// Frame compositor: scene backgrounds + transitions, readability scrim, emoji/stat stickers,
// title banner, captions, progress bar and (free tier) watermark. Used for the live preview
// and for export, so what you see is exactly what you get.

import { drawTheme, drawCover, drawGrain, lookById, sceneTheme, PALETTES } from './visuals.js';
import { drawCaptions, captionAnchorY } from './captions.js';
import { sceneAt } from './timeline.js';
import { clamp, ease, lerp, hashString, luminance } from './util.js';
import { langMeta, pack } from './langs.js';

// bundled fonts for Arabic and Devanagari text in titles, number cards and the watermark
const SCRIPTS = '"AS Arabic", "AS Devanagari"';

const TRANS = 0.34;
const PRE = 0.12;
const AUTO_TRANS = ['zoom', 'slide', 'fade', 'whip'];

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

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

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

export class Renderer {
  constructor(canvas, { mode = 'preview' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.mode = mode;
    this.data = null;
    this.layers = null;
    this.playing = false;
    this.safeZones = false;
    this.titleCache = null;
  }

  setData(d) {
    this.data = d;
    this.titleCache = null;
    this.rtl = !!(d && d.project && langMeta(d.project.lang).dir === 'rtl');
    // text direction follows the video's language, not the interface (an English video in the
    // Arabic interface still reads left to right)
    if (this.canvas && this.canvas.setAttribute) this.canvas.setAttribute('dir', this.rtl ? 'rtl' : 'ltr');
  }

  ensureLayers() {
    const { width: W, height: H } = this.canvas;
    if (!this.layers || this.layers[0].width !== W || this.layers[0].height !== H) {
      this.layers = [makeCanvas(W, H), makeCanvas(W, H)];
    }
    return this.layers;
  }

  visualOf(i) {
    const sc = this.data.project.scenes[i];
    return (sc && sc.visual) || null;
  }

  isMediaScene(i) {
    const v = this.visualOf(i);
    return !!(v && v.type === 'media' && v.assetId);
  }

  drawBackground(ctx, i, t) {
    const { project, timeline, media } = this.data;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sc = project.scenes[i];
    const tl = timeline.scenes[i];
    const look = lookById(project.settings.visuals.look);
    const v = sc && sc.visual;
    if (v && v.type === 'media' && v.assetId && media) {
      const local = Math.max(0, t - tl.start);
      const dur = Math.max(0.5, tl.end - tl.start);
      const fr = media.frameForScene ? media.frameForScene(i, v.assetId) : media.frame(v.assetId, local, this.playing);
      if (fr) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        drawCover(ctx, fr.src, fr.w, fr.h, W, H, local / dur, project.settings.visuals.motion !== false, hashString(sc.id));
        return;
      }
    }
    const theme = v && v.type === 'theme' ? v.theme : sceneTheme(look.id, i);
    drawTheme(ctx, W, H, theme, look.palette, hashString(sc ? sc.id : String(i)), t);
  }

  transitionFor(i) {
    const st = this.data.project.settings.visuals.transition || 'auto';
    if (st !== 'auto') return st;
    const sc = this.data.project.scenes[i];
    return AUTO_TRANS[hashString(sc ? sc.id : String(i)) % AUTO_TRANS.length];
  }

