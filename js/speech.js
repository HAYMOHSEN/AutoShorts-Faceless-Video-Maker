// Text → what the voice should actually say: symbols, units, abbreviations and the number forms
// the phonemizer gets wrong, per language. Captions keep the original text.

import { asciiDigits } from './langs.js';

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

function englishSpeech(text) {
  let t = String(text || '');
  t = t.replace(EMOJI, '');
  t = t.replace(/\$\s?(\d[\d,.]*)\s?(thousand|million|billion|trillion)?/gi, (m, n, s) => `${n}${s ? ' ' + s : ''} dollars`);
  t = t.replace(/(\d)\s?%/g, '$1 percent');
  t = t.replace(/°\s?C\b/g, ' degrees Celsius').replace(/°\s?F\b/g, ' degrees Fahrenheit').replace(/°/g, ' degrees');
  t = t.replace(/(\d)\s?km\b/gi, '$1 kilometers').replace(/(\d)\s?kg\b/gi, '$1 kilograms').replace(/(\d)\s?mph\b/gi, '$1 miles per hour').replace(/(\d)\s?cm\b/gi, '$1 centimeters').replace(/(\d)\s?mm\b/gi, '$1 millimeters').replace(/(\d)\s?lbs?\b/gi, '$1 pounds');
  t = t.replace(/\be\.g\.,?/gi, 'for example,').replace(/\bi\.e\.,?/gi, 'that is,').replace(/\bvs\.?\b/gi, 'versus').replace(/\betc\./gi, 'et cetera');
  t = t.replace(/&/g, ' and ').replace(/\s*\+\s*/g, ' plus ').replace(/[#*_~^<>{}[\]|\\]/g, ' ');
  t = t.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  return t;
}

// ------------------------------------------------------------------ number words (German, French)

const DE_ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

export function deCardinal(n) {
  if (n < 20) return DE_ONES[n];
  if (n < 100) {
    const u = n % 10;
    return (u ? (u === 1 ? 'ein' : DE_ONES[u]) + 'und' : '') + DE_TENS[Math.floor(n / 10)];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h === 1 ? 'ein' : DE_ONES[h]) + 'hundert' + (r ? deCardinal(r) : '');
  }
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  return (th === 1 ? 'ein' : deCardinal(th)) + 'tausend' + (r ? deCardinal(r) : '');
}

const DE_ORD = { 1: 'erst', 3: 'dritt', 7: 'siebt', 8: 'acht' };
function deOrdinalStem(n) {
  if (n === 100) return 'hundertst';
  if (n === 1000) return 'tausendst';
  const r = n % 100;
  if (n < 20) return DE_ORD[n] || DE_ONES[n] + 't';
  if (r > 0 && r < 20) return deCardinal(n - r) + (DE_ORD[r] || DE_ONES[r] + 't');
  return deCardinal(n) + 'st';
}

const FR_ONES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const FR_TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

export function frCardinal(n) {
  if (n <= 16) return FR_ONES[n];
  if (n < 20) return 'dix-' + FR_ONES[n - 10];
  if (n < 70) {
    const u = n % 10;
    return FR_TENS[Math.floor(n / 10)] + (u === 1 ? ' et un' : u ? '-' + FR_ONES[u] : '');
  }
  if (n < 80) return 'soixante' + (n === 71 ? ' et onze' : '-' + frCardinal(n - 60));
  if (n < 100) return n === 80 ? 'quatre-vingts' : 'quatre-vingt-' + frCardinal(n - 80);
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h === 1 ? 'cent' : FR_ONES[h] + ' cent' + (r ? '' : 's')) + (r ? ' ' + frCardinal(r) : '');
  }
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  return (th === 1 ? 'mille' : frCardinal(th) + ' mille') + (r ? ' ' + frCardinal(r) : '');
}

