// eSpeak NG phonemizer (WebAssembly) for the non-English voices. Used inside the voice workers:
// Kokoro voices read IPA phonemes, Piper voices read phoneme IDs. The data package only holds the
// dictionaries for the app's languages (about 1.7 MB).

let modPromise = null;
let lines = [];

function module() {
  if (!modPromise) {
    const base = new URL('../vendor/espeak/', import.meta.url).href;
    modPromise = import('../vendor/espeak/espeak-phonemize.mjs')
      .then(({ default: create }) =>
        create({
          print: (s) => lines.push(s),
          printErr: () => {},
          locateFile: (f) => base + f,
        })
      )
      .catch((e) => {
        modPromise = null; // try again next time (e.g. after coming back online)
        throw e;
      });
  }
  return modPromise;
}

/**
 * @param {string[]} texts
 * @param {string} voice  eSpeak voice, e.g. "es", "fr", "de", "pt-br", "hi"
 * @returns {Promise<{phonemes:string[], phoneme_ids:number[]}[]>}  one result per text
 */
export async function phonemize(texts, voice) {
  const m = await module();
  lines = [];
  m.callMain(['-l', voice, '--input', JSON.stringify(texts.map((text) => ({ text }))), '--espeak_data', '/espeak-ng-data']);
  const out = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l));
    } catch {
      /* not a result line */
    }
  }
  return out;
}

// Kokoro was trained with eSpeak output where some phoneme pairs are tied into one symbol
// (misaki EspeakG2P); this eSpeak build doesn't mark ties, so the pairs are mapped directly.
const TIES = [
  ['aɪ', 'I'],
  ['aʊ', 'W'],
  ['dz', 'ʣ'],
  ['dʒ', 'ʤ'],
  ['eɪ', 'A'],
  ['oʊ', 'O'],
  ['əʊ', 'Q'],
  ['ts', 'ʦ'],
  ['tʃ', 'ʧ'],
  ['ɔɪ', 'Y'],
];

const PUNCT = '.,!?;:…';

const SPACE_AFTER = new RegExp(`([${PUNCT}])(?=[^\\s${PUNCT}])`, 'g');
// in Hindi "r." is the flap ड़ (Kokoro was trained on it written that way), not a full stop
const SPACE_AFTER_HI = new RegExp(`([${PUNCT.replace('.', '')}]|(?<!r)\\.)(?=[^\\s${PUNCT}])`, 'g');

/** eSpeak phonemes → the IPA string Kokoro reads. */
export function kokoroPhonemes(phonemes, lang) {
  let s = phonemes.join('');
  for (const [a, b] of TIES) s = s.split(a).join(b);
  s = s.replace(/-/g, '');
  // eSpeak runs sentences together ("gut.ʊnt"); Kokoro learned a space after punctuation
  s = s.replace(lang === 'hi' ? SPACE_AFTER_HI : SPACE_AFTER, '$1 ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Split a flat phoneme list into sentences (Piper voices speak one sentence at a time). */
export function phonemeSentences(phonemes) {
  const out = [];
  let cur = [];
  for (let i = 0; i < phonemes.length; i++) {
    const p = phonemes[i];
    if (!cur.length && p === ' ') continue;
    cur.push(p);
    if ('.!?…'.includes(p) && !'.!?…'.includes(phonemes[i + 1] || '')) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.some((p) => p.trim())) out.push(cur);
  return out;
}

// Kokoro voice prefix → eSpeak language (a/b = English, read by the engine's own phonemizer)
export const KOKORO_ESPEAK = { e: 'es', f: 'fr', h: 'hi', p: 'pt-br' };
// eSpeak language → app language code (for the language-specific fixes above)
export const ESPEAK_LANG = { es: 'es', fr: 'fr', hi: 'hi', 'pt-br': 'pt', de: 'de' };
