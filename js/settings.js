// Settings dialog: AI voices, stock footage key, AI script writer, storage, about.

import { h, icon, modal, toggle, field, toast, confirmDialog, clear } from './ui.js';
import { kvGet, kvSet, db, storageEstimate } from './db.js';
import { cleanupStorage } from './project.js';
import { engine, isModelCached, clearModelCache, ENGINE_SIZES, forgetClipsInMemory } from './tts.js';
import { onDeviceStatus, testRemote } from './ai.js';
import { fmtBytes } from './util.js';

export const APP_VERSION = '1.0.0';
export const SUPPORT_EMAIL = 'haymohsen@gmail.com';

export async function openSettings(focus = '') {
  const body = h('div', { class: 'settings' });
  const dlg = modal({ title: 'Settings', body, size: 'wide', actions: [{ label: 'Done', kind: 'primary', onClick: (c) => c() }] });

  // ---------------- voices
  const voiceSec = h('section', { id: 'set-voice' });
  const renderVoice = async () => {
    clear(voiceSec);
    const cached = await isModelCached();
    const gpuAvail = !!navigator.gpu;
    const gpu = await kvGet('voiceGpu', false);
    const st = engine.snapshot();
    const dl = h('button', { class: 'btn small', disabled: st.status === 'loading' || st.status === 'ready' }, icon('download', 14), cached ? 'Load voices now' : `Download voices (${ENGINE_SIZES.q8} MB)`);
    dl.addEventListener('click', async () => {
      dl.disabled = true;
      const off = engine.on((s) => (dl.textContent = s.status === 'loading' && s.total ? `Downloading ${Math.round(s.progress * 100)}%` : 'Loading…'));
      try {
        await engine.load();
        toast('AI voices are ready');
      } catch (e) {
        toast(e.message, { kind: 'error' });
      }
      off();
      renderVoice();
    });
    const rm = h('button', { class: 'btn small danger', disabled: !cached }, icon('trash', 14), 'Remove downloaded voices');
    rm.addEventListener('click', async () => {
      if (!(await confirmDialog('Remove the AI voice pack from this PC? It downloads again the next time you make a voiceover.', { okLabel: 'Remove', danger: true }))) return;
      await clearModelCache();
      forgetClipsInMemory();
      renderVoice();
    });
    voiceSec.append(...[
      h('h3', { text: 'AI voices' }),
      h('p', { text: cached ? 'The voice pack is on this PC. Voiceovers are made offline and nothing is uploaded.' : 'Voiceovers are made on this PC. The voice pack downloads once, the first time you need it.' }),
      h('div', { class: 'row' }, dl, rm),
      gpuAvail
        ? toggle(
            'Use the graphics card for faster voiceovers',
            gpu,
            async (v) => {
              await kvSet('voiceGpu', v);
              engine.terminate();
              toast(v ? `Faster mode is on. It downloads a larger voice pack (${ENGINE_SIZES.fp32} MB) once.` : 'Standard mode is on.');
            },
            { hint: `Downloads a larger ${ENGINE_SIZES.fp32} MB pack once. Turn off if voices sound wrong on your PC.` }
          )
        : null,
    ].filter(Boolean));
  };
  renderVoice();

  // ---------------- stock
  const keyInput = h('input', { type: 'password', placeholder: 'Paste your Pexels API key', value: (await kvGet('pexelsKey', '')) || '', autocomplete: 'off', spellcheck: false });
  const show = h('button', { class: 'btn small ghost', type: 'button', text: 'Show' });
  show.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    show.textContent = keyInput.type === 'password' ? 'Show' : 'Hide';
  });
  const saveKey = h('button', { class: 'btn small primary' }, 'Save key');
  saveKey.addEventListener('click', async () => {
    const k = keyInput.value.trim();
    if (k) {
      try {
        const r = await fetch('https://api.pexels.com/v1/search?query=nature&per_page=1', { headers: { Authorization: k } });
        if (!r.ok) throw new Error();
      } catch {
        toast('Pexels did not accept that key. Check it and try again.', { kind: 'error' });
        return;
      }
    }
    await kvSet('pexelsKey', k);
    toast(k ? 'Stock footage is on' : 'Pexels key removed');
  });
  const stockSec = h(
    'section',
    { id: 'set-stock' },
    h('h3', { text: 'Stock footage (Pexels)' }),
    h('p', {}, 'Free vertical clips and photos for your scenes. Create a free key at ', h('a', { href: 'https://www.pexels.com/api/', target: '_blank', rel: 'noopener' }, 'pexels.com/api'), ', then paste it here. Your key stays on this PC.'),
    h('div', { class: 'row' }, h('div', { style: { flex: '1', minWidth: '220px' } }, keyInput), show, saveKey)
  );

  // ---------------- AI writer
  const aiPref = await kvGet('aiWriter', 'auto');
  const od = await onDeviceStatus();
  const cfg = (await kvGet('aiRemote', null)) || {};
  const baseUrl = h('input', { type: 'url', placeholder: 'https://api.openai.com/v1', value: cfg.baseUrl || '' });
  const apiKey = h('input', { type: 'password', placeholder: 'API key', value: cfg.apiKey || '', autocomplete: 'off' });
  const model = h('input', { type: 'text', placeholder: 'Model name, e.g. gpt-4o-mini', value: cfg.model || '' });
  let remoteOn = !!cfg.enabled;
  const saveRemote = async () => kvSet('aiRemote', { baseUrl: baseUrl.value.trim(), apiKey: apiKey.value.trim(), model: model.value.trim(), enabled: remoteOn });
  [baseUrl, apiKey, model].forEach((el) => el.addEventListener('change', saveRemote));
  const test = h('button', { class: 'btn small' }, 'Test connection');
  test.addEventListener('click', async () => {
    await saveRemote();
    test.disabled = true;
    try {
      await testRemote({ baseUrl: baseUrl.value.trim(), apiKey: apiKey.value.trim(), model: model.value.trim() });
      toast('Connected. Scripts will be written by your AI.');
    } catch (e) {
      toast(`Connection failed: ${e.message}`, { kind: 'error' });
    }
    test.disabled = false;
  });
  const odText = { available: 'Built-in on-device AI is available and will write scripts for topics.', downloadable: 'Your browser offers on-device AI. It downloads on first use.', downloading: 'On-device AI is downloading.', unavailable: 'No built-in on-device AI on this PC. AutoShorts uses its own writer and Wikipedia facts.' };
  const aiSec = h(
    'section',
    { id: 'set-ai' },
    h('h3', { text: 'Script writer' }),
    h('p', { text: odText[od] || odText.unavailable }),
    toggle('Use an AI writer when one is available', aiPref !== 'off', (v) => kvSet('aiWriter', v ? 'auto' : 'off'), { hint: 'Off means scripts always come from the built-in writer' }),
    h('p', { text: 'Optional: connect any OpenAI-compatible service with your own key (OpenAI, Groq, OpenRouter, or a local LM Studio server). The key stays on this PC and is only sent to the address you enter.' }),
    h('div', { style: { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } }, field('Address', baseUrl), field('API key', apiKey), field('Model', model)),
    h('div', { class: 'row' }, toggle('Use this service', remoteOn, (v) => ((remoteOn = v), saveRemote())), test)
  );

  // ---------------- storage
  const est = await storageEstimate();
  const usage = h('p', { text: `AutoShorts is using ${fmtBytes(est.usage || 0)} on this PC (videos, voice lines, media and the voice pack).` });
  const tidy = h('button', { class: 'btn small' }, icon('refresh', 14), 'Free up space');
  tidy.addEventListener('click', async () => {
    tidy.disabled = true;
    try {
      const r = await cleanupStorage({ minAgeMs: 10 * 60 * 1000 });
      const parts = [];
      if (r.voices) parts.push(`${r.voices} unused voice ${r.voices === 1 ? 'line' : 'lines'}`);
      if (r.tracks) parts.push(`${r.tracks} unused music ${r.tracks === 1 ? 'track' : 'tracks'}`);
      toast(r.removed ? `Removed ${parts.join(' and ')} (${fmtBytes(r.bytes)})` : 'Nothing to remove. Everything stored is used by your videos.');
      const now = await storageEstimate();
      usage.textContent = `AutoShorts is using ${fmtBytes(now.usage || 0)} on this PC (videos, voice lines, media and the voice pack).`;
    } catch (e) {
      toast(`Could not free up space: ${e.message}`, { kind: 'error' });
    } finally {
      tidy.disabled = false;
    }
  });
  const storeSec = h(
    'section',
    {},
    h('h3', { text: 'Storage' }),
    usage,
    h('p', { class: 'hint', text: 'Free up space removes old voice lines and music tracks that none of your videos use. Your videos, photos and clips stay.' }),
    h('div', { class: 'row' }, tidy, h('button', {
      class: 'btn small danger',
      on: {
        click: async () => {
          if (!(await confirmDialog('Delete every video project, recording and imported file? The voice pack stays. This can’t be undone.', { title: 'Delete all videos', okLabel: 'Delete everything', danger: true }))) return;
          await db.clear('projects');
          await db.clear('assets');
          forgetClipsInMemory();
          toast('All videos deleted');
          location.hash = '#/';
          location.reload();
        },
      },
    }, icon('trash', 14), 'Delete all videos'))
  );

  // ---------------- about
  const aboutSec = h(
    'section',
    {},
    h('h3', { text: 'About' }),
    h('div', { class: 'kv' }, h('span', { text: 'Version' }), h('b', { text: APP_VERSION }), h('span', { text: 'Support' }), h('b', {}, h('a', { href: `mailto:${SUPPORT_EMAIL}` }, SUPPORT_EMAIL)), h('span', { text: 'Privacy' }), h('b', {}, h('a', { href: 'privacy.html', target: '_blank' }, 'Privacy policy')), h('span', { text: 'Credits' }), h('b', {}, h('a', { href: 'licenses.html', target: '_blank' }, 'Open-source licenses')))
  );

  body.append(voiceSec, stockSec, aiSec, storeSec, aboutSec);
  if (focus) {
    const el = body.querySelector(`#set-${focus}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }
  return dlg;
}
