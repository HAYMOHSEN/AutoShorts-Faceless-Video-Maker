// Interface language: translations, plurals, dates and right-to-left layout.
// Strings are written in English in the code and looked up by their English text:
//   t('Generate video')                       → "Generar video"
//   t('{n} scenes', { n: 4 })                 → plural form chosen with Intl.PluralRules
//   tx('{left} of {limit} left', { left: el }) → array of text and nodes, for strings with markup
// Data lists (voice descriptions, look names…) mark their strings with N_() so the extractor finds
// them, and translate them where they are shown.

import { kvGet, kvSet } from './db.js';

export const UI_LANGS = [
  { id: 'en', name: 'English', locale: 'en' },
  { id: 'es', name: 'Español', locale: 'es' },
  { id: 'fr', name: 'Français', locale: 'fr' },
  { id: 'de', name: 'Deutsch', locale: 'de' },
  { id: 'pt', name: 'Português (Brasil)', locale: 'pt-BR' },
  { id: 'hi', name: 'हिन्दी', locale: 'hi' },
  // Western digits in the Arabic interface, to match times, resolutions and the video captions
  { id: 'ar', name: 'العربية', locale: 'ar', intl: 'ar-u-nu-latn', dir: 'rtl' },
];

// English plural forms (the other languages bring their own in their dictionaries). Keys with {n}
// choose a form with Intl.PluralRules: one, two, few, many, other (Arabic uses all of them).
const EN = {
  '{n} scenes': { one: '{n} scene', other: '{n} scenes' },
  '{n} saved on this PC': { one: '{n} saved on this PC', other: '{n} saved on this PC' },
  '{n} voice lines are still being recorded. Export will wait for them.': { one: '{n} voice line is still being recorded. Export will wait for it.', other: '{n} voice lines are still being recorded. Export will wait for them.' },
  '{n} scenes have no recording yet and will be silent.': { one: '{n} scene has no recording yet and will be silent.', other: '{n} scenes have no recording yet and will be silent.' },
  'Added {n} clips.': { one: 'Added {n} clip.', other: 'Added {n} clips.' },
  'Resets in {n} days': { one: 'Resets in {n} day', other: 'Resets in {n} days' },
  '{n} unused voice lines': { one: '{n} unused voice line', other: '{n} unused voice lines' },
  '{n} unused music tracks': { one: '{n} unused music track', other: '{n} unused music tracks' },
};

let lang = 'en';
let dict = EN;
let plural = new Intl.PluralRules('en');

export const N_ = (s) => s;

// language names, as they appear inside sentences ("AI voices don't speak Arabic yet")
const LANG_NAMES = { en: N_('English'), es: N_('Spanish'), fr: N_('French'), de: N_('German'), pt: N_('Portuguese'), hi: N_('Hindi'), ar: N_('Arabic') };
export const langName = (id) => t(LANG_NAMES[id] || id);
export const uiLang = () => lang;
const entry = () => UI_LANGS.find((l) => l.id === lang) || UI_LANGS[0];
export const uiLocale = () => entry().intl || entry().locale;
export const isRtl = () => lang === 'ar';
/** Joins short interface phrases with the comma of the interface language (Arabic uses ،). */
export const joinList = (...parts) => parts.join(lang === 'ar' ? '، ' : ', ');

/** The interface language that fits this PC: the saved choice, else the first Windows/browser language we have. */
export function systemLang() {
  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
  for (const l of list) {
    const id = String(l || '').toLowerCase().split('-')[0];
    if (UI_LANGS.some((x) => x.id === id)) return id;
  }
  return 'en';
}

export async function initI18n() {
  let id = null;
  try {
    id = await kvGet('uiLang', null);
  } catch {
    /* storage unavailable */
  }
  if (!id || !UI_LANGS.some((x) => x.id === id)) id = systemLang();
  await useLang(id);
  return lang;
}

async function useLang(id) {
  lang = id;
  dict = EN;
  if (id !== 'en') {
    try {
      const mod = await import(`./i18n/${id}.js`);
      dict = { ...EN, ...mod.default };
    } catch (e) {
      console.warn('Translations could not be loaded', e);
      lang = 'en';
    }
  }
  plural = new Intl.PluralRules(uiLocale());
  const root = document.documentElement;
  root.lang = entry().locale;
  root.dir = isRtl() ? 'rtl' : 'ltr';
}

/** Change the interface language (the app restarts its views to apply it). */
export async function setUiLang(id) {
  await kvSet('uiLang', id);
  location.reload();
}

// In Arabic, inserted values (a video title, "120 MB", an English voice name) are isolated so the
// right-to-left sentence around them keeps its order.
const isolate = (v) => (lang === 'ar' ? `\u2068${v}\u2069` : v);

function fill(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? isolate(String(vars[k])) : m));
}

function lookup(key, vars) {
  let s = dict[key];
  if (s && typeof s === 'object') {
    const n = vars && typeof vars.n === 'number' ? vars.n : 0;
    s = s[plural.select(n)] || s.other || key;
  }
  return typeof s === 'string' && s ? s : key;
}

/** Translate an interface string; {name} placeholders are filled from vars. */
export function t(key, vars) {
  if (key == null) return '';
  return fill(lookup(String(key), vars), vars);
}

/** Like t(), but placeholders can be DOM nodes: returns an array for h() children. */
export function tx(key, vars = {}) {
  const s = lookup(key, vars);
  const out = [];
  let last = 0;
  s.replace(/\{(\w+)\}/g, (m, k, i) => {
    out.push(s.slice(last, i));
    const v = vars[k];
    out.push(v == null ? m : v instanceof Node ? v : isolate(String(v)));
    last = i + m.length;
    return m;
  });
  out.push(s.slice(last));
  return out.filter((x) => x !== '');
}

/** "3 min ago", "Yesterday", "12 Oct" in the interface language. */
export function relativeDate(ts) {
  const diff = Date.now() - ts;
  const day = 86400000;
  const rtf = new Intl.RelativeTimeFormat(uiLocale(), { numeric: 'auto' });
  const cap = (s) => s.charAt(0).toLocaleUpperCase(uiLocale()) + s.slice(1);
  if (diff < 60000) return t('Just now');
  if (diff < 3600000) return cap(rtf.format(-Math.round(diff / 60000), 'minute'));
  if (diff < day) return cap(rtf.format(-Math.round(diff / 3600000), 'hour'));
  if (diff < 7 * day) return cap(rtf.format(-Math.max(1, Math.round(diff / day)), 'day'));
  return new Date(ts).toLocaleDateString(uiLocale(), { month: 'short', day: 'numeric' });
}

/** A number in the interface language's format. */
export function fmtNum(n, opts) {
  return new Intl.NumberFormat(uiLocale(), opts).format(n);
}
