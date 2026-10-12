// Voice engine client: voice catalogue, worker management, clip cache and word alignment.

import { db, kvGet } from './db.js';
import { hashString } from './util.js';
import { alignWords, trimClip } from './align.js';

export const VOICES = [
  { id: 'af_heart', name: 'Heart', accent: 'American', gender: 'Female', desc: 'Warm and natural', free: true },
  { id: 'am_michael', name: 'Michael', accent: 'American', gender: 'Male', desc: 'Calm, low', free: true },
  { id: 'bf_emma', name: 'Emma', accent: 'British', gender: 'Female', desc: 'Clear and polished', free: true },
  { id: 'af_bella', name: 'Bella', accent: 'American', gender: 'Female', desc: 'Bright, energetic' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'American', gender: 'Male', desc: 'Bold, dramatic' },
  { id: 'am_puck', name: 'Puck', accent: 'American', gender: 'Male', desc: 'Playful, upbeat' },
  { id: 'af_nicole', name: 'Nicole', accent: 'American', gender: 'Female', desc: 'Soft, close-mic' },
  { id: 'af_aoede', name: 'Aoede', accent: 'American', gender: 'Female', desc: 'Smooth' },
  { id: 'af_kore', name: 'Kore', accent: 'American', gender: 'Female', desc: 'Confident' },
  { id: 'af_sarah', name: 'Sarah', accent: 'American', gender: 'Female', desc: 'Friendly' },
  { id: 'af_nova', name: 'Nova', accent: 'American', gender: 'Female', desc: 'Crisp' },
  { id: 'af_sky', name: 'Sky', accent: 'American', gender: 'Female', desc: 'Light, airy' },
  { id: 'af_alloy', name: 'Alloy', accent: 'American', gender: 'Female', desc: 'Even, neutral' },
  { id: 'af_jessica', name: 'Jessica', accent: 'American', gender: 'Female', desc: 'Casual' },
  { id: 'af_river', name: 'River', accent: 'American', gender: 'Female', desc: 'Relaxed' },
  { id: 'am_adam', name: 'Adam', accent: 'American', gender: 'Male', desc: 'Narrator' },
  { id: 'am_echo', name: 'Echo', accent: 'American', gender: 'Male', desc: 'Even, steady' },
  { id: 'am_eric', name: 'Eric', accent: 'American', gender: 'Male', desc: 'Matter-of-fact' },
  { id: 'am_liam', name: 'Liam', accent: 'American', gender: 'Male', desc: 'Young, casual' },
  { id: 'am_onyx', name: 'Onyx', accent: 'American', gender: 'Male', desc: 'Deep, rich' },
  { id: 'am_santa', name: 'Santa', accent: 'American', gender: 'Male', desc: 'Jolly, seasonal' },
  { id: 'bf_isabella', name: 'Isabella', accent: 'British', gender: 'Female', desc: 'Elegant' },
  { id: 'bf_alice', name: 'Alice', accent: 'British', gender: 'Female', desc: 'Bright' },
  { id: 'bf_lily', name: 'Lily', accent: 'British', gender: 'Female', desc: 'Gentle' },
  { id: 'bm_george', name: 'George', accent: 'British', gender: 'Male', desc: 'Documentary' },
  { id: 'bm_lewis', name: 'Lewis', accent: 'British', gender: 'Male', desc: 'Deep' },
  { id: 'bm_daniel', name: 'Daniel', accent: 'British', gender: 'Male', desc: 'Measured' },
  { id: 'bm_fable', name: 'Fable', accent: 'British', gender: 'Male', desc: 'Storyteller' },
];

export const voiceById = (id) => VOICES.find((v) => v.id === id) || VOICES[0];

const MODEL_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/';
const VOICE_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';
// MB, one-time download: model plus the 28 voice styles (about 15 MB)
export const ENGINE_SIZES = { q8: 107, fp32: 341 };
const SPEAK_TIMEOUT = 180000;

