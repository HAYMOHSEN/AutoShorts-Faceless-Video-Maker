// Voice engines: voice catalogue, worker management, clip cache and word alignment.
// Kokoro-82M speaks English, Spanish, French, Portuguese and Hindi; Piper voices speak German.
// Arabic has no on-device AI voice yet — videos in Arabic use "My voice" or captions only.

import { db, kvGet } from './db.js';
import { hashString } from './util.js';
import { alignWords, trimClip } from './align.js';
import { speechText } from './speech.js';
import { t, N_ } from './i18n.js';

export { speechText };

// lang: video language · engine: 'kokoro' (default) or 'piper' · free: included in the free plan
export const VOICES = [
  { id: 'af_heart', lang: 'en', name: 'Heart', accent: 'American', gender: 'Female', desc: N_('Warm and natural'), free: true },
  { id: 'am_michael', lang: 'en', name: 'Michael', accent: 'American', gender: 'Male', desc: N_('Calm, low'), free: true },
  { id: 'bf_emma', lang: 'en', name: 'Emma', accent: 'British', gender: 'Female', desc: N_('Clear and polished'), free: true },
  { id: 'af_bella', lang: 'en', name: 'Bella', accent: 'American', gender: 'Female', desc: N_('Bright, energetic') },
  { id: 'am_fenrir', lang: 'en', name: 'Fenrir', accent: 'American', gender: 'Male', desc: N_('Bold, dramatic') },
  { id: 'am_puck', lang: 'en', name: 'Puck', accent: 'American', gender: 'Male', desc: N_('Playful, upbeat') },
  { id: 'af_nicole', lang: 'en', name: 'Nicole', accent: 'American', gender: 'Female', desc: N_('Soft, close-mic') },
  { id: 'af_aoede', lang: 'en', name: 'Aoede', accent: 'American', gender: 'Female', desc: N_('Smooth') },
  { id: 'af_kore', lang: 'en', name: 'Kore', accent: 'American', gender: 'Female', desc: N_('Confident') },
  { id: 'af_sarah', lang: 'en', name: 'Sarah', accent: 'American', gender: 'Female', desc: N_('Friendly') },
  { id: 'af_nova', lang: 'en', name: 'Nova', accent: 'American', gender: 'Female', desc: N_('Crisp') },
  { id: 'af_sky', lang: 'en', name: 'Sky', accent: 'American', gender: 'Female', desc: N_('Light, airy') },
  { id: 'af_alloy', lang: 'en', name: 'Alloy', accent: 'American', gender: 'Female', desc: N_('Even, neutral') },
  { id: 'af_jessica', lang: 'en', name: 'Jessica', accent: 'American', gender: 'Female', desc: N_('Casual') },
  { id: 'af_river', lang: 'en', name: 'River', accent: 'American', gender: 'Female', desc: N_('Relaxed') },
  { id: 'am_adam', lang: 'en', name: 'Adam', accent: 'American', gender: 'Male', desc: N_('Narrator') },
  { id: 'am_echo', lang: 'en', name: 'Echo', accent: 'American', gender: 'Male', desc: N_('Even, steady') },
  { id: 'am_eric', lang: 'en', name: 'Eric', accent: 'American', gender: 'Male', desc: N_('Matter-of-fact') },
  { id: 'am_liam', lang: 'en', name: 'Liam', accent: 'American', gender: 'Male', desc: N_('Young, casual') },
  { id: 'am_onyx', lang: 'en', name: 'Onyx', accent: 'American', gender: 'Male', desc: N_('Deep, rich') },
  { id: 'am_santa', lang: 'en', name: 'Santa', accent: 'American', gender: 'Male', desc: N_('Jolly, seasonal') },
  { id: 'bf_isabella', lang: 'en', name: 'Isabella', accent: 'British', gender: 'Female', desc: N_('Elegant') },
  { id: 'bf_alice', lang: 'en', name: 'Alice', accent: 'British', gender: 'Female', desc: N_('Bright') },
  { id: 'bf_lily', lang: 'en', name: 'Lily', accent: 'British', gender: 'Female', desc: N_('Gentle') },
  { id: 'bm_george', lang: 'en', name: 'George', accent: 'British', gender: 'Male', desc: N_('Documentary') },
  { id: 'bm_lewis', lang: 'en', name: 'Lewis', accent: 'British', gender: 'Male', desc: N_('Deep') },
  { id: 'bm_daniel', lang: 'en', name: 'Daniel', accent: 'British', gender: 'Male', desc: N_('Measured') },
  { id: 'bm_fable', lang: 'en', name: 'Fable', accent: 'British', gender: 'Male', desc: N_('Storyteller') },

  { id: 'ef_dora', lang: 'es', name: 'Dora', accent: 'Spanish', gender: 'Female', desc: N_('Warm and clear'), free: true },
  { id: 'em_alex', lang: 'es', name: 'Alex', accent: 'Spanish', gender: 'Male', desc: N_('Natural, friendly'), free: true },
  { id: 'em_santa', lang: 'es', name: 'Santa', accent: 'Spanish', gender: 'Male', desc: N_('Jolly, seasonal') },

  { id: 'ff_siwis', lang: 'fr', name: 'Camille', accent: 'French', gender: 'Female', desc: N_('Clear and natural'), free: true },

  { id: 'pf_dora', lang: 'pt', name: 'Dora', accent: 'Brazilian', gender: 'Female', desc: N_('Bright and warm'), free: true },
  { id: 'pm_alex', lang: 'pt', name: 'Alex', accent: 'Brazilian', gender: 'Male', desc: N_('Natural, steady'), free: true },
  { id: 'pm_santa', lang: 'pt', name: 'Santa', accent: 'Brazilian', gender: 'Male', desc: N_('Jolly, seasonal') },

  { id: 'hm_omega', lang: 'hi', name: 'Arjun', spoken: 'अर्जुन', accent: 'Hindi', gender: 'Male', desc: N_('Clear, steady'), free: true },
  { id: 'hf_beta', lang: 'hi', name: 'Meera', spoken: 'मीरा', accent: 'Hindi', gender: 'Female', desc: N_('Warm and clear'), free: true },
  { id: 'hf_alpha', lang: 'hi', name: 'Aditi', spoken: 'अदिति', accent: 'Hindi', gender: 'Female', desc: N_('Bright') },
  { id: 'hm_psi', lang: 'hi', name: 'Kabir', spoken: 'कबीर', accent: 'Hindi', gender: 'Male', desc: N_('Calm') },

  // German: a Piper voice trained on the M-AILABS dataset (its license allows commercial use), a
  // separate 20 MB download. Optional `noise: [noise_scale, noise_w]` overrides the model's values.
  { id: 'de_eva', lang: 'de', engine: 'piper', path: 'de/de_DE/eva_k/x_low/de_DE-eva_k-x_low', size: 20, name: 'Eva', accent: 'German', gender: 'Female', desc: N_('Clear and natural'), free: true },
];