  draw(t) {
    if (!this.data || !this.data.timeline) return;
    const ctx = this.ctx;
    if ('direction' in ctx) ctx.direction = this.rtl ? 'rtl' : 'ltr';
    const W = this.canvas.width;
    const H = this.canvas.height;
    const { project, timeline, chunks, media } = this.data;
    const S = project.settings;
    if (media && media.beginFrame) media.beginFrame();
    const i = Math.max(0, sceneAt(timeline, t));
    const scenes = timeline.scenes;

    // ---- background with transition
    let trans = null;
    const next = scenes[i + 1];
    if (next && t >= next.start - PRE) trans = { a: i, b: i + 1, p: (t - (next.start - PRE)) / TRANS };
    else if (i > 0 && t < scenes[i].start + (TRANS - PRE)) trans = { a: i - 1, b: i, p: (t - (scenes[i].start - PRE)) / TRANS };
    const style = trans ? this.transitionFor(trans.b) : 'cut';
    if (trans && style !== 'cut' && trans.p > 0 && trans.p < 1) {
      const [A, B] = this.ensureLayers();
      const ca = A.getContext('2d');
      const cb = B.getContext('2d');
      this.drawBackground(ca, trans.a, t);
      this.drawBackground(cb, trans.b, t);
      this.composite(ctx, A, B, style, clamp(trans.p, 0, 1), W, H);
    } else {
      this.drawBackground(ctx, i, t);
    }

    const pal = PALETTES[lookById(S.visuals.look).palette] || PALETTES.aurora;
    // ---- readability scrim
    const media_ = this.isMediaScene(i);
    const dim = S.visuals.dim ?? 0.25;
    const light = !!pal.light && !media_;
    const base = light ? dim * 0.15 : media_ ? Math.min(0.75, dim + 0.12) : dim * 0.6;
    if (base > 0.005) {
      ctx.fillStyle = `rgba(0,0,0,${base})`;
      ctx.fillRect(0, 0, W, H);
    }
    const ay = captionAnchorY(S.captions.position, H);
    const vg = ctx.createRadialGradient(W / 2, ay, W * 0.05, W / 2, ay, W * 0.8);
    vg.addColorStop(0, `rgba(0,0,0,${light ? 0.06 : media_ ? 0.32 : 0.2})`);
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    if (!media_) drawGrain(ctx, W, H, 0.035, t);

    // ---- stickers (emoji / stat)
    this.drawSticker(ctx, i, t, W, H);

    // ---- title banner
    if (S.visuals.titleBanner && S.visuals.titleBanner !== 'off') this.drawTitle(ctx, t, W, H);

    // ---- captions
    drawCaptions(ctx, W, H, t, chunks, S.captions);

    // ---- progress bar
    if (S.visuals.progress) {
      const h = Math.max(3, Math.round(H * 0.0055));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, 0, W, h);
      ctx.fillStyle = S.captions.highlight || '#FFD23F';
      ctx.fillRect(0, 0, W * clamp(t / timeline.duration, 0, 1), h);
    }

