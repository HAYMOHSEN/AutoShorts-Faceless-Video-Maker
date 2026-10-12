// Export dialog: resolution, weekly allowance, render progress, save and post kit.

import { h, icon, modal, toast, clear, copyText, saveBlob } from './ui.js';
import { exportVideo, exportCover, RESOLUTIONS, exportCapabilities } from './exporter.js';
import { license, quota, recordExport, resetText } from './license.js';
import { buildPublishKit, UPLOAD_LINKS } from './publish.js';
import { fmtBytes, fmtTime, slugify } from './util.js';
import { Renderer } from './renderer.js';

export async function openExport(ed) {
  const pro = license.pro;
  let res = pro ? 1080 : 720;
  const q = await quota();
  const canExport = pro || q.left > 0;

  const preview = h('canvas', { width: 360, height: 640 });
  const phone = h('div', { class: 'phone' }, preview);
  const pr = new Renderer(preview);
  pr.setData(ed.renderData());
  const t0 = Math.min(ed.timeline.duration - 0.1, (ed.timeline.scenes[0]?.end || 2) * 0.6);
  pr.draw(t0);

  const right = h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start' } });
  const grid = h('div', { class: 'export-grid' }, phone, right);
  let ctrl = null;
  let resultUrl = null;
  const dlg = modal({
    title: 'Export video',
    body: grid,
    size: 'wide',
    onClose: () => {
      if (ctrl) ctrl.abort();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
  });

  function optionsView() {
    clear(right);
    const opts = h('div', { class: 'res-options', role: 'radiogroup', 'aria-label': 'Resolution' });
    for (const r of [720, 1080]) {
      const R = RESOLUTIONS[r];
      const locked = r === 1080 && !pro;
      const b = h(
        'button',
        { class: 'res-option', role: 'radio', 'aria-checked': String(res === r) },
        h('span', {}, h('b', { text: R.label }), h('small', { text: `${R.w} × ${R.h}, 30 fps, MP4` })),
        locked ? icon('lock', 15) : null
      );
      b.addEventListener('click', () => {
        if (locked) return ed.ctx.openPro('hd');
        res = r;
        optionsView();
      });
      opts.append(b);
    }
    const info = h('div', { class: 'note' });
    if (pro) info.append(h('strong', { text: 'Pro' }), h('span', { text: 'Unlimited exports, no watermark.' }));
    else {
      info.append(
        h('strong', { text: `${q.left} of ${q.limit} free exports left this week` }),
        h('span', { text: `Free exports are 720p with a small “Made with AutoShorts” mark. ${resetText(q.resets)}.` }),
        h('div', { class: 'row' }, h('button', { class: 'btn pro small', on: { click: () => ed.ctx.openPro('export') } }, icon('crown', 14), 'Get Pro for unlimited HD'))
      );
    }
    const pending = ed.pendingVoices().length;
    const voiceNote = pending && ed.project.settings.voice.mode === 'ai' ? h('p', { class: 'hint', text: `${pending} voice line${pending > 1 ? 's are' : ' is'} still being recorded. Export will wait for ${pending > 1 ? 'them' : 'it'}.` }) : null;
    const missingMic = ed.project.settings.voice.mode === 'mic' ? ed.project.scenes.filter((s) => !s.recId).length : 0;
    const micNote = missingMic ? h('p', { class: 'hint', text: `${missingMic} scene${missingMic > 1 ? 's have' : ' has'} no recording yet and will be silent.` }) : null;
    const go = h('button', { class: 'btn primary big', disabled: !canExport }, icon('download', 20), 'Export MP4');
    go.addEventListener('click', run);
    right.append(...[
      h('div', { class: 'kv' }, h('span', { text: 'Length' }), h('b', { text: fmtTime(ed.timeline.duration) }), h('span', { text: 'Scenes' }), h('b', { text: String(ed.project.scenes.length) })),
      opts,
      info,
      voiceNote,
      micNote,
      h('div', {}, go),
    ].filter(Boolean));
    dlg.setActions([]);
  }

  async function run() {
    ctrl = new AbortController();
    clear(right);
    const label = h('strong', { text: 'Getting ready' });
    const sub = h('span', { text: '' });
    const bar = h('div', { class: 'progress' }, h('i'));
    right.append(h('div', { class: 'note' }, label, bar, sub));
    dlg.setActions([{ label: 'Cancel', onClick: () => ctrl.abort() }]);
    const setP = (p) => (bar.firstChild.style.width = `${Math.round(p * 100)}%`);
    try {
      const caps = await exportCapabilities(res);
      if (!caps.ok) throw new Error(caps.reason);
      if (ed.project.settings.voice.mode === 'ai' && ed.pendingVoices().length) {
        label.textContent = 'Finishing the voiceover';
        const ok = await ed.waitForVoices((d, n) => {
          sub.textContent = `Line ${Math.min(d + 1, n)} of ${n}`;
          setP(n ? d / n : 0);
          if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        });
        if (!ok) throw new Error(ed.voiceError || 'The voice could not be finished.');
      }
      if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      label.textContent = 'Mixing audio';
      sub.textContent = '';
      const snap = await ed.exportSnapshot();
      if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      label.textContent = 'Rendering video';
      const result = await exportVideo({
        project: ed.project,
        timeline: snap.timeline,
        chunks: snap.chunks,
        mix: snap.mix,
        resolution: res,
        watermark: !license.pro,
        signal: ctrl.signal,
        onProgress: (p, info) => {
          setP(p);
          if (info.finishing) {
            label.textContent = 'Finishing the file';
            sub.textContent = '';
          } else if (info.frame) sub.textContent = `Frame ${info.frame} of ${info.frames}${info.eta != null ? ` · about ${Math.max(1, Math.round(info.eta))}s left` : ''}`;
        },
      });
      if (!license.pro) await recordExport();
      ed.project.exports = [...(ed.project.exports || []), { at: Date.now(), res, size: result.blob.size }];
      ed.save();
      doneView(result);
    } catch (e) {
      if (e.name === 'AbortError') {
        toast('Export cancelled');
        if (dlg.panel.isConnected) optionsView();
        return;
      }
      console.error(e);
      clear(right);
      right.append(h('div', { class: 'note warn' }, h('strong', { text: 'Export didn’t finish' }), h('span', { text: e.message || String(e) })));
      dlg.setActions([
        { label: 'Close', onClick: (close) => close() },
        { label: 'Try again', kind: 'primary', onClick: () => optionsView() },
      ]);
    }
  }

  function doneView(result) {
    const url = URL.createObjectURL(result.blob);
    resultUrl = url;
    ctrl = null;
    const video = h('video', { src: url, controls: true, autoplay: true, muted: true, loop: true, playsInline: true });
    phone.replaceChildren(video);
    clear(right);
    const name = `${slugify(ed.project.title)}.mp4`;
    const kit = buildPublishKit(ed.project);
    const save = h('button', { class: 'btn primary big' }, icon('download', 20), 'Save MP4');
    save.addEventListener('click', async () => {
      const r = await saveBlob(result.blob, name, { description: 'MP4 video', mime: 'video/mp4', ext: '.mp4' });
      if (r !== 'cancelled') toast(r === 'saved' ? 'Video saved' : 'Video downloaded');
    });
    const cover = h('button', { class: 'btn' }, icon('image', 16), 'Save cover image');
    cover.addEventListener('click', async () => {
      const t = Math.min(ed.timeline.duration - 0.1, (ed.timeline.scenes[0]?.end || 2) * 0.6);
      const blob = await exportCover({ project: ed.project, timeline: ed.timeline, chunks: ed.chunks, watermark: !license.pro }, t);
      await saveBlob(blob, `${slugify(ed.project.title)}-cover.jpg`, { description: 'JPEG image', mime: 'image/jpeg', ext: '.jpg' });
    });
    const codecNote = result.videoCodec !== 'avc' ? h('p', { class: 'hint', text: `This PC saved the video as ${String(result.videoCodec).toUpperCase()}${result.audioCodec ? ' / ' + String(result.audioCodec).toUpperCase() : ''} instead of H.264. YouTube accepts it. If another app refuses the upload, install the Media Feature Pack (Windows N editions), update Microsoft Edge and export again.` }) : null;
    const links = h('div', { class: 'media-actions' });
    for (const l of UPLOAD_LINKS) links.append(h('a', { class: 'btn small', href: l.url, target: '_blank', rel: 'noopener' }, icon('external', 14), l.label));
    right.append(...[
      h('div', { class: 'note' }, h('strong', { text: 'Your video is ready' }), h('span', { text: `${RESOLUTIONS[res].label}, ${fmtTime(result.seconds)}, ${fmtBytes(result.blob.size)}. Rendered in ${Math.round(result.renderSeconds)}s.` })),
      h('div', { class: 'row' }, save, cover),
      codecNote,
      h('div', { class: 'kit-block' }, h('div', { class: 'head' }, h('span', { text: 'Caption to paste' }), h('button', { class: 'btn small ghost', on: { click: () => copyText(kit.tiktok) } }, icon('copy', 14), 'Copy')), h('textarea', { rows: 4, value: kit.tiktok, 'aria-label': 'Caption' })),
      h('div', { class: 'group' }, h('span', { class: 'field-label', text: 'Upload it' }), links),
    ].filter(Boolean));
    dlg.setActions([{ label: 'Done', onClick: (close) => close() }]);
  }

  optionsView();
}
