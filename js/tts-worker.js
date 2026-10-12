// On-device neural text-to-speech (Kokoro-82M via ONNX Runtime Web). Runs in a module worker so the
// interface stays responsive. The model is downloaded once and kept in the browser cache.
// English voices use the engine's own phonemizer; Spanish, French, Hindi and Portuguese voices are
// phonemized with eSpeak NG (js/espeak.js), the way the model was trained.

import { KokoroTTS, env } from '../vendor/kokoro.web.js';
import { phonemize, kokoroPhonemes, KOKORO_ESPEAK, ESPEAK_LANG } from './espeak.js';

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

async function generate(model, text, voice, speed) {
  const lang = KOKORO_ESPEAK[voice[0]];
  if (!lang) return model.generate(text, { voice, speed });
  const [res] = await phonemize([text], lang);
  const ipa = res ? kokoroPhonemes(res.phonemes, ESPEAK_LANG[lang]) : '';
  if (!ipa) throw new Error('This line has nothing to read aloud.');
  const { input_ids } = model.tokenizer(ipa, { truncation: true });
  return model.generate_from_ids(input_ids, { voice, speed });
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
        const audio = await generate(model, m.text, m.voice, m.speed || 1);
        const pcm = audio.audio instanceof Float32Array ? audio.audio : new Float32Array(audio.audio);
        self.postMessage({ type: 'audio', id: m.id, pcm, sampleRate: audio.sampling_rate }, [pcm.buffer]);
      } catch (err) {
        self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
      }
    });
  }
};
