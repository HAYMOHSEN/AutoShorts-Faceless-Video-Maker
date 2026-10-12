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

let ready = null;

export function loadFonts() {
  if (!ready) {
    ready = Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready);
  }
  return ready;
}
