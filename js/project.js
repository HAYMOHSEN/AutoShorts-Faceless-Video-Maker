// Project model: defaults, persistence and helpers.

import { db } from './db.js';
import { uid, deepClone } from './util.js';
import { lookById, paletteOf } from './visuals.js';
import { clipKey, previewKeys } from './tts.js';

export function defaultSettings(o = {}) {
  const look = o.look || 'aurora';
  return {
    voice: { mode: 'ai', id: o.voiceId || 'af_heart', speed: 1 },
    music: { enabled: o.mood !== 'none', mood: o.mood && o.mood !== 'none' ? o.mood : 'lofi', volume: 0.3, duck: true, beatSync: true, sfx: true, customAssetId: null, customName: '' },
    visuals: { look, motion: true, dim: 0.25, stickers: true, stats: true, titleBanner: 'always', progress: true, transition: 'auto' },
    captions: { style: o.captionStyle || 'pop', position: 'middle', size: 1, highlight: o.highlight || '#FFD23F', color: '#FFFFFF', uppercase: null, keywords: true, maxWords: null },
    pacing: 'natural',
  };
}

export function createProject({ script, mode, input, format, seconds, settings, source = {} }) {
  const now = Date.now();
  return {
    id: uid('p'),
    version: 1,
    title: script.title,
    topic: script.topic,
    format,
    seconds,
    created: now,
    updated: now,
    source: { mode, input: String(input || '').slice(0, 20000), ...source },
    settings,
    scenes: script.scenes,
    publish: null,
    thumb: '',
    exports: [],
  };
}

export async function saveProject(p) {
  p.updated = Date.now();
  await db.put('projects', JSON.parse(JSON.stringify(p)));
}

export async function loadProject(id) {
  return db.get('projects', id);
}

export async function listProjects() {
  const all = await db.all('projects').catch(() => []);
  return all.sort((a, b) => b.updated - a.updated);
}

export async function deleteProject(id) {
  await db.del('projects', id);
}

export async function duplicateProject(p) {
  const copy = deepClone(p);
  copy.id = uid('p');
  copy.title = `${p.title} (copy)`;
  copy.created = copy.updated = Date.now();
  copy.exports = [];
  copy.scenes = copy.scenes.map((s) => ({ ...s, id: uid('s') }));
  await saveProject(copy);
  return copy;
}

/**
 * Remove voice lines and music tracks that no saved video uses any more — every edit of a line
 * leaves its old take behind. Imported photos and clips stay: they are the media library.
 * Only items older than minAgeMs are removed, so work in progress is never touched.
 */
export async function cleanupStorage({ minAgeMs = 36 * 3600 * 1000 } = {}) {
  const projects = await db.all('projects');
  const keep = new Set(previewKeys());
  for (const p of projects) {
    const v = (p.settings && p.settings.voice) || {};
    for (const sc of p.scenes || []) {
      if (sc.recId) keep.add(sc.recId);
      if (sc.text) keep.add(clipKey(sc.text, v.id || 'af_heart', v.speed || 1));
    }
    const m = p.settings && p.settings.music;
    if (m && m.customAssetId) keep.add(m.customAssetId);
  }
  const ids = [...(await db.keysByIndex('assets', 'kind', 'voice')), ...(await db.keysByIndex('assets', 'kind', 'music'))];
  const now = Date.now();
  const out = { removed: 0, voices: 0, tracks: 0, bytes: 0 };
  for (const id of ids) {
    if (keep.has(id)) continue;
    const a = await db.get('assets', id);
    if (!a || now - (a.created || 0) < minAgeMs) continue;
    out.bytes += a.pcm ? a.pcm.byteLength : a.blob ? a.blob.size : 0;
    await db.del('assets', id);
    out.removed++;
    if (a.kind === 'music') out.tracks++;
    else out.voices++;
  }
  return out;
}

export function highlightForLook(lookId) {
  const pal = paletteOf(lookId);
  return pal.hi || '#FFD23F';
}

export { lookById };