export const voiceById = (id) => VOICES.find((v) => v.id === id) || VOICES[0];
const ACCENTS = {
  American: N_('American English'),
  British: N_('British English'),
  Spanish: N_('Spanish'),
  French: N_('French'),
  Brazilian: N_('Brazilian Portuguese'),
  Hindi: N_('Hindi'),
  German: N_('German'),
};
/** Group heading for a voice list ("American English", "German"…), translated. */
export const accentLabel = (accent) => t(ACCENTS[accent] || accent);
/** "Female, warm and natural" in the interface language. */
export const voiceSummary = (v) => `${v.gender === 'Female' ? t('Female') : t('Male')}, ${t(v.desc)}`;
export const voiceLang = (id) => voiceById(id).lang;
export const voicesFor = (lang) => VOICES.filter((v) => v.lang === (lang || 'en'));
/** Whether a language has an on-device AI voice (Arabic doesn't, yet). */
export const hasAiVoice = (lang) => VOICES.some((v) => v.lang === (lang || 'en'));
const DEFAULT_VOICE = { en: 'af_heart', es: 'ef_dora', fr: 'ff_siwis', pt: 'pf_dora', hi: 'hm_omega', de: 'de_eva' };
export const defaultVoice = (lang) => DEFAULT_VOICE[lang] || null;

