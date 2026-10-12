// Script engine: turns a topic, an article or the user's own lines into a short-form voiceover script
// split into scenes. Works fully offline (extractive summarising + hook/CTA writing).

import { hashString, mulberry32, pick, hasArabic, uid } from './util.js';
import { emojiFor, emojiForText } from './emoji.js';

export const FORMATS = [
  { id: 'facts', name: 'Did you know', hint: 'Surprising facts, question hook' },
  { id: 'list', name: 'Top list', hint: 'Numbered points' },
  { id: 'explainer', name: 'Explainer', hint: 'How and why, simply' },
  { id: 'story', name: 'Story', hint: 'Told in order' },
  { id: 'mystery', name: 'Mystery', hint: 'Curiosity first' },
  { id: 'motivation', name: 'Motivation', hint: 'Short punchy lessons' },
];

export const WORDS_PER_SECOND = 2.6; // average narration pace at 1.0x

const STOP = new Set(`a about above across after afterwards again against all almost alone along already also although always am among amongst an and another any anyhow anyone anything anyway anywhere are around as at back be became because become becomes becoming been before beforehand behind being below beside besides between beyond both but by can cannot could did do does doing done down due during each either else elsewhere enough even ever every everyone everything everywhere except few for former formerly from further get gets got had has have having he hence her here hereafter hereby herein hers herself him himself his how however i if in indeed into is it its itself just keep last latter latterly least less let like made make many may me meanwhile might mine more moreover most mostly much must my myself namely neither never nevertheless next no nobody none noone nor not nothing now nowhere of off often on once one only onto or other others otherwise our ours ourselves out over own part per perhaps please put rather re really same say says said see seem seemed seeming seems several she should show side since so some somehow someone something sometime sometimes somewhere still such than that the their theirs them themselves then thence there thereafter thereby therefore therein thereupon these they this those though through throughout thru thus to together too toward towards under until up upon us use used using very via was we well were what whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever whether which while whither who whoever whole whom whose why will with within without would yet you your yours yourself yourselves also known called including include includes around approximately about can't don't won't isn't aren't wasn't weren't it's that's there's they're we're you're i'm i've they've we've would've could've should've many much new first second third one two three four five six seven eight nine ten years year time times way ways thing things people person lot lots kind sort type types example examples however`.split(/\s+/));

const VERBISH = /(?:ing|ed|ly|ize|ise|ised|ized)$/;
const COMMON_VERBS = new Set('change changes make makes take takes give gives become becomes keep keeps help helps show shows find finds think thinks know knows open opens escape watch watched survive survives turn turns start starts stop stops need needs want wants feel feels look looks seem seems move moves grow grows live lives save share follow comment tell tells try tries happen happens begin begins call calls bring brings hold holds leave leaves mean means play plays reach reaches build builds spend spends lose loses pay pays meet meets learn learns'.split(' '));
const PRONOUN_START = /^(this|these|those|it|its|they|their|them|he|she|his|her|that|such|both|which|there)\b/i;
const JUNK = /(cookie|subscribe|newsletter|©|all rights reserved|click here|sign up|log in|read more|advertisement|photo by|image credit|follow us|terms of use|privacy policy|share this|related articles|getty images)/i;
const FACT_CUES = /\b(largest|biggest|smallest|fastest|slowest|oldest|first|only|never|every|most|least|percent|million|billion|thousand|record|discovered|scientists|researchers|study|studies|surprising|actually|secret|rare|unique|deadly|strongest|tallest|deepest|longest|heaviest|hottest|coldest)\b/i;

const ABBR = ['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e\\.g', 'i\\.e', 'u\\.s', 'u\\.k', 'a\\.m', 'p\\.m', 'no', 'inc', 'ltd', 'co', 'corp', 'fig', 'approx', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'mt', 'ft', 'gen', 'gov', 'sen', 'rep', 'dept', 'univ', 'est', 'al', 'ca', 'cf'];
const ABBR_RE = new RegExp('\\b(' + ABBR.join('|') + ')\\.', 'gi');

