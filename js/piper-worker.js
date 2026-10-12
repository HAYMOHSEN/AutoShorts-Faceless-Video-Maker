// Piper voices (VITS models run with ONNX Runtime Web) for languages the main voice engine doesn't
// speak — German. Runs in a module worker. Each voice is a single model file, downloaded once and
// kept in the browser cache; text is turned into phonemes with eSpeak NG.

import * as ort from '../vendor/ort/ort.webgpu.min.mjs';
import { phonemize, phonemeSentences } from './espeak.js';

const CACHE = 'piper-voices';
const SENTENCE_PAUSE = 0.2; // seconds of silence between sentences, as Piper does
let current = null; // { key, session, config }
let loading = null; // { key, promise }
let chain = Promise.resolve();

/** Fetch a file through the voice cache, reporting download progress. */
async function fetchCached(url, onProgress) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Voice download failed: ${res.status} ${url}`);
    throw new Error('Could not download the AI voices. Check your connection and try again.');
  }
  const total = Number(res.headers.get('content-length')) || 0;
  let blob;
  if (res.body && onProgress) {
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
    blob = new Blob(chunks);
  } else blob = await res.blob();
  if (cache) {
    try {
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
    } catch {
      /* storage full: the voice still works this session */
    }
  }
  return new Uint8Array(await blob.arrayBuffer());
}

async function load({ model, config, wasmPaths }) {
  if (current && current.key === model) return current;
  if (loading && loading.key === model) return loading.promise;
  if (loading) await loading.promise.catch(() => {});
  const promise = (async () => {
    ort.env.wasm.wasmPaths = wasmPaths;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
    const cfg = JSON.parse(new TextDecoder().decode(await fetchCached(config)));
    let last = 0;
    const bytes = await fetchCached(model, (loaded, total) => {
      const now = Date.now();
      if (now - last < 120 && loaded < total) return;
      last = now;
      self.postMessage({ type: 'progress', file: model, status: 'progress', loaded, total });
    });
    self.postMessage({ type: 'progress', file: model, status: 'done', loaded: bytes.length, total: bytes.length });
    if (current) {
      // one voice in memory at a time
      await current.session.release().catch(() => {});
      current = null;
    }
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    current = { key: model, session, config: cfg };
    return current;
  })();
  loading = { key: model, promise };
  try {
    return await promise;
  } finally {
    if (loading && loading.promise === promise) loading = null;
  }
}

function idsFor(phonemes, map) {
  const ids = [...map['^'], ...map['_']];
  for (const p of phonemes) {
    const id = map[p];
    if (id) ids.push(...id, ...map['_']);
  }
  ids.push(...map['$']);
  return ids;
}

async function synthesize(voice, text, speed, speaker = 0, noise = null) {
  const cfg = voice.config;
  const map = cfg.phoneme_id_map;
  const [res] = await phonemize([text], (cfg.espeak && cfg.espeak.voice) || 'de');
  const sentences = res ? phonemeSentences(res.phonemes).filter((s) => s.some((p) => /\p{L}/u.test(p))) : [];
  if (!sentences.length) throw new Error('This line has nothing to read aloud.');
  const inf = cfg.inference || {};
  const sampleRate = cfg.audio.sample_rate;
  const [noiseScale, noiseW] = noise || [inf.noise_scale ?? 0.667, inf.noise_w ?? 0.8];
  const scales = Float32Array.from([noiseScale, (inf.length_scale ?? 1) / (speed || 1), noiseW]);
  const pieces = [];
  for (const ph of sentences) {
    const ids = idsFor(ph, map);
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', scales, [3]),
    };
    if (voice.session.inputNames.includes('sid')) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(speaker)]), [1]);
    const out = await voice.session.run(feeds);
    const audio = out[voice.session.outputNames[0]];
    pieces.push(Float32Array.from(audio.data));
    if (audio.dispose) audio.dispose();
  }
  const gap = Math.round(sampleRate * SENTENCE_PAUSE);
  const pcm = new Float32Array(pieces.reduce((n, p) => n + p.length, 0) + gap * (pieces.length - 1));
  let o = 0;
  pieces.forEach((p, i) => {
    pcm.set(p, o);
    o += p.length + (i < pieces.length - 1 ? gap : 0);
  });
  return { pcm, sampleRate };
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'load') {
    load(m)
      .then(() => self.postMessage({ type: 'ready', id: m.id }))
      .catch((err) => self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) }));
    return;
  }
  if (m.type === 'speak') {
    // one inference at a time
    chain = chain.then(async () => {
      try {
        const voice = await load(m);
        const { pcm, sampleRate } = await synthesize(voice, m.text, m.speed || 1, m.speaker || 0, m.noise);
        self.postMessage({ type: 'audio', id: m.id, pcm, sampleRate }, [pcm.buffer]);
      } catch (err) {
        self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
      }
    });
  }
};