export function frOrdinal(n, fem = false) {
  if (n === 1) return fem ? 'première' : 'premier';
  const w = frCardinal(n);
  if (/(^|[\s-])un$/.test(w)) return w + 'ième';
  if (w.endsWith('cinq')) return w + 'uième';
  if (w.endsWith('neuf')) return w.slice(0, -1) + 'vième';
  if (w.endsWith('vingts') || w.endsWith('cents')) return w.slice(0, -1) + 'ième';
  if (w.endsWith('e')) return w.slice(0, -1) + 'ième';
  return w + 'ième';
}

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
export function romanToInt(s) {
  if (!/^[IVXLCDM]+$/.test(s)) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] || 0;
    n += v < next ? -v : v;
  }
  // only accept canonical spellings (rejects words like "MIX" read as numbers by accident)
  return intToRoman(n) === s ? n : 0;
}
function intToRoman(n) {
  const T = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of T) {
    while (n >= v) {
      out += r;
      n -= v;
    }
  }
  return out;
}

// ------------------------------------------------------------------ per-language rules

// shared shape: words for symbols and units, plus [pattern, replacement] fixes run first
const UNITS = {
  es: { of: 'de', pct: 'por ciento', deg: 'grados', c: 'grados Celsius', f: 'grados Fahrenheit', kmh: 'kilómetros por hora', km: 'kilómetros', kg: 'kilos', cm: 'centímetros', mm: 'milímetros', mph: 'millas por hora', lb: 'libras', and: 'y', plus: 'más', usd: 'dólares', eur: 'euros', gbp: 'libras', inr: 'rupias', brl: 'reales' },
  fr: { of: 'de', pct: 'pour cent', deg: 'degrés', c: 'degrés Celsius', f: 'degrés Fahrenheit', kmh: 'kilomètres par heure', km: 'kilomètres', kg: 'kilos', cm: 'centimètres', mm: 'millimètres', mph: 'miles par heure', lb: 'livres', and: 'et', plus: 'plus', usd: 'dollars', eur: 'euros', gbp: 'livres', inr: 'roupies', brl: 'réaux' },
  de: { pct: 'Prozent', deg: 'Grad', c: 'Grad Celsius', f: 'Grad Fahrenheit', kmh: 'Kilometer pro Stunde', km: 'Kilometer', kg: 'Kilogramm', cm: 'Zentimeter', mm: 'Millimeter', mph: 'Meilen pro Stunde', lb: 'Pfund', and: 'und', plus: 'plus', usd: 'Dollar', eur: 'Euro', gbp: 'Pfund', inr: 'Rupien', brl: 'Real' },
  pt: { of: 'de', pct: 'por cento', deg: 'graus', c: 'graus Celsius', f: 'graus Fahrenheit', kmh: 'quilômetros por hora', km: 'quilômetros', kg: 'quilos', cm: 'centímetros', mm: 'milímetros', mph: 'milhas por hora', lb: 'libras', and: 'e', plus: 'mais', usd: 'dólares', eur: 'euros', gbp: 'libras', inr: 'rúpias', brl: 'reais' },
  hi: { pct: 'प्रतिशत', deg: 'डिग्री', c: 'डिग्री सेल्सियस', f: 'डिग्री फ़ारेनहाइट', kmh: 'किलोमीटर प्रति घंटा', km: 'किलोमीटर', kg: 'किलोग्राम', cm: 'सेंटीमीटर', mm: 'मिलीमीटर', mph: 'मील प्रति घंटा', lb: 'पाउंड', and: 'और', plus: 'प्लस', usd: 'डॉलर', eur: 'यूरो', gbp: 'पाउंड', inr: 'रुपये', brl: 'रियाल' },
  ar: { pct: 'بالمئة', deg: 'درجة', c: 'درجة مئوية', f: 'درجة فهرنهايت', kmh: 'كيلومتر في الساعة', km: 'كيلومتر', kg: 'كيلوغرام', cm: 'سنتيمتر', mm: 'مليمتر', mph: 'ميل في الساعة', lb: 'رطل', and: 'و', plus: 'زائد', usd: 'دولار', eur: 'يورو', gbp: 'جنيه إسترليني', inr: 'روبية', brl: 'ريال' },
};

