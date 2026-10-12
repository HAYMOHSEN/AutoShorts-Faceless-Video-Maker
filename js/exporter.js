// MP4 export: renders every frame with the same renderer as the preview and encodes with WebCodecs
// (H.264 + AAC where available, falling back to VP9 / Opus) via Mediabunny.

import { Renderer } from './renderer.js';
import { ExportMedia } from './media.js';
import { N_, t } from './i18n.js';

const TRANS = 0.34;
const PRE = 0.12;

export const RESOLUTIONS = {
  720: { w: 720, h: 1280, bitrate: 5_000_000, label: N_('720p') },
  1080: { w: 1080, h: 1920, bitrate: 9_000_000, label: N_('1080p Full HD') },
};

export async function exportCapabilities(res = 1080) {
  const M = await import('../vendor/mediabunny.min.mjs');
  const R = RESOLUTIONS[res];
  if (typeof VideoEncoder === 'undefined') return { ok: false, reason: t('This version of Windows/Edge cannot encode video. Update Microsoft Edge and try again.') };
  const video = await M.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: R.w, height: R.h, bitrate: R.bitrate });
  const audio = await M.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: 48000, bitrate: 192000 });
  return { ok: !!video, video, audio, reason: video ? '' : t('No supported video encoder was found on this PC.') };
}

/**
 * @param {object} o
 * @param {object} o.project
 * @param {object} o.timeline
 * @param {object[]} o.chunks
 * @param {AudioBuffer} o.mix
 * @param {720|1080} o.resolution
 * @param {boolean} o.watermark
 * @param {(p:number, info:object)=>void} o.onProgress
 * @param {AbortSignal} o.signal
 */
export async function exportVideo(o) {
  const M = await import('../vendor/mediabunny.min.mjs');
  const R = RESOLUTIONS[o.resolution] || RESOLUTIONS[720];
  const fps = 30;
  const W = R.w;
  const H = R.h;
  const duration = o.timeline.duration;
  const frames = Math.ceil(duration * fps);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const media = new ExportMedia(W, H);
  let output = null;
  let audioSource = null;
  let caps = null;
  let finished = false;
  const started = performance.now();
  try {
    const mediaScenes = [];
    o.project.scenes.forEach((sc, i) => {
      if (sc.visual && sc.visual.type === 'media' && sc.visual.assetId) mediaScenes.push({ i, assetId: sc.visual.assetId });
    });
    await media.ensure([...new Set(mediaScenes.map((m) => m.assetId))]);

    // frame ranges in which each video scene is visible (incl. transitions)
    const ranges = mediaScenes
      .map(({ i, assetId }) => {
        const sc = o.timeline.scenes[i];
        const a = Math.max(0, Math.floor((sc.start - PRE - 0.02) * fps));
        const b = Math.min(frames - 1, Math.ceil((sc.end + TRANS) * fps));
        return { i, assetId, a, b, open: false, done: false };
      })
      .filter((r) => {
        const asset = media.assets.get(r.assetId);
        return asset && asset.type === 'video';
      });

    const renderer = new Renderer(canvas, { mode: 'export' });
    renderer.setData({ project: o.project, timeline: o.timeline, chunks: o.chunks, media, watermark: o.watermark });

    caps = await exportCapabilities(o.resolution);
    if (!caps.ok) throw new Error(caps.reason);

    output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
    const videoSource = new M.CanvasSource(canvas, { codec: caps.video, bitrate: R.bitrate, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });
    if (o.mix && caps.audio) {
      audioSource = new M.AudioBufferSource({ codec: caps.audio, bitrate: 192000 });
      output.addAudioTrack(audioSource);
    }
    output.setMetadataTags && output.setMetadataTags({ title: o.project.title, comment: 'Made with AutoShorts' });
    await output.start();

    const loopStart = performance.now();
    for (let f = 0; f < frames; f++) {
      if (o.signal && o.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const t = f / fps;
      for (const r of ranges) {
        if (!r.open && f >= r.a && f <= r.b) {
          const sc = o.timeline.scenes[r.i];
          const ts = [];
          for (let k = f; k <= r.b; k++) ts.push(Math.max(0, k / fps - sc.start));
          await media.openCursor(r.i, r.assetId, ts);
          r.open = true;
        }
        if (r.open && !r.done && f <= r.b) await media.advance(r.i);
      }
      renderer.draw(t);
      await videoSource.add(t, 1 / fps);
      for (const r of ranges) {
        if (r.open && !r.done && f >= r.b) {
          await media.closeCursor(r.i);
          r.done = true;
        }
      }
      if (f % 10 === 0) {
        const elapsed = (performance.now() - loopStart) / 1000;
        const p = (f + 1) / frames;
        o.onProgress && o.onProgress(p * 0.95, { frame: f + 1, frames, eta: p > 0.02 ? (elapsed / p) * (1 - p) : null });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    videoSource.close();
    if (audioSource) {
      await audioSource.add(o.mix);
      audioSource.close();
    }
    o.onProgress && o.onProgress(0.97, { finishing: true });
    await output.finalize();
    finished = true;
  } finally {
    if (!finished && output) {
      try {
        await output.cancel();
      } catch {}
    }
    await media.dispose().catch((e) => console.warn(e));
  }
  const buffer = output.target.buffer;
  o.onProgress && o.onProgress(1, { done: true });
  return {
    blob: new Blob([buffer], { type: 'video/mp4' }),
    width: W,
    height: H,
    seconds: duration,
    videoCodec: caps.video,
    audioCodec: audioSource ? caps.audio : null,
    renderSeconds: (performance.now() - started) / 1000,
  };
}

/** A still image of the video for a cover/thumbnail. */
export async function exportCover(o, t) {
  const R = RESOLUTIONS[1080];
  const canvas = document.createElement('canvas');
  canvas.width = R.w;
  canvas.height = R.h;
  const media = new ExportMedia(R.w, R.h);
  try {
    const ids = o.project.scenes.filter((s) => s.visual && s.visual.type === 'media').map((s) => s.visual.assetId);
    await media.ensure([...new Set(ids)]);
    const renderer = new Renderer(canvas, { mode: 'export' });
    renderer.setData({ project: o.project, timeline: o.timeline, chunks: o.chunks, media, watermark: o.watermark });
    // video scenes show the frame at that moment on the cover
    const i = o.timeline.scenes.findIndex((s) => t >= s.start && t < s.end);
    const sc = o.project.scenes[i];
    if (sc && sc.visual && sc.visual.type === 'media') {
      await media.openCursor(i, sc.visual.assetId, [Math.max(0, t - o.timeline.scenes[i].start)]);
      await media.advance(i);
    }
    renderer.draw(t);
    return await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  } finally {
    await media.dispose().catch(() => {});
  }
}
