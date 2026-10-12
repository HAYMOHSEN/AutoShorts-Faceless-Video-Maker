// Record one scene line with the microphone (teleprompter, level meter, retake).

import { h, modal, clear, toast } from './ui.js';
import { t } from './i18n.js';

/** @returns {Promise<{pcm: Float32Array, sampleRate: number}|null>} */
export function openRecorder(text, lang = 'en') {
  return new Promise((resolve) => {
    let stream = null;
    let rec = null;
    let chunks = [];
    let take = null;
    let actx = null;
    let raf = 0;
    let result = null;
    let playing = null;

    const meter = h('div', { class: 'meter' }, h('i'));
    const status = h('p', { class: 'hint', text: t('Read the line at your natural pace. Recording starts after a short countdown.') });
    const body = h('div', { style: { display: 'grid', gap: '14px' } }, h('div', { class: 'teleprompter', text: text, lang, dir: 'auto' }), meter, status);
    const dlg = modal({
      title: t('Record this line'),
      body,
      onClose: () => {
        cleanup();
        resolve(result);
      },
    });

    function cleanup() {
      cancelAnimationFrame(raf);
      if (rec && rec.state !== 'inactive') rec.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (playing) playing.stop();
      if (actx) actx.close().catch(() => {});
    }

    function idle() {
      dlg.setActions([
        { label: t('Cancel'), onClick: (close) => close() },
        { label: take ? t('Record again') : t('Start recording'), kind: 'rec', icon: 'mic', onClick: start },
        ...(take ? [{ label: t('Play take'), icon: 'play', onClick: playTake }, { label: t('Use this take'), kind: 'primary', onClick: useTake }] : []),
      ]);
    }

    async function start() {
      try {
        if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        status.textContent = t('Microphone access was blocked. Allow the microphone for AutoShorts in Windows Settings › Privacy › Microphone, then try again.');
        return;
      }
      if (!actx) actx = new AudioContext();
      const src = actx.createMediaStreamSource(stream);
      const an = actx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const data = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        meter.firstChild.style.width = `${Math.min(100, peak * 140)}%`;
        raf = requestAnimationFrame(tick);
      };
      tick();
      dlg.setActions([{ label: t('Cancel'), onClick: (close) => close() }]);
      for (const n of [3, 2, 1]) {
        status.textContent = t('Recording in {n}…', { n });
        await new Promise((r) => setTimeout(r, 650));
      }
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = finish;
      rec.start();
      clear(status);
      status.append(h('span', { class: 'rec-dot' }), ' ' + t('Recording — press Stop when you finish the line.'));
      dlg.setActions([{ label: t('Stop'), kind: 'rec', icon: 'stop', onClick: () => rec.state !== 'inactive' && rec.stop() }]);
    }

    async function finish() {
      cancelAnimationFrame(raf);
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const buf = await actx.decodeAudioData(await blob.arrayBuffer());
        const ch0 = buf.getChannelData(0);
        const pcm = new Float32Array(ch0.length);
        if (buf.numberOfChannels > 1) {
          const ch1 = buf.getChannelData(1);
          for (let i = 0; i < pcm.length; i++) pcm[i] = (ch0[i] + ch1[i]) / 2;
        } else pcm.set(ch0);
        let peak = 0;
        for (const v of pcm) peak = Math.max(peak, Math.abs(v));
        if (peak < 0.01) {
          status.textContent = t('That take was silent. Check the microphone and try again.');
          take = null;
          idle();
          return;
        }
        const g = Math.min(8, 0.9 / peak);
        for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
        take = { pcm, sampleRate: buf.sampleRate };
        status.textContent = t('Take recorded ({s}s). Play it back or use it.', { s: (pcm.length / buf.sampleRate).toFixed(1) });
      } catch (e) {
        status.textContent = t('Could not read that recording. Try again.');
        take = null;
      }
      idle();
    }

    function playTake() {
      if (!take) return;
      if (playing) playing.stop();
      const b = actx.createBuffer(1, take.pcm.length, take.sampleRate);
      b.copyToChannel(take.pcm, 0);
      const s = actx.createBufferSource();
      s.buffer = b;
      s.connect(actx.destination);
      s.start();
      playing = s;
    }

    function useTake(close) {
      result = take;
      close();
      toast(t('Recording added to the scene'));
    }

    idle();
  });
}
