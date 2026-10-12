// Visual library: animated generative backgrounds (royalty-free, drawn live on canvas),
// palettes, "looks" (theme sets + palette) and helpers for photos/videos with Ken Burns motion.

import { mulberry32, hashString, lerp, clamp, ease, rgba, mixHex } from './util.js';
import { N_ } from './i18n.js';
import { englishFor } from './emoji.js';

export const PALETTES = {
  aurora: { bg: ['#050d1f', '#0c2a3a'], c: ['#00f5a0', '#00d9f5', '#7b5cff', '#ff4ecd'], hi: '#00F5A0' },
  ocean: { bg: ['#021a31', '#05456f'], c: ['#00c2ff', '#2ef2d5', '#4f7cff', '#a0f0ff'], hi: '#2EF2D5' },
  midnight: { bg: ['#0a0f24', '#1d2a55'], c: ['#5c7cfa', '#9775fa', '#3bc9db', '#e599f7'], hi: '#FFD43B' },
  candy: { bg: ['#ff7aa2', '#ffb86b'], c: ['#ffffff', '#ffe066', '#7b2cbf', '#3a86ff'], hi: '#FFE066' },
  neon: { bg: ['#090317', '#1d0a3d'], c: ['#f72585', '#4cc9f0', '#7209b7', '#b5179e'], hi: '#4CC9F0' },
  sunset: { bg: ['#1b0b30', '#5a1a52'], c: ['#ff6b6b', '#ffb347', '#ff3d81', '#ffd166'], hi: '#FFD166' },
  ember: { bg: ['#160700', '#3d1300'], c: ['#ff7b00', '#ff3c00', '#ffb000', '#ff5e5b'], hi: '#FFB000' },
  matrix: { bg: ['#000804', '#00180b'], c: ['#00ff66', '#00cc55', '#66ff99', '#c6ffd9'], hi: '#00FF66' },
  paper: { bg: ['#f7f2e8', '#efe5d3'], c: ['#1f6feb', '#e63946', '#2a9d8f', '#f4a261'], hi: '#E63946', light: true },
  mono: { bg: ['#0e0e10', '#26262b'], c: ['#ffffff', '#b8b8c0', '#6f6f78', '#ffd400'], hi: '#FFD400' },
};

export const LOOKS = [
  { id: 'aurora', name: N_('Aurora'), palette: 'aurora', themes: ['aurora', 'lava', 'bokeh'], free: true },
  { id: 'ocean', name: N_('Deep ocean'), palette: 'ocean', themes: ['waves', 'bokeh', 'aurora'], free: true },
  { id: 'midnight', name: N_('Midnight'), palette: 'midnight', themes: ['bokeh', 'aurora', 'warp'], free: true },
  { id: 'candy', name: N_('Candy pop'), palette: 'candy', themes: ['shapes', 'rays', 'stripes'], free: true },
  { id: 'neon', name: N_('Neon night'), palette: 'neon', themes: ['grid', 'network', 'warp'] },
  { id: 'sunset', name: N_('Sunset drive'), palette: 'sunset', themes: ['grid', 'rays', 'lava'] },
  { id: 'ember', name: N_('Ember'), palette: 'ember', themes: ['lava', 'bokeh', 'rays'] },
  { id: 'matrix', name: N_('Code rain'), palette: 'matrix', themes: ['code', 'network', 'grid'] },
  { id: 'paper', name: N_('Notebook'), palette: 'paper', themes: ['paper', 'shapes'] },
  { id: 'mono', name: N_('Monochrome'), palette: 'mono', themes: ['stripes', 'network', 'rays'] },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

const AUTO_RULES = [
  [/\b(space|planet|galaxy|universe|star|stars|nasa|moon|mars|astronaut|rocket|cosmic|orbit|alien|black hole)/i, 'midnight'],
  [/\b(ai|robot|code|coding|software|computer|tech|technology|internet|crypto|data|hacker|app|algorithm|cyber|digital|chip)/i, 'matrix'],
  [/\b(ocean|sea|water|fish|whale|octop|shark|beach|river|rain|coral|dolphin|island|wave)/i, 'ocean'],
  [/\b(money|business|startup|invest|rich|wealth|success|productiv|habit|hustle|career|million|billion|market|brand)/i, 'sunset'],
  [/\b(history|war|ancient|empire|king|queen|egypt|rome|roman|medieval|volcano|fire|battle)/i, 'ember'],
  [/\b(sleep|calm|mind|brain|psycholog|anxiety|stress|meditat|dream|health|relax|mental)/i, 'aurora'],
  [/\b(food|candy|fun|kid|color|party|music|dance|cat|dog|pet|cute|animal)/i, 'candy'],
  [/\b(study|learn|school|book|exam|science|math|student|teacher|word|language)/i, 'paper'],
  [/\b(music|night|club|game|gaming|neon|city|retro|80s)/i, 'neon'],
];

/** Choose a look from the topic text, limited to the looks the user can use. Topics in other
 * languages are matched through the English word for each of their words ("pieuvre" → octopus). */
export function autoLook(text, allowed = (l) => true, lang = 'en') {
  let probe = String(text);
  if (lang && lang !== 'en') {
    const words = probe.split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length > 2);
    probe += ' ' + words.map((w) => englishFor(w, lang)).filter(Boolean).join(' ');
  }
  for (const [re, id] of AUTO_RULES) {
    if (re.test(probe) && allowed(lookById(id))) return id;
  }
  const free = LOOKS.filter(allowed);
  const pickFrom = free.length ? free : LOOKS;
  return pickFrom[hashString(String(text)) % pickFrom.length].id;
}

