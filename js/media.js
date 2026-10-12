// Photos and video clips used as scene backgrounds: import, thumbnails, and frame access for the
// live preview (HTMLVideoElement) and for export (frame-accurate decoding with Mediabunny).

import { db } from './db.js';
import { uid } from './util.js';

let mb = null;
async function mediabunny() {
  if (!mb) mb = await import('../vendor/mediabunny.min.mjs');
  return mb;
}

const MAX_IMAGE = 2600;

function videoMeta(blob) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    const url = URL.createObjectURL(blob);
    v.src = url;
    const done = (ok) => {
      if (ok) resolve({ w: v.videoWidth, h: v.videoHeight, duration: v.duration, el: v, url });
      else {
        URL.revokeObjectURL(url);
        reject(new Error('This video format is not supported. Try an MP4 (H.264) or WebM file.'));
      }
    };
    v.onloadeddata = () => done(true);
    v.onerror = () => done(false);
    setTimeout(() => (v.readyState >= 2 ? done(true) : null), 6000);
  });
}

async function makeThumb(source, w, h, size = 180) {
  const s = Math.min(1, size / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

/** Store an imported or downloaded file as a media asset. */
export async function importMedia(file, credit = null) {
  const type = file.type || '';
  const isVideo = type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name || '');
  const isImage = type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name || '');
  if (!isVideo && !isImage) throw new Error('Choose a photo (JPG, PNG, WebP) or a video (MP4, WebM).');
  const id = uid('m');
  let asset;
  if (isImage) {
    const bmp = await createImageBitmap(file);
    const thumb = await makeThumb(bmp, bmp.width, bmp.height);
    asset = { id, kind: 'media', mediaType: 'image', blob: file, name: file.name || 'Photo', w: bmp.width, h: bmp.height, thumb, credit, created: Date.now() };
    bmp.close && bmp.close();
  } else {
    const meta = await videoMeta(file);
    await new Promise((r) => {
      meta.el.currentTime = Math.min(0.5, (meta.duration || 1) / 3);
      meta.el.onseeked = () => r();
      setTimeout(r, 1500);
    });
    const thumb = await makeThumb(meta.el, meta.w, meta.h);
    URL.revokeObjectURL(meta.url);
    asset = { id, kind: 'media', mediaType: 'video', blob: file, name: file.name || 'Video', w: meta.w, h: meta.h, duration: meta.duration, thumb, credit, created: Date.now() };
  }
  await db.put('assets', asset);
  return asset;
}

export async function listMedia() {
  const all = await db.byIndex('assets', 'kind', 'media').catch(() => []);
  return all.sort((a, b) => b.created - a.created).map(({ blob, ...rest }) => rest);
}

export async function deleteMedia(id) {
  await db.del('assets', id);
}

// ---------------------------------------------------------------- pool for preview

export class PreviewMedia {
  constructor(onUpdate = null) {
    this.items = new Map();
    this.used = new Set();
    this.onUpdate = onUpdate;
  }

  async ensure(ids) {
    for (const id of ids) {
      if (!id || this.items.has(id)) continue;
      this.items.set(id, { loading: true });
      try {
        const a = await db.get('assets', id);
        if (!a) {
          this.items.set(id, { missing: true });
          continue;
        }
        if (a.mediaType === 'image') {
          const bmp = await createImageBitmap(a.blob);
          let src = bmp;
          if (Math.max(bmp.width, bmp.height) > MAX_IMAGE) {
            const s = MAX_IMAGE / Math.max(bmp.width, bmp.height);
            src = await createImageBitmap(a.blob, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: 'high' });
            bmp.close && bmp.close();
          }
          this.items.set(id, { type: 'image', src, w: src.width, h: src.height });
        } else {
          const v = document.createElement('video');
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          v.preload = 'auto';
          v.src = URL.createObjectURL(a.blob);
          await new Promise((r) => {
            v.onloadeddata = r;
            v.onerror = r;
            setTimeout(r, 5000);
          });
          if (v.error) {
            URL.revokeObjectURL(v.src);
            this.items.set(id, { missing: true });
            continue;
          }
          // the size may only be known once data arrives (slow disks): frame() reads it again
          this.items.set(id, { type: 'video', el: v, w: v.videoWidth || a.w || 0, h: v.videoHeight || a.h || 0, duration: v.duration || a.duration || 1 });
          v.addEventListener('seeked', () => this.onUpdate && this.onUpdate());
          v.addEventListener('loadeddata', () => this.onUpdate && this.onUpdate());
        }
        this.onUpdate && this.onUpdate();
      } catch (e) {
        console.warn('media load failed', id, e);
        this.items.set(id, { missing: true });
      }
    }
  }

  beginFrame() {
    this.used.clear();
  }

  /** Returns a drawable for this asset at a local time; keeps preview videos roughly in sync. */
  frame(id, localTime, playing) {
    const it = this.items.get(id);
    if (!it || it.loading || it.missing) return null;
    if (it.type === 'image') return { src: it.src, w: it.w, h: it.h };
    this.used.add(id);
    const v = it.el;
    const target = it.duration > 0 ? localTime % it.duration : 0;
    if (playing) {
      if (v.paused) {
        try {
          v.currentTime = target;
        } catch {}
        v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - target) > 0.35) {
        try {
          v.currentTime = target;
        } catch {}
      }
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 0.04 && !v.seeking) {
        try {
          v.currentTime = target;
        } catch {}
      }
    }
    if (v.readyState < 2) return null;
    const w = v.videoWidth || it.w;
    const h = v.videoHeight || it.h;
    if (!w || !h) return null;
    return { src: v, w, h };
  }

  endFrame() {
    for (const [id, it] of this.items) {
      if (it.type === 'video' && !this.used.has(id) && !it.el.paused) it.el.pause();
    }
  }

  pauseAll() {
    for (const it of this.items.values()) if (it.type === 'video' && !it.el.paused) it.el.pause();
  }

  dispose() {
    for (const it of this.items.values()) {
      if (it.type === 'video') {
        it.el.pause();
        URL.revokeObjectURL(it.el.src);
      }
      if (it.type === 'image' && it.src.close) it.src.close();
    }
    this.items.clear();
  }
}

