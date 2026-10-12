// On-device neural text-to-speech (Kokoro-82M via ONNX Runtime Web). Runs in a module worker so the
// interface stays responsive. The model is downloaded once and kept in the browser cache.

import { KokoroTTS, env } from '../vendor/kokoro.web.js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;
let loading = null;
let chain = Promise.resolve();

async function load({ device, dtype, wasmPaths }) {
  if (tts) return tts;
  if (!loading) {
    env.wasmPaths = wasmPaths;
    loading = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (p) => {
        if (p && (p.status === 'progress' || p.status === 'done' || p.status === 'initiate')) {
          self.postMessage({ type: 'progress', file: p.file, status: p.status, loaded: p.loaded || 0, total: p.total || 0, progress: p.progress || 0 });
        }
      },
    })
      .then((m) => {
        tts = m;
        return m;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'load') {
    load(m)
      .then(() => self.postMessage({ type: 'ready', id: m.id, device: m.device }))
      .catch((err) => self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) }));
    return;
  }
  if (m.type === 'speak') {
    // serialise generation: one inference at a time
    chain = chain.then(async () => {
      try {
        const model = await load(m);
        const audio = await model.generate(m.text, { voice: m.voice, speed: m.speed || 1 });
        const pcm = audio.audio instanceof Float32Array ? audio.audio : new Float32Array(audio.audio);
        self.postMessage({ type: 'audio', id: m.id, pcm, sampleRate: audio.sampling_rate }, [pcm.buffer]);
      } catch (err) {
        self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
      }
    });
  }
};
