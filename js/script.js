// Script engine: turns a topic, an article or the user's own lines into a short-form voiceover script
// split into scenes. Works fully offline (extractive summarising + hook/CTA writing), in every video
// language in langs.js. English has the most detailed rules; the other languages share a generic path
// driven by their language packs.

import { hashString, mulberry32, pick, hasArabic, uid } from './util.js';
import { emojiFor, emojiForText } from './emoji.js';
import { pack, langMeta, normLang, stemFor, asciiDigits } from './langs.js';
import { N_ } from './i18n.js';

export const FORMATS = [
  { id: 'facts', name: N_('Did you know'), hint: N_('Surprising facts, question hook') },
  { id: 'list', name: N_('Top list'), hint: N_('Numbered points') },
  { id: 'explainer', name: N_('Explainer'), hint: N_('How and why, simply') },
  { id: 'story', name: N_('Story'), hint: N_('Told in order') },
  { id: 'mystery', name: N_('Mystery'), hint: N_('Curiosity first') },
  { id: 'motivation', name: N_('Motivation'), hint: N_('Short punchy lessons') },
];

export const WORDS_PER_SECOND = 2.6; // average English narration pace at 1.0x
export const wpsFor = (lang) => langMeta(lang).wps || WORDS_PER_SECOND;

export const STOP = new Set(`a about above across after afterwards again against all almost alone along already also although always am among amongst an and another any anyhow anyone anything anyway anywhere are around as at back be became because become becomes becoming been before beforehand behind being below beside besides between beyond both but by can cannot could did do does doing done down due during each either else elsewhere enough even ever every everyone everything everywhere except few for former formerly from further get gets got had has have having he hence her here hereafter hereby herein hers herself him himself his how however i if in indeed into is it its itself just keep last latter latterly least less let like made make many may me meanwhile might mine more moreover most mostly much must my myself namely neither never nevertheless next no nobody none noone nor not nothing now nowhere of off often on once one only onto or other others otherwise our ours ourselves out over own part per perhaps please put rather re really same say says said see seem seemed seeming seems several she should show side since so some somehow someone something sometime sometimes somewhere still such than that the their theirs them themselves then thence there thereafter thereby therefore therein thereupon these they this those though through throughout thru thus to together too toward towards under until up upon us use used using very via was we well were what whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever whether which while whither who whoever whole whom whose why will with within without would yet you your yours yourself yourselves also known called including include includes around approximately about can't don't won't isn't aren't wasn't weren't it's that's there's they're we're you're i'm i've they've we've would've could've should've many much new first second third one two three four five six seven eight nine ten years year time times way ways thing things people person lot lots kind sort type types example examples however`.split(/\s+/));

// describing words that make poor topics and hashtags on their own ("old", "big")
export const WEAK_WORDS = new Set('old big small good bad great best better worse worst real true false long short high low little large huge tiny full empty easy hard simple strange weird crazy amazing actual actually really whole entire main early late enough single number largest biggest smallest oldest newest longest highest one two three four five six seven eight nine ten first second third fourth fifth thing things stuff people way ways time times year years day days'.split(' '));

const VERBISH = /(?:ing|ed|ly|ize|ise|ised|ized)$/;
const COMMON_VERBS = new Set('change changes make makes take takes give gives become becomes keep keeps help helps show shows find finds think thinks know knows open opens escape watch watched survive survives turn turns start starts stop stops need needs want wants feel feels look looks seem seems move moves grow grows live lives save share follow comment tell tells try tries happen happens begin begins call calls bring brings hold holds leave leaves mean means play plays reach reaches build builds spend spends lose loses pay pays meet meets learn learns'.split(' '));
const PRONOUN_START = /^(this|these|those|it|its|they|their|them|he|she|his|her|that|such|both|which|there)\b/i;
const JUNK = /(cookie|subscribe|newsletter|©|all rights reserved|click here|sign up|log in|read more|advertisement|photo by|image credit|follow us|terms of use|privacy policy|share this|related articles|getty images)/i;
const FACT_CUES = /\b(largest|biggest|smallest|fastest|slowest|oldest|first|only|never|every|most|least|percent|million|billion|thousand|record|discovered|scientists|researchers|study|studies|surprising|actually|secret|rare|unique|deadly|strongest|tallest|deepest|longest|heaviest|hottest|coldest)\b/i;

const ABBR = ['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e\\.g', 'i\\.e', 'u\\.s', 'u\\.k', 'a\\.m', 'p\\.m', 'no', 'inc', 'ltd', 'co', 'corp', 'fig', 'approx', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'mt', 'ft', 'gen', 'gov', 'sen', 'rep', 'dept', 'univ', 'est', 'al', 'ca', 'cf'];
const ABBR_RE = new RegExp('\\b(' + ABBR.join('|') + ')\\.', 'gi');
// abbreviations of the other Latin-script languages ("z. B.", "Sr.", "p. ex.")
const ABBR_OTHER = /(?<![\p{L}])(sr|sra|dra|dr|prof|pág|etc|ej|p\. ?ex|z\. ?b|bzw|ca|nr|vol|núm|mme|mlle)\./giu;

// ---------------------------------------------------------------- language context

const STOP_EN = STOP;
function ctx(lang) {
  const id = normLang(lang);
  const P = pack(id);
  if (id === 'en') return { lang: id, P, stop: STOP_EN, weak: WEAK_WORDS, minWord: 3, en: true };
  return { lang: id, P, stop: P.stop, weak: P.weak, minWord: P.minWord || 3, en: false };
}