const ABBR = {
  es: [
    [/\bp\.\s?ej\./gi, 'por ejemplo'],
    [/\baprox\./gi, 'aproximadamente'],
    [/\bEE\.\s?UU\./g, 'Estados Unidos'],
    [/\ba\.\s?C\./g, 'antes de Cristo'],
    [/\bd\.\s?C\./g, 'después de Cristo'],
    [/\bSra\./g, 'señora'],
    [/\bSr\./g, 'señor'],
    [/\bDra\./g, 'doctora'],
    [/\bDr\./g, 'doctor'],
    [/\bnúm\./gi, 'número'],
    [/\bvs\.?(?=\s)/gi, 'contra'],
    [/(\d)\.(?=[ºª])/g, '$1'],
    [/\b1\.?er\b/g, 'primer'],
    [/\b3\.?er\b/g, 'tercer'],
  ],
  fr: [
    [/\bp\.\s?ex\./gi, 'par exemple'],
    [/\benv\.(?=\s*\d)/gi, 'environ'],
    [/\bav\.\s?J\.-?C\./g, 'avant Jésus-Christ'],
    [/\bapr\.\s?J\.-?C\./g, 'après Jésus-Christ'],
    [/\bM\.(?=\s+[A-ZÀ-Ý])/g, 'Monsieur'],
    [/\bMM\.(?=\s+[A-ZÀ-Ý])/g, 'Messieurs'],
    [/\bMme\b/g, 'Madame'],
    [/\bMlle\b/g, 'Mademoiselle'],
    [/\bDr\b\.?/g, 'docteur'],
    [/\bn°\s?(?=\d)/gi, 'numéro '],
    [/\bvs\.?(?=\s)/gi, 'contre'],
  ],
  de: [
    [/\bz\.\s?B\./g, 'zum Beispiel'],
    [/\bu\.\s?a\./g, 'unter anderem'],
    [/\bd\.\s?h\./g, 'das heißt'],
    [/\bu\.\s?Ä\./g, 'und Ähnliches'],
    [/\bv\.\s?a\./g, 'vor allem'],
    [/\bs\.\s?o\./g, 'siehe oben'],
    [/\bv\.\s?Chr\./g, 'vor Christus'],
    [/\bn\.\s?Chr\./g, 'nach Christus'],
    [/\busw\./g, 'und so weiter'],
    [/\bbzw\./g, 'beziehungsweise'],
    [/\bca\./g, 'circa'],
    [/\betc\./g, 'et cetera'],
    [/\bevtl\./g, 'eventuell'],
    [/\binkl\./g, 'inklusive'],
    [/\bggf\./g, 'gegebenenfalls'],
    [/\bsog\./g, 'sogenannte'],
    [/\bJh\./g, 'Jahrhundert'],
    [/\bJhs\./g, 'Jahrhunderts'],
    [/\bMio\./g, 'Millionen'],
    [/\bMrd\./g, 'Milliarden'],
    [/\bTsd\./g, 'Tausend'],
    [/\bNr\.(?=\s*\d)/g, 'Nummer'],
    [/\bDr\./g, 'Doktor'],
    [/\bProf\./g, 'Professor'],
    [/\bSt\.(?=\s+[A-ZÄÖÜ])/g, 'Sankt'],
    [/\bvs\.?(?=\s)/gi, 'gegen'],
  ],
  pt: [
    [/\bp\.\s?ex\./gi, 'por exemplo'],
    [/\baprox\./gi, 'aproximadamente'],
    [/\ba\.\s?C\./g, 'antes de Cristo'],
    [/\bd\.\s?C\./g, 'depois de Cristo'],
    [/\bSra\./g, 'senhora'],
    [/\bSr\./g, 'senhor'],
    [/\bDra\./g, 'doutora'],
    [/\bDr\./g, 'doutor'],
    [/\bn[ºo°]\s?(?=\d)/gi, 'número '],
    [/\bvs\.?(?=\s)/gi, 'contra'],
    [/(\d)\.(?=[ºª])/g, '$1'],
  ],
  hi: [
    [/डॉ\.\s?/g, 'डॉक्टर '],
    [/ई\.\s?पू\./g, 'ईसा पूर्व'],
    [/[।॥]/g, '.'],
  ],
  ar: [],
};