// ---------------------------------------------------------------- text normalisation for speech

export function speechText(text) {
  let t = String(text || '');
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '');
  t = t.replace(/\$\s?(\d[\d,.]*)\s?(thousand|million|billion|trillion)?/gi, (m, n, s) => `${n}${s ? ' ' + s : ''} dollars`);
  t = t.replace(/(\d)\s?%/g, '$1 percent');
  t = t.replace(/°\s?C\b/g, ' degrees Celsius').replace(/°\s?F\b/g, ' degrees Fahrenheit').replace(/°/g, ' degrees');
  t = t.replace(/(\d)\s?km\b/gi, '$1 kilometers').replace(/(\d)\s?kg\b/gi, '$1 kilograms').replace(/(\d)\s?mph\b/gi, '$1 miles per hour').replace(/(\d)\s?cm\b/gi, '$1 centimeters').replace(/(\d)\s?mm\b/gi, '$1 millimeters').replace(/(\d)\s?lbs?\b/gi, '$1 pounds');
  t = t.replace(/\be\.g\.,?/gi, 'for example,').replace(/\bi\.e\.,?/gi, 'that is,').replace(/\bvs\.?\b/gi, 'versus').replace(/\betc\./gi, 'et cetera');
  t = t.replace(/&/g, ' and ').replace(/\s*\+\s*/g, ' plus ').replace(/[#*_~^<>{}[\]|\\]/g, ' ');
  t = t.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  return t;
}

// ---------------------------------------------------------------- worker client

class VoiceEngine {
  constructor() {
    this.worker = null;
    this.status = 'idle'; // idle | loading | ready | error
    this.error = '';
    this.device = 'wasm';
    this.files = new Map();
    this.pending = new Map();
    this.loadPromise = null;
    this.listeners = new Set();
    this.seq = 0;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.snapshot());
  }

  snapshot() {
    let loaded = 0;
    let total = 0;
    for (const f of this.files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    return { status: this.status, error: this.error, loaded, total, progress: total ? loaded / total : 0, device: this.device };
  }

  async config() {
    const gpu = !this.forceWasm && (await kvGet('voiceGpu', false)) && !!navigator.gpu;
    return gpu ? { device: 'webgpu', dtype: 'fp32' } : { device: 'wasm', dtype: 'q8' };
  }

  spawn() {
    if (this.worker) return;
    this.worker = new Worker(new URL('./tts-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.onerror = (e) => {
      const msg = (e && e.message) || 'The voice engine stopped unexpectedly.';
      this.terminate(false); // rejects pending calls; the next request starts a fresh engine
      this.status = 'error';
      this.error = msg;
      this.emit();
    };
  }

  onMessage(m) {
    if (m.type === 'progress') {
      if (!m.file) return;
      const f = this.files.get(m.file) || { loaded: 0, total: 0 };
      if (m.total) f.total = m.total;
      if (m.loaded) f.loaded = m.loaded;
      if (m.status === 'done' && f.total) f.loaded = f.total;
      this.files.set(m.file, f);
      this.emit();
      return;
    }
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
  }

  call(msg) {
    this.spawn();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  async load() {
    if (this.status === 'ready' && this.worker) return;
    if (this.loadPromise) return this.loadPromise;
    const cfg = await this.config();
    this.device = cfg.device;
    this.status = 'loading';
    this.error = '';
    this.emit();
    const wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
    this.loadPromise = this.call({ type: 'load', ...cfg, wasmPaths })
      .then(() => {
        this.status = 'ready';
        this.emit();
        prefetchVoices();
      })
      .catch((e) => {
        this.loadPromise = null;
        this.terminate(false);
        if (cfg.device === 'webgpu' && !this.forceWasm) {
          // the graphics card path failed on this PC: fall back to the standard engine
          this.forceWasm = true;
          this.status = 'idle';
          return this.load();
        }
        this.status = 'error';
        this.error = friendlyError(e);
        this.emit();
        throw new Error(this.error);
      });
    return this.loadPromise;
  }

  async speak(text, voice, speed = 1) {
    await this.load();
    const cfg = await this.config();
    const wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        this.terminate(false);
        this.status = 'idle';
        this.emit();
        reject(new Error('The voice engine took too long. Try again.'));
      }, SPEAK_TIMEOUT);
    });
    try {
      const r = await Promise.race([this.call({ type: 'speak', text, voice, speed, ...cfg, wasmPaths }), timeout]);
      return { pcm: r.pcm, sampleRate: r.sampleRate };
    } finally {
      clearTimeout(timer);
    }
  }

  terminate(resetStatus = true) {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.loadPromise = null;
    if (resetStatus || this.status === 'ready') this.status = 'idle';
    for (const p of this.pending.values()) p.reject(new Error('The voice engine restarted. Try again.'));
    this.pending.clear();
    this.files.clear();
  }
}

