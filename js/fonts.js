// Make sure caption fonts are ready before anything is drawn to a canvas.

const FACES = [
  '900 40px Montserrat',
  '800 40px Montserrat',
  '400 40px Anton',
  '400 40px "Bebas Neue"',
  '400 40px Bangers',
  '600 40px Poppins',
  '700 40px Poppins',
  '700 40px "Space Mono"',
  '700 40px "Archivo Variable"',
];

// caption fallbacks for Arabic and Hindi load only when a video in that script is shown
const SCRIPT_FACES = {
  ar: { sample: 'عربي', faces: ['400 40px "AS Arabic"', '900 40px "AS Arabic"', '400 40px Cairo', '700 40px Cairo'] },
  hi: { sample: 'हिन्दी', faces: ['400 40px "AS Devanagari"', '900 40px "AS Devanagari"', '600 40px Poppins', '700 40px Poppins'] },
};

let ready = null;
const scriptReady = new Map();

export function loadFonts(lang) {
  if (!ready) {
    ready = Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready);
  }
  const extra = SCRIPT_FACES[lang];
  if (!extra) return ready;
  if (!scriptReady.has(lang)) scriptReady.set(lang, Promise.all(extra.faces.map((f) => document.fonts.load(f, extra.sample).catch(() => null))));
  return Promise.all([ready, scriptReady.get(lang)]);
}