// German "19. Jahrhundert", "am 3. Mai" → ordinal words (eSpeak reads "neunzehn. Jahrhundert")
const DE_MONTHS = 'Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember';
const DE_ORD_NOUNS = `${DE_MONTHS}|Jahrhunderts?|Jahrtausends?|Weltkriegs?|Weltkrieges|Platz|Platzes|Stock|Stockwerk|Klasse|Mal|Liga|Runde|Tag|Tages|Woche|Monat|Stufe|Generation|Auflage|Ausgabe|Kapitel|Staffel|Folge|Etappe|Ordnung|Hälfte|Geburtstag|Jubiläum|Akt|Lebensjahr|Stelle|Version|Teil|Band|Sinfonie|Symphonie|Dynastie|Grades|Grad`;
const DE_ART = 'der|die|das|dem|den|des|im|am|vom|zum|zur|beim|ins|ein|eine|einem|einen|eines|einer|sein|seine|seinem|seinen|seiner|ihr|ihre|ihrem|ihren|ihrer|jedem|jeden|jede|jeder|diese|diesem|diesen|dieser|dieses';
const DE_EN_CASE = /(?:^|\s)(im|am|vom|zum|zur|beim|dem|den|des|einem|einen|eines|einer|seinem|seinen|seiner|ihrem|ihren|ihrer|jedem|jeden|jeder|diesem|diesen|dieser|dieses)\s+$/i;
const DE_PREP_DER = /(?:^|\s)(in|an|auf|aus|bei|mit|nach|von|vor|zu|seit|während|wegen|trotz|unter|über|hinter|neben|zwischen|bis zur?)\s+der\s+$/i;

function germanOrdinals(t) {
  const re = new RegExp(`(^|[\\s(])(\\d{1,4})\\.(?=\\s+(\\S+))`, 'g');
  return t.replace(re, (m, pre, num, next, offset, all) => {
    const before = all.slice(0, offset + pre.length);
    const word = next.replace(/[.,;:!?)]+$/, '');
    const nounOk = new RegExp(`^(${DE_ORD_NOUNS})$`, 'i').test(word);
    const artOk = new RegExp(`(?:^|\\s)(${DE_ART})\\s+$`, 'i').test(before);
    const n = +num;
    if (!(nounOk || artOk) || n < 1 || n > 9999) return m;
    const en = DE_EN_CASE.test(before) || DE_PREP_DER.test(before) || /s$/.test(word);
    return `${pre}${deOrdinalStem(n)}${en ? 'en' : 'e'}`;
  });
}

// Spoken years: German and Hindi say 1990 as "nineteen hundred ninety"
function hundredsForm(t, lang) {
  return t.replace(/(^|[^\d.,])(1[1-9])(\d\d)(?![\d]|[.,]\d)/g, (m, pre, h, r) => {
    const head = lang === 'de' ? `${DE_ONES[+h]}hundert` : `${+h} सौ`;
    return `${pre}${head}${+r ? ' ' + +r : ''}`;
  });
}

