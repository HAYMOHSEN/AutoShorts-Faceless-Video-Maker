// Free stock footage and photos from Pexels (needs a free Pexels API key, set in Settings).
// Pexels content is free to use; we keep the photographer credit with each clip.

import { kvGet } from './db.js';
import { importMedia } from './media.js';
import { t } from './i18n.js';
import { englishFor } from './emoji.js';

// Pexels understands searches in these languages; Hindi and Arabic words are searched in English
const PEXELS_LOCALE = { es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR' };

function searchTerms(query, lang) {
  const q = query.trim();
  if (lang !== 'hi' && lang !== 'ar') return q;
  const words = q.split(/\s+/).map((w) => englishFor(w, lang)).filter(Boolean);
  return words.length ? [...new Set(words)].join(' ') : q;
}

// Optional: an app-wide key can be placed here so users don't need their own.
export const APP_PEXELS_KEY = '';

export async function pexelsKey() {
  const k = (await kvGet('pexelsKey', '')) || '';
  return k.trim() || APP_PEXELS_KEY;
}

// errors that stop a whole "fill every scene" run carry a code (their text is translated)
function stopError(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function api(path, key, signal) {
  const res = await fetch(`https://api.pexels.com${path}`, { headers: { Authorization: key }, signal });
  if (res.status === 401 || res.status === 403) throw stopError(t('Pexels did not accept the API key. Check it in Settings.'), 'pexels-key');
  if (res.status === 429) throw stopError(t('Pexels limit reached for now. Try again later.'), 'pexels-limit');
  if (!res.ok) throw new Error(t('Pexels search failed ({status}).', { status: res.status }));
  return res.json();
}

function bestVideoFile(files) {
  const mp4 = files.filter((f) => /mp4/i.test(f.file_type || 'video/mp4'));
  const portrait = mp4.filter((f) => f.height >= f.width);
  const pool = portrait.length ? portrait : mp4;
  const sized = pool.filter((f) => f.height >= 1000 && f.height <= 2000).sort((a, b) => a.height - b.height);
  return sized[0] || pool.sort((a, b) => a.height - b.height).find((f) => f.height >= 720) || pool[0];
}

// Search results are kept for a while: reopening the stock panel or filling several scenes with the
// same keyword doesn't spend the key's hourly request allowance again.
const searchCache = new Map();
const CACHE_MS = 30 * 60 * 1000;
const CACHE_MAX = 80;

/** @returns {Promise<{kind:'video'|'photo', id, thumb, url, w, h, duration, credit}[]>} */
export async function searchStock(query, { kind = 'video', page = 1, signal, lang = 'en' } = {}) {
  const key = await pexelsKey();
  if (!key) throw stopError(t('Add your free Pexels API key in Settings to search stock footage.'), 'pexels-key');
  const terms = searchTerms(query, lang);
  const locale = PEXELS_LOCALE[lang] && terms === query.trim() ? `&locale=${PEXELS_LOCALE[lang]}` : '';
  const cacheKey = `${kind}|${page}|${locale}|${terms.toLocaleLowerCase()}`;
  const hit = searchCache.get(cacheKey);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_MS) return hit.items;
  const q = encodeURIComponent(terms);
  let items;
  if (kind === 'video') {
    const json = await api(`/videos/search?query=${q}&orientation=portrait&size=medium&per_page=15&page=${page}${locale}`, key, signal);
    items = (json.videos || [])
      .map((v) => {
        const f = bestVideoFile(v.video_files || []);
        if (!f) return null;
        return { kind: 'video', id: `pv${v.id}`, thumb: v.image, url: f.link, w: f.width, h: f.height, duration: v.duration, credit: { name: v.user && v.user.name, url: v.url, source: 'Pexels' } };
      })
      .filter(Boolean);
  } else {
    const json = await api(`/v1/search?query=${q}&orientation=portrait&per_page=20&page=${page}${locale}`, key, signal);
    items = (json.photos || []).map((p) => ({ kind: 'photo', id: `pp${p.id}`, thumb: p.src.medium, url: p.src.large2x || p.src.portrait, w: p.width, h: p.height, credit: { name: p.photographer, url: p.url, source: 'Pexels' }, alt: p.alt }));
  }
  searchCache.delete(cacheKey);
  searchCache.set(cacheKey, { items, key, at: Date.now() });
  while (searchCache.size > CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
  return items;
}

/** Download a stock item and store it as a media asset. */
export async function downloadStock(item, { signal } = {}) {
  const res = await fetch(item.url, { signal, mode: 'cors' });
  if (!res.ok) throw new Error(t('Download failed.'));
  const blob = await res.blob();
  const ext = item.kind === 'video' ? 'mp4' : 'jpg';
  const type = blob.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const file = new File([blob], `${item.id}.${ext}`, { type });
  return importMedia(file, item.credit);
}

/** Pick and download one stock clip per scene keyword (used by "Fill scenes with stock"). */
export async function autoStock(scenes, { kind = 'video', signal, onProgress, topic = '', lang = 'en' } = {}) {
  const used = new Set();
  const results = new Map();
  let done = 0;
  for (const sc of scenes) {
    if (signal && signal.aborted) break;
    const query = (sc.keyword || topic || '').trim();
    try {
      let items = query ? await searchStock(query, { kind, signal, lang }) : [];
      if (!items.length && topic && topic !== query) items = await searchStock(topic, { kind, signal, lang });
      const pick = items.find((i) => !used.has(i.id));
      if (pick) {
        used.add(pick.id);
        const asset = await downloadStock(pick, { signal });
        results.set(sc.id, asset);
      }
    } catch (e) {
      if (e.name === 'AbortError') break;
      if (e.code === 'pexels-key' || e.code === 'pexels-limit') throw e;
      console.warn('stock for scene failed', e);
    }
    done++;
    onProgress && onProgress(done, scenes.length);
  }
  return results;
}
