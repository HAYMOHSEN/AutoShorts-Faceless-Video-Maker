// Final audio mix: voice clips on the timeline, music bed ducked under speech, optional
// transition whooshes and sticker pops, gentle bus compression and peak normalisation.

import { normalize } from './music.js';

const SR = 48000;

function noiseBuffer(c) {
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0);
  let s = 9;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

function whoosh(c, out, noise, t, vel = 1) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(5200, t + 0.2);
  bp.frequency.exponentialRampToValueAtTime(1500, t + 0.34);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  const pan = c.createStereoPanner ? c.createStereoPanner() : null;
  if (pan) {
    pan.pan.setValueAtTime(-0.5, t);
    pan.pan.linearRampToValueAtTime(0.5, t + 0.34);
    src.connect(bp).connect(g).connect(pan).connect(out);
  } else src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + 0.4);
}

function pop(c, out, t, vel = 1) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(1250, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.1);
}

/**
 * @param {object} o
 * @param {number} o.duration
 * @param {{start:number, clip:{pcm:Float32Array, sampleRate:number}}[]} o.voices
 * @param {AudioBuffer|null} o.music
 * @param {number} o.musicVolume  0..1
 * @param {boolean} o.duck
 * @param {boolean} o.loopMusic   loop a user track that is shorter than the video
 * @param {number[]} o.cuts       scene cut times (whoosh)
 * @param {number[]} o.pops       sticker entrance times (pop)
 * @param {boolean} o.sfx
 * @returns {Promise<AudioBuffer>}
 */
export async function mixdown(o) {
  const duration = Math.max(1, o.duration);
  const c = new OfflineAudioContext(2, Math.ceil(SR * duration), SR);

  const master = c.createGain();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.18;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  master.connect(comp).connect(limiter).connect(c.destination);

  // voice bus
  const vbus = c.createGain();
  vbus.gain.value = 1;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 75;
  const presence = c.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.gain.value = 2;
  presence.Q.value = 0.8;
  const vcomp = c.createDynamicsCompressor();
  vcomp.threshold.value = -20;
  vcomp.ratio.value = 3;
  vcomp.attack.value = 0.004;
  vcomp.release.value = 0.12;
  vbus.connect(hp).connect(presence).connect(vcomp).connect(master);

  const spans = [];
  for (const v of o.voices || []) {
    if (!v.clip || !v.clip.pcm || !v.clip.pcm.length) continue;
    const b = c.createBuffer(1, v.clip.pcm.length, v.clip.sampleRate);
    b.copyToChannel(v.clip.pcm, 0);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(vbus);
    s.start(Math.max(0, v.start));
    spans.push([v.start, v.start + v.clip.pcm.length / v.clip.sampleRate]);
  }
  spans.sort((a, b) => a[0] - b[0]);

  // music bed
  if (o.music) {
    const src = c.createBufferSource();
    src.buffer = o.music;
    src.loop = !!o.loopMusic && o.music.duration < duration;
    const g = c.createGain();
    const base = Math.max(0, Math.min(1, o.musicVolume ?? 0.35));
    const low = base * (o.duckAmount ?? 0.32);
    const fadeStart = Math.max(0.5, duration - 1.4);
    // merge voice spans separated by short gaps so the music doesn't pump between sentences
    const merged = [];
    if (o.duck) {
      for (const s of spans) {
        const last = merged[merged.length - 1];
        if (last && s[0] - last[1] < 0.7) last[1] = Math.max(last[1], s[1]);
        else merged.push([...s]);
      }
    }
    // if the voice starts right away, fade the music straight in at the ducked level
    const startLow = merged.length && merged[0][0] < 0.5;
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(startLow ? low : base, 0.35);
    let lastEvent = 0.35;
    if (merged.length) {
      for (const [k, [a, b]] of merged.entries()) {
        const da = Math.max(lastEvent + 0.01, a - 0.12);
        if (da >= fadeStart) break;
        if (!(k === 0 && startLow)) g.gain.setTargetAtTime(low, da, 0.05);
        lastEvent = da;
        const rb = b + 0.08;
        if (rb < fadeStart - 0.1) {
          g.gain.setTargetAtTime(base, rb, 0.22);
          lastEvent = rb;
        }
      }
    }
    g.gain.setTargetAtTime(0.0001, Math.max(fadeStart, lastEvent + 0.01), 0.35);
    src.connect(g).connect(master);
    src.start(0);
    src.stop(duration);
  }

  if (o.sfx) {
    const fx = c.createGain();
    fx.gain.value = 0.9;
    fx.connect(master);
    const noise = noiseBuffer(c);
    for (const t of o.cuts || []) if (t > 0.2 && t < duration - 0.3) whoosh(c, fx, noise, Math.max(0, t - 0.2), 0.8);
    for (const t of o.pops || []) if (t >= 0 && t < duration - 0.2) pop(c, fx, t, 0.8);
  }

  const out = await c.startRendering();
  normalize(out, 0.89);
  return out;
}

/** Encode an AudioBuffer as a 16-bit WAV Blob (used for previews and downloads). */
export function audioBufferToWav(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length * ch * 2 + 44;
  const view = new DataView(new ArrayBuffer(len));
  const w = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  view.setUint32(4, len - 8, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, len - 44, true);
  const data = [];
  for (let i = 0; i < ch; i++) data.push(buf.getChannelData(i));
  let off = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let k = 0; k < ch; k++) {
      const v = Math.max(-1, Math.min(1, data[k][i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
