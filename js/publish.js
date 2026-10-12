// Publish kit: title, caption and hashtags for TikTok, YouTube Shorts and Instagram Reels, written in
// the video's language.

import { tokenize, stem, WEAK_WORDS, STOP as SCRIPT_STOP } from './script.js';
import { pack, normLang } from './langs.js';
import { hashString, mulberry32, pick } from './util.js';

const STOP = new Set('the a an and or of to in on for with is are was were be this that these those it its your you our we they their from by at as how why what when who which into than then about'.split(' '));

function tagify(w) {
  return String(w || '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_]/gu, '');
}

export function buildPublishKit(project) {
  const lang = normLang(project.lang);
  const P = pack(lang);
  const en = lang === 'en';
  const stopA = en ? STOP : P.stop;
  const stopB = en ? SCRIPT_STOP : P.stop;
  const weak = en ? WEAK_WORDS : P.weak;
  const rng = mulberry32(hashString(project.id + (project.publish?.seed || 0)));
  const text = project.scenes.map((s) => s.text).join(' ');
  const counts = new Map();
  const surface = new Map();
  for (const w of tokenize(text, lang)) {
    if (w.length < (lang === 'hi' ? 3 : 4) || stopA.has(w) || stopB.has(w) || weak.has(w) || /^\d+$/.test(w)) continue;
    const k = stem(w, lang);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (!surface.has(k)) surface.set(k, w);
  }
  const kws = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => (en ? k : surface.get(k)));
  const topicWords = String(project.topic || '').split(/\s+/).filter((w) => !stopA.has(w.toLocaleLowerCase()) && !stopB.has(w.toLocaleLowerCase()));
  const topicTags = [...new Set([tagify(topicWords.join('')), ...project.scenes.map((s) => tagify(s.keyword)), ...kws.slice(0, 4).map(tagify)])].filter((t) => t && t.length >= 3 && t.length <= 24 && !weak.has(t));
  const formatTags = P.tags[project.format] || P.tags.facts;
  // one tag per word family (#heart, not #heart #hearts)
  const seen = new Set();
  const uniqueTopic = topicTags.filter((t) => {
    const k = stem(t, lang);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const hashtags = [...new Set([...uniqueTopic.slice(0, 4), ...formatTags.slice(0, 3)])].slice(0, 7).map((t) => '#' + t);

  const hook = project.scenes[0] ? project.scenes[0].text : project.title;
  const emojis = project.scenes.map((s) => s.emoji).filter(Boolean);
  const lead = emojis[0] ? emojis[0] + ' ' : '';
  const title = (project.title || hook).replace(/\s+/g, ' ').slice(0, 90);
  const body = project.scenes.filter((s) => s.kind === 'body').slice(0, 2).map((s) => s.text);
  const ask = pick(rng, P.ask);
  const credits = [];
  if (project.source && project.source.attribution) credits.push(project.source.attribution);
  const stockNames = [...new Set(project.scenes.map((s) => s.visual && s.visual.credit && s.visual.credit.name).filter(Boolean))];
  if (stockNames.length) credits.push(P.credits.stock(stockNames.slice(0, 4).join(', ')));

  const tiktok = [`${lead}${hook}`, ask, hashtags.join(' ') + ' #fyp'].join('\n\n');
  const youtubeTitle = `${title.slice(0, 85)}${title.length > 85 ? '…' : ''} #shorts`;
  const youtubeDesc = [hook, body.join(' '), credits.join('\n'), hashtags.join(' ') + ' #shorts'].filter(Boolean).join('\n\n');
  const instagram = [`${lead}${hook}`, body[0] || '', ask, hashtags.join(' ') + ' #reels'].filter(Boolean).join('\n\n');
  return { title, hashtags, tiktok, youtubeTitle, youtubeDesc, instagram, credits };
}

export const UPLOAD_LINKS = [
  { id: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/upload' },
  { id: 'youtube', label: 'YouTube Studio', url: 'https://studio.youtube.com/' },
  { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/' },
];
