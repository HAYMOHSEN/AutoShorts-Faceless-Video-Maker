// Animated captions: groups timed words into on-screen chunks and draws them in one of several
// styles. Everything is resolution-independent (sizes are fractions of the frame width).

import { clamp, ease, lerp, rgba, hasArabic, mulberry32, luminance } from './util.js';
import { stem } from './script.js';

export const CAPTION_STYLES = [
  { id: 'pop', name: 'Bold pop', free: true, family: 'Montserrat', weight: 900, size: 0.084, upper: true, maxWords: 3, lineH: 1.08 },
  { id: 'karaoke', name: 'Highlight box', free: true, family: 'Montserrat', weight: 800, size: 0.07, upper: true, maxWords: 4, lineH: 1.24 },
  { id: 'clean', name: 'Clean box', free: true, family: 'Poppins', weight: 700, size: 0.056, upper: false, maxWords: 7, lineH: 1.42 },
  { id: 'minimal', name: 'Minimal', free: true, family: 'Poppins', weight: 600, size: 0.062, upper: false, maxWords: 5, lineH: 1.2 },
  { id: 'neon', name: 'Neon glow', family: 'Bebas Neue', weight: 400, size: 0.13, upper: true, maxWords: 3, lineH: 0.98, letter: 0.02 },
  { id: 'comic', name: 'Comic pop', family: 'Bangers', weight: 400, size: 0.11, upper: true, maxWords: 3, lineH: 1.02, letter: 0.03 },
  { id: 'slam', name: 'Word slam', family: 'Anton', weight: 400, size: 0.17, upper: true, maxWords: 1, lineH: 1 },
  { id: 'marker', name: 'Highlighter', family: 'Montserrat', weight: 800, size: 0.066, upper: false, maxWords: 5, lineH: 1.32 },
  { id: 'type', name: 'Typewriter', family: 'Space Mono', weight: 700, size: 0.056, upper: false, maxWords: 6, lineH: 1.34 },
];

export const styleById = (id) => CAPTION_STYLES.find((s) => s.id === id) || CAPTION_STYLES[0];

export const HIGHLIGHTS = ['#FFD23F', '#7CFF6B', '#3DE0FF', '#FF5DA2', '#FF8A3D', '#FFFFFF'];

const FALLBACK = '"Segoe UI", "Noto Sans Arabic", Tahoma, Arial, sans-serif';
const POWER = new Set(['never', 'always', 'secret', 'secrets', 'free', 'best', 'worst', 'only', 'first', 'last', 'million', 'billion', 'trillion', 'biggest', 'largest', 'smallest', 'fastest', 'deadly', 'dangerous', 'shocking', 'insane', 'wild', 'crazy', 'impossible', 'nobody', 'everyone', 'truth', 'stop', 'warning', 'why', 'how', 'mistake', 'mistakes']);

export function fontFor(style, px) {
  const fam = /\s/.test(style.family) ? `"${style.family}"` : style.family;
  return `${style.weight} ${Math.round(px)}px ${fam}, ${FALLBACK}`;
}

