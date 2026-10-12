// Publish kit: title, caption and hashtags for TikTok, YouTube Shorts and Instagram Reels.

import { tokenize, stem } from './script.js';
import { hashString, mulberry32, pick } from './util.js';

const STOP = new Set('the a an and or of to in on for with is are was were be this that these those it its your you our we they their from by at as how why what when who which into than then about'.split(' '));

const FORMAT_TAGS = {
  facts: ['didyouknow', 'facts', 'funfacts', 'learnontiktok'],
  list: ['top5', 'facts', 'didyouknow', 'learnsomethingnew'],
  explainer: ['explained', 'learnontiktok', 'science', 'education'],
  story: ['storytime', 'history', 'truestory'],
  mystery: ['mystery', 'unsolved', 'creepy', 'didyouknow'],
  motivation: ['motivation', 'mindset', 'selfimprovement', 'discipline'],
};

function tagify(w) {
  return String(w)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function buildPublishKit(project) {
  const rng = mulberry32(hashString(project.id + (project.publish?.seed || 0)));
  const text = project.scenes.map((s) => s.text).join(' ');
  const counts = new Map();
  for (const w of tokenize(text)) {
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    const k = stem(w);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const kws = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const topicTags = [...new Set([tagify(project.topic), ...project.scenes.map((s) => tagify(s.keyword)), ...kws.slice(0, 4).map(tagify)])].filter((t) => t && t.length >= 3 && t.length <= 24);
  const formatTags = FORMAT_TAGS[project.format] || FORMAT_TAGS.facts;
  const hashtags = [...new Set([...topicTags.slice(0, 4), ...formatTags.slice(0, 3)])].slice(0, 7).map((t) => '#' + t);

  const hook = project.scenes[0] ? project.scenes[0].text : project.title;
  const emojis = project.scenes.map((s) => s.emoji).filter(Boolean);
  const lead = emojis[0] ? emojis[0] + ' ' : '';
  const title = (project.title || hook).replace(/\s+/g, ' ').slice(0, 90);
  const body = project.scenes.filter((s) => s.kind === 'body').slice(0, 2).map((s) => s.text);
  const ask = pick(rng, ['Which part surprised you?', 'Did you know this?', 'Follow for more.', 'Save this for later.']);
  const credits = [];
  if (project.source && project.source.attribution) credits.push(project.source.attribution);
  const stockNames = [...new Set(project.scenes.map((s) => s.visual && s.visual.credit && s.visual.credit.name).filter(Boolean))];
  if (stockNames.length) credits.push(`Stock footage: ${stockNames.slice(0, 4).join(', ')} on Pexels`);

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