// ---------------------------------------------------------------- text basics

export function cleanText(raw, { keepAll = false, lang = 'en' } = {}) {
  let t = String(raw || '');
  t = t.replace(/\r/g, '');
  t = t.replace(/https?:\/\/\S+/g, ' ').replace(/\bwww\.\S+/g, ' ');
  t = t.replace(/\[(?:\d+|[a-z]|citation needed|note \d+|nb \d+|update|cita requerida|réf\. nécessaire|Anm\. \d+)\]/gi, '');
  t = t.replace(/\{\\displaystyle[^}]*\}/g, '');
  if (!keepAll) t = t.replace(/^\s*(advertisement|sponsored|related:|read more|subscribe|sign up|share this|click here|image:|photo:|credit:|getty images).*$/gim, '');
  t = t.replace(/[“”«»„]/g, '"').replace(/[‘’‚]/g, "'");
  t = t.replace(/[ \t  ]+/g, ' ');
  if (lang === 'fr') t = t.replace(/ ([?!:;])/g, '$1'); // captions break words at spaces
  t = t.replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

export function splitSentences(text, lang = 'en') {
  const paras = String(text || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];
  paras.forEach((p, pi) => {
    let s = p;
    let parts;
    if (lang === 'en') {
      s = s.replace(/\b([A-Z])\.(?=\s?[A-Z]\.)/g, '$1<DOT>');
      s = s.replace(/(\d)\.(\d)/g, '$1<DOT>$2');
      s = s.replace(ABBR_RE, '$1<DOT>');
      s = s.replace(/\b([A-Z])\.\s(?=[A-Z][a-z])/g, '$1<DOT> ');
      parts = s.split(/(?<=[.!?…؟]["')\]]*)\s+(?=["'(\[]?[A-Z0-9؀-ۿ])/);
    } else {
      s = s.replace(/(\d)\.(\d)/g, '$1<DOT>$2');
      s = s.replace(/(?<![\p{L}])(\p{Lu})\.(?=\s?\p{Lu}\.)/gu, '$1<DOT>');
      s = s.replace(ABBR_OTHER, (m) => m.replace(/\./g, '<DOT>'));
      parts = s.split(/(?<=[.!?…؟।]["')\]]*)\s+(?=["'(\[¿¡]?[\p{Lu}\p{Lo}\p{N}])/u);
    }
    parts.forEach((part, k) => {
      const txt = part.replace(/<DOT>/g, '.').trim();
      if (txt) out.push({ text: txt, para: pi, paraFirst: k === 0 });
    });
  });
  return out;
}

export function tokenize(s, lang = 'en') {
  if (lang === 'en') return (String(s).toLowerCase().match(/[a-zÀ-ɏ؀-ۿ0-9]+(?:'[a-z]+)?/g) || []).map((w) => w.replace(/'s$/, ''));
  let t = String(s).toLocaleLowerCase();
  if (lang === 'fr') t = t.replace(/(?<![\p{L}])[a-z]{1,2}'(?=\p{L})/gu, ''); // l'eau → eau
  return t.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
}

export function stem(w, lang = 'en') {
  if (lang !== 'en') return /^\d/.test(w) ? w : stemFor(w, lang);
  if (/^\d/.test(w)) return w;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(uses|sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

const isContentIn = (c, w) => w.length >= c.minWord && !c.stop.has(w) && !/^\d+$/.test(w);
const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;

function capFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function endPunct(s, lang = 'en') {
  s = s.trim();
  if (!/[.!?…؟।"')]$/.test(s)) s += lang === 'hi' ? '।' : '.';
  return s;
}

function stripEnd(s) {
  return s.trim().replace(/[.!?…؟।]+$/, '');
}

// ---------------------------------------------------------------- numbers & cleanup

function humanizeNumbers(t) {
  return t.replace(/\b(\d{1,3}(?:,\d{3})+|\d{7,})\b/g, (m) => {
    const n = Number(m.replace(/,/g, ''));
    if (!isFinite(n)) return m;
    const fmt = (v) => (Math.round(v * 10) / 10).toString();
    if (n >= 1e12) return `${fmt(n / 1e12)} trillion`;
    if (n >= 1e9) return `${fmt(n / 1e9)} billion`;
    if (n >= 1e6) return `${fmt(n / 1e6)} million`;
    return m;
  });
}

const PHRASES = [
  [/\bapproximately\b/gi, 'about'],
  [/\bin order to\b/gi, 'to'],
  [/\butilize[sd]?\b/gi, 'use'],
  [/\butilization\b/gi, 'use'],
  [/\ba number of\b/gi, 'several'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bthe majority of\b/gi, 'most'],
  [/\bin the event that\b/gi, 'if'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequently\b/gi, 'later'],
  [/\bcommence[sd]?\b/gi, 'start'],
  [/\bdemonstrate[sd]?\b/gi, 'show'],
];

export function compressSentence(s, lang = 'en') {
  let t = s;
  t = t.replace(/\s*\([^()]{0,220}\)/g, '');
  t = t.replace(/\s*\[[^\]]{0,220}\]/g, '');
  t = t.replace(/\s+[—–]\s+[^—–]{3,140}?\s+[—–]\s+/g, ' ');
  t = t.replace(/—[^—]{3,140}—/g, ' ');
  if (lang === 'en') {
    t = t.replace(/^(however|moreover|furthermore|in addition|additionally|meanwhile|notably|interestingly|importantly|indeed|thus|therefore|consequently|in fact|as a result|for example|for instance|on the other hand|in other words|that said|overall|also),\s+/i, '');
    for (const [re, rep] of PHRASES) t = t.replace(re, rep);
    t = humanizeNumbers(t);
  } else {
    const lead = pack(lang).leadConnectors;
    if (lead) t = t.replace(lead, '');
  }
  t = t.replace(/\s+([,.;:!?،؛])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
  t = t.replace(/^[,;:،\s]+/, '');
  return endPunct(capFirst(t), lang);
}

function splitLong(s, maxWords = 26, lang = 'en') {
  if (wordCount(s) <= maxWords) return [s];
  const parts = [];
  const bySemi = s.split(/[;؛]\s+/);
  if (bySemi.length > 1 && bySemi.every((p) => wordCount(p) >= 5)) {
    bySemi.forEach((p) => parts.push(endPunct(capFirst(p), lang)));
  } else if (lang === 'en') {
    const m = s.match(/^(.{30,}?),\s+(but|while|whereas|yet)\s+(.{20,})$/i);
    if (m && wordCount(m[1]) >= 6 && wordCount(m[3]) >= 5) {
      parts.push(endPunct(m[1]));
      parts.push(endPunct(capFirst(m[2].toLowerCase() === 'but' ? 'But ' + m[3] : m[3])));
    } else parts.push(s);
  } else parts.push(s);
  return parts;
}

// ---------------------------------------------------------------- analysis

function docStats(sentences, lang = 'en') {
  const c = ctx(lang);
  const tf = new Map();
  const surface = new Map(); // stem -> Map(surface -> count)
  const capsMid = new Map(); // lowercased word -> count of capitalised mid-sentence uses
  const wordRe = c.en ? /[A-Za-zÀ-ɏ؀-ۿ0-9]+(?:'[a-z]+)?/g : /[\p{L}\p{M}\p{N}]+/gu;
  const capRe = c.en ? /^[A-Z]/ : /^\p{Lu}/u;
  for (const s of sentences) {
    const text = lang === 'fr' ? s.text.replace(/(?<![\p{L}])[A-Za-z]{1,2}'(?=\p{L})/gu, '') : s.text;
    const raw = text.match(wordRe) || [];
    raw.forEach((w, i) => {
      const lw = c.en ? w.toLowerCase().replace(/'s$/, '') : w.toLocaleLowerCase();
      if (i > 0 && capRe.test(w)) capsMid.set(lw, (capsMid.get(lw) || 0) + 1);
      if (!isContentIn(c, lw)) return;
      const st = stem(lw, lang);
      tf.set(st, (tf.get(st) || 0) + 1);
      if (!surface.has(st)) surface.set(st, new Map());
      const m = surface.get(st);
      const form = i > 0 && capRe.test(w) ? w : lw;
      m.set(form, (m.get(form) || 0) + 1);
    });
  }
  let maxTf = 1;
  for (const v of tf.values()) maxTf = Math.max(maxTf, v);
  const bestSurface = (st) => {
    const m = surface.get(st);
    if (!m) return st;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const isProper = (lw) => (capsMid.get(lw) || 0) >= 1;
  return { tf, maxTf, bestSurface, isProper, lang };
}

function topBigram(sentences, lang = 'en') {
  const c = ctx(lang);
  const counts = new Map();
  for (const s of sentences) {
    const toks = tokenize(s.text, lang);
    for (let i = 0; i < toks.length - 1; i++) {
      if (isContentIn(c, toks[i]) && isContentIn(c, toks[i + 1])) {
        const k = toks[i] + ' ' + toks[i + 1];
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
  }
  let best = null;
  for (const [k, n] of counts) if (!best || n > best[1]) best = [k, n];
  return best;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function pickKeyword(text, stats, avoid = new Set(), lang = stats?.lang || 'en') {
  const c = ctx(lang);
  const raw = c.en ? String(text).match(/[A-Za-zÀ-ɏ]+/g) || [] : String(text).match(/[\p{L}\p{M}]+/gu) || [];
  const capRe = c.en ? /^[A-Z]/ : /^\p{Lu}/u;
  let best = null;
  raw.forEach((w, i) => {
    const lw = c.en ? w.toLowerCase() : w.toLocaleLowerCase();
    if (!isContentIn(c, lw) || avoid.has(lw)) return;
    const st = stem(lw, lang);
    let score = Math.sqrt(stats ? stats.tf.get(st) || 1 : 1);
    if (emojiFor(lw, lang)) score *= 1.6;
    if (i > 0 && capRe.test(w)) score *= 1.25;
    if (c.en && (VERBISH.test(lw) || COMMON_VERBS.has(lw))) score *= 0.5;
    if (c.weak.has(lw)) score *= 0.35;
    if (lw.length >= 5) score *= 1.15;
    if (lw.length <= 3) score *= c.en || lang !== 'hi' ? 0.6 : 0.85;
    if (!best || score > best.score) best = { word: i > 0 && capRe.test(w) ? w : lw, score };
  });
  return best ? best.word : '';
}

// ---------------------------------------------------------------- stats ("big number" cards)

const NUMWORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, hundreds: 100, thousand: 1000, thousands: 1000 };
const SCALE = { thousand: 'K', million: 'M', billion: 'B', trillion: 'T' };

function compact(n) {
  const f = (v) => String(Math.round(v * 10) / 10);
  if (n >= 1e9) return `${f(n / 1e9)}B`;
  if (n >= 1e6) return `${f(n / 1e6)}M`;
  if (n >= 1e4) return `${f(n / 1e3)}K`;
  return f(n);
}

export function extractStat(text, lang = 'en') {
  if (lang !== 'en') return extractStatOther(text, lang);
  const t = String(text);
  let m = t.match(/(\d+(?:\.\d+)?)\s?(%|percent\b)/i);
  if (m) {
    const next = (t.slice(m.index + m[0].length).match(/[a-z]+/gi) || []).slice(0, 4).find((w) => !STOP.has(w.toLowerCase()) && !/^(the|of|all)$/i.test(w));
    return { value: `${m[1]}%`, label: next ? next.toLowerCase() : '' };
  }
  m = t.match(/\b(\d+(?:\.\d+)?)\s+(thousand|million|billion|trillion)\s+([a-z]+)/i);
  if (m) return { value: `${m[1]}${SCALE[m[2].toLowerCase()]}`, label: STOP.has(m[3].toLowerCase()) ? '' : m[3].toLowerCase() };
  m = t.match(/\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s+([a-z]{3,}s)\b/i);
  if (m && !STOP.has(m[2].toLowerCase())) {
    const n = m[1];
    if (/^(1[0-9]{3}|20[0-9]{2})$/.test(n)) return { value: n, label: '' };
    return { value: n, label: m[2].toLowerCase() };
  }
  m = t.match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundreds?|thousands?)\s+(?!of\b)([a-z]{3,}s)\b/i);
  if (m && !STOP.has(m[2].toLowerCase())) {
    const v = NUMWORDS[m[1].toLowerCase()];
    const value = /hundreds|thousands/i.test(m[1]) ? `${v}s` : String(v);
    return { value, label: m[2].toLowerCase() };
  }
  m = t.match(/\b(in|since|by|around|until)\s+((?:1[0-9]|20)[0-9]{2})\b/i);
  if (m) return { value: m[2], label: '' };
  return null;
}

function extractStatOther(text, lang) {
  const c = ctx(lang);
  const P = c.P;
  const t = asciiDigits(String(text)).replace(/٫/g, '.');
  const NUM = '(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d+(?:[.,]\\d+)?)';
  const label = (rest) => {
    const words = rest.match(/[\p{L}\p{M}]+/gu) || [];
    const w = words.slice(0, 4).find((x) => isContentIn(c, x.toLocaleLowerCase()));
    return w ? (P.keepCase ? w : w.toLocaleLowerCase()) : '';
  };
  let m = t.match(new RegExp(`${NUM}\\s?(%|٪|${P.percent})`, 'iu'));
  if (m) return { value: `${m[1].replace(',', '.')}%`, label: label(t.slice(m.index + m[0].length)) };
  for (const [word, mult] of P.scale || []) {
    m = t.match(new RegExp(`${NUM}\\s+${word}(?![\\p{L}])`, 'iu'));
    if (m) {
      const n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (isFinite(n)) return { value: compact(n * mult), label: label(t.slice(m.index + m[0].length)) };
    }
  }
  m = t.match(new RegExp(`(?<![\\d.,])${NUM}\\s+([\\p{L}\\p{M}]{3,})`, 'u'));
  if (m) {
    const n = m[1].replace(/\s/g, '');
    if (/^(1[0-9]{3}|20[0-9]{2})$/.test(n)) return { value: n, label: '' };
    const w = m[2].toLocaleLowerCase();
    if (!c.stop.has(w)) return { value: n, label: P.keepCase ? m[2] : w };
  }
  const words = Object.keys(P.numWords || {});
  if (words.length) {
    m = t.match(new RegExp(`(?<![\\p{L}])(${words.join('|')})\\s+([\\p{L}\\p{M}]{3,})`, 'iu'));
    if (m) {
      const w = m[2].toLocaleLowerCase();
      if (!c.stop.has(w)) return { value: String(P.numWords[m[1].toLocaleLowerCase()]), label: P.keepCase ? m[2] : w };
    }
  }
  m = t.match(/(?<!\d)((?:1[0-9]|20)[0-9]{2})(?!\d)/);
  if (m) return { value: m[1], label: '' };
  return null;
}

// ---------------------------------------------------------------- topic & hooks

const QWORDS = /^(why|how|what|where|when|who|which|is|are|do|does|did|can|could|should|would|will|has|have)\b/i;

const DET = /^(the|a|an|our|your|their|my|his|her|its|this|these|those|some|most|many)$/i;
const AUX = /^(do|does|did|is|are|was|were|can|could|should|would|will|has|have|had|might|must)$/i;

// Split "octopuses have three hearts" / "the moon looks so big" into subject + verb + tail.
function subjectSplit(words) {
  let j = 0;
  while (j < words.length - 1 && DET.test(words[j])) j++;
  // allow one adjective/noun modifier before the head noun ("black hole", "giant squid")
  if (words.length - j > 3 && !/s$/i.test(words[j]) && /^[a-z]+$/i.test(words[j + 1]) && !/s$/i.test(words[j + 1]) && /s$/i.test(words[j + 2] || '')) j++;
  const subject = words.slice(0, j + 1).join(' ');
  const verb = words[j + 1] || '';
  const tail = words.slice(j + 2).join(' ');
  const head = words[j] || '';
  const plural = /s$/i.test(head) && !/(ss|us|is)$/i.test(head) || /^(we|they|you|i|people|children|men|women|mice|teeth)$/i.test(head);
  return { subject, verb, tail, plural };
}

export function topicAsQuestion(input, lang = 'en') {
  let q = String(input || '').trim().replace(/\s+/g, ' ');
  if (!q) return '';
  if (lang !== 'en') {
    const P = pack(lang);
    if (/[?؟]$/.test(q)) return capFirst(q);
    if (!P.questionStart.test(q)) return '';
    q = q.replace(/[.!।]+$/, '');
    if (P.openQ && !q.startsWith(P.openQ)) q = P.openQ + capFirst(q);
    return capFirst(q) + P.qmark;
  }
  if (/\?$/.test(q)) return capFirst(q);
  if (!QWORDS.test(q)) return '';
  q = q.replace(/[.!]+$/, '');
  let m = q.match(/^(why|how|where|when|what)\s+(.+?)\s+(is|are|was|were)\s+(.+)$/i);
  if (m && !/^(is|are|was|were)$/i.test(m[2]) && !/\s(is|are|was|were)\s/i.test(' ' + m[2] + ' ')) return capFirst(`${m[1].toLowerCase()} ${m[3]} ${m[2]} ${m[4]}?`);
  m = q.match(/^(why|how|where|when)\s+(.+)$/i);
  if (m) {
    const words = m[2].split(' ');
    if (AUX.test(words[0])) return capFirst(q + '?');
    const { subject, verb, tail, plural } = subjectSplit(words);
    if (verb) {
      if (!plural) {
        const base = /[^s]s$/i.test(verb) ? verb.replace(/ies$/i, 'y').replace(/(sh|ch|x|ss)es$/i, '$1').replace(/s$/i, '') : verb;
        return capFirst(`${m[1].toLowerCase()} does ${subject} ${base}${tail ? ' ' + tail : ''}?`);
      }
      return capFirst(`${m[1].toLowerCase()} do ${subject} ${verb}${tail ? ' ' + tail : ''}?`);
    }
  }
  return capFirst(q + '?');
}

// A short noun phrase for templates like "facts about {topic}".
export function topicPhrase(input, lang = 'en') {
  let t = String(input || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .trim()
    .replace(/[?!.؟।]+$/, '')
    .replace(/\s+/g, ' ');
  if (!t) return '';
  if (lang !== 'en') {
    const c = ctx(lang);
    t = t.replace(/^[¿¡]/, '');
    if (c.P.questionStart.test(t) && !['hi'].includes(lang)) t = t.replace(c.P.questionStart, '').trim();
    const words = t.split(' ');
    if (words.length > 4) return words.filter((w) => isContentIn(c, w.toLocaleLowerCase())).slice(0, 3).join(' ');
    return t;
  }
  const qm = t.match(/^(why|how|where|when|what|who)\s+(?:(is|are|was|were|do|does|did|can|could)\s+)?(.+)$/i);
  if (qm) {
    let words = qm[3].split(' ');
    let subj;
    if (/^(what|who)$/i.test(qm[1]) && qm[2]) subj = words.join(' ');
    else subj = subjectSplit(words).subject;
    subj = subj.replace(/^(a|an)\s+(.+)$/i, (x, a, rest) => (/s$/i.test(rest) ? rest : rest + 's'));
    return subj;
  }
  if (/^(is|are|do|does|can|should)\s/i.test(t)) {
    const words = t.split(' ').slice(1);
    return subjectSplit(words).subject;
  }
  const words = t.split(' ');
  if (words.length > 5) return words.filter((w) => !STOP.has(w.toLowerCase())).slice(0, 3).join(' ').toLowerCase();
  return t;
}

function fill(tpl, c, lang = 'en') {
  if (lang === 'en' && c.n === 1) tpl = tpl.replace(/^\{n\} things/, 'One thing').replace(/\{n\} facts/, 'one fact').replace(/\{n\} things/, 'one thing');
  return tpl
    .replace(/\{Topic\}/g, capFirst(c.topic))
    .replace(/\{topic\}/g, c.topic)
    .replace(/\{n\}/g, String(c.n))
    .replace(/^(\d+)/, (d) => d); // numbers at start stay digits
}

function hookTemplates(format, n, lang) {
  const P = pack(lang);
  // a "{n} things" hook needs at least two points; other languages fall back to the facts hooks
  if (format === 'list' && n < 2 && lang !== 'en') return P.hooks.facts;
  return P.hooks[format] || P.hooks.facts;
}

export function hookOptions(format, c, lang = 'en') {
  const list = hookTemplates(format, c.n, lang).map((t) => capFirst(fill(t, c, lang)));
  if (c.question && ['facts', 'explainer', 'story', 'mystery'].includes(format)) list.unshift(c.question);
  if (c.fact && format === 'facts') list.unshift(c.fact);
  return [...new Set(list)];
}

export function ctaOptions(format, lang = 'en') {
  const P = pack(lang);
  return P.ctas[format] || P.ctas.facts;
}

function didYouKnow(sentence, stats, lang = 'en') {
  const s = stripEnd(sentence);
  const first = s.split(/\s+/)[0] || '';
  if (lang !== 'en') {
    const P = pack(lang);
    const keepCase = !!P.keepCase || stats.isProper(first.toLocaleLowerCase()) || /^\p{Lu}{2,}/u.test(first);
    return endPunct(P.didYouKnow(s, keepCase), lang);
  }
  const keepCase = stats.isProper(first.toLowerCase().replace(/[^a-z]/g, '')) || /^[A-Z]{2,}/.test(first);
  const body = keepCase ? s : s.charAt(0).toLowerCase() + s.slice(1);
  return `Did you know ${body}?`;
}

// ---------------------------------------------------------------- summariser

function scoreSentences(sents, stats, { query = '', title = '', lang = 'en' } = {}) {
  const c = ctx(lang);
  const qset = new Set(tokenize(query, lang).filter((w) => isContentIn(c, w)).map((w) => stem(w, lang)));
  const tset = new Set(tokenize(title, lang).filter((w) => isContentIn(c, w)).map((w) => stem(w, lang)));
  const numWords = c.en ? /\b(two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b/i : null;
  const factCues = c.en ? FACT_CUES : c.P.factCues;
  const pronounStart = c.en ? PRONOUN_START : c.P.pronounStart;
  return sents.map((s, i) => {
    const toks = tokenize(s.text, lang);
    const content = [...new Set(toks.filter((w) => isContentIn(c, w)).map((w) => stem(w, lang)))];
    const wc = wordCount(s.text);
    let score = 0;
    for (const x of content) score += (stats.tf.get(x) || 0) / stats.maxTf;
    score /= Math.sqrt(Math.max(4, content.length));
    if (i === 0) score += 0.3;
    else if (i < 3) score += 0.15;
    if (s.paraFirst) score += 0.08;
    if (/\d|[٠-٩०-९]/.test(s.text) || (numWords && numWords.test(s.text))) score += 0.18;
    if (factCues && factCues.test(s.text)) score += 0.14;
    if (qset.size) {
      let hit = 0;
      for (const x of content) if (qset.has(x)) hit++;
      score += 0.55 * (hit / qset.size);
    }
    if (tset.size) {
      let hit = 0;
      for (const x of content) if (tset.has(x)) hit++;
      score += 0.25 * (hit / tset.size);
    }
    if (pronounStart && pronounStart.test(s.text)) score -= 0.3;
    if (/[?؟]$/.test(s.text)) score -= 0.15;
    if (/["]/.test(s.text)) score -= 0.08;
    if (wc < 7) score -= 0.15;
    if (wc > 34) score -= 0.25;
    return { ...s, idx: i, score, set: new Set(content), wc };
  });
}

function selectSentences(scored, budgetWords, maxCount = 12, lang = 'en') {
  const pool = scored.filter((s) => s.wc >= 5 && s.wc <= 48 && !JUNK.test(s.text) && /[\p{L}]/u.test(s.text));
  const chosen = [];
  let words = 0;
  const lambda = 0.72;
  while (pool.length && chosen.length < maxCount) {
    let best = null;
    for (const s of pool) {
      let sim = 0;
      for (const c of chosen) sim = Math.max(sim, jaccard(s.set, c.set));
      const mmr = lambda * s.score - (1 - lambda) * sim;
      if (!best || mmr > best.mmr) best = { s, mmr };
    }
    if (!best) break;
    const s = best.s;
    pool.splice(pool.indexOf(s), 1);
    const w = wordCount(compressSentence(s.text, lang));
    if (chosen.length && words + w > budgetWords * 1.2) {
      if (words >= budgetWords * 0.86) break;
      continue; // try a shorter one
    }
    chosen.push(s);
    words += w;
    if (words >= budgetWords) break;
  }
  return chosen.sort((a, b) => a.idx - b.idx);
}

// ---------------------------------------------------------------- public API

function finalizeScenes(lines, stats, format, mainKeyword = '', lang = 'en') {
  const P = pack(lang);
  const usedKeywords = new Set();
  let lastStat = -2;
  return lines.map((line, i) => {
    const text = line.text.trim();
    const core = text.replace(P.ordinalRe, '');
    let keyword;
    let emoji;
    if (line.kind === 'cta') {
      keyword = mainKeyword || pickKeyword(core, stats, new Set(), lang);
      emoji = (P.ctaEmoji.find(([re]) => re.test(text)) || [null, '👉'])[1];
    } else {
      keyword = pickKeyword(core, stats, usedKeywords, lang) || mainKeyword;
      if (line.kind === 'hook' && mainKeyword && !emojiFor(keyword, lang) && emojiFor(mainKeyword, lang)) keyword = mainKeyword;
      emoji = emojiForText(core, keyword, lang);
    }
    if (keyword) usedKeywords.add(keyword.toLocaleLowerCase());
    let stat = null;
    if (line.kind === 'body' && i - lastStat >= 2) {
      stat = extractStat(core, lang);
      if (stat) lastStat = i;
    }
    return { id: uid('s'), kind: line.kind, text, keyword, emoji, stat, visual: null };
  });
}

function mainKeywordOf(topic, stats, lang = 'en') {
  const c = ctx(lang);
  const words = String(topic || '').split(/\s+/).filter((w) => isContentIn(c, w.toLocaleLowerCase()));
  // prefer the topic word with an emoji or the highest document frequency
  let best = '';
  let bestScore = -1;
  for (const w of words) {
    const lw = w.toLocaleLowerCase();
    const sc = (stats.tf.get(stem(lw, lang)) || 0) + (emojiFor(lw, lang) ? 2 : 0);
    if (sc > bestScore) {
      best = w;
      bestScore = sc;
    }
  }
  return best;
}

// First clause of a sentence, good for a short hook ("An octopus has three hearts").
function firstClause(s, lang = 'en') {
  const m = lang === 'en' ? s.match(/^(.{12,}?)(?::|;|,\s+(?:while|which|whereas|but|and so)\b|\s+[—–]\s+)/) : s.match(/^(.{12,}?)(?::|;|؛|\s+[—–]\s+)/);
  if (m && wordCount(m[1]) >= 4) return endPunct(m[1], lang);
  return s;
}

/**
 * Build a script.
 * @param {object} o
 * @param {'topic'|'article'|'script'} o.mode
 * @param {string} o.input        what the user typed or pasted
 * @param {string} [o.source]     source article text (article mode, or facts fetched for a topic)
 * @param {string} [o.sourceTitle]
 * @param {string} o.format       one of FORMATS ids
 * @param {number} o.seconds      target length
 * @param {string} [o.lang]       video language (langs.js), default English
 * @param {number} [o.seed]
 * @param {boolean} [o.addHook]   own-script mode: add a hook line
 * @param {boolean} [o.addCta]    own-script mode: add a call to action
 */
export function buildScript(o) {
  const lang = normLang(o.lang);
  const P = pack(lang);
  const format = o.format || 'facts';
  const seconds = o.seconds || 30;
  const seed = o.seed ?? hashString((o.input || '') + format + seconds);
  const rng = mulberry32(seed);
  const totalWords = Math.round(seconds * wpsFor(lang));

  if (o.mode === 'script') {
    const raw = cleanText(o.input, { keepAll: true, lang });
    const lines = [];
    raw.split(/\n+/).forEach((ln) => {
      const t = ln.trim().replace(/^[-*•\d.)\s]+(?=\S)/, (m) => (/^\d+[.)]\s/.test(m) ? '' : m.replace(/[-*•]\s*/, '')));
      if (!t) return;
      const sents = splitSentences(t, lang).map((s) => s.text);
      // keep short adjacent sentences together on one scene
      let buf = '';
      for (const s of sents) {
        if (buf && wordCount(buf) + wordCount(s) > 22) {
          lines.push(buf);
          buf = s;
        } else buf = buf ? buf + ' ' + s : s;
      }
      if (buf) lines.push(buf);
    });
    const sentObjs = lines.map((t) => ({ text: t }));
    const stats = docStats(sentObjs, lang);
    const topic = properCase(o.sourceTitle || guessTopic(sentObjs, stats, lang), stats);
    const out = lines.map((t, i) => ({ text: endPunct(t, lang), kind: i === 0 ? 'hook' : i === lines.length - 1 && lines.length > 2 ? 'cta' : 'body' }));
    if (o.addHook) out.unshift({ text: capFirst(fill(pick(rng, hookTemplates(format, lines.length, lang)), { topic, n: lines.length }, lang)), kind: 'hook' });
    if (o.addCta) out.push({ text: pick(rng, ctaOptions(format, lang)), kind: 'cta' });
    const scenes = finalizeScenes(out, stats, format, mainKeywordOf(topic, stats, lang), lang);
    return { title: titleFrom(o.input, scenes, lang), topic, format, scenes, source: 'own', seed, lang };
  }

  // topic or article: summarise the source text
  const sourceText = cleanText(o.source || o.input || '', { lang });
  let sents = splitSentences(sourceText, lang);
  let titleLine = o.sourceTitle || '';
  if (o.mode === 'article' && sents.length) {
    const first = sents[0].text;
    if (!/[.!?؟।]$/.test(first) && wordCount(first) <= 16 && wordCount(first) >= 2) {
      titleLine = titleLine || first;
      sents = sents.slice(1);
    }
  }
  sents = sents.filter((s) => /[.!?…؟।"')]$/.test(s.text) || wordCount(s.text) > 10);
  const stats = docStats(sents.length ? sents : [{ text: o.input || '' }], lang);
  const userTopic = o.mode === 'topic' ? o.input : '';
  const question = userTopic ? topicAsQuestion(userTopic, lang) : '';
  let topic;
  if (lang !== 'en' && o.mode === 'topic' && o.sourceTitle) topic = o.sourceTitle.replace(/\s*\([^)]*\)\s*$/, '');
  else if (userTopic) topic = topicPhrase(userTopic, lang);
  else if (titleLine && wordCount(topicPhrase(titleLine, lang)) <= 3) topic = topicPhrase(titleLine, lang);
  else topic = guessTopic(sents, stats, lang);
  if (!topic || wordCount(topic) > 6) topic = guessTopic(sents, stats, lang);
  topic = properCase(topic, stats);
  const mainKeyword = mainKeywordOf(topic, stats, lang);

  const hookBudget = 11;
  const ctaBudget = 8;
  const bodyBudget = Math.max(14, totalWords - hookBudget - ctaBudget);
  const scored = scoreSentences(sents, stats, { query: userTopic, title: titleLine, lang });
  const maxCount = format === 'list' ? Math.max(3, Math.min(7, Math.round(seconds / 9))) : 14;
  let chosen = selectSentences(scored, bodyBudget, maxCount, lang);

  // when the user asked a question, lead with the sentence that answers it
  if (question && chosen.length > 1) {
    const c = ctx(lang);
    const q = new Set(tokenize(userTopic, lang).filter((w) => isContentIn(c, w)).map((w) => stem(w, lang)));
    let bestI = 0;
    let bestHit = -1;
    chosen.forEach((s, i) => {
      let hit = 0;
      for (const x of s.set) if (q.has(x)) hit++;
      if (hit > bestHit) {
        bestHit = hit;
        bestI = i;
      }
    });
    if (bestI > 0) chosen.unshift(chosen.splice(bestI, 1)[0]);
  }
  let body = [];
  chosen.forEach((s) => splitLong(compressSentence(s.text, lang), 26, lang).forEach((t) => body.push(t)));

  // hook
  let hook = '';
  const factCues = lang === 'en' ? FACT_CUES : P.factCues;
  const pronounStart = lang === 'en' ? PRONOUN_START : P.pronounStart;
  if (format === 'facts' && !question && body.length > 1) {
    // turn the strongest short fact into a "Did you know" question
    const ranked = [...chosen]
      .map((s) => {
        const c = compressSentence(s.text, lang);
        const clause = firstClause(c, lang);
        let r = s.score + (extractStat(clause, lang) ? 0.35 : 0) + (factCues && factCues.test(clause) ? 0.15 : 0) - (wordCount(clause) > 14 ? 0.25 : 0);
        if ((pronounStart && pronounStart.test(c)) || /[?؟]$/.test(c) || wordCount(clause) > 17) r = -Infinity;
        return { c, clause, r };
      })
      .sort((a, b) => b.r - a.r);
    const cand = ranked[0];
    if (cand && cand.r > -Infinity) {
      hook = didYouKnow(cand.clause, stats, lang);
      if (cand.clause === cand.c) body = body.filter((t) => t !== cand.c);
    }
  }
  if (!hook) {
    if (question && ['facts', 'explainer', 'story', 'mystery'].includes(format)) hook = question;
    else hook = capFirst(fill(pick(rng, hookTemplates(format, body.length, lang)), { topic, n: body.length }, lang));
  }
  if (format === 'list' && body.length > 1) body = body.map((t, i) => `${P.ordinals[i] || P.next} ${t}`);
  const cta = pick(rng, ctaOptions(format, lang));

  const lines = [{ text: hook, kind: 'hook' }, ...body.map((t) => ({ text: t, kind: 'body' })), { text: cta, kind: 'cta' }];
  const scenes = finalizeScenes(lines, stats, format, mainKeyword, lang);
  const title = titleFrom(userTopic ? question || userTopic : titleLine || topic, scenes, lang);
  return { title, topic, format, scenes, source: o.mode === 'article' ? 'article' : 'facts', seed, hasBody: body.length > 0, lang };
}

function properCase(phrase, stats) {
  return String(phrase || '')
    .split(/\s+/)
    .map((w) => {
      const lw = w.toLocaleLowerCase();
      if (/^\p{Lu}{2,}$/u.test(w)) return w;
      return stats.isProper(lw) ? w.charAt(0).toLocaleUpperCase() + w.slice(1) : lw;
    })
    .join(' ');
}

/** Lines produced by an AI writer (one sentence per line, hook first, CTA last). */
export function scriptFromLines(lines, { format = 'facts', input = '', lang = 'en' } = {}) {
  const clean = lines
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|hook:|cta:|line \d+:)\s*/i, '').replace(/^["']|["']$/g, '').trim())
    .filter((l) => l && !/^(here is|here's|sure|title:)/i.test(l));
  const objs = clean.map((t) => ({ text: t }));
  const stats = docStats(objs, lang);
  const out = clean.map((t, i) => ({ text: endPunct(t, lang), kind: i === 0 ? 'hook' : i === clean.length - 1 ? 'cta' : 'body' }));
  const topic = properCase(input ? topicPhrase(input, lang) : guessTopic(objs, stats, lang), stats);
  const scenes = finalizeScenes(out, stats, format, mainKeywordOf(topic, stats, lang), lang);
  return { title: titleFrom(input || topic, scenes, lang), topic, format, scenes, source: 'ai', lang };
}

/** Keyword/emoji/stat refresh after the user edits a line. */
export function analyzeLine(text, kind = 'body', lang = 'en') {
  const stats = docStats([{ text }], lang);
  const keyword = pickKeyword(text, stats, new Set(), lang);
  return { keyword, emoji: emojiForText(text, keyword, lang), stat: kind === 'body' ? extractStat(text, lang) : null };
}

function guessTopic(sents, stats, lang = 'en') {
  const weak = ctx(lang).weak;
  const bi = topBigram(sents, lang);
  let top = null;
  for (const [st, c] of stats.tf) if (!weak.has(st) && (!top || c > top[1])) top = [st, c];
  if (bi && top && bi[1] >= 3 && bi[1] >= 0.6 * top[1]) return bi[0];
  return top ? stats.bestSurface(top[0]) : lang === 'en' ? 'this' : pack(lang).yourTopic;
}

function titleFrom(input, scenes, lang = 'en') {
  let t = String(input || '').trim().split('\n')[0];
  if (!t && scenes[0]) t = scenes[0].text;
  t = t.replace(/\s+/g, ' ').replace(/[.।]+$/, '');
  if (t.length > 70) t = t.slice(0, 67).replace(/\s+\S*$/, '') + '…';
  return capFirst(t) || pack(lang).untitled;
}

export function estimateSeconds(text, speed = 1, lang = 'en') {
  return Math.max(1.2, wordCount(text) / (wpsFor(lang) * speed) + 0.25);
}

export function starterOutline(topic, format, lang = 'en') {
  const P = pack(lang);
  const t = topicPhrase(topic, lang) || P.yourTopic;
  const q = topicAsQuestion(topic, lang);
  return P.outline(t, q, ctaOptions(format, lang)[0]).join('\n');
}

export { hasArabic };