export const THEME_NAMES = {
  aurora: N_('Aurora'),
  lava: N_('Lava'),
  bokeh: N_('Bokeh'),
  waves: N_('Waves'),
  warp: N_('Warp'),
  grid: N_('Retro grid'),
  rays: N_('Sunburst'),
  shapes: N_('Shapes'),
  stripes: N_('Stripes'),
  network: N_('Network'),
  code: N_('Code rain'),
  paper: N_('Notebook'),
};

// ---------------------------------------------------------------- shared scratch canvases

const scratch = new Map();
function scratchCanvas(key, w, h) {
  let c = scratch.get(key);
  if (!c || c.width !== w || c.height !== h) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    scratch.set(key, c);
  }
  return c;
}

let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = scratchCanvas('grain', 160, 160);
  const g = c.getContext('2d');
  const img = g.createImageData(160, 160);
  const r = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(r() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

export function drawGrain(ctx, W, H, amount = 0.035, t = 0) {
  const tile = grain();
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'overlay';
  const s = Math.max(1, W / 540);
  const ox = (Math.floor(t * 24) * 37) % 160;
  for (let y = -ox; y < H; y += 160 * s) for (let x = -ox; x < W; x += 160 * s) ctx.drawImage(tile, x, y, 160 * s, 160 * s);
  ctx.restore();
}

function bgGradient(ctx, W, H, pal, angle = 0) {
  const g = ctx.createLinearGradient(W * (0.5 - angle), 0, W * (0.5 + angle), H);
  g.addColorStop(0, pal.bg[0]);
  g.addColorStop(1, pal.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- themes

const THEMES = {
  aurora: {
    init(r) {
      return { blobs: Array.from({ length: 5 }, (_, i) => ({ ci: i % 4, ax: 0.25 + r() * 0.3, ay: 0.2 + r() * 0.3, fx: 0.05 + r() * 0.08, fy: 0.04 + r() * 0.07, px: r() * 6, py: r() * 6, rad: 0.45 + r() * 0.35 })) };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0.15);
      const w = Math.max(24, Math.round(W / 10));
      const h = Math.max(42, Math.round(H / 10));
      const c = scratchCanvas('aurora', w, h);
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const b of s.blobs) {
        const x = (0.5 + b.ax * Math.sin(t * b.fx * 6.283 + b.px)) * w;
        const y = (0.45 + b.ay * Math.cos(t * b.fy * 6.283 + b.py)) * h;
        const rad = b.rad * w;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, rgba(pal.c[b.ci], 0.75));
        gr.addColorStop(1, rgba(pal.c[b.ci], 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.globalCompositeOperation = 'screen';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c, 0, 0, W, H);
      ctx.restore();
    },
  },
  lava: {
    init(r) {
      return { blobs: Array.from({ length: 7 }, (_, i) => ({ ci: i % 4, x: r(), y: r(), vx: (r() - 0.5) * 0.05, vy: (r() - 0.5) * 0.06, rad: 0.18 + r() * 0.2, ph: r() * 6 })) };
    },
    draw(ctx, W, H, t, s, pal) {
      ctx.fillStyle = pal.bg[0];
      ctx.fillRect(0, 0, W, H);
      const w = Math.max(24, Math.round(W / 12));
      const h = Math.max(42, Math.round(H / 12));
      const c = scratchCanvas('lava', w, h);
      const g = c.getContext('2d');
      g.fillStyle = pal.bg[1];
      g.fillRect(0, 0, w, h);
      for (const b of s.blobs) {
        const x = (((b.x + b.vx * t) % 1) + 1) % 1;
        const y = 0.5 + 0.42 * Math.sin(t * 0.35 + b.ph) * (0.6 + b.y * 0.4);
        const rad = b.rad * w * (1 + 0.15 * Math.sin(t * 0.8 + b.ph));
        const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, rad);
        gr.addColorStop(0, pal.c[b.ci]);
        gr.addColorStop(0.55, rgba(pal.c[b.ci], 0.75));
        gr.addColorStop(1, rgba(pal.c[b.ci], 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x * w, y * h, rad, 0, Math.PI * 2);
        g.fill();
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(c, 0, 0, W, H);
      ctx.restore();
    },
  },
  bokeh: {
    init(r) {
      return { dots: Array.from({ length: 34 }, () => ({ x: r(), y: r(), z: 0.25 + r() * 0.75, ci: Math.floor(r() * 4), sp: 0.01 + r() * 0.03, sw: r() * 6 })) };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0.1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const d of s.dots) {
        const y = (((d.y - t * d.sp * d.z) % 1) + 1) % 1;
        const x = d.x + Math.sin(t * 0.4 + d.sw) * 0.02;
        const rad = W * (0.025 + 0.09 * d.z);
        const gr = ctx.createRadialGradient(x * W, y * H * 1.1 - H * 0.05, 0, x * W, y * H * 1.1 - H * 0.05, rad);
        gr.addColorStop(0, rgba(pal.c[d.ci], 0.32 * d.z + 0.06));
        gr.addColorStop(0.7, rgba(pal.c[d.ci], 0.16 * d.z));
        gr.addColorStop(1, rgba(pal.c[d.ci], 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x * W, y * H * 1.1 - H * 0.05, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  waves: {
    init(r) {
      return { layers: Array.from({ length: 5 }, (_, i) => ({ amp: 0.018 + r() * 0.03, len: 0.6 + r() * 0.9, sp: 0.15 + r() * 0.35, ph: r() * 6, ci: i % 4 })), bubbles: Array.from({ length: 22 }, () => ({ x: r(), y: r(), s: 0.004 + r() * 0.01, v: 0.02 + r() * 0.05 })) };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0);
      // light shafts
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const x = W * (0.15 + i * 0.25) + Math.sin(t * 0.3 + i) * W * 0.05;
        const g = ctx.createLinearGradient(x, 0, x + W * 0.2, H * 0.7);
        g.addColorStop(0, rgba(pal.c[3], 0.09));
        g.addColorStop(1, rgba(pal.c[3], 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - W * 0.04, 0);
        ctx.lineTo(x + W * 0.05, 0);
        ctx.lineTo(x + W * 0.3, H * 0.75);
        ctx.lineTo(x + W * 0.1, H * 0.75);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      s.layers.forEach((L, i) => {
        const base = H * (0.6 + i * 0.085);
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 40) {
          const y = base + Math.sin((x / W) * Math.PI * 2 * L.len + t * L.sp * 2 + L.ph) * H * L.amp + Math.sin((x / W) * 9 + t * 0.7 + i) * H * 0.006;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = rgba(mixHex(pal.c[L.ci], pal.bg[0], 0.35 + i * 0.1), 0.42);
        ctx.fill();
      });
      ctx.save();
      ctx.strokeStyle = rgba('#ffffff', 0.35);
      ctx.lineWidth = Math.max(1, W * 0.002);
      for (const b of s.bubbles) {
        const y = (((b.y - t * b.v) % 1) + 1) % 1;
        ctx.beginPath();
        ctx.arc(b.x * W + Math.sin(t + b.y * 9) * W * 0.01, y * H, b.s * W, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  warp: {
    init(r) {
      return { stars: Array.from({ length: 240 }, () => ({ x: (r() - 0.5) * 2, y: (r() - 0.5) * 2, z: r(), ci: Math.floor(r() * 4) })) };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0);
      const cx = W / 2;
      const cy = H * 0.42;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.7);
      g.addColorStop(0, rgba(pal.c[1], 0.18));
      g.addColorStop(1, rgba(pal.c[1], 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.lineCap = 'round';
      const speed = 0.12;
      for (const st of s.stars) {
        const z = 1 - ((st.z + t * speed) % 1);
        const z2 = Math.min(1, z + 0.035);
        const k = W * 0.32;
        const x1 = cx + (st.x / z) * k;
        const y1 = cy + (st.y / z) * k;
        const x0 = cx + (st.x / z2) * k;
        const y0 = cy + (st.y / z2) * k;
        if (x1 < -50 || x1 > W + 50 || y1 < -50 || y1 > H + 50) continue;
        const a = clamp(1 - z, 0, 1);
        ctx.strokeStyle = rgba(st.ci === 0 ? '#ffffff' : pal.c[st.ci], 0.25 + a * 0.75);
        ctx.lineWidth = Math.max(1, W * 0.004 * (1 - z) + 0.5);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  grid: {
    init(r) {
      return { sunY: 0.36 + r() * 0.06 };
    },
    draw(ctx, W, H, t, s, pal) {
      const horizon = H * 0.6;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, pal.bg[0]);
      sky.addColorStop(0.7, pal.bg[1]);
      sky.addColorStop(1, mixHex(pal.c[0], pal.bg[1], 0.4));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);
      // sun
      const r = W * 0.3;
      const cx = W / 2;
      const cy = H * s.sunY;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const sg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      sg.addColorStop(0, pal.c[3] || pal.c[1]);
      sg.addColorStop(1, pal.c[0]);
      ctx.fillStyle = sg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = pal.bg[1];
      for (let i = 0; i < 7; i++) {
        const yy = cy + r * (0.05 + i * 0.14);
        const hh = r * (0.02 + i * 0.012);
        ctx.fillRect(cx - r, yy + ((t * r * 0.08) % (r * 0.14)), r * 2, hh);
      }
      ctx.restore();
      const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 2);
      glow.addColorStop(0, rgba(pal.c[0], 0.25));
      glow.addColorStop(1, rgba(pal.c[0], 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, horizon);
      // ground
      const gg = ctx.createLinearGradient(0, horizon, 0, H);
      gg.addColorStop(0, mixHex(pal.bg[1], '#000000', 0.3));
      gg.addColorStop(1, pal.bg[0]);
      ctx.fillStyle = gg;
      ctx.fillRect(0, horizon, W, H - horizon);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizon, W, H - horizon);
      ctx.clip();
      const lineCol = pal.c[1];
      const drawLines = (width, alpha) => {
        ctx.strokeStyle = rgba(lineCol, alpha);
        ctx.lineWidth = width;
        for (let i = -12; i <= 12; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * W * 0.02, horizon);
          ctx.lineTo(cx + i * W * 0.32, H);
          ctx.stroke();
        }
        const off = (t * 0.6) % 1;
        for (let k = 0; k < 14; k++) {
          const z = (k + 1 - off) / 14;
          const y = horizon + (H - horizon) * Math.pow(z, 2.2);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
      };
      drawLines(Math.max(2, W * 0.008), 0.18);
      drawLines(Math.max(1, W * 0.0025), 0.85);
      ctx.restore();
    },
  },
  rays: {
    init(r) {
      return { n: 14 + Math.floor(r() * 8), dir: r() < 0.5 ? -1 : 1, cy: 0.36 + r() * 0.1 };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0.05);
      const cx = W / 2;
      const cy = H * s.cy;
      const R = Math.hypot(W, H);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.12 * s.dir);
      ctx.fillStyle = rgba(pal.c[0], pal.light ? 0.16 : 0.11);
      const step = (Math.PI * 2) / s.n;
      for (let i = 0; i < s.n; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, i * step, i * step + step / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.75);
      g.addColorStop(0, rgba(pal.c[1], 0.42));
      g.addColorStop(1, rgba(pal.c[1], 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  },
  shapes: {
    init(r) {
      const kinds = ['circle', 'triangle', 'square', 'plus', 'zigzag', 'ring'];
      return { items: Array.from({ length: 16 }, (_, i) => ({ k: kinds[i % kinds.length], x: r(), y: r(), s: 0.035 + r() * 0.06, rot: r() * 6, vr: (r() - 0.5) * 0.8, vx: (r() - 0.5) * 0.02, vy: -0.01 - r() * 0.025, ci: Math.floor(r() * 4), fill: r() < 0.3 })) };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0.3);
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const it of s.items) {
        const x = ((((it.x + it.vx * t) % 1) + 1) % 1) * W;
        const y = ((((it.y + it.vy * t) % 1.1) + 1.1) % 1.1) * H - H * 0.05;
        const size = it.s * W;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(it.rot + it.vr * t);
        ctx.strokeStyle = pal.c[it.ci];
        ctx.fillStyle = rgba(pal.c[it.ci], 0.85);
        ctx.lineWidth = Math.max(2, W * 0.009);
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        if (it.k === 'circle') ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        else if (it.k === 'ring') {
          ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
          ctx.moveTo(size * 0.25, 0);
          ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
        } else if (it.k === 'triangle') {
          ctx.moveTo(0, -size * 0.55);
          ctx.lineTo(size * 0.5, size * 0.35);
          ctx.lineTo(-size * 0.5, size * 0.35);
          ctx.closePath();
        } else if (it.k === 'square') ctx.rect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.8);
        else if (it.k === 'plus') {
          ctx.moveTo(-size * 0.45, 0);
          ctx.lineTo(size * 0.45, 0);
          ctx.moveTo(0, -size * 0.45);
          ctx.lineTo(0, size * 0.45);
        } else {
          ctx.moveTo(-size * 0.6, 0);
          for (let k = 0; k < 4; k++) ctx.lineTo(-size * 0.6 + (k + 1) * size * 0.3, k % 2 ? 0 : -size * 0.25);
        }
        if (it.fill && it.k !== 'plus' && it.k !== 'zigzag') ctx.fill();
        else ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  },
  stripes: {
    init(r) {
      return { w: 0.09 + r() * 0.06, dir: r() < 0.5 ? 1 : -1, accent: Math.floor(r() * 3) };
    },
    draw(ctx, W, H, t, s, pal) {
      ctx.fillStyle = pal.bg[0];
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-0.5 * s.dir);
      const D = Math.hypot(W, H);
      const sw = s.w * W;
      const off = (t * W * 0.05) % (sw * 2);
      for (let x = -D; x < D; x += sw * 2) {
        const idx = Math.round((x + D) / (sw * 2));
        ctx.fillStyle = idx % 5 === s.accent ? rgba(pal.c[3] || pal.c[0], 0.5) : rgba(pal.bg[1], 0.9);
        ctx.fillRect(x + off, -D, sw, D * 2);
      }
      ctx.restore();
      const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W);
      g.addColorStop(0, rgba(pal.bg[0], 0));
      g.addColorStop(1, rgba(pal.bg[0], 0.7));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  },
  network: {
    init(r) {
      return { pts: Array.from({ length: 46 }, () => ({ x: r(), y: r(), vx: (r() - 0.5) * 0.03, vy: (r() - 0.5) * 0.03, ci: Math.floor(r() * 4) })) };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0.2);
      const P = s.pts.map((p) => {
        const x = p.x + p.vx * t;
        const y = p.y + p.vy * t;
        const fx = Math.abs((((x % 2) + 2) % 2) - 1);
        const fy = Math.abs((((y % 2) + 2) % 2) - 1);
        return [fx * W, fy * H, p.ci];
      });
      const maxD = W * 0.26;
      ctx.save();
      ctx.lineWidth = Math.max(1, W * 0.0022);
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const dx = P[i][0] - P[j][0];
          const dy = P[i][1] - P[j][1];
          const d = Math.hypot(dx, dy);
          if (d < maxD) {
            ctx.strokeStyle = rgba(pal.c[P[i][2]], (1 - d / maxD) * 0.5);
            ctx.beginPath();
            ctx.moveTo(P[i][0], P[i][1]);
            ctx.lineTo(P[j][0], P[j][1]);
            ctx.stroke();
          }
        }
      }
      for (const p of P) {
        ctx.fillStyle = rgba(pal.c[p[2]], 0.9);
        ctx.beginPath();
        ctx.arc(p[0], p[1], Math.max(1.5, W * 0.006), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  code: {
    init(r) {
      const cols = 26;
      return { cols: Array.from({ length: cols }, (_, i) => ({ x: (i + 0.5) / cols, off: r() * 3, sp: 0.18 + r() * 0.3, len: 8 + Math.floor(r() * 12), seed: Math.floor(r() * 1e6) })) };
    },
    draw(ctx, W, H, t, s, pal) {
      ctx.fillStyle = pal.bg[0];
      ctx.fillRect(0, 0, W, H);
      const fs = W / 26;
      ctx.save();
      ctx.font = `700 ${fs}px "Space Mono", Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネ<>{}[]=+*#$%ABCDEF';
      const rows = Math.ceil(H / fs) + 2;
      for (const c of s.cols) {
        const head = ((t * c.sp + c.off) % 1.6) * rows;
        for (let k = 0; k < c.len; k++) {
          const row = Math.floor(head) - k;
          if (row < 0 || row > rows) continue;
          const a = k === 0 ? 1 : (1 - k / c.len) * 0.75;
          const ch = chars[(c.seed + row * 7 + Math.floor(t * 6 + k)) % chars.length];
          ctx.fillStyle = k === 0 ? rgba(pal.c[3], a) : rgba(pal.c[k % 2 ? 1 : 0], a);
          ctx.fillText(ch, c.x * W, row * fs);
        }
      }
      ctx.restore();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgba(pal.bg[0], 0.1));
      g.addColorStop(0.5, rgba(pal.bg[0], 0.55));
      g.addColorStop(1, rgba(pal.bg[0], 0.15));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  },
  paper: {
    init(r) {
      return { doodles: Array.from({ length: 6 }, (_, i) => ({ x: 0.12 + r() * 0.76, y: 0.08 + r() * 0.84, s: 0.05 + r() * 0.06, k: i % 3, ci: Math.floor(r() * 4), rot: r() * 6, seed: Math.floor(r() * 1e5) })) };
    },
    draw(ctx, W, H, t, s, pal) {
      bgGradient(ctx, W, H, pal, 0);
      const gap = W * 0.075;
      ctx.save();
      ctx.strokeStyle = 'rgba(31,111,235,0.22)';
      ctx.lineWidth = Math.max(1, W * 0.0025);
      const drift = (t * W * 0.01) % gap;
      for (let y = gap * 2 - drift; y < H; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(230,57,70,0.45)';
      ctx.beginPath();
      ctx.moveTo(W * 0.12, 0);
      ctx.lineTo(W * 0.12, H);
      ctx.stroke();
      // hand-drawn doodles
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const d of s.doodles) {
        const r = mulberry32(d.seed);
        const cx = d.x * W;
        const cy = d.y * H + Math.sin(t * 0.6 + d.seed) * W * 0.006;
        const size = d.s * W;
        ctx.strokeStyle = rgba(pal.c[d.ci], 0.55);
        ctx.lineWidth = Math.max(2, W * 0.006);
        ctx.beginPath();
        if (d.k === 0) {
          for (let a = 0; a <= Math.PI * 2.1; a += 0.2) {
            const rr = size * (0.9 + (r() - 0.5) * 0.12);
            const x = cx + Math.cos(a + d.rot) * rr;
            const y = cy + Math.sin(a + d.rot) * rr * 0.8;
            if (a === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else if (d.k === 1) {
          ctx.moveTo(cx - size, cy + size * 0.4);
          ctx.quadraticCurveTo(cx, cy - size * 0.8, cx + size, cy);
          ctx.moveTo(cx + size, cy);
          ctx.lineTo(cx + size * 0.6, cy - size * 0.2);
          ctx.moveTo(cx + size, cy);
          ctx.lineTo(cx + size * 0.7, cy + size * 0.35);
        } else {
          for (let k = 0; k < 5; k++) {
            const a = d.rot + (k * Math.PI * 4) / 5;
            const x = cx + Math.cos(a) * size * 0.8;
            const y = cy + Math.sin(a) * size * 0.8;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);

const stateCache = new Map();
function themeState(theme, seed) {
  const key = theme + ':' + seed;
  let s = stateCache.get(key);
  if (!s) {
    s = THEMES[theme].init(mulberry32(seed));
    stateCache.set(key, s);
    if (stateCache.size > 400) stateCache.delete(stateCache.keys().next().value);
  }
  return s;
}

/** Draw an animated background. `t` is seconds (global, so motion is continuous). */
export function drawTheme(ctx, W, H, theme, paletteId, seed, t) {
  const th = THEMES[theme] ? theme : 'aurora';
  const pal = PALETTES[paletteId] || PALETTES.aurora;
  THEMES[th].draw(ctx, W, H, t, themeState(th, seed), pal);
}

export function paletteOf(lookId) {
  const look = lookById(lookId);
  return PALETTES[look.palette] || PALETTES.aurora;
}

/** Theme used by scene i of a look, unless the scene overrides it. */
export function sceneTheme(look, index) {
  const l = lookById(look);
  return l.themes[index % l.themes.length];
}

// ---------------------------------------------------------------- photos & video

/**
 * Draw an image/video frame to cover the frame, with optional Ken Burns zoom/pan.
 * @param p progress 0..1 through the scene
 */
export function drawCover(ctx, src, sw, sh, W, H, p, motion, seed) {
  if (!src || !sw || !sh) return;
  const r = mulberry32(seed || 1);
  const zoomIn = r() < 0.6;
  const base = Math.max(W / sw, H / sh);
  const pe = ease.inOutCubic(clamp(p, 0, 1)) * 0.4 + clamp(p, 0, 1) * 0.6;
  const z = motion ? (zoomIn ? lerp(1.02, 1.14, pe) : lerp(1.14, 1.02, pe)) : 1;
  const dw = sw * base * z;
  const dh = sh * base * z;
  const landscape = sw / sh > (W / H) * 1.35;
  let px;
  let py;
  if (motion && landscape) {
    const dir = r() < 0.5;
    px = dir ? lerp(0.12, 0.88, pe) : lerp(0.88, 0.12, pe);
    py = 0.5;
  } else {
    const ax = r() - 0.5;
    const ay = r() - 0.5;
    px = 0.5 + (motion ? ax * 0.6 * (pe - 0.5) : 0);
    py = 0.5 + (motion ? ay * 0.6 * (pe - 0.5) : 0);
  }
  const x = -(dw - W) * px;
  const y = -(dh - H) * py;
  ctx.drawImage(src, x, y, dw, dh);
}

/** Small static swatch of a look (for pickers). */
export function drawLookSwatch(canvas, lookId, t = 2.5) {
  const ctx = canvas.getContext('2d');
  const look = lookById(lookId);
  drawTheme(ctx, canvas.width, canvas.height, look.themes[0], look.palette, hashString(look.id), t);
}
