// Lays scenes out in time: voice clips back to back with natural gaps, optionally snapped to the
// music's beat grid so every cut lands on a beat. Produces absolute word timings for captions.

import { moodById } from './music.js';
import { estimateWords } from './align.js';
import { estimateSeconds } from './script.js';

export const PACING = { tight: 0.06, natural: 0.2, relaxed: 0.42 };

/**
 * @param {object} project
 * @param {Map<string, object|null>} clips  scene id → voice clip ({duration, words, pcm, sampleRate})
 */
export function buildTimeline(project, clips) {
  const st = project.settings;
  const voiceOn = st.voice.mode !== 'none';
  const speed = st.voice.speed || 1;
  const musicOn = st.music.enabled && st.music.mood !== 'custom';
  const bpm = musicOn ? moodById(st.music.mood).bpm : 100;
  let grid = 60 / bpm / 2;
  if (grid > 0.3) grid /= 2;
  const snap = st.music.beatSync && st.music.enabled;
  const gap = PACING[st.pacing || 'natural'] ?? 0.2;

  const scenes = [];
  let t = 0.12;
  project.scenes.forEach((sc, i) => {
    const clip = voiceOn ? clips.get(sc.id) || null : null;
    let start = i === 0 ? 0.12 : t + gap;
    if (snap && i > 0) start = Math.ceil((start - 1e-6) / grid) * grid;
    const dur = clip ? clip.duration : estimateSeconds(sc.text, speed);
    const words = clip && clip.words && clip.words.length
      ? clip.words.map((w) => ({ w: w.w, start: start + w.start, end: start + w.end }))
      : estimateWords(sc.text, dur, start);
    scenes.push({
      id: sc.id,
      index: i,
      kind: sc.kind,
      voiceStart: start,
      voiceEnd: start + dur,
      clip,
      words,
      start: i === 0 ? 0 : start,
      end: 0,
    });
    t = start + dur + (sc.pauseAfter || 0);
  });

  const tail = 0.75;
  const duration = Math.max(2.5, (scenes.length ? scenes[scenes.length - 1].voiceEnd : 2) + tail);
  scenes.forEach((s, i) => {
    s.end = i + 1 < scenes.length ? scenes[i + 1].start : duration;
  });

  const cuts = scenes.slice(1).map((s) => s.start);
  const pops = [];
  project.scenes.forEach((sc, i) => {
    const showSticker = (st.visuals.stickers && sc.emoji) || (st.visuals.stats && sc.stat);
    if (showSticker && scenes[i]) pops.push(scenes[i].start + (i === 0 ? 0.25 : 0.08));
  });

  return { duration, bpm, grid, scenes, cuts, pops };
}

export function sceneAt(timeline, t) {
  const sc = timeline.scenes;
  if (!sc.length) return -1;
  let lo = 0;
  let hi = sc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sc[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
