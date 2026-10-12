// Generative background music. Every track is synthesised on the device with the Web Audio API,
// so it is original and royalty-free by construction. Tempo is fixed per mood so scene cuts can
// be locked to the beat grid.

import { mulberry32, hashString } from './util.js';

export const MOODS = [
  { id: 'lofi', name: 'Lo-fi chill', bpm: 84, free: true, desc: 'Dusty drums, warm keys' },
  { id: 'upbeat', name: 'Upbeat pop', bpm: 118, free: true, desc: 'Bouncy and bright' },
  { id: 'ambient', name: 'Calm ambient', bpm: 70, free: true, desc: 'Soft pads, no drums' },
  { id: 'cinematic', name: 'Cinematic', bpm: 90, desc: 'Big and emotional' },
  { id: 'tech', name: 'Tech pulse', bpm: 104, desc: 'Arpeggios, synthwave' },
  { id: 'hiphop', name: 'Boom bap', bpm: 90, desc: 'Head-nod hip-hop' },
  { id: 'mystery', name: 'Mystery', bpm: 80, desc: 'Tense and curious' },
  { id: 'inspire', name: 'Inspiring', bpm: 110, desc: 'Hopeful piano, claps' },
];

export const moodById = (id) => MOODS.find((m) => m.id === id) || MOODS[0];

const SR = 48000;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- shared resources per context

function makeNoise(c, seconds = 2) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

function makeImpulse(c, seconds = 2.4, decay = 3.2) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = 777 + ch * 99;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s / 0x7fffffff) * 2 - 1;
      const t = i / len;
      d[i] = n * Math.pow(1 - t, decay) * (i < c.sampleRate * 0.01 ? i / (c.sampleRate * 0.01) : 1);
    }
  }
  return buf;
}

function makeCrackle(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  let s = 4242;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const r = s / 0x7fffffff;
    d[i] = (r * 2 - 1) * 0.012 + (r > 0.9993 ? (r - 0.9993) * 900 * (i % 2 ? 1 : -1) : 0);
  }
  return buf;
}