// ---------------------------------------------------------------- pool for export (frame accurate)

export class ExportMedia {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.assets = new Map(); // id -> {type, src|blob, w, h, duration}
    this.cursors = new Map(); // sceneIndex -> {iter, sink, input}
    this.frames = new Map(); // sceneIndex -> drawable
  }

  async ensure(ids) {
    const M = await mediabunny();
    for (const id of ids) {
      if (!id || this.assets.has(id)) continue;
      const a = await db.get('assets', id);
      if (!a) {
        this.assets.set(id, { missing: true });
        continue;
      }
      if (a.mediaType === 'image') {
        const bmp = await createImageBitmap(a.blob);
        let src = bmp;
        if (Math.max(bmp.width, bmp.height) > MAX_IMAGE) {
          const s = MAX_IMAGE / Math.max(bmp.width, bmp.height);
          src = await createImageBitmap(a.blob, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: 'high' });
          bmp.close && bmp.close();
        }
        this.assets.set(id, { type: 'image', src, w: src.width, h: src.height });
      } else {
        let input = null;
        try {
          input = new M.Input({ source: new M.BlobSource(a.blob), formats: M.ALL_FORMATS });
          const track = await input.getPrimaryVideoTrack();
          if (!track || !(await track.canDecode())) throw new Error('cannot decode');
          const duration = (await input.computeDuration()) || a.duration || 1;
          const w = track.displayWidth;
          const h = track.displayHeight;
          if (!w || !h) throw new Error('unknown video size');
          this.assets.set(id, { type: 'video', blob: a.blob, w, h, duration, M });
        } catch (e) {
          console.warn('export video decode unavailable, using thumbnail', e);
          const img = new Image();
          let ok = false;
          if (a.thumb) {
            img.src = a.thumb;
            ok = await img.decode().then(
              () => img.naturalWidth > 0,
              () => false
            );
          }
          // without a usable still the scene keeps its animated background
          this.assets.set(id, ok ? { type: 'image', src: img, w: img.naturalWidth, h: img.naturalHeight } : { missing: true });
        } finally {
          // this reader only looked at the file; each scene opens its own when it is drawn
          try {
            input && input.dispose && input.dispose();
          } catch {}
        }
      }
    }
  }

  /** Prepare a per-scene sequential decoder for the given local timestamps. */
  async openCursor(sceneIndex, assetId, timestamps) {
    const a = this.assets.get(assetId);
    if (!a || a.type !== 'video') return;
    const M = a.M;
    const input = new M.Input({ source: new M.BlobSource(a.blob), formats: M.ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      const s = Math.min(1, Math.max(this.W / a.w, this.H / a.h) * 1.18);
      const sink = new M.CanvasSink(track, { width: Math.max(2, Math.round(a.w * s)), height: Math.max(2, Math.round(a.h * s)), fit: 'fill', poolSize: 3 });
      const first = await track.getFirstTimestamp().catch(() => 0);
      const span = Math.max(0.05, a.duration - first - 0.04);
      const ts = timestamps.map((t) => first + (a.duration > 0 ? t % span : 0));
      const iter = sink.canvasesAtTimestamps(ts);
      this.cursors.set(sceneIndex, { iter, input, w: a.w * s, h: a.h * s });
    } catch (e) {
      // the scene falls back to its animated background instead of failing the whole export
      console.warn('could not open video for scene', sceneIndex, e);
      try {
        input.dispose && input.dispose();
      } catch {}
    }
  }

  async advance(sceneIndex) {
    const c = this.cursors.get(sceneIndex);
    if (!c || c.broken) return;
    try {
      const r = await c.iter.next();
      if (!r.done && r.value) this.frames.set(sceneIndex, { src: r.value.canvas, w: r.value.canvas.width, h: r.value.canvas.height });
    } catch (e) {
      // a damaged frame: keep showing the last good one for the rest of the scene
      console.warn('video decode failed for scene', sceneIndex, e);
      c.broken = true;
    }
  }

  async closeCursor(sceneIndex) {
    const c = this.cursors.get(sceneIndex);
    if (!c) return;
    try {
      await c.iter.return();
    } catch {}
    try {
      c.input.dispose && c.input.dispose();
    } catch {}
    this.cursors.delete(sceneIndex);
    this.frames.delete(sceneIndex);
  }

  frameForScene(sceneIndex, assetId) {
    const a = this.assets.get(assetId);
    if (!a || a.missing) return null;
    if (a.type === 'image') return { src: a.src, w: a.w, h: a.h };
    return this.frames.get(sceneIndex) || null;
  }

  async dispose() {
    for (const k of [...this.cursors.keys()]) await this.closeCursor(k);
    for (const a of this.assets.values()) if (a.type === 'image' && a.src && a.src.close) a.src.close();
    this.assets.clear();
  }
}