    if (this.data.watermark) this.drawWatermark(ctx, W, H);
    if (this.safeZones && this.mode === 'preview') this.drawSafeZones(ctx, W, H);
    if (media && media.endFrame) media.endFrame();
  }

  composite(ctx, A, B, style, p, W, H) {
    const e = ease.inOutCubic(p);
    ctx.save();
    switch (style) {
      case 'fade':
        ctx.drawImage(A, 0, 0);
        ctx.globalAlpha = e;
        ctx.drawImage(B, 0, 0);
        break;
      case 'slide':
        ctx.drawImage(A, 0, -H * e);
        ctx.drawImage(B, 0, H * (1 - e));
        break;
      case 'whip': {
        const blur = Math.sin(Math.PI * p);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        for (const [img, x] of [
          [A, -W * e],
          [B, W * (1 - e)],
        ]) {
          ctx.globalAlpha = 1;
          ctx.drawImage(img, x, 0);
          if (blur > 0.05) {
            ctx.globalAlpha = 0.35 * blur;
            ctx.drawImage(img, x - W * 0.04 * blur, 0);
            ctx.drawImage(img, x + W * 0.04 * blur, 0);
          }
        }
        break;
      }
      case 'zoom':
      default: {
        const sa = 1 + 0.22 * ease.inCubic(p);
        ctx.translate(W / 2, H / 2);
        ctx.scale(sa, sa);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(A, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const sb = lerp(1.28, 1, ease.outCubic(p));
        ctx.globalAlpha = clamp(p * 2.4, 0, 1);
        ctx.translate(W / 2, H / 2);
        ctx.scale(sb, sb);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(B, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const flash = 0.22 * Math.sin(Math.PI * p);
        if (flash > 0.01) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = `rgba(255,255,255,${flash})`;
          ctx.fillRect(0, 0, W, H);
        }
        break;
      }
    }
    ctx.restore();
  }

  stickerY(H) {
    const pos = this.data.project.settings.captions.position;
    return pos === 'top' ? H * 0.64 : pos === 'bottom' ? H * 0.38 : H * 0.3;
  }

  drawSticker(ctx, i, t, W, H) {
    const { project, timeline } = this.data;
    const S = project.settings;
    const sc = project.scenes[i];
    const tl = timeline.scenes[i];
    if (!sc || !tl) return;
    const enter = tl.start + (i === 0 ? 0.25 : 0.08);
    const local = t - enter;
    if (local < 0) return;
    const exit = clamp((tl.end - t) / 0.14, 0, 1);
    const y = this.stickerY(H);
    if (S.visuals.stats && sc.stat && sc.stat.value) {
      this.drawStat(ctx, sc.stat, local, exit, W, H, y);
      return;
    }
    if (S.visuals.stickers && sc.emoji) {
      const s = ease.outBack(clamp(local / 0.34, 0, 1), 2.4) * (0.85 + 0.15 * exit);
      const bob = Math.sin(t * 2.4 + i) * W * 0.008;
      const rot = Math.sin(t * 1.7 + i) * 0.06;
      const size = W * 0.21;
      ctx.save();
      ctx.globalAlpha = exit;
      ctx.translate(W / 2, y + bob);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.38)';
      ctx.shadowBlur = W * 0.03;
      ctx.shadowOffsetY = W * 0.012;
      ctx.fillText(sc.emoji, 0, 0);
      ctx.restore();
    }
  }

  drawStat(ctx, stat, local, exit, W, H, y) {
    const S = this.data.project.settings;
    const hi = S.captions.highlight || '#FFD23F';
    const a = ease.outCubic(clamp(local / 0.3, 0, 1));
    const m = String(stat.value).match(/^([\d.,]+)(.*)$/);
    let text = stat.value;
    if (m && !/^(1[0-9]{3}|20[0-9]{2})$/.test(m[1])) {
      const target = parseFloat(m[1].replace(/,/g, ''));
      const k = ease.outCubic(clamp(local / 0.9, 0, 1));
      const cur = target * k;
      const decimals = (m[1].split('.')[1] || '').length;
      const n = decimals ? cur.toFixed(decimals) : Math.round(cur).toLocaleString('en-US');
      text = n + m[2];
    }
    const px = W * 0.2;
    ctx.save();
    ctx.globalAlpha = a * exit;
    ctx.translate(0, (1 - a) * H * 0.03);
    ctx.font = `400 ${Math.round(px)}px Anton, Impact, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if ('direction' in ctx) ctx.direction = 'ltr'; // "70%" in every language
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let w = ctx.measureText(text).width;
    let scale = Math.min(1, (W * 0.8) / Math.max(1, w));
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = px * 0.12;
    ctx.shadowOffsetY = px * 0.04;
    ctx.strokeStyle = '#0d0d12';
    ctx.lineWidth = px * 0.1;
    ctx.strokeText(text, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    if (stat.label) {
      const lp = W * 0.046;
      ctx.font = `800 ${Math.round(lp)}px Montserrat, ${SCRIPTS}, "Segoe UI", sans-serif`;
      const label = stat.label.toUpperCase();
      // spacing letters apart breaks joined scripts (Arabic) and Devanagari clusters
      if ('letterSpacing' in ctx) ctx.letterSpacing = /^[\x00-\u024f\s]*$/.test(label) ? `${(lp * 0.06).toFixed(1)}px` : '0px';
      if (this.rtl) ctx.direction = 'rtl';
      w = ctx.measureText(label).width;
      const bw = w + lp * 1.2;
      const bh = lp * 1.6;
      const by = y + px * 0.62;
      ctx.fillStyle = hi;
      roundRect(ctx, W / 2 - bw / 2, by - bh / 2, bw, bh, bh * 0.3);
      ctx.fill();
      ctx.fillStyle = luminance(hi) > 0.45 ? '#111114' : '#FFFFFF';
      ctx.fillText(label, W / 2, by + lp * 0.04);
    }
    ctx.restore();
  }

  titleLayout(ctx, W) {
    const title = (this.data.project.title || '').trim();
    if (this.titleCache && this.titleCache.title === title && this.titleCache.W === W) return this.titleCache;
    let px = W * 0.052;
    const maxW = W * 0.8;
    let lines = [];
    for (let guard = 0; guard < 6; guard++) {
      ctx.font = `900 ${Math.round(px)}px Montserrat, ${SCRIPTS}, "Segoe UI", sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      const words = title.split(/\s+/);
      lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
      px *= 0.88;
    }
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      lines[1] = lines[1].replace(/\s*\S*$/, '') + '…';
    }
    ctx.font = `900 ${Math.round(px)}px Montserrat, ${SCRIPTS}, "Segoe UI", sans-serif`;
    const widths = lines.map((l) => ctx.measureText(l).width);
    this.titleCache = { title, W, px, lines, widths };
    return this.titleCache;
  }

  drawTitle(ctx, t, W, H) {
    const { project, timeline } = this.data;
    const S = project.settings;
    if (!project.title) return;
    const mode = S.visuals.titleBanner;
    let alpha = ease.outCubic(clamp((t - 0.05) / 0.35, 0, 1));
    if (mode === 'hook' && timeline.scenes[0]) {
      const endHook = timeline.scenes[0].end;
      alpha *= clamp((endHook - t) / 0.2, 0, 1);
    }
    if (alpha <= 0.001) return;
    const L = this.titleLayout(ctx, W);
    const hi = S.captions.highlight || '#FFD23F';
    const lh = L.px * 1.22;
    const padX = L.px * 0.5;
    const padY = L.px * 0.36;
    const maxw = Math.max(...L.widths);
    const boxW = maxw + padX * 2;
    const boxH = lh * L.lines.length + padY * 2 - L.px * 0.22;
    const y0 = H * 0.085 + (1 - alpha) * -H * 0.03;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hi;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = W * 0.02;
    ctx.shadowOffsetY = W * 0.006;
    roundRect(ctx, W / 2 - boxW / 2, y0, boxW, boxH, L.px * 0.35);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.font = `900 ${Math.round(L.px)}px Montserrat, ${SCRIPTS}, "Segoe UI", sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (this.rtl) ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = luminance(hi) > 0.45 ? '#111114' : '#FFFFFF';
    L.lines.forEach((l, k) => ctx.fillText(l, W / 2, y0 + padY + lh * k + L.px * 0.5));
    ctx.restore();
  }

  drawWatermark(ctx, W, H) {
    const px = W * 0.028;
    const x = W * 0.04;
    const y = H * 0.022;
    ctx.save();
    // the mark is written in the video's language
    const L = langMeta(this.data.project && this.data.project.lang);
    ctx.font = `700 ${Math.round(px)}px "Archivo Variable", Archivo, ${SCRIPTS}, "Segoe UI", sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (L.dir === 'rtl') ctx.direction = 'rtl';
    const label = pack(L.id).madeWith;
    const tw = ctx.measureText(label).width;
    const icon = px * 1.1;
    const w = tw + icon + px * 1.4;
    const h = px * 1.8;
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    // icon: rounded frame with play triangle
    const ix = x + px * 0.55;
    const iy = y + (h - icon) / 2;
    ctx.fillStyle = '#FFD23F';
    roundRect(ctx, ix, iy, icon * 0.72, icon, icon * 0.18);
    ctx.fill();
    ctx.fillStyle = '#1C1733';
    ctx.beginPath();
    ctx.moveTo(ix + icon * 0.24, iy + icon * 0.3);
    ctx.lineTo(ix + icon * 0.54, iy + icon * 0.5);
    ctx.lineTo(ix + icon * 0.24, iy + icon * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, ix + icon * 0.72 + px * 0.45, y + h / 2 + px * 0.05);
    ctx.restore();
  }

  drawSafeZones(ctx, W, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,79,109,0.16)';
    ctx.strokeStyle = 'rgba(255,79,109,0.7)';
    ctx.setLineDash([W * 0.012, W * 0.01]);
    ctx.lineWidth = Math.max(1, W * 0.003);
    const zones = [
      [W * 0.85, H * 0.4, W * 0.15, H * 0.46],
      [0, H * 0.82, W, H * 0.18],
      [0, 0, W, H * 0.06],
    ];
    for (const [x, y, w, h] of zones) {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
}

/** Render one frame into a small JPEG data URL (project thumbnails). */
export function snapshot(renderer, t, width = 216) {
  const src = renderer.canvas;
  renderer.draw(t);
  const h = Math.round((width * src.height) / src.width);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, width, h);
  return c.toDataURL('image/jpeg', 0.78);
}