const MODEL_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/';
const VOICE_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';
// Piper voices, pinned to a release of the rhasspy/piper-voices repository
const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/';
const PIPER_CACHE = 'piper-voices';
// MB, one-time download: model plus the voice styles (about 15 MB for the English ones)
export const ENGINE_SIZES = { q8: 107, fp32: 341 };
const SPEAK_TIMEOUT = 180000;
const ORT_PATHS = () => new URL('../vendor/ort/', import.meta.url).href;

const piperFiles = (v) => ({ model: `${PIPER_BASE}${v.path}.onnx`, config: `${PIPER_BASE}${v.path}.onnx.json` });

// ---------------------------------------------------------------- worker client

class WorkerEngine {
  constructor(kind, script) {
    this.kind = kind;
    this.script = script;
    this.worker = null;
    this.status = 'idle'; // idle | loading | ready | error
    this.error = '';
    this.device = 'wasm';
    this.files = new Map();
    this.pending = new Map();
    this.loadPromise = null;
    this.listeners = new Set();
    this.seq = 0;
    this.voiceName = '';
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
    return { kind: this.kind, voiceName: this.voiceName, status: this.status, error: this.error, loaded, total, progress: total ? loaded / total : 0, device: this.device };
  }

  spawn() {
    if (this.worker) return;
    this.worker = new Worker(this.script, { type: 'module' });
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.onerror = (e) => {
      const msg = (e && e.message) || t('The voice engine stopped unexpectedly.');
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
    if (m.type === 'error') p.reject(new Error(t(m.message)));
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

  /** A worker call that gives up (and restarts the engine) if it takes far too long. */
  async timed(msg) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        this.terminate(false);
        this.status = 'idle';
        this.emit();
        reject(new Error(t('The voice engine took too long. Try again.')));
      }, SPEAK_TIMEOUT);
    });
    try {
      const r = await Promise.race([this.call(msg), timeout]);
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
    for (const p of this.pending.values()) p.reject(new Error(t('The voice engine restarted. Try again.')));
    this.pending.clear();
    this.files.clear();
  }
}

class KokoroEngine extends WorkerEngine {
  constructor() {
    super('kokoro', new URL('./tts-worker.js', import.meta.url));
  }

  async config() {
    const gpu = !this.forceWasm && (await kvGet('voiceGpu', false)) && !!navigator.gpu;
    return gpu ? { device: 'webgpu', dtype: 'fp32' } : { device: 'wasm', dtype: 'q8' };
  }