class Kit {
  constructor(c, seed) {
    this.c = c;
    this.rng = mulberry32(seed);
    this.noise = makeNoise(c);
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.Q.value = 0.5;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.2;
    this.master.connect(this.tone).connect(comp).connect(c.destination);
    this.drums = c.createGain();
    this.drums.connect(this.master);
    this.inst = c.createGain(); // instruments, can be "pumped" by the kick
    this.inst.connect(this.master);
    this.verb = c.createConvolver();
    this.verb.buffer = makeImpulse(c);
    this.verbIn = c.createGain();
    this.verbIn.gain.value = 0.5;
    const verbOut = c.createGain();
    verbOut.gain.value = 0.55;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.master);
  }

  noiseSrc(t, dur) {
    const s = this.c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, this.rng() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  gainEnv(t, a, peak, d, end = 0.0001) {
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
    return g;
  }

  // ------------------------------------------------ drums
  kick(t, vel = 1, { tone = 1, decay = 0.42 } = {}) {
    const c = this.c;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160 * tone, t);
    o.frequency.exponentialRampToValueAtTime(46 * tone, t + 0.12);
    const g = this.gainEnv(t, 0.003, 0.95 * vel, decay);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + decay + 0.05);
    const n = this.noiseSrc(t, 0.02);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = this.gainEnv(t, 0.001, 0.18 * vel, 0.015);
    n.connect(hp).connect(ng).connect(this.drums);
  }

  snare(t, vel = 1, { tight = false } = {}) {
    const c = this.c;
    const len = tight ? 0.12 : 0.2;
    const n = this.noiseSrc(t, len);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;
    const g = this.gainEnv(t, 0.002, 0.55 * vel, len);
    n.connect(bp).connect(hp).connect(g).connect(this.drums);
    const send = c.createGain();
    send.gain.value = 0.25;
    g.connect(send).connect(this.verbIn);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const og = this.gainEnv(t, 0.002, 0.35 * vel, 0.09);
    o.connect(og).connect(this.drums);
    o.start(t);
    o.stop(t + 0.12);
  }

  clap(t, vel = 1) {
    const c = this.c;
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.011;
      const n = this.noiseSrc(tt, 0.03);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 1.1;
      const g = this.gainEnv(tt, 0.001, 0.42 * vel, k === 2 ? 0.16 : 0.02);
      n.connect(bp).connect(g).connect(this.drums);
      if (k === 2) {
        const send = c.createGain();
        send.gain.value = 0.35;
        g.connect(send).connect(this.verbIn);
      }
    }
  }

  hat(t, vel = 1, open = false) {
    const c = this.c;
    const len = open ? 0.22 : 0.045;
    const n = this.noiseSrc(t, len);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = this.gainEnv(t, 0.001, 0.2 * vel, len);
    n.connect(hp).connect(g).connect(this.drums);
  }

  shaker(t, vel = 1) {
    const c = this.c;
    const n = this.noiseSrc(t, 0.09);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 6000;
    bp.Q.value = 1.4;
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 * vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(bp).connect(g).connect(this.drums);
  }

  tick(t, vel = 1) {
    const c = this.c;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = 2400;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 6;
    const g = this.gainEnv(t, 0.001, 0.12 * vel, 0.025);
    o.connect(bp).connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.04);
  }

  impact(t, vel = 1) {
    const c = this.c;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.1);
    const g = this.gainEnv(t, 0.004, 0.9 * vel, 1.3);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 1.4);
    const n = this.noiseSrc(t, 0.6);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    const ng = this.gainEnv(t, 0.002, 0.35 * vel, 0.55);
    n.connect(lp).connect(ng);
    ng.connect(this.drums);
    const send = c.createGain();
    send.gain.value = 0.8;
    ng.connect(send).connect(this.verbIn);
  }

  riser(t, dur, vel = 1) {
    const c = this.c;
    const n = this.noiseSrc(t, dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vel, t + dur * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    n.connect(bp).connect(g);
    g.connect(this.drums);
    const send = c.createGain();
    send.gain.value = 0.6;
    g.connect(send).connect(this.verbIn);
  }

  // ------------------------------------------------ tonal voices
  keys(t, midi, dur, vel = 1, { bright = 3200, verb = 0.3 } = {}) {
    const c = this.c;
    const f = mtof(midi);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = bright;
    const g = c.createGain();
    const peak = 0.16 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.7);
    g.gain.setValueAtTime(peak * 0.35, t + Math.max(0.71, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.71, dur) + 0.5);
    const end = t + Math.max(0.71, dur) + 0.55;
    const o1 = c.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.001;
    const g2 = this.gainEnv(t, 0.004, 0.35, 0.35, 0.02);
    const o3 = c.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = f * 0.999;
    const g3 = c.createGain();
    g3.gain.value = 0.25;
    o1.connect(g);
    o2.connect(g2).connect(g);
    o3.connect(g3).connect(g);
    g.connect(lp).connect(this.inst);
    if (verb) {
      const s = c.createGain();
      s.gain.value = verb;
      lp.connect(s).connect(this.verbIn);
    }
    for (const o of [o1, o2, o3]) {
      o.start(t);
      o.stop(end);
    }
  }

  piano(t, midi, vel = 1, decay = 1.6) {
    const c = this.c;
    const f = mtof(midi);
    const g = this.gainEnv(t, 0.003, 0.14 * vel, decay);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + decay);
    const parts = [
      [1, 'triangle', 1],
      [2, 'sine', 0.35],
      [3, 'sine', 0.12],
    ];
    for (const [mul, type, amp] of parts) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul * (1 + (this.rng() - 0.5) * 0.0015);
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
    g.connect(lp).connect(this.inst);
    const s = c.createGain();
    s.gain.value = 0.35;
    lp.connect(s).connect(this.verbIn);
  }

  pad(t, midis, dur, vel = 1, { cutoff = 1300, verb = 0.6, attack = 0.5 } = {}) {
    const c = this.c;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff * 0.6, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.75, t + dur);
    lp.Q.value = 0.4;
    const g = c.createGain();
    const peak = (0.05 * vel) / Math.sqrt(midis.length / 3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack + 0.01, dur - 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
    for (const m of midis) {
      for (const det of [-9, 8]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 1);
      }
    }
    g.connect(lp).connect(this.inst);
    const s = c.createGain();
    s.gain.value = verb;
    lp.connect(s).connect(this.verbIn);
  }

  pluck(t, midi, vel = 1, { decay = 0.28, open = 3800, type = 'sawtooth', verb = 0.25 } = {}) {
    const c = this.c;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = mtof(midi);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(open, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + decay);
    const g = this.gainEnv(t, 0.003, 0.11 * vel, decay + 0.05);
    o.connect(lp).connect(g).connect(this.inst);
    if (verb) {
      const s = c.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verbIn);
    }
    o.start(t);
    o.stop(t + decay + 0.1);
  }

  bass(t, midi, dur, vel = 1, { kind = 'synth' } = {}) {
    const c = this.c;
    const f = mtof(midi);
    if (kind === '808') {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.9, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const sh = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 2.2);
      }
      sh.curve = curve;
      const g = this.gainEnv(t, 0.004, 0.42 * vel, Math.max(0.3, dur));
      o.connect(sh).connect(g).connect(this.inst);
      o.start(t);
      o.stop(t + dur + 0.1);
      return;
    }
    const o = c.createOscillator();
    o.type = kind === 'sub' ? 'sine' : 'sawtooth';
    o.frequency.value = f;
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(kind === 'sub' ? 500 : 900, t);
    lp.frequency.exponentialRampToValueAtTime(kind === 'sub' ? 300 : 260, t + Math.min(0.25, dur));
    lp.Q.value = 1.5;
    const g = c.createGain();
    const peak = 0.26 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + Math.min(0.2, dur));
    g.gain.setValueAtTime(peak * 0.6, t + Math.max(0.21, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.24, dur));
    const sg = c.createGain();
    sg.gain.value = 0.7;
    o.connect(lp).connect(g);
    sub.connect(sg).connect(g);
    g.connect(this.inst);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  bell(t, midi, vel = 1, decay = 2.2) {
    const c = this.c;
    const f = mtof(midi);
    const car = c.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = c.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 3.5;
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = this.gainEnv(t, 0.002, 0.08 * vel, decay);
    car.connect(g).connect(this.inst);
    const s = c.createGain();
    s.gain.value = 0.7;
    g.connect(s).connect(this.verbIn);
    car.start(t);
    mod.start(t);
    car.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  drone(t, midi, dur, vel = 1) {
    const c = this.c;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * vel, t + 1.5);
    g.gain.setValueAtTime(0.06 * vel, t + Math.max(1.6, dur - 1));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    for (const [m, type, det] of [[midi, 'sawtooth', -5], [midi + 7, 'sawtooth', 6], [midi - 12, 'sine', 0]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
    g.connect(lp).connect(this.inst);
    const s = c.createGain();
    s.gain.value = 0.5;
    lp.connect(s).connect(this.verbIn);
  }

  pump(t, depth = 0.55, rel = 0.22) {
    const g = this.inst.gain;
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(1 - depth, t + 0.01);
    g.linearRampToValueAtTime(1, t + rel);
  }

  crackle(dur) {
    const s = this.c.createBufferSource();
    s.buffer = makeCrackle(this.c, Math.min(dur, 30));
    s.loop = true;
    const lp = this.c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 2500;
    lp.Q.value = 0.5;
    const g = this.c.createGain();
    g.gain.value = 0.55;
    s.connect(lp).connect(g).connect(this.master);
    s.start(0);
    s.stop(dur);
  }
}

// ---------------------------------------------------------------- songs

const PROGS = {
  lofi: { chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: [41, 40, 38, 36] },
  upbeat: { chords: [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]], bass: [36, 43, 45, 41] },
  ambient: { chords: [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 57, 59], [43, 50, 55, 57, 62]], bass: [36, 33, 29, 31] },
  cinematic: { chords: [[50, 57, 62, 65], [46, 53, 58, 62], [41, 53, 57, 60], [48, 55, 60, 64]], bass: [38, 34, 41, 36] },
  tech: { chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]], bass: [45, 41, 48, 43] },
  hiphop: { chords: [[60, 63, 67, 70], [56, 60, 63, 67], [53, 56, 60, 63], [55, 59, 62, 65]], bass: [36, 32, 29, 31] },
  mystery: { chords: [[52, 55, 59], [48, 52, 55, 59], [45, 52, 57, 60], [47, 51, 54, 57]], bass: [40, 36, 33, 35] },
  inspire: { chords: [[55, 59, 62, 67], [54, 57, 62, 66], [52, 55, 59, 64], [52, 55, 60, 64]], bass: [43, 38, 40, 36] },
};

