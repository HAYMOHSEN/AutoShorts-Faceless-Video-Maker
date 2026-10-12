// Script sources beyond the built-in writer:
//  - the browser's built-in on-device language model (Prompt API), when the system provides one
//  - an optional OpenAI-compatible endpoint with the user's own key (OpenAI, Groq, OpenRouter, LM Studio…)
//  - Wikipedia, for facts about a typed topic (needs a connection)

import { kvGet } from './db.js';

const FORMAT_HINT = {
  facts: 'surprising "did you know" facts',
  list: 'a numbered top list (start body lines with "Number one.", "Number two." …)',
  explainer: 'a simple explainer of how or why something works',
  story: 'a short story told in order with a twist or payoff',
  mystery: 'a curiosity-driven mystery that keeps people watching',
  motivation: 'short, punchy motivational lessons',
};

function buildPrompt({ mode, input, format, seconds }) {
  const words = Math.round(seconds * 2.6);
  const lines = Math.max(4, Math.round(seconds / 4.5));
  const base = [
    `Write the voiceover script for a ${seconds}-second vertical short video (TikTok / Reels / YouTube Shorts).`,
    `Style: ${FORMAT_HINT[format] || FORMAT_HINT.facts}.`,
    `Rules: about ${words} words in total, ${lines} to ${lines + 2} lines, one spoken sentence per line, at most 18 words per line.`,
    'The first line is a scroll-stopping hook (max 12 words). The last line is a short call to action (follow, comment or save).',
    'Plain spoken English. Only include facts you are confident are true. No emojis, no hashtags, no stage directions, no line numbers, no quotation marks, no title.',
    'Output only the lines, one per line.',
  ];
  if (mode === 'article') base.push('', 'Base every fact only on this article:', '"""', String(input).slice(0, 7000), '"""');
  else base.push('', `Topic: ${input}`);
  return base.join('\n');
}

function toLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- on-device model (Prompt API)

function lm() {
  if (typeof self.LanguageModel !== 'undefined') return self.LanguageModel;
  return null;
}

export async function onDeviceStatus() {
  const L = lm();
  if (!L || !L.availability) return 'unavailable';
  try {
    return await L.availability({ expectedOutputs: [{ type: 'text', languages: ['en'] }] });
  } catch {
    try {
      return await L.availability();
    } catch {
      return 'unavailable';
    }
  }
}

export async function writeOnDevice(opts, { signal, onProgress } = {}) {
  const L = lm();
  if (!L) throw new Error('On-device AI is not available on this PC.');
  const session = await L.create({
    signal,
    initialPrompts: [{ role: 'system', content: 'You write short, accurate, engaging voiceover scripts for vertical videos.' }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress && onProgress(e.loaded));
    },
  });
  try {
    const out = await session.prompt(buildPrompt(opts), { signal });
    return toLines(out);
  } finally {
    session.destroy && session.destroy();
  }
}

// ---------------------------------------------------------------- OpenAI-compatible endpoint

export async function remoteConfig() {
  const cfg = (await kvGet('aiRemote', null)) || {};
  return { baseUrl: cfg.baseUrl || '', apiKey: cfg.apiKey || '', model: cfg.model || '', enabled: !!(cfg.enabled && cfg.baseUrl && cfg.model) };
}

export async function writeRemote(opts, { signal } = {}) {
  const cfg = await remoteConfig();
  if (!cfg.enabled) throw new Error('No AI writer is set up.');
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.8,
      messages: [
        { role: 'system', content: 'You write short, accurate, engaging voiceover scripts for vertical videos.' },
        { role: 'user', content: buildPrompt(opts) },
      ],
    }),
  });
  if (!res.ok) {
    let msg = `The AI writer returned an error (${res.status}).`;
    if (res.status === 401) msg = 'The AI writer rejected the API key. Check it in Settings.';
    if (res.status === 429) msg = 'The AI writer is rate-limited right now. Try again in a minute.';
    throw new Error(msg);
  }
  const json = await res.json();
  const text = json && json.choices && json.choices[0] && (json.choices[0].message?.content || json.choices[0].text);
  return toLines(text);
}

export async function testRemote(cfg) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, max_tokens: 5, messages: [{ role: 'user', content: 'Reply with OK.' }] }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return true;
}

// ---------------------------------------------------------------- Wikipedia facts

const WIKI_HEADERS = { 'Api-User-Agent': 'AutoShorts/1.0 (https://haymohsen.github.io/AutoShorts/)' };

export async function wikipediaFacts(query, { signal, lang = 'en' } = {}) {
  const q = String(query || '')
    .replace(/[?!.]+$/, '')
    .replace(/^(why|how|what|where|when|who)\s+(is|are|was|were|do|does|did|can)?\s*/i, '')
    .trim();
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: q || query,
    gsrlimit: '1',
    prop: 'extracts|info',
    inprop: 'url',
    explaintext: '1',
    exsectionformat: 'plain',
    redirects: '1',
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal, headers: WIKI_HEADERS });
  if (!res.ok) throw new Error('Wikipedia is not reachable right now.');
  const json = await res.json();
  const pages = json && json.query && json.query.pages ? Object.values(json.query.pages) : [];
  const page = pages[0];
  if (!page || !page.extract) throw new Error('No facts found for this topic.');
  // drop reference-like sections
  const text = page.extract.split(/\n\s*(See also|References|External links|Further reading|Notes|Bibliography|Sources)\s*\n/)[0];
  return { title: page.title, text, url: page.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}` };
}