function friendlyError(e) {
  const msg = String((e && e.message) || e || '');
  if (/fetch|network|Failed to fetch|NetworkError|load/i.test(msg) && !navigator.onLine) return 'You are offline. Connect once to download the AI voices (one time only).';
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return 'Could not download the AI voices. Check your connection and try again.';
  return msg || 'The voice engine stopped unexpectedly.';
}

export const engine = new VoiceEngine();

// The engine fetches each voice's style file the first time that voice is used. Download all of
// them once (about 15 MB) into the same cache, so every voice keeps working offline.
let prefetching = null;
export function prefetchVoices() {
  if (prefetching || !('caches' in self)) return prefetching;
  prefetching = (async () => {
    try {
      const cache = await caches.open('kokoro-voices');
      for (const v of VOICES) {
        const url = `${VOICE_BASE}${v.id}.bin`;
        if (await cache.match(url)) continue;
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, new Response(await res.arrayBuffer(), { headers: res.headers }));
        } catch {
          /* offline: try again next time */
        }
      }
    } catch {
      /* cache unavailable */
    }
  })();
  return prefetching;
}

export async function isModelCached() {
  try {
    if (!('caches' in self)) return false;
    const names = await caches.keys();
    for (const n of names) {
      const c = await caches.open(n);
      const keys = await c.keys();
      if (keys.some((r) => r.url.startsWith(MODEL_BASE) && /model(_quantized)?\.onnx$/.test(r.url))) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function clearModelCache() {
  try {
    const names = await caches.keys();
    for (const n of names) {
      const c = await caches.open(n);
      const keys = await c.keys();
      for (const r of keys) if (r.url.includes('huggingface.co/onnx-community/Kokoro')) await c.delete(r);
    }
  } catch {
    /* ignore */
  }
  engine.terminate();
}

// ---------------------------------------------------------------- clips

export function clipKey(text, voice, speed) {
  return 'v_' + hashString(`${voice}|${(+speed).toFixed(2)}|${speechText(text)}`).toString(36);
}

const memClips = new Map();
const MEM_LIMIT = 120;
function remember(id, clip) {
  memClips.delete(id);
  memClips.set(id, clip);
  while (memClips.size > MEM_LIMIT) memClips.delete(memClips.keys().next().value);
  return clip;
}

/**
 * Get a voice clip for a line: cached in memory/IndexedDB, synthesised otherwise.
 * @returns {Promise<{id, pcm: Float32Array, sampleRate, duration, words}>}
 */
export async function voiceClip(text, voice, speed = 1, { signal } = {}) {
  const id = clipKey(text, voice, speed);
  if (memClips.has(id)) return remember(id, memClips.get(id));
  const stored = await db.get('assets', id).catch(() => null);
  if (stored && stored.pcm) {
    return remember(id, { id, pcm: new Float32Array(stored.pcm), sampleRate: stored.sampleRate, duration: stored.duration, words: stored.words });
  }
  if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const parts = speechParts(speechText(text) || '...');
  let pcm;
  let sampleRate = 24000;
  if (parts.length === 1) {
    const r = await engine.speak(parts[0].text, voice, speed);
    pcm = r.pcm;
    sampleRate = r.sampleRate;
  } else {
    // long lines are spoken in pieces (the model reads at most ~500 sounds at once) and joined
    const pieces = [];
    for (const part of parts) {
      if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const r = await engine.speak(part.text, voice, speed);
      sampleRate = r.sampleRate;
      pieces.push(trimClip(r.pcm, sampleRate, 0.02).pcm, new Float32Array(Math.round(sampleRate * part.pause)));
    }
    pcm = new Float32Array(pieces.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of pieces) {
      pcm.set(p, o);
      o += p.length;
    }
  }
  if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  return storeClip(id, text, pcm, sampleRate, 'ai');
}

const MAX_WORDS = 38;

/** Split long text into speakable parts with natural pauses. */
export function speechParts(text) {
  const words = (s) => (s.trim().match(/\S+/g) || []).length;
  if (words(text) <= MAX_WORDS) return [{ text, pause: 0 }];
  const sentences = text.split(/(?<=[.!?…])\s+/).filter((s) => s.trim());
  const pieces = [];
  for (const s of sentences) {
    if (words(s) <= MAX_WORDS) {
      pieces.push({ text: s, pause: 0.22 });
      continue;
    }
    const clauses = s.split(/(?<=[,;:—–])\s+/);
    let buf = '';
    for (const c of clauses) {
      if (buf && words(buf) + words(c) > MAX_WORDS) {
        pieces.push({ text: buf, pause: 0.1 });
        buf = c;
      } else buf = buf ? `${buf} ${c}` : c;
      while (words(buf) > MAX_WORDS) {
        const w = buf.split(/\s+/);
        pieces.push({ text: w.slice(0, MAX_WORDS).join(' '), pause: 0.06 });
        buf = w.slice(MAX_WORDS).join(' ');
      }
    }
    if (buf) pieces.push({ text: buf, pause: 0.22 });
  }
  // pack short neighbours back together
  const out = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && words(last.text) + words(p.text) <= MAX_WORDS) {
      last.text += ' ' + p.text;
      last.pause = p.pause;
    } else out.push({ ...p });
  }
  return out;
}

export async function storeClip(id, text, rawPcm, sampleRate, source) {
  const { pcm } = trimClip(rawPcm, sampleRate, 0.06);
  const { words } = alignWords(text, pcm, sampleRate);
  const duration = pcm.length / sampleRate;
  const clip = remember(id, { id, pcm, sampleRate, duration, words });
  try {
    await db.put('assets', { id, kind: 'voice', source, pcm: pcm.buffer.slice(0), sampleRate, duration, words, created: Date.now() });
  } catch (e) {
    console.warn('Could not cache voice clip', e);
  }
  return clip;
}

export async function loadClip(id) {
  if (!id) return null;
  if (memClips.has(id)) return memClips.get(id);
  const stored = await db.get('assets', id).catch(() => null);
  if (!stored || !stored.pcm) return null;
  return remember(id, { id, pcm: new Float32Array(stored.pcm), sampleRate: stored.sampleRate, duration: stored.duration, words: stored.words });
}

export function forgetClipsInMemory() {
  memClips.clear();
}

// ---------------------------------------------------------------- previews

const PREVIEW_LINE = (name) => `Hi, I'm ${name}. Give me any topic and I'll turn it into a short people want to finish.`;

export async function previewVoice(voiceId, speed = 1) {
  const v = voiceById(voiceId);
  return voiceClip(PREVIEW_LINE(v.name), v.id, speed);
}

/** Ids of the stored voice previews (kept when unused voice lines are cleaned up). */
export function previewKeys() {
  return VOICES.map((v) => clipKey(PREVIEW_LINE(v.name), v.id, 1));
}