function scheduleSong(k, moodId, bars, bpm, total) {
  const beat = 60 / bpm;
  const bar = beat * 4;
  const step = beat / 4;
  const prog = PROGS[moodId] || PROGS.lofi;
  const r = k.rng;
  const swingAmt = moodId === 'lofi' || moodId === 'hiphop' ? 0.18 : 0;
  const st = (b, s) => b * bar + s * step + (s % 2 === 1 ? swingAmt * step : 0);

  k.tone.frequency.value = moodId === 'lofi' ? 5200 : 18000;

  for (let b = 0; b < bars; b++) {
    const ci = b % 4;
    const chord = prog.chords[ci];
    const root = prog.bass[ci];
    const t0 = b * bar;
    if (t0 > total + 0.5) break;
    const last = b === bars - 1;
    const fill = b % 4 === 3;

    switch (moodId) {
      case 'lofi': {
        k.keys(t0, chord[0], bar * 0.95, 0.9, { bright: 2600 });
        chord.slice(1).forEach((m, i) => k.keys(t0 + 0.012 * (i + 1), m, bar * 0.95, 0.8, { bright: 2600 }));
        if (r() < 0.5) chord.slice(1).forEach((m) => k.keys(st(b, 10), m, beat * 1.4, 0.5, { bright: 2300 }));
        k.bass(t0, root, beat * 1.6, 0.9, { kind: 'sub' });
        k.bass(st(b, 10), root, beat * 1.2, 0.7, { kind: 'sub' });
        for (const s of [0, 7, 10]) k.kick(st(b, s), s === 0 ? 0.9 : 0.6, { tone: 0.9, decay: 0.35 });
        for (const s of [4, 12]) k.snare(st(b, s), 0.55);
        for (let s = 0; s < 16; s += 2) k.hat(st(b, s), 0.5 + r() * 0.35);
        if (fill) k.hat(st(b, 15), 0.4);
        break;
      }
      case 'upbeat': {
        for (const s of [0, 4, 8, 12]) {
          k.kick(st(b, s), 0.95);
          k.pump(st(b, s), 0.45, beat * 0.6);
        }
        for (const s of [4, 12]) k.clap(st(b, s), 0.8);
        for (const s of [2, 6, 10, 14]) k.hat(st(b, s), 0.75, s === 14 && fill);
        for (let s = 1; s < 16; s += 2) k.hat(st(b, s), 0.25);
        for (const s of [0, 3, 6, 8, 11, 14]) chord.forEach((m) => k.pluck(st(b, s), m, 0.85, { decay: 0.22, open: 4200 }));
        for (let s = 0; s < 16; s += 2) k.bass(st(b, s), root + (s % 8 === 6 ? 12 : 0), step * 1.7, 0.8);
        if (fill) k.riser(t0 + beat * 2, beat * 2, 0.6);
        break;
      }
      case 'ambient': {
        if (b % 2 === 0) {
          const ch = prog.chords[Math.floor(b / 2) % 4];
          k.pad(t0, ch, bar * 2, 1, { cutoff: 1500, verb: 0.9, attack: 1.2 });
          k.bass(t0, prog.bass[Math.floor(b / 2) % 4], bar * 2, 0.45, { kind: 'sub' });
        }
        const scale = [72, 74, 76, 79, 81, 84];
        for (let s = 0; s < 16; s += 4) if (r() < 0.45) k.bell(st(b, s), scale[Math.floor(r() * scale.length)], 0.8);
        if (b > 0) for (let s = 0; s < 16; s += 4) k.shaker(st(b, s + 2), 0.35);
        break;
      }
      case 'cinematic': {
        if (b % 4 === 0) k.impact(t0, 0.9);
        k.pad(t0, chord, bar, 1, { cutoff: 1100, verb: 0.8, attack: 0.4 });
        for (let s = 0; s < 16; s += 2) k.pluck(st(b, s), root + 12, 0.7, { decay: 0.18, open: 900, type: 'sawtooth', verb: 0.2 });
        k.bass(t0, root, bar * 0.95, 0.8, { kind: 'sub' });
        for (const s of [0, 6, 8]) k.kick(st(b, s), 0.55, { tone: 0.7, decay: 0.6 });
        if (b % 2 === 1) k.piano(t0 + beat * 2, chord[chord.length - 1] + 12, 0.7, 2.4);
        if (b % 4 === 3) k.riser(t0, bar, 0.7);
        break;
      }
      case 'tech': {
        for (const s of [0, 8]) k.kick(st(b, s), 0.95);
        if (r() < 0.5) k.kick(st(b, 11), 0.6);
        for (const s of [4, 12]) k.snare(st(b, s), 0.7, { tight: true });
        for (let s = 0; s < 16; s += 2) k.hat(st(b, s + 1), 0.5);
        const arp = [...chord, chord[0] + 12, chord[1] + 12];
        for (let s = 0; s < 16; s++) k.pluck(st(b, s), arp[(s * (b % 2 ? 3 : 1)) % arp.length] + 12, 0.75, { decay: 0.16, open: 3200, type: 'square', verb: 0.3 });
        k.pad(t0, chord.map((m) => m - 12), bar, 0.7, { cutoff: 900, verb: 0.5, attack: 0.2 });
        for (let s = 0; s < 16; s += 2) k.bass(st(b, s), root, step * 1.6, 0.75);
        if (fill) k.riser(t0 + beat * 2, beat * 2, 0.5);
        break;
      }
      case 'hiphop': {
        for (const s of [0, 7, 10]) k.kick(st(b, s), s === 0 ? 1 : 0.75, { decay: 0.4 });
        for (const s of [4, 12]) k.snare(st(b, s), 0.85);
        for (let s = 0; s < 16; s += 2) k.hat(st(b, s), 0.45 + (s % 4 === 2 ? 0.25 : 0));
        k.bass(t0, root, beat * 1.5, 1, { kind: '808' });
        k.bass(st(b, 10), root, beat * 1.2, 0.8, { kind: '808' });
        for (const s of [0, 6]) chord.forEach((m) => k.keys(st(b, s), m, beat * 1.2, 0.65, { bright: 2200, verb: 0.2 }));
        break;
      }
      case 'mystery': {
        for (let s = 0; s < 16; s += 2) k.tick(st(b, s), s % 4 === 0 ? 0.9 : 0.55);
        if (b % 2 === 0) k.drone(t0, root, bar * 2, 1);
        const scale = [64, 67, 71, 72, 75, 76];
        for (let s = 0; s < 16; s += 2) if (r() < 0.38) k.pluck(st(b, s), scale[Math.floor(r() * scale.length)], 0.7, { decay: 0.2, open: 1600, type: 'triangle', verb: 0.5 });
        if (b % 4 === 0) k.kick(t0, 0.7, { tone: 0.6, decay: 0.9 });
        if (b % 4 === 2) k.bell(t0 + beat, chord[0] + 24, 0.5, 2.6);
        break;
      }
      case 'inspire': {
        for (const s of [0, 8]) k.kick(st(b, s), 0.75);
        for (const s of [4, 12]) k.clap(st(b, s), 0.65);
        for (let s = 0; s < 16; s += 2) k.shaker(st(b, s + 1), 0.6);
        const arp = [chord[0], chord[1], chord[2], chord[chord.length - 1] + 12];
        for (let s = 0; s < 16; s += 2) k.piano(st(b, s), arp[(s / 2) % arp.length] + 12, 0.75, 1.1);
        k.pad(t0, chord, bar, 0.6, { cutoff: 1800, verb: 0.6, attack: 0.3 });
        k.bass(t0, root, beat * 2, 0.75, { kind: 'sub' });
        k.bass(t0 + beat * 2, root, beat * 2, 0.6, { kind: 'sub' });
        if (fill) k.riser(t0 + beat * 2, beat * 2, 0.45);
        break;
      }
      default:
        break;
    }
    if (last) break;
  }
  if (moodId === 'lofi' || moodId === 'hiphop') k.crackle(total + 1);
}

