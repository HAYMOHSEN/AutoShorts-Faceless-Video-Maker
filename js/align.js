// Word-timing alignment for captions. Works on any speech clip (AI voice or a microphone take):
// words share the *voiced* time in proportion to their estimated syllables, so pauses at
// punctuation automatically land in the silent gaps of the audio.

const FRAME = 0.01; // 10 ms analysis frames

export function syllables(word) {
  const w = String(word).toLowerCase();
  if (/[؀-ۿ]/.test(w)) return Math.max(1, Math.round(w.replace(/[^؀-ۿ]/g, '').length / 2));
  if (/\d/.test(w)) {
    const digits = w.replace(/[^0-9]/g, '').length;
    let s = Math.max(2, Math.round(digits * 1.6));
    if (/%/.test(w)) s += 2;
    return s;
  }
  const clean = w.replace(/[^a-z]/g, '');
  if (!clean) return 1;
  if (clean.length <= 3) return 1;
  const groups = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function splitWords(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function frameRms(pcm, sr) {
  const hop = Math.max(1, Math.round(sr * FRAME));
  const n = Math.floor(pcm.length / hop);
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * hop;
    for (let j = 0; j < hop; j++) {
      const v = pcm[o + j];
      s += v * v;
    }
    rms[i] = Math.sqrt(s / hop);
  }
  return rms;
}

function voicedMask(rms) {
  let peak = 0;
  for (const v of rms) peak = Math.max(peak, v);
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
  const thr = Math.max(peak * 0.045, floor * 2.5, 0.0025);
  const mask = new Uint8Array(rms.length);
  for (let i = 0; i < rms.length; i++) mask[i] = rms[i] > thr ? 1 : 0;
  // close tiny gaps (< 70 ms) inside speech
  let i = 0;
  while (i < mask.length) {
    if (!mask[i]) {
      let j = i;
      while (j < mask.length && !mask[j]) j++;
      if (i > 0 && j < mask.length && j - i < 7) for (let k = i; k < j; k++) mask[k] = 1;
      i = j;
    } else i++;
  }
  // drop isolated blips (< 30 ms)
  i = 0;
  while (i < mask.length) {
    if (mask[i]) {
      let j = i;
      while (j < mask.length && mask[j]) j++;
      if (j - i < 3) for (let k = i; k < j; k++) mask[k] = 0;
      i = j;
    } else i++;
  }
  return mask;
}

/** Speech start/end in seconds (leading and trailing silence trimmed). */
export function speechBounds(pcm, sr) {
  const rms = frameRms(pcm, sr);
  const mask = voicedMask(rms);
  let a = 0;
  while (a < mask.length && !mask[a]) a++;
  let b = mask.length - 1;
  while (b > a && !mask[b]) b--;
  if (a >= mask.length) return { start: 0, end: pcm.length / sr, mask, rms };
  return { start: Math.max(0, a * FRAME - 0.02), end: Math.min(pcm.length / sr, (b + 1) * FRAME + 0.04), mask, rms };
}

/**
 * Estimate per-word timings for `text` spoken in `pcm`.
 * Phrase breaks (commas, full stops…) are first matched to real pauses in the audio, then words
 * inside each phrase share that segment's voiced time by syllable weight.
 * @returns {{words: {w:string,start:number,end:number}[], start:number, end:number}}
 */
export function alignWords(text, pcm, sr) {
  const words = splitWords(text);
  const { start, end, mask } = speechBounds(pcm, sr);
  if (!words.length) return { words: [], start, end };
  const a = Math.floor(start / FRAME);
  const b = Math.min(mask.length, Math.ceil(end / FRAME));

  // phrases split at punctuation
  const phrases = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(i);
    if (/[,.;:!?…—–؟،]["')\]]*$/.test(w) && i < words.length - 1) {
      phrases.push(cur);
      cur = [];
    }
  });
  if (cur.length) phrases.push(cur);

  // pauses (>= 110 ms of silence) inside the speech
  const pauses = [];
  let f = a;
  while (f < b) {
    if (!mask[f]) {
      let g = f;
      while (g < b && !mask[g]) g++;
      if (g - f >= 11 && f > a && g < b) pauses.push({ s: f, e: g, len: g - f });
      f = g;
    } else f++;
  }

  if (phrases.length > 1 && pauses.length) {
    const weights = words.map((w) => syllables(w) + (w.length > 8 ? 0.4 : 0));
    const total = weights.reduce((x, y) => x + y, 0);
    // voiced-time position of each pause (fraction of all voiced frames before it)
    let voicedTotal = 0;
    for (let k = a; k < b; k++) voicedTotal += mask[k];
    const prefix = new Int32Array(b - a + 1);
    for (let k = a; k < b; k++) prefix[k - a + 1] = prefix[k - a] + mask[k];
    const pausePos = pauses.map((p) => prefix[p.s - a] / Math.max(1, voicedTotal));
    const bounds = [];
    let acc = 0;
    let from = 0;
    for (let pi = 0; pi < phrases.length - 1; pi++) {
      for (const wi of phrases[pi]) acc += weights[wi];
      const expected = acc / total;
      let best = -1;
      let bestScore = Infinity;
      for (let k = from; k < pauses.length; k++) {
        const score = Math.abs(pausePos[k] - expected) - Math.min(0.08, pauses[k].len * 0.002);
        if (score < bestScore && Math.abs(pausePos[k] - expected) < 0.22) {
          bestScore = score;
          best = k;
        }
      }
      bounds.push(best);
      if (best >= 0) from = best + 1;
    }
    // build segments and align each phrase inside its segment
    const out = [];
    let segStart = a;
    let pi = 0;
    while (pi < phrases.length) {
      // merge phrases whose boundary had no matching pause
      const group = [...phrases[pi]];
      while (pi < phrases.length - 1 && bounds[pi] < 0) {
        pi++;
        group.push(...phrases[pi]);
      }
      const pause = pi < phrases.length - 1 ? pauses[bounds[pi]] : null;
      const segEnd = pause ? pause.s : b;
      const local = alignSegment(group.map((i) => words[i]), mask, segStart, segEnd);
      out.push(...local);
      segStart = pause ? pause.e : b;
      pi++;
    }
    if (out.length === words.length) return { words: out, start, end };
  }
  return { words: alignSegment(words, mask, a, b), start, end };
}

