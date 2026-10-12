// Export dialog: resolution, weekly allowance, render progress, save and post kit.

import { h, icon, modal, toast, clear, copyText, saveBlob } from './ui.js';
import { exportVideo, exportCover, RESOLUTIONS, exportCapabilities } from './exporter.js';
import { license, quota, recordExport, resetText } from './license.js';
import { buildPublishKit, UPLOAD_LINKS } from './publish.js';
import { fmtBytes, fmtTime, slugify } from './util.js';
import { Renderer } from './renderer.js';
import { t, tx, joinList } from './i18n.js';
import { langMeta } from './langs.js';

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
    title: t('Export video'),
    body: grid,
    size: 'wide',
    onClose: () => {
      if (ctrl) ctrl.abort();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
  });

  function optionsView() {
    clear(right);
    const opts = h('div', { class: 'res-options', role: 'radiogroup', 'aria-label': t('Resolution') });
    for (const r of [720, 1080]) {
      const R = RESOLUTIONS[r];
      const locked = r === 1080 && !pro;
      const b = h(
        'button',
        { class: 'res-option', role: 'radio', 'aria-checked': String(res === r) },
        h('span', {}, h('b', { text: t(R.label) }), h('small', {}, h('span', { dir: 'ltr', text: `${R.w} × ${R.h}, 30 fps, MP4` }))),
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
    if (pro) info.append(h('strong', { text: t('Pro') }), h('span', { text: t('Unlimited exports, no watermark.') }));
    else {
      info.append(
        h('strong', {}, ...tx('{left} of {limit} free exports left this week', { left: q.left, limit: q.limit, n: q.limit })),
        h('span', { text: t('Free exports are 720p with a small “Made with AutoShorts” mark. {reset}.', { reset: resetText(q.resets) }) }),
        h('div', { class: 'row' }, h('button', { class: 'btn pro small', on: { click: () => ed.ctx.openPro('export') } }, icon('crown', 14), t('Get Pro for unlimited HD')))
      );
    }
    const pending = ed.pendingVoices().length;
    const voiceNote = pending && ed.project.settings.voice.mode === 'ai' ? h('p', { class: 'hint', text: t('{n} voice lines are still being recorded. Export will wait for them.', { n: pending }) }) : null;
    const missingMic = ed.project.settings.voice.mode === 'mic' ? ed.project.scenes.filter((s) => !s.recId).length : 0;
    const micNote = missingMic ? h('p', { class: 'hint', text: t('{n} scenes have no recording yet and will be silent.', { n: missingMic }) }) : null;
    const go = h('button', { class: 'btn primary big', disabled: !canExport }, icon('download', 20), t('Export MP4'));
    go.addEventListener('click', run);
    right.append(...[
      h('div', { class: 'kv' }, h('span', { text: t('Length') }), h('b', { text: fmtTime(ed.timeline.duration) }), h('span', { text: t('Scenes') }), h('b', { text: String(ed.project.scenes.length) })),
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
    const label = h('strong', { text: t('Getting ready') });
    const sub = h('span', { text: '' });
    const bar = h('div', { class: 'progress' }, h('i'));
    right.append(h('div', { class: 'note' }, label, bar, sub));
    dlg.setActions([{ label: t('Cancel'), onClick: () => ctrl.abort() }]);
    const setP = (p) => (bar.firstChild.style.width = `${Math.round(p * 100)}%`);
    try {
      const caps = await exportCapabilities(res);
      if (!caps.ok) throw new Error(caps.reason);
      if (ed.project.settings.voice.mode === 'ai' && ed.pendingVoices().length) {
        label.textContent = t('Finishing the voiceover');
        const ok = await ed.waitForVoices((d, n) => {
          sub.textContent = t('Line {i} of {total}', { i: Math.min(d + 1, n), total: n });
          setP(n ? d / n : 0);
          if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        });
        if (!ok) throw new Error(ed.voiceError || t('The voice could not be finished.'));
      }
      if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      label.textContent = t('Mixing audio');
      sub.textContent = '';
      const snap = await ed.exportSnapshot();
      if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      label.textContent = t('Rendering video');
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
            label.textContent = t('Finishing the file');
            sub.textContent = '';
          } else if (info.frame) {
            const frame = t('Frame {i} of {total}', { i: info.frame, total: info.frames });
            sub.textContent = info.eta != null ? `${frame} · ${t('about {s}s left', { s: Math.max(1, Math.round(info.eta)) })}` : frame;
          }
        },
      });
      if (!license.pro) await recordExport();
      ed.project.exports = [...(ed.project.exports || []), { at: Date.now(), res, size: result.blob.size }];
      ed.save();
      doneView(result);
    } catch (e) {
      if (e.name === 'AbortError') {
        toast(t('Export cancelled'));
        if (dlg.panel.isConnected) optionsView();
        return;
      }
      console.error(e);
      clear(right);
      right.append(h('div', { class: 'note warn' }, h('strong', { text: t('Export didn’t finish') }), h('span', { text: e.message || String(e) })));
      dlg.setActions([
        { label: t('Close'), onClick: (close) => close() },
        { label: t('Try again'), kind: 'primary', onClick: () => optionsView() },
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
    const save = h('button', { class: 'btn primary big' }, icon('download', 20), t('Save MP4'));
    save.addEventListener('click', async () => {
      const r = await saveBlob(result.blob, name, { description: t('MP4 video'), mime: 'video/mp4', ext: '.mp4' });
      if (r !== 'cancelled') toast(r === 'saved' ? t('Video saved') : t('Video downloaded'));
    });
    const cover = h('button', { class: 'btn' }, icon('image', 16), t('Save cover image'));
    cover.addEventListener('click', async () => {
      const at = Math.min(ed.timeline.duration - 0.1, (ed.timeline.scenes[0]?.end || 2) * 0.6);
      const blob = await exportCover({ project: ed.project, timeline: ed.timeline, chunks: ed.chunks, watermark: !license.pro }, at);
      await saveBlob(blob, `${slugify(ed.project.title)}-cover.jpg`, { description: t('JPEG image'), mime: 'image/jpeg', ext: '.jpg' });
    });
    const codecs = `${String(result.videoCodec).toUpperCase()}${result.audioCodec ? ' / ' + String(result.audioCodec).toUpperCase() : ''}`;
    const codecNote = result.videoCodec !== 'avc' ? h('p', { class: 'hint', text: t('This PC saved the video as {codecs} instead of H.264. YouTube accepts it. If another app refuses the upload, install the Media Feature Pack (Windows N editions), update Microsoft Edge and export again.', { codecs }) }) : null;
    const links = h('div', { class: 'media-actions' });
    for (const l of UPLOAD_LINKS) links.append(h('a', { class: 'btn small', href: l.url, target: '_blank', rel: 'noopener' }, icon('external', 14), l.label));
    right.append(...[
      h('div', { class: 'note' }, h('strong', { text: t('Your video is ready') }), h('span', { text: `${joinList(t(RESOLUTIONS[res].label), fmtTime(result.seconds), fmtBytes(result.blob.size))}. ${t('Rendered in {s}s.', { s: Math.round(result.renderSeconds) })}` })),
      h('div', { class: 'row' }, save, cover),
      codecNote,
      h('div', { class: 'kit-block' }, h('div', { class: 'head' }, h('span', { text: t('Caption to paste') }), h('button', { class: 'btn small ghost', on: { click: () => copyText(kit.tiktok) } }, icon('copy', 14), t('Copy'))), h('textarea', { rows: 4, value: kit.tiktok, 'aria-label': t('Caption'), lang: langMeta(ed.project.lang).id, dir: 'auto' })),
      h('div', { class: 'group' }, h('span', { class: 'field-label', text: t('Upload it') }), links),
    ].filter(Boolean));
    dlg.setActions([{ label: t('Done'), onClick: (close) => close() }]);
  }

  optionsView();
}