const loops = new Map();
const LOOP_BARS = 8;
const TAIL = 3;

/** Render one seamless 8-bar loop for a mood (reverb tails wrapped around). Cached. */
function renderLoop(moodId, seed) {
  const mood = moodById(moodId);
  const key = mood.id + '|' + seed;
  if (loops.has(key)) return loops.get(key);
  const p = (async () => {
    const bar = (60 / mood.bpm) * 4;
    const loopLen = Math.round(bar * LOOP_BARS * SR);
    const c = new OfflineAudioContext(2, loopLen + TAIL * SR, SR);
    const k = new Kit(c, hashString(mood.id) ^ seed);
    scheduleSong(k, mood.id, LOOP_BARS, mood.bpm, bar * LOOP_BARS);
    const rendered = await c.startRendering();
    const out = new AudioBuffer({ numberOfChannels: 2, length: loopLen, sampleRate: SR });
    for (let ch = 0; ch < 2; ch++) {
      const src = rendered.getChannelData(ch);
      const dst = out.getChannelData(ch);
      dst.set(src.subarray(0, loopLen));
      const tail = Math.min(src.length - loopLen, loopLen);
      for (let i = 0; i < tail; i++) dst[i] += src[loopLen + i];
    }
    normalize(out, 0.85);
    return out;
  })();
  loops.set(key, p);
  p.catch(() => loops.delete(key));
  return p;
}