// ---------------------------------------------------------------- text basics

export function cleanText(raw, { keepAll = false } = {}) {
  let t = String(raw || '');
  t = t.replace(/\r/g, '');
  t = t.replace(/https?:\/\/\S+/g, ' ').replace(/\bwww\.\S+/g, ' ');
  t = t.replace(/\[(?:\d+|[a-z]|citation needed|note \d+|nb \d+|update)\]/gi, '');
  t = t.replace(/\{\\displaystyle[^}]*\}/g, '');
  if (!keepAll) t = t.replace(/^\s*(advertisement|sponsored|related:|read more|subscribe|sign up|share this|click here|image:|photo:|credit:|getty images).*$/gim, '');
  t = t.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'");
  t = t.replace(/[ \t ]+/g, ' ');
  t = t.replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

export function splitSentences(text) {
  const paras = String(text || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];
  paras.forEach((p, pi) => {
    let s = p;
    s = s.replace(/\b([A-Z])\.(?=\s?[A-Z]\.)/g, '$1<DOT>');
    s = s.replace(/(\d)\.(\d)/g, '$1<DOT>$2');
    s = s.replace(ABBR_RE, '$1<DOT>');
    s = s.replace(/\b([A-Z])\.\s(?=[A-Z][a-z])/g, '$1<DOT> ');
    const parts = s.split(/(?<=[.!?…؟]["')\]]*)\s+(?=["'(\[]?[A-Z0-9؀-ۿ])/);
    parts.forEach((part, k) => {
      const txt = part.replace(/<DOT>/g, '.').trim();
      if (txt) out.push({ text: txt, para: pi, paraFirst: k === 0 });
    });
  });
  return out;
}

export function tokenize(s) {
  return (String(s).toLowerCase().match(/[a-zÀ-ɏ؀-ۿ0-9]+(?:'[a-z]+)?/g) || []).map((w) => w.replace(/'s$/, ''));
}

export function stem(w) {
  if (/^\d/.test(w)) return w;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(uses|sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

const isContent = (w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w);
const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;

function capFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function endPunct(s) {
  s = s.trim();
  if (!/[.!?…؟"')]$/.test(s)) s += '.';
  return s;
}

function stripEnd(s) {
  return s.trim().replace(/[.!?…]+$/, '');
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

export function compressSentence(s) {
  let t = s;
  t = t.replace(/\s*\([^()]{0,220}\)/g, '');
  t = t.replace(/\s*\[[^\]]{0,220}\]/g, '');
  t = t.replace(/\s+[—–]\s+[^—–]{3,140}?\s+[—–]\s+/g, ' ');
  t = t.replace(/—[^—]{3,140}—/g, ' ');
  t = t.replace(/^(however|moreover|furthermore|in addition|additionally|meanwhile|notably|interestingly|importantly|indeed|thus|therefore|consequently|in fact|as a result|for example|for instance|on the other hand|in other words|that said|overall|also),\s+/i, '');
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  t = humanizeNumbers(t);
  t = t.replace(/\s+([,.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
  t = t.replace(/^[,;:\s]+/, '');
  return endPunct(capFirst(t));
}

function splitLong(s, maxWords = 26) {
  if (wordCount(s) <= maxWords) return [s];
  const parts = [];
  const bySemi = s.split(/;\s+/);
  if (bySemi.length > 1 && bySemi.every((p) => wordCount(p) >= 5)) {
    bySemi.forEach((p) => parts.push(endPunct(capFirst(p))));
  } else {
    const m = s.match(/^(.{30,}?),\s+(but|while|whereas|yet)\s+(.{20,})$/i);
    if (m && wordCount(m[1]) >= 6 && wordCount(m[3]) >= 5) {
      parts.push(endPunct(m[1]));
      parts.push(endPunct(capFirst(m[2].toLowerCase() === 'but' ? 'But ' + m[3] : m[3])));
    } else parts.push(s);
  }
  return parts;
}

// ---------------------------------------------------------------- analysis

function docStats(sentences) {
  const tf = new Map();
  const surface = new Map(); // stem -> Map(surface -> count)
  const capsMid = new Map(); // lowercased word -> count of capitalised mid-sentence uses
  for (const s of sentences) {
    const raw = s.text.match(/[A-Za-zÀ-ɏ؀-ۿ0-9]+(?:'[a-z]+)?/g) || [];
    raw.forEach((w, i) => {
      const lw = w.toLowerCase().replace(/'s$/, '');
      if (i > 0 && /^[A-Z]/.test(w)) capsMid.set(lw, (capsMid.get(lw) || 0) + 1);
      if (!isContent(lw)) return;
      const st = stem(lw);
      tf.set(st, (tf.get(st) || 0) + 1);
      if (!surface.has(st)) surface.set(st, new Map());
      const m = surface.get(st);
      const form = i > 0 && /^[A-Z]/.test(w) ? w : lw;
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
  return { tf, maxTf, bestSurface, isProper };
}

function topBigram(sentences) {
  const counts = new Map();
  for (const s of sentences) {
    const toks = tokenize(s.text);
    for (let i = 0; i < toks.length - 1; i++) {
      if (isContent(toks[i]) && isContent(toks[i + 1])) {
        const k = toks[i] + ' ' + toks[i + 1];
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
  }
  let best = null;
  for (const [k, c] of counts) if (!best || c > best[1]) best = [k, c];
  return best;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function pickKeyword(text, stats, avoid = new Set()) {
  const raw = String(text).match(/[A-Za-zÀ-ɏ]+/g) || [];
  let best = null;
  raw.forEach((w, i) => {
    const lw = w.toLowerCase();
    if (!isContent(lw) || avoid.has(lw)) return;
    const st = stem(lw);
    let score = Math.sqrt(stats ? stats.tf.get(st) || 1 : 1);
    if (emojiFor(lw)) score *= 1.6;
    if (i > 0 && /^[A-Z]/.test(w)) score *= 1.25;
    if (VERBISH.test(lw) || COMMON_VERBS.has(lw)) score *= 0.5;
    if (lw.length >= 5) score *= 1.15;
    if (lw.length <= 3) score *= 0.6;
    if (!best || score > best.score) best = { word: i > 0 && /^[A-Z]/.test(w) ? w : lw, score };
  });
  return best ? best.word : '';
}

// ---------------------------------------------------------------- stats ("big number" cards)

const NUMWORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, hundreds: 100, thousand: 1000, thousands: 1000 };
const SCALE = { thousand: 'K', million: 'M', billion: 'B', trillion: 'T' };

export function extractStat(text) {
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

export function topicAsQuestion(input) {
  let q = String(input || '').trim().replace(/\s+/g, ' ');
  if (!q) return '';
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
export function topicPhrase(input) {
  let t = String(input || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .trim()
    .replace(/[?!.]+$/, '')
    .replace(/\s+/g, ' ');
  if (!t) return '';
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


const HOOKS = {
  facts: ['Here are facts about {topic} that sound fake but are true.', "Most people know nothing about {topic}. Here's what you're missing.", 'Stop scrolling. These facts about {topic} are wild.'],
  list: ["{n} things about {topic} you probably didn't know.", 'Here are {n} facts about {topic} worth knowing.', '{n} things about {topic} that will surprise you.'],
  explainer: ['{Topic}, explained in under a minute.', '{Topic}, explained simply.', 'Let me explain {topic} in plain words.'],
  story: ['This is the story of {topic}.', 'Let me tell you the story of {topic}.', 'The story of {topic} is stranger than you think.'],
  mystery: ['Here is something about {topic} that most people never question.', "There's more to {topic} than you think.", "Something about {topic} doesn't add up."],
  motivation: ['If you need a push today, listen to this.', 'Here is a lesson about {topic} worth remembering.', 'Read this when you feel stuck.'],
};

const CTAS = {
  facts: ['Follow for more facts like this.', 'Which fact surprised you most? Tell me in the comments.', 'Save this and share it with someone curious.'],
  list: ['Which one did you already know? Comment below.', 'Follow for more lists like this.', 'Save this list for later.'],
  explainer: ['Now you know. Follow for more quick explainers.', 'Save this so you remember it later.', 'Follow for more things explained simply.'],
  story: ['Follow for more stories like this one.', 'What would you have done? Tell me below.', 'Share this with someone who loves a good story.'],
  mystery: ['What do you think is going on? Comment your theory.', 'Follow for more mysteries like this.', 'Share this with someone who loves a mystery.'],
  motivation: ['Save this for the day you need it.', 'Send this to someone who needs it today.', 'Follow for a daily push forward.'],
};

const ORDINALS = ['Number one.', 'Number two.', 'Number three.', 'Number four.', 'Number five.', 'Number six.', 'Number seven.', 'Number eight.', 'Number nine.', 'Number ten.'];

function fill(tpl, ctx) {
  if (ctx.n === 1) tpl = tpl.replace(/^\{n\} things/, 'One thing').replace(/\{n\} facts/, 'one fact').replace(/\{n\} things/, 'one thing');
  return tpl
    .replace(/\{Topic\}/g, capFirst(ctx.topic))
    .replace(/\{topic\}/g, ctx.topic)
    .replace(/\{n\}/g, String(ctx.n))
    .replace(/^(\d+)/, (d) => d); // numbers at start stay digits
}

export function hookOptions(format, ctx) {
  const list = (HOOKS[format] || HOOKS.facts).map((t) => capFirst(fill(t, ctx)));
  if (ctx.question && ['facts', 'explainer', 'story', 'mystery'].includes(format)) list.unshift(ctx.question);
  if (ctx.fact && format === 'facts') list.unshift(ctx.fact);
  return [...new Set(list)];
}

export function ctaOptions(format) {
  return CTAS[format] || CTAS.facts;
}

function didYouKnow(sentence, stats) {
  const s = stripEnd(sentence);
  const first = s.split(/\s+/)[0] || '';
  const keepCase = stats.isProper(first.toLowerCase().replace(/[^a-z]/g, '')) || /^[A-Z]{2,}/.test(first);
  const body = keepCase ? s : s.charAt(0).toLowerCase() + s.slice(1);
  return `Did you know ${body}?`;
}

// ---------------------------------------------------------------- summariser

function scoreSentences(sents, stats, { query = '', title = '' } = {}) {
  const qset = new Set(tokenize(query).filter(isContent).map(stem));
  const tset = new Set(tokenize(title).filter(isContent).map(stem));
  return sents.map((s, i) => {
    const toks = tokenize(s.text);
    const content = [...new Set(toks.filter(isContent).map(stem))];
    const wc = wordCount(s.text);
    let score = 0;
    for (const c of content) score += (stats.tf.get(c) || 0) / stats.maxTf;
    score /= Math.sqrt(Math.max(4, content.length));
    if (i === 0) score += 0.3;
    else if (i < 3) score += 0.15;
    if (s.paraFirst) score += 0.08;
    if (/\d/.test(s.text) || /\b(two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b/i.test(s.text)) score += 0.18;
    if (FACT_CUES.test(s.text)) score += 0.14;
    if (qset.size) {
      let hit = 0;
      for (const c of content) if (qset.has(c)) hit++;
      score += 0.55 * (hit / qset.size);
    }
    if (tset.size) {
      let hit = 0;
      for (const c of content) if (tset.has(c)) hit++;
      score += 0.25 * (hit / tset.size);
    }
    if (PRONOUN_START.test(s.text)) score -= 0.3;
    if (/\?$/.test(s.text)) score -= 0.15;
    if (/["]/.test(s.text)) score -= 0.08;
    if (wc < 7) score -= 0.15;
    if (wc > 34) score -= 0.25;
    return { ...s, idx: i, score, set: new Set(content), wc };
  });
}

function selectSentences(scored, budgetWords, maxCount = 12) {
  const pool = scored.filter((s) => s.wc >= 5 && s.wc <= 48 && !JUNK.test(s.text) && /[a-z؀-ۿ]/i.test(s.text));
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
    const w = wordCount(compressSentence(s.text));
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

const CTA_EMOJI = [
  [/\bcomment|tell me|below\b/i, '💬'],
  [/\bsave\b/i, '📌'],
  [/\bshare|send\b/i, '📤'],
  [/\bfollow\b/i, '🔔'],
];

function finalizeScenes(lines, stats, format, mainKeyword = '') {
  const usedKeywords = new Set();
  let lastStat = -2;
  return lines.map((line, i) => {
    const text = line.text.trim();
    const core = text.replace(/^(number (one|two|three|four|five|six|seven|eight|nine|ten)|next)\.\s*/i, '');
    let keyword;
    let emoji;
    if (line.kind === 'cta') {
      keyword = mainKeyword || pickKeyword(core, stats);
      emoji = (CTA_EMOJI.find(([re]) => re.test(text)) || [null, '👉'])[1];
    } else {
      keyword = pickKeyword(core, stats, usedKeywords) || mainKeyword;
      if (line.kind === 'hook' && mainKeyword && !emojiFor(keyword) && emojiFor(mainKeyword)) keyword = mainKeyword;
      emoji = emojiForText(core, keyword);
    }
    if (keyword) usedKeywords.add(keyword.toLowerCase());
    let stat = null;
    if (line.kind === 'body' && i - lastStat >= 2) {
      stat = extractStat(core);
      if (stat) lastStat = i;
    }
    return { id: uid('s'), kind: line.kind, text, keyword, emoji, stat, visual: null };
  });
}

function mainKeywordOf(topic, stats) {
  const words = String(topic || '').split(/\s+/).filter((w) => isContent(w.toLowerCase()));
  // prefer the topic word with an emoji or the highest document frequency
  let best = '';
  let bestScore = -1;
  for (const w of words) {
    const lw = w.toLowerCase();
    const sc = (stats.tf.get(stem(lw)) || 0) + (emojiFor(lw) ? 2 : 0);
    if (sc > bestScore) {
      best = w;
      bestScore = sc;
    }
  }
  return best;
}

// First clause of a sentence, good for a short hook ("An octopus has three hearts").
function firstClause(s) {
  const m = s.match(/^(.{12,}?)(?::|;|,\s+(?:while|which|whereas|but|and so)\b|\s+[—–]\s+)/);
  if (m && wordCount(m[1]) >= 4) return endPunct(m[1]);
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
 * @param {number} [o.seed]
 * @param {boolean} [o.addHook]   own-script mode: add a hook line
 * @param {boolean} [o.addCta]    own-script mode: add a call to action
 */
export function buildScript(o) {
  const format = o.format || 'facts';
  const seconds = o.seconds || 30;
  const seed = o.seed ?? hashString((o.input || '') + format + seconds);
  const rng = mulberry32(seed);
  const totalWords = Math.round(seconds * WORDS_PER_SECOND);

  if (o.mode === 'script') {
    const raw = cleanText(o.input, { keepAll: true });
    const lines = [];
    raw.split(/\n+/).forEach((ln) => {
      const t = ln.trim().replace(/^[-*•\d.)\s]+(?=\S)/, (m) => (/^\d+[.)]\s/.test(m) ? '' : m.replace(/[-*•]\s*/, '')));
      if (!t) return;
      const sents = splitSentences(t).map((s) => s.text);
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
    const stats = docStats(sentObjs);
    const topic = properCase(o.sourceTitle || guessTopic(sentObjs, stats), stats);
    const out = lines.map((t, i) => ({ text: endPunct(t), kind: i === 0 ? 'hook' : i === lines.length - 1 && lines.length > 2 ? 'cta' : 'body' }));
    if (o.addHook) out.unshift({ text: capFirst(fill(pick(rng, HOOKS[format] || HOOKS.facts), { topic, n: lines.length })), kind: 'hook' });
    if (o.addCta) out.push({ text: pick(rng, ctaOptions(format)), kind: 'cta' });
    const scenes = finalizeScenes(out, stats, format, mainKeywordOf(topic, stats));
    return { title: titleFrom(o.input, scenes), topic, format, scenes, source: 'own', seed };
  }

  // topic or article: summarise the source text
  const sourceText = cleanText(o.source || o.input || '');
  let sents = splitSentences(sourceText);
  let titleLine = o.sourceTitle || '';
  if (o.mode === 'article' && sents.length) {
    const first = sents[0].text;
    if (!/[.!?]$/.test(first) && wordCount(first) <= 16 && wordCount(first) >= 2) {
      titleLine = titleLine || first;
      sents = sents.slice(1);
    }
  }
  sents = sents.filter((s) => /[.!?…؟"')]$/.test(s.text) || wordCount(s.text) > 10);
  const stats = docStats(sents.length ? sents : [{ text: o.input || '' }]);
  const userTopic = o.mode === 'topic' ? o.input : '';
  const question = userTopic ? topicAsQuestion(userTopic) : '';
  let topic;
  if (userTopic) topic = topicPhrase(userTopic);
  else if (titleLine && wordCount(topicPhrase(titleLine)) <= 3) topic = topicPhrase(titleLine);
  else topic = guessTopic(sents, stats);
  if (!topic || wordCount(topic) > 6) topic = guessTopic(sents, stats);
  topic = properCase(topic, stats);
  const mainKeyword = mainKeywordOf(topic, stats);

  const hookBudget = 11;
  const ctaBudget = 8;
  const bodyBudget = Math.max(14, totalWords - hookBudget - ctaBudget);
  const scored = scoreSentences(sents, stats, { query: userTopic, title: titleLine });
  const maxCount = format === 'list' ? Math.max(3, Math.min(7, Math.round(seconds / 9))) : 14;
  let chosen = selectSentences(scored, bodyBudget, maxCount);

  // when the user asked a question, lead with the sentence that answers it
  if (question && chosen.length > 1) {
    const q = new Set(tokenize(userTopic).filter(isContent).map(stem));
    let bestI = 0;
    let bestHit = -1;
    chosen.forEach((c, i) => {
      let hit = 0;
      for (const x of c.set) if (q.has(x)) hit++;
      if (hit > bestHit) {
        bestHit = hit;
        bestI = i;
      }
    });
    if (bestI > 0) chosen.unshift(chosen.splice(bestI, 1)[0]);
  }
  let body = [];
  chosen.forEach((s) => splitLong(compressSentence(s.text)).forEach((t) => body.push(t)));

  // hook
  let hook = '';
  if (format === 'facts' && !question && body.length > 1) {
    // turn the strongest short fact into a "Did you know" question
    const ranked = [...chosen]
      .map((s) => {
        const c = compressSentence(s.text);
        const clause = firstClause(c);
        let r = s.score + (extractStat(clause) ? 0.35 : 0) + (FACT_CUES.test(clause) ? 0.15 : 0) - (wordCount(clause) > 14 ? 0.25 : 0);
        if (PRONOUN_START.test(c) || /\?$/.test(c) || wordCount(clause) > 17) r = -Infinity;
        return { c, clause, r };
      })
      .sort((a, b) => b.r - a.r);
    const cand = ranked[0];
    if (cand && cand.r > -Infinity) {
      hook = didYouKnow(cand.clause, stats);
      if (cand.clause === cand.c) body = body.filter((t) => t !== cand.c);
    }
  }
  if (!hook) {
    if (question && ['facts', 'explainer', 'story', 'mystery'].includes(format)) hook = question;
    else hook = capFirst(fill(pick(rng, HOOKS[format] || HOOKS.facts), { topic, n: body.length }));
  }
  if (format === 'list' && body.length > 1) body = body.map((t, i) => `${ORDINALS[i] || 'Next.'} ${t}`);
  const cta = pick(rng, ctaOptions(format));

  const lines = [{ text: hook, kind: 'hook' }, ...body.map((t) => ({ text: t, kind: 'body' })), { text: cta, kind: 'cta' }];
  const scenes = finalizeScenes(lines, stats, format, mainKeyword);
  const title = titleFrom(userTopic ? question || userTopic : titleLine || topic, scenes);
  return { title, topic, format, scenes, source: o.mode === 'article' ? 'article' : 'facts', seed, hasBody: body.length > 0 };
}

function properCase(phrase, stats) {
  return String(phrase || '')
    .split(/\s+/)
    .map((w) => {
      const lw = w.toLowerCase();
      if (/^[A-Z]{2,}$/.test(w)) return w;
      return stats.isProper(lw) ? w.charAt(0).toUpperCase() + w.slice(1) : lw;
    })
    .join(' ');
}

/** Lines produced by an AI writer (one sentence per line, hook first, CTA last). */
export function scriptFromLines(lines, { format = 'facts', input = '' } = {}) {
  const clean = lines
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|hook:|cta:|line \d+:)\s*/i, '').replace(/^["']|["']$/g, '').trim())
    .filter((l) => l && !/^(here is|here's|sure|title:)/i.test(l));
  const objs = clean.map((t) => ({ text: t }));
  const stats = docStats(objs);
  const out = clean.map((t, i) => ({ text: endPunct(t), kind: i === 0 ? 'hook' : i === clean.length - 1 ? 'cta' : 'body' }));
  const topic = properCase(input ? topicPhrase(input) : guessTopic(objs, stats), stats);
  const scenes = finalizeScenes(out, stats, format, mainKeywordOf(topic, stats));
  return { title: titleFrom(input || topic, scenes), topic, format, scenes, source: 'ai' };
}

/** Keyword/emoji/stat refresh after the user edits a line. */
export function analyzeLine(text, kind = 'body') {
  const stats = docStats([{ text }]);
  const keyword = pickKeyword(text, stats);
  return { keyword, emoji: emojiForText(text, keyword), stat: kind === 'body' ? extractStat(text) : null };
}

function guessTopic(sents, stats) {
  const bi = topBigram(sents);
  let top = null;
  for (const [st, c] of stats.tf) if (!top || c > top[1]) top = [st, c];
  if (bi && top && bi[1] >= 3 && bi[1] >= 0.6 * top[1]) return bi[0];
  return top ? stats.bestSurface(top[0]) : 'this';
}

function titleFrom(input, scenes) {
  let t = String(input || '').trim().split('\n')[0];
  if (!t && scenes[0]) t = scenes[0].text;
  t = t.replace(/\s+/g, ' ').replace(/[.]+$/, '');
  if (t.length > 70) t = t.slice(0, 67).replace(/\s+\S*$/, '') + '…';
  return capFirst(t) || 'Untitled video';
}

export function estimateSeconds(text, speed = 1) {
  return Math.max(1.2, wordCount(text) / (WORDS_PER_SECOND * speed) + 0.25);
}

export function starterOutline(topic, format) {
  const t = topicPhrase(topic) || 'your topic';
  const q = topicAsQuestion(topic);
  const lines = [
    q || `Here is what you need to know about ${t}.`,
    `Write your first point about ${t} here.`,
    `Add a second point, ideally with a surprising number.`,
    `Add one more point that people rarely hear.`,
    ctaOptions(format)[0],
  ];
  return lines.join('\n');
}

export { hasArabic };