function frenchOrdinals(t) {
  // Roman numerals: XIXe siècle, Ve République, Louis XIV, François Ier (not "Le" or "Ce")
  t = t.replace(/\bI(er|ᵉʳ)(?![\p{L}])/gu, 'premier').replace(/\bI(re|ʳᵉ)(?![\p{L}])/gu, 'première');
  t = t.replace(/\b([IVXLC]{2,}|V|X)(e|ᵉ|ème|è)(?![\p{L}])/gu, (m, r) => {
    const n = romanToInt(r);
    return n ? frOrdinal(n) : m;
  });
  t = t.replace(/([A-ZÀ-Ý][\p{L}-]+)\s+([IVXL]{2,6})(?![\p{L}'’])/gu, (m, name, r) => {
    const n = romanToInt(r);
    return n ? `${name} ${n}` : m;
  });
  t = t.replace(/\b(\d{1,4})(er|ᵉʳ)(?![\p{L}])/gu, (m, n) => (+n === 1 ? 'premier' : frOrdinal(+n)));
  t = t.replace(/\b(\d{1,4})(re|ʳᵉ)(?![\p{L}])/gu, (m, n) => (+n === 1 ? 'première' : frOrdinal(+n)));
  t = t.replace(/\b(\d{1,4})(e|ᵉ|ème|è)(?![\p{L}])/gu, (m, n) => frOrdinal(+n));
  return t;
}

function otherSpeech(text, lang) {
  const U = UNITS[lang];
  let t = String(text || '');
  if (lang === 'hi') t = asciiDigits(t);
  t = t.replace(EMOJI, '');
  for (const [re, rep] of ABBR[lang] || []) t = t.replace(re, rep);
  // thin and non-breaking spaces inside numbers ("1 500") → plain digits
  t = t.replace(/(\d)[   ](?=\d{3}(?!\d))/g, '$1');
  if (lang === 'de') t = germanOrdinals(t);
  if (lang === 'fr') t = frenchOrdinals(t);
  if (lang === 'de' || lang === 'hi') t = hundredsForm(t, lang);
  // currencies (symbol before or after the amount)
  const NUM = '(\\d[\\d.,\\s]*\\d|\\d)';
  const cur = [
    ['R\\$', U.brl],
    ['US\\$', U.usd],
    ['\\$', U.usd],
    ['€', U.eur],
    ['£', U.gbp],
    ['₹', U.inr],
  ];
  const SCALE = '(\\s?(?:mil millones|millones|millón|milliards?|millions?|Millionen|Milliarden|milhões|milhão|bilhões|bilhão|mil|lakh|crore|लाख|करोड़)(?![\\p{L}\\p{M}]))?';
  // "5 millones de dólares", "5 millions de dollars", "5 milhões de dólares"
  const amount = (n, scale, word) => `${n}${scale || ''}${scale && U.of && /mill|milh|bilh|milliard/i.test(scale) && !/^\s?mil$/i.test(scale) ? ' ' + U.of : ''} ${word}`;
  for (const [sym, word] of cur) {
    t = t.replace(new RegExp(`${sym}\\s?${NUM}${SCALE}`, 'gu'), (m, n, scale) => amount(n, scale, word));
    t = t.replace(new RegExp(`${NUM}${SCALE}\\s?${sym}(?![\\p{L}])`, 'gu'), (m, n, scale) => amount(n, scale, word));
  }
  t = t.replace(/(\d)\s?%/g, `$1 ${U.pct}`);
  t = t.replace(/°\s?C\b/g, ` ${U.c}`).replace(/°\s?F\b/g, ` ${U.f}`);
  if (lang === 'es' || lang === 'pt') t = t.replace(/(\d)°(?=\s+\p{Ll})/gu, lang === 'es' ? '$1º' : '$1º');
  t = t.replace(/°/g, ` ${U.deg}`);
  t = t
    .replace(/(\d)\s?km\/h\b/gi, `$1 ${U.kmh}`)
    .replace(/(\d)\s?km\b/gi, `$1 ${U.km}`)
    .replace(/(\d)\s?kg\b/gi, `$1 ${U.kg}`)
    .replace(/(\d)\s?cm\b/gi, `$1 ${U.cm}`)
    .replace(/(\d)\s?mm\b/gi, `$1 ${U.mm}`)
    .replace(/(\d)\s?mph\b/gi, `$1 ${U.mph}`)
    .replace(/(\d)\s?lbs?\b/gi, `$1 ${U.lb}`);
  t = t.replace(/&/g, ` ${U.and} `).replace(/\s*\+\s*/g, ` ${U.plus} `).replace(/[#*_~^<>{}[\]|\\]/g, ' ');
  t = t.replace(/["“”„«»‹›]/g, '').replace(/\s+/g, ' ').trim();
  return t;
}

/** What the voice says for a line of text in the given language. */
export function speechText(text, lang = 'en') {
  // typographic apostrophes (qu’il, don’t) read like plain ones
  text = String(text).replace(/[\u2018\u2019\u02BC]/g, "'");
  if (!lang || lang === 'en' || !UNITS[lang]) return englishSpeech(text);
  return otherSpeech(text, lang);
}