/**
 * Music bed of `seconds` length: the mood's loop tiled, with a short fade-in and a fade-out.
 * @returns {Promise<AudioBuffer>}
 */
export async function renderMusic(moodId, seconds, seed = 1) {
  const loop = await renderLoop(moodId, seed);
  const total = Math.max(1, seconds);
  const len = Math.ceil(total * SR);
  const out = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: SR });
  const fadeIn = Math.round(0.25 * SR);
  const fadeOut = Math.round(Math.min(1.6, total / 3) * SR);
  for (let ch = 0; ch < 2; ch++) {
    const src = loop.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let o = 0; o < len; o += src.length) dst.set(src.subarray(0, Math.min(src.length, len - o)), o);
    for (let i = 0; i < fadeIn && i < len; i++) dst[i] *= i / fadeIn;
    for (let i = 0; i < fadeOut && i < len; i++) dst[len - 1 - i] *= i / fadeOut;
  }
  return out;
}

/** Warm the loop cache in the background (e.g. while the voice is being generated). */
export function prepareMusic(moodId, seed = 1) {
  return renderLoop(moodId, seed).catch(() => null);
}

export function normalize(buf, target = 0.89) {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  if (peak < 1e-5) return buf;
  const g = target / peak;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return buf;
}

/** Short looping preview for the mood picker. */
export function previewMusic(moodId) {
  return renderMusic(moodId, 12, 1);
}