  async load() {
    if (this.status === 'ready' && this.worker) return;
    if (this.loadPromise) return this.loadPromise;
    const cfg = await this.config();
    this.device = cfg.device;
    this.status = 'loading';
    this.error = '';
    this.emit();
    this.loadPromise = this.call({ type: 'load', ...cfg, wasmPaths: ORT_PATHS() })
      .then(() => {
        this.status = 'ready';
        this.emit();
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
    return this.timed({ type: 'speak', text, voice, speed, ...cfg, wasmPaths: ORT_PATHS() });
  }
}

// The worker keeps one Piper model loaded; a request names its speaker for models that hold several.
class PiperEngine extends WorkerEngine {
  constructor() {
    super('piper', new URL('./piper-worker.js', import.meta.url));
    this.model = null; // path of the model loaded in the worker
    this.loadingModel = null;
  }

  async load(v) {
    if (this.worker && this.status === 'ready' && this.model === v.path) return;
    if (this.loadPromise && this.loadingModel === v.path) return this.loadPromise;
    if (this.loadPromise) {
      await this.loadPromise.catch(() => {});
      if (this.worker && this.status === 'ready' && this.model === v.path) return;
    }
    this.status = 'loading';
    this.error = '';
    this.files.clear();
    this.loadingModel = v.path;
    this.voiceName = v.name;
    this.emit();
    const promise = this.call({ type: 'load', ...piperFiles(v), wasmPaths: ORT_PATHS() })
      .then(() => {
        this.status = 'ready';
        this.model = v.path;
        this.emit();
      })
      .catch((e) => {
        this.terminate(false);
        this.status = 'error';
        this.error = friendlyError(e);
        this.emit();
        throw new Error(this.error);
      })
      .finally(() => {
        if (this.loadPromise === promise) {
          this.loadPromise = null;
          this.loadingModel = null;
        }
      });
    this.loadPromise = promise;
    return promise;
  }

  async speak(text, voiceId, speed = 1) {
    const v = voiceById(voiceId);
    await this.load(v);
    return this.timed({ type: 'speak', text, speed, speaker: v.speaker || 0, noise: v.noise || null, ...piperFiles(v), wasmPaths: ORT_PATHS() });
  }

  terminate(resetStatus = true) {
    super.terminate(resetStatus);
    this.model = null;
    this.loadingModel = null;
  }
}

function friendlyError(e) {
  const msg = String((e && e.message) || e || '');
  if (/fetch|network|Failed to fetch|NetworkError|load|download/i.test(msg) && !navigator.onLine) return t('You are offline. Connect once to download the AI voices (one time only).');
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return t('Could not download the AI voices. Check your connection and try again.');
  return msg || t('The voice engine stopped unexpectedly.');
}

const kokoro = new KokoroEngine();
const piper = new PiperEngine();
const engineOf = (voiceId) => (voiceById(voiceId).engine === 'piper' ? piper : kokoro);

/**
 * All voice engines behind one object. Status and progress follow the engine that was used last
 * (or is downloading), so the interface shows one voice engine at a time.
 */
class Voices {
  constructor(engines) {
    this.engines = engines;
    this.active = engines[0];
    this.listeners = new Set();
    for (const e of engines) {
      e.on(() => {
        if (e.status === 'loading') this.active = e;
        if (e === this.active) this.emit();
      });
    }
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  snapshot() {
    return this.active.snapshot();
  }

  get status() {
    return this.active.status;
  }

  get device() {
    return this.active.device;
  }

  use(e) {
    if (e !== this.active) {
      this.active = e;
      this.emit();
    }
  }

  /** Make sure the engine for this voice (default: the English engine) is downloaded and running. */
  async load(voiceId) {
    const v = voiceById(voiceId);
    const e = engineOf(v.id);
    this.use(e);
    await e.load(v);
    if (e === kokoro) prefetchVoices(v.lang);
  }

  async speak(text, voiceId, speed) {
    const e = engineOf(voiceId);
    this.use(e);
    const r = await e.speak(text, voiceId, speed);
    if (e === kokoro) prefetchVoices(voiceLang(voiceId));
    return r;
  }

  terminate() {
    for (const e of this.engines) e.terminate();
    this.emit();
  }
}

export const engine = new Voices([kokoro, piper]);

// The engine fetches each voice's style file the first time that voice is used. Download the
// styles of a language once (about 0.5 MB per voice) into the same cache, so they work offline.
const prefetching = new Map();
export function prefetchVoices(lang = 'en') {
  if (prefetching.has(lang) || !('caches' in self)) return prefetching.get(lang);
  const job = (async () => {
    try {
      const cache = await caches.open('kokoro-voices');
      for (const v of VOICES) {
        if (v.lang !== lang || v.engine === 'piper') continue;
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
  prefetching.set(lang, job);
  return job;
}

async function kokoroCached() {
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

async function piperCached(v) {
  try {
    if (!('caches' in self)) return false;
    const c = await caches.open(PIPER_CACHE);
    return !!(await c.match(piperFiles(v).model));
  } catch {
    return false;
  }
}

/** Whether the files for this voice (default: the English engine) are already on this PC. */
export async function isModelCached(voiceId) {
  const v = voiceById(voiceId);
  return v.engine === 'piper' ? piperCached(v) : kokoroCached();
}

/** True when the voice can speak right away, without a download. */
export async function voiceReady(voiceId) {
  const v = voiceById(voiceId);
  const e = engineOf(v.id);
  if (e === kokoro && kokoro.status === 'ready') return true;
  if (e === piper && piper.status === 'ready' && piper.model === v.path) return true;
  return isModelCached(v.id);
}

/** One-time download size in MB for this voice's engine. */
export function downloadSize(voiceId) {
  const v = voiceById(voiceId);
  return v.engine === 'piper' ? v.size : ENGINE_SIZES.q8;
}

/** Voices of the extra voice packs (German) that are downloaded to this PC. */
export async function cachedPiperVoices() {
  const out = [];
  for (const v of VOICES) if (v.engine === 'piper' && (await piperCached(v))) out.push(v);
  return out;
}

export async function clearModelCache() {
  try {
    const names = await caches.keys();
    for (const n of names) {
      if (n === PIPER_CACHE) continue;
      const c = await caches.open(n);
      const keys = await c.keys();
      for (const r of keys) if (r.url.includes('huggingface.co/onnx-community/Kokoro')) await c.delete(r);
    }
    await caches.delete(PIPER_CACHE);
  } catch {
    /* ignore */
  }
  prefetching.clear();
  engine.terminate();
}

// ---------------------------------------------------------------- clips

export function clipKey(text, voice, speed) {
  return 'v_' + hashString(`${voice}|${(+speed).toFixed(2)}|${speechText(text, voiceLang(voice))}`).toString(36);
}

const memClips = new Map();
const MEM_LIMIT = 120;
function remember(id, clip) {
  memClips.delete(id);
  memClips.set(id, clip);
  while (memClips.size > MEM_LIMIT) memClips.delete(memClips.keys().next().value);
  return clip;
}

// Voices differ in loudness (the Hindi ones are about twice as loud as the English ones), so
// clips in the other languages are brought to the level of the English voices.
const TARGET_RMS = 0.11;
function level(pcm) {
  let sum = 0;
  let n = 0;
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]);
    if (a > peak) peak = a;
    if (a > 0.02) {
      sum += a * a;
      n++;
    }
  }
  if (!n || !peak) return pcm;
  const gain = Math.min(2.5, Math.max(0.4, TARGET_RMS / Math.sqrt(sum / n)), 0.97 / peak);
  if (Math.abs(gain - 1) < 0.03) return pcm;
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  return pcm;
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
  const lang = voiceLang(voice);
  const parts = speechParts(speechText(text, lang) || '...');
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
  if (lang !== 'en') level(pcm);
  return storeClip(id, text, pcm, sampleRate, 'ai');
}

const MAX_WORDS = 38;

/** Split long text into speakable parts with natural pauses. */
export function speechParts(text) {
  const words = (s) => (s.trim().match(/\S+/g) || []).length;
  if (words(text) <= MAX_WORDS) return [{ text, pause: 0 }];
  const sentences = text.split(/(?<=[.!?…।؟])\s+/).filter((s) => s.trim());
  const pieces = [];
  for (const s of sentences) {
    if (words(s) <= MAX_WORDS) {
      pieces.push({ text: s, pause: 0.22 });
      continue;
    }
    const clauses = s.split(/(?<=[,;:—–،؛])\s+/);
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

const PREVIEW = {
  en: (v) => `Hi, I'm ${v.name}. Give me any topic and I'll turn it into a short people want to finish.`,
  es: (v) => `Hola, soy ${v.name}. Dame cualquier tema y lo convierto en un video corto que la gente quiera ver hasta el final.`,
  fr: (v) => `Bonjour, je m'appelle ${v.name}. Donnez-moi un sujet et j'en fais une vidéo courte qu'on regarde jusqu'au bout.`,
  pt: (v) => `Oi, eu sou ${v.gender === 'Female' ? 'a' : 'o'} ${v.name}. Me dê qualquer tema e eu transformo num vídeo curto que as pessoas querem ver até o fim.`,
  de: (v) => `Hallo, ich bin ${v.name}. Gib mir ein Thema, und ich mache daraus ein kurzes Video, das man bis zum Ende schaut.`,
  hi: (v) => `नमस्ते, मैं ${v.spoken || v.name} हूँ। मुझे कोई भी विषय दीजिए, मैं उसे ऐसा छोटा वीडियो बना ${v.gender === 'Female' ? 'दूँगी' : 'दूँगा'} जिसे लोग आख़िर तक देखें।`,
};
const previewLine = (v) => (PREVIEW[v.lang] || PREVIEW.en)(v);

export async function previewVoice(voiceId, speed = 1) {
  const v = voiceById(voiceId);
  return voiceClip(previewLine(v), v.id, speed);
}

/** Ids of the stored voice previews (kept when unused voice lines are cleaned up). */
export function previewKeys() {
  return VOICES.map((v) => clipKey(previewLine(v), v.id, 1));
}