function displayWord(w, upper) {
  let s = String(w).replace(/^["'“‘(]+|["'”’)]+$/g, '');
  s = s.replace(/[,.;:]+$/, '');
  return upper ? s.toLocaleUpperCase() : s;
}

/**
 * Group timeline words into caption chunks.
 * @returns {{start:number,end:number,scene:number,words:{t:string,start:number,end:number,emph:boolean}[] , rtl:boolean}[]}
 */
export function buildChunks(timeline, project, captionSettings) {
  const style = styleById(captionSettings.style);
  const maxWords = captionSettings.maxWords || style.maxWords;
  const upper = captionSettings.uppercase ?? style.upper;
  const maxChars = Math.max(10, Math.round((style.maxWords <= 1 ? 12 : 16) * (0.084 / style.size) * (style.upper ? 1 : 1.25)));
  const chunks = [];
  timeline.scenes.forEach((sc, si) => {
    const scene = project.scenes[si];
    const kw = scene && scene.keyword ? stem(scene.keyword.toLowerCase()) : '';
    let cur = null;
    const flush = () => {
      if (cur && cur.words.length) chunks.push(cur);
      cur = null;
    };
    sc.words.forEach((w, wi) => {
      const raw = w.w;
      const t = displayWord(raw, upper);
      if (!t) return;
      const low = raw.toLowerCase().replace(/[^a-z0-9%؀-ۿ]/g, '');
      const emph = captionSettings.keywords !== false && ((kw && stem(low) === kw) || /\d/.test(low) || POWER.has(low));
      if (!cur) cur = { start: w.start, end: w.end, scene: si, words: [], rtl: false };
      const chars = cur.words.reduce((n, x) => n + x.t.length + 1, 0) + t.length;
      if (cur.words.length >= maxWords || (cur.words.length && chars > maxChars * 2)) {
        flush();
        cur = { start: w.start, end: w.end, scene: si, words: [], rtl: false };
      }
      cur.words.push({ t, start: w.start, end: w.end, emph });
      if (hasArabic(t)) cur.rtl = true;
      cur.end = w.end;
      const endsSentence = /[.!?…؟]["')]*$/.test(raw);
      const comma = /[,;:—–]$/.test(raw);
      if (endsSentence || (comma && cur.words.length >= 2)) flush();
      if (wi === sc.words.length - 1) flush();
    });
    flush();
  });
  // timing: each chunk stays until the next one starts (short gaps) or holds briefly after speech
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const next = chunks[i + 1];
    const sceneEnd = timeline.scenes[c.scene].end;
    const hold = c.end + 0.45;
    if (next && next.scene === c.scene && next.start - c.end < 0.8) c.end = next.start;
    else c.end = Math.min(next ? Math.min(next.start, sceneEnd) : sceneEnd, hold);
    c.start = Math.max(0, c.start - 0.04);
  }
  return chunks;
}

// ---------------------------------------------------------------- layout

const layoutCache = new Map();

function measure(ctx, text, style, px) {
  ctx.font = fontFor(style, px);
  if ('letterSpacing' in ctx) ctx.letterSpacing = style.letter ? `${(style.letter * px).toFixed(1)}px` : '0px';
  return ctx.measureText(text).width;
}

function layoutChunk(ctx, chunk, style, W, H, settings, key) {
  const k = key + '|' + W + '|' + (settings.size || 1) + '|' + style.id;
  if (layoutCache.has(k)) return layoutCache.get(k);
  let px = style.size * W * (settings.size || 1);
  const maxW = W * (style.id === 'clean' || style.id === 'type' ? 0.8 : 0.86);
  const space = () => measure(ctx, ' ', style, px) * (style.id === 'pop' || style.id === 'comic' ? 1.55 : style.id === 'karaoke' ? 1.6 : style.upper ? 1.1 : 1);
  let widths;
  // shrink if a single word doesn't fit
  for (let guard = 0; guard < 8; guard++) {
    widths = chunk.words.map((w) => measure(ctx, w.t, style, px));
    const widest = Math.max(...widths);
    if (widest <= maxW) break;
    px *= maxW / widest;
  }
  const sp = space();
  const lines = [];
  let line = { words: [], width: 0 };
  chunk.words.forEach((w, i) => {
    const add = (line.words.length ? sp : 0) + widths[i];
    if (line.words.length && line.width + add > maxW) {
      lines.push(line);
      line = { words: [], width: 0 };
    }
    line.words.push({ ...w, idx: i, w: widths[i] });
    line.width += (line.words.length > 1 ? sp : 0) + widths[i];
  });
  if (line.words.length) lines.push(line);
  const lh = px * style.lineH;
  const totalH = lh * lines.length;
  lines.forEach((ln, li) => {
    let x = (W - ln.width) / 2;
    const order = chunk.rtl ? [...ln.words].reverse() : ln.words;
    for (const w of order) {
      w.x = x;
      x += w.w + sp;
    }
    ln.y = -totalH / 2 + lh * (li + 0.5);
  });
  const out = { px, lines, lh, totalH, sp };
  layoutCache.set(k, out);
  if (layoutCache.size > 600) layoutCache.delete(layoutCache.keys().next().value);
  return out;
}

export function clearCaptionCache() {
  layoutCache.clear();
}

export function captionAnchorY(position, H) {
  return position === 'top' ? H * 0.26 : position === 'bottom' ? H * 0.68 : H * 0.52;
}

// ---------------------------------------------------------------- drawing

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setFont(ctx, style, px) {
  ctx.font = fontFor(style, px);
  if ('letterSpacing' in ctx) ctx.letterSpacing = style.letter ? `${(style.letter * px).toFixed(1)}px` : '0px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
}

function wordDir(ctx, w) {
  if ('direction' in ctx) ctx.direction = hasArabic(w.t) ? 'rtl' : 'ltr';
  if (hasArabic(w.t)) ctx.textAlign = 'right';
  else ctx.textAlign = 'left';
  return hasArabic(w.t) ? w.x + w.w : w.x;
}

function activeIndex(chunk, t) {
  let a = -1;
  chunk.words.forEach((w, i) => {
    if (t >= w.start - 0.03) a = i;
  });
  return a;
}

/**
 * Draw the caption chunk visible at time t.
 */
export function drawCaptions(ctx, W, H, t, chunks, settings, opts = {}) {
  if (!chunks || !chunks.length) return;
  const style = styleById(settings.style);
  const hi = settings.highlight || '#FFD23F';
  const color = settings.color || '#FFFFFF';
  const anchor = captionAnchorY(settings.position, H);
  // find current chunk (binary search on start)
  let lo = 0;
  let hiIdx = chunks.length - 1;
  let idx = -1;
  while (lo <= hiIdx) {
    const mid = (lo + hiIdx) >> 1;
    if (chunks[mid].start <= t) {
      idx = mid;
      lo = mid + 1;
    } else hiIdx = mid - 1;
  }
  if (idx < 0) return;
  const chunk = chunks[idx];
  if (t > chunk.end) return;
  const L = layoutChunk(ctx, chunk, style, W, H, settings, idx + ':' + chunk.start.toFixed(3) + ':' + chunk.words.map((w) => w.t).join(' '));
  const px = L.px;
  const local = t - chunk.start;
  const outFade = clamp((chunk.end - t) / 0.08, 0, 1);
  const act = activeIndex(chunk, t);
  const darkText = luminance(hi) > 0.45 ? '#111114' : '#ffffff';

  ctx.save();
  ctx.translate(0, anchor);
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  setFont(ctx, style, px);

  const drawStrokeFill = (text, x, y, fill, strokeW, strokeCol = '#000', shadow = true) => {
    if (strokeW > 0) {
      if (shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = px * 0.14;
        ctx.shadowOffsetY = px * 0.05;
      }
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = strokeW;
      ctx.strokeText(text, x, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };

  switch (style.id) {
    case 'pop': {
      ctx.globalAlpha = outFade;
      for (const ln of L.lines) {
        for (const w of ln.words) {
          const since = t - w.start;
          if (since < -0.04) continue;
          const a = clamp((since + 0.04) / 0.17, 0, 1);
          const isAct = w.idx === act;
          const s = (0.6 + 0.4 * ease.outBack(a, 1.7)) * (isAct ? 1.04 : 1);
          ctx.save();
          const cx = w.x + w.w / 2;
          ctx.translate(cx, ln.y);
          ctx.scale(s, s);
          ctx.translate(-cx, -ln.y);
          const x = wordDir(ctx, w);
          drawStrokeFill(w.t, x, ln.y, isAct ? hi : w.emph ? hi : color, px * 0.17);
          ctx.restore();
        }
      }
      break;
    }
    case 'karaoke': {
      const a = ease.outCubic(clamp(local / 0.12, 0, 1));
      ctx.globalAlpha = a * outFade;
      const s = 0.92 + 0.08 * a;
      ctx.translate(W / 2, 0);
      ctx.scale(s, s);
      ctx.translate(-W / 2, 0);
      // moving highlight box
      const flat = L.lines.flatMap((ln) => ln.words.map((w) => ({ w, y: ln.y })));
      const cur = flat.find((f) => f.w.idx === act);
      if (cur) {
        const prev = flat.find((f) => f.w.idx === act - 1);
        const k = prev ? ease.outCubic(clamp((t - cur.w.start + 0.03) / 0.1, 0, 1)) : 1;
        const bx = prev && prev.y === cur.y ? lerp(prev.w.x, cur.w.x, k) : cur.w.x;
        const bw = prev && prev.y === cur.y ? lerp(prev.w.w, cur.w.w, k) : cur.w.w;
        const padX = px * 0.16;
        const padY = px * 0.1;
        ctx.fillStyle = hi;
        roundRect(ctx, bx - padX, cur.y - px * 0.5 - padY, bw + padX * 2, px + padY * 2, px * 0.2);
        ctx.fill();
      }
      for (const ln of L.lines) {
        for (const w of ln.words) {
          const x = wordDir(ctx, w);
          if (w.idx === act) {
            ctx.fillStyle = darkText;
            ctx.fillText(w.t, x, ln.y);
          } else drawStrokeFill(w.t, x, ln.y, w.emph ? hi : color, px * 0.13, '#000', true);
        }
      }
      break;
    }
    case 'clean': {
      const a = ease.outCubic(clamp(local / 0.15, 0, 1));
      ctx.globalAlpha = a * outFade;
      ctx.translate(0, (1 - a) * px * 0.3);
      for (const ln of L.lines) {
        const padX = px * 0.42;
        const padY = px * 0.2;
        const left = Math.min(...ln.words.map((w) => w.x));
        const right = Math.max(...ln.words.map((w) => w.x + w.w));
        ctx.fillStyle = settings.boxColor || '#FFFFFF';
        roundRect(ctx, left - padX, ln.y - px * 0.55 - padY, right - left + padX * 2, px * 1.1 + padY * 2, px * 0.3);
        ctx.fill();
        for (const w of ln.words) {
          const x = wordDir(ctx, w);
          ctx.fillStyle = w.idx === act ? '#000000' : '#18181b';
          ctx.fillText(w.t, x, ln.y + px * 0.03);
        }
      }
      break;
    }
    case 'minimal': {
      for (const ln of L.lines) {
        for (const w of ln.words) {
          const since = t - w.start + 0.05;
          if (since < 0) continue;
          const a = ease.outCubic(clamp(since / 0.2, 0, 1));
          ctx.globalAlpha = a * outFade;
          const x = wordDir(ctx, w);
          const y = ln.y + (1 - a) * px * 0.2;
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = px * 0.3;
          ctx.shadowOffsetY = px * 0.04;
          ctx.strokeStyle = 'rgba(0,0,0,0.38)';
          ctx.lineWidth = px * 0.07;
          ctx.strokeText(w.t, x, y);
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = w.emph ? hi : color;
          ctx.fillText(w.t, x, y);
        }
      }
      break;
    }
    case 'neon': {
      let flick = 1;
      if (local < 0.18) flick = [0.2, 1, 0.4, 1, 0.7, 1][Math.floor(local / 0.03)] ?? 1;
      ctx.globalAlpha = flick * outFade;
      for (const ln of L.lines) {
        for (const w of ln.words) {
          const isAct = w.idx === act;
          const col = isAct || w.emph ? hi : color;
          const x = wordDir(ctx, w);
          ctx.shadowColor = isAct ? hi : rgba(hi, 0.8);
          ctx.shadowBlur = px * (isAct ? 0.55 : 0.3);
          ctx.fillStyle = col;
          ctx.fillText(w.t, x, ln.y);
          ctx.shadowBlur = px * 0.12;
          ctx.fillText(w.t, x, ln.y);
        }
      }
      break;
    }
    case 'comic': {
      ctx.globalAlpha = outFade;
      for (const ln of L.lines) {
        for (const w of ln.words) {
          const since = t - w.start;
          if (since < -0.04) continue;
          const a = clamp((since + 0.04) / 0.2, 0, 1);
          const r = mulberry32(Math.floor(w.start * 1000))();
          const rot = (r - 0.5) * 0.16;
          const s = 0.4 + 0.6 * ease.outElastic(a);
          const isAct = w.idx === act;
          ctx.save();
          const cx = w.x + w.w / 2;
          ctx.translate(cx, ln.y);
          ctx.rotate(rot);
          ctx.scale(s, s);
          ctx.translate(-cx, -ln.y);
          const x = wordDir(ctx, w);
          ctx.fillStyle = '#000';
          ctx.fillText(w.t, x + px * 0.06, ln.y + px * 0.07);
          ctx.strokeStyle = '#000';
          ctx.lineWidth = px * 0.14;
          ctx.strokeText(w.t, x, ln.y);
          ctx.fillStyle = isAct ? hi : w.emph ? hi : color;
          ctx.fillText(w.t, x, ln.y);
          ctx.restore();
        }
      }
      break;
    }
    case 'slam': {
      const w = L.lines[0] && L.lines[0].words[0];
      if (!w) break;
      const a = clamp(local / 0.13, 0, 1);
      const s = lerp(1.75, 1, ease.outCubic(a));
      ctx.globalAlpha = outFade;
      const cx = W / 2;
      const g = ctx.createLinearGradient(0, -px * 0.5, 0, px * 0.5);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(1, w.emph ? hi : rgba(hi, 0.95));
      const drawAt = (scale, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha * outFade;
        ctx.translate(cx, L.lines[0].y);
        ctx.rotate(-0.035);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -L.lines[0].y);
        const x = wordDir(ctx, w);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = px * 0.08;
        ctx.strokeText(w.t, x, L.lines[0].y);
        ctx.fillStyle = g;
        ctx.fillText(w.t, x, L.lines[0].y);
        ctx.restore();
      };
      if (a < 1) {
        drawAt(s * 1.18, 0.18 * (1 - a));
        drawAt(s * 1.08, 0.3 * (1 - a));
      }
      drawAt(s, 1);
      break;
    }
    case 'marker': {
      const a = ease.outCubic(clamp(local / 0.12, 0, 1));
      ctx.globalAlpha = a * outFade;
      for (const ln of L.lines) {
        for (const w of ln.words) {
          const dur = Math.max(0.12, w.end - w.start);
          const p = clamp((t - w.start) / dur, 0, 1);
          if (p > 0) {
            ctx.fillStyle = rgba(hi, 0.94);
            const bh = px * 1.04;
            const left = hasArabic(w.t) ? w.x + w.w - w.w * p : w.x;
            roundRect(ctx, left - px * 0.1, ln.y - px * 0.54, w.w * p + px * 0.2, bh, px * 0.12);
            ctx.fill();
          }
          const x = wordDir(ctx, w);
          if (p >= 1) {
            ctx.fillStyle = darkText;
            ctx.fillText(w.t, x, ln.y);
          } else drawStrokeFill(w.t, x, ln.y, color, px * 0.1, 'rgba(0,0,0,0.85)', false);
        }
      }
      break;
    }
    case 'type': {
      ctx.globalAlpha = outFade;
      const left = Math.min(...L.lines.flatMap((ln) => ln.words.map((w) => w.x)));
      const right = Math.max(...L.lines.flatMap((ln) => ln.words.map((w) => w.x + w.w)));
      const top = L.lines[0].y - px * 0.75;
      const bottom = L.lines[L.lines.length - 1].y + px * 0.75;
      ctx.fillStyle = 'rgba(8,8,12,0.72)';
      roundRect(ctx, left - px * 0.6, top, right - left + px * 1.2, bottom - top, px * 0.3);
      ctx.fill();
      let caret = null;
      for (const ln of L.lines) {
        for (const w of ln.words) {
          const dur = Math.max(0.1, w.end - w.start);
          const p = clamp((t - w.start + 0.04) / (dur * 0.85), 0, 1);
          const n = Math.ceil(w.t.length * p);
          if (n <= 0) continue;
          const shown = w.t.slice(0, n);
          ctx.fillStyle = w.emph ? hi : color;
          ctx.textAlign = 'left';
          ctx.fillText(shown, w.x, ln.y);
          caret = { x: w.x + measure(ctx, shown, style, px), y: ln.y };
          setFont(ctx, style, px);
        }
      }
      if (caret && Math.floor(t * 2.5) % 2 === 0) {
        ctx.fillStyle = hi;
        ctx.fillRect(caret.x + px * 0.08, caret.y - px * 0.45, px * 0.45, px * 0.9);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Static mini preview for the style picker. */
export function drawStyleSample(canvas, styleId, hi = '#FFD23F') {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const style = styleById(styleId);
  const words = style.maxWords <= 1 ? ['WOW'] : ['Big', 'idea'];
  const chunk = { start: 0, end: 5, scene: 0, rtl: false, words: words.map((w, i) => ({ t: style.upper ? w.toUpperCase() : w, start: i * 0.3, end: i * 0.3 + 0.3, emph: false })) };
  const settings = { style: styleId, size: 1.6, highlight: hi, color: '#FFFFFF', position: 'middle' };
  ctx.save();
  ctx.translate(0, -H * 0.02);
  drawCaptions(ctx, W, H, 0.75, [chunk], settings);
  ctx.restore();
}