function alignSegment(words, mask, a, b) {
  const start = a * FRAME;
  const end = b * FRAME;
  let voiced = 0;
  for (let i = a; i < b; i++) voiced += mask[i];
  const weights = words.map((w) => syllables(w) + (w.length > 8 ? 0.4 : 0));
  const total = weights.reduce((x, y) => x + y, 0);
  if (voiced < 5) {
    // no clear speech: spread evenly
    const dur = Math.max(0.3, end - start);
    let t = start;
    return words.map((w, i) => {
      const d = (dur * weights[i]) / total;
      const o = { w, start: t, end: t + d };
      t += d;
      return o;
    });
  }
  const targets = [];
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    targets.push((acc / total) * voiced);
    acc += weights[i];
  }
  const starts = new Array(words.length).fill(null);
  let k = 0;
  let count = 0;
  for (let f = a; f < b && k < words.length; f++) {
    while (k < words.length && count >= targets[k] - 1e-6) {
      // start the word at the next voiced frame
      let g = f;
      while (g < b && !mask[g]) g++;
      starts[k] = g * FRAME;
      k++;
    }
    count += mask[f];
  }
  for (let i = 0; i < words.length; i++) if (starts[i] == null) starts[i] = i ? starts[i - 1] + 0.12 : start;
  const out = [];
  for (let i = 0; i < words.length; i++) {
    let wEnd = i + 1 < words.length ? starts[i + 1] : end;
    // if a silence follows this word, end the word where the silence begins
    let f = Math.floor(starts[i] / FRAME) + 1;
    const stop = Math.floor(wEnd / FRAME);
    let run = 0;
    for (; f < stop; f++) {
      if (!mask[f]) {
        run++;
        if (run >= 12) {
          wEnd = (f - run + 1) * FRAME;
          break;
        }
      } else run = 0;
    }
    out.push({ w: words[i], start: starts[i], end: Math.max(starts[i] + 0.08, wEnd) });
  }
  return out;
}

/** Even spread for scenes that have no audio (captions-only videos). */
export function estimateWords(text, duration, offset = 0) {
  const words = splitWords(text);
  const weights = words.map((w) => syllables(w) + (/[,.;:!?]$/.test(w) ? 1.2 : 0));
  const total = weights.reduce((x, y) => x + y, 0) || 1;
  let t = offset;
  return words.map((w, i) => {
    const d = (duration * weights[i]) / total;
    const o = { w, start: t, end: t + d * 0.92 };
    t += d;
    return o;
  });
}

/** Trim silence, add 6 ms fades. Returns a new Float32Array and the trim offset (s). */
export function trimClip(pcm, sr, pad = 0.05) {
  const { start, end } = speechBounds(pcm, sr);
  const a = Math.max(0, Math.floor((start - pad) * sr));
  const b = Math.min(pcm.length, Math.ceil((end + pad) * sr));
  const out = pcm.slice(a, Math.max(a + 1, b));
  const fade = Math.min(out.length >> 1, Math.round(sr * 0.006));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return { pcm: out, offset: a / sr };
}
