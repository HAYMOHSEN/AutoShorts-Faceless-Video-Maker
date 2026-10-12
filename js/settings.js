// Settings dialog: AI voices, stock footage key, AI script writer, storage, about.

import { h, icon, modal, toggle, field, toast, confirmDialog, clear } from './ui.js';
import { kvGet, kvSet, db, storageEstimate } from './db.js';
import { cleanupStorage } from './project.js';
import { engine, isModelCached, clearModelCache, ENGINE_SIZES, forgetClipsInMemory, cachedPiperVoices, downloadSize, defaultVoice } from './tts.js';

const GERMAN_MB = downloadSize(defaultVoice('de'));
import { onDeviceStatus, testRemote } from './ai.js';
import { fmtBytes } from './util.js';
import { t, tx, UI_LANGS, uiLang, setUiLang } from './i18n.js';

export const APP_VERSION = '1.0.0';
export const SUPPORT_EMAIL = 'haymohsen@gmail.com';

export async function openSettings(focus = '') {
  const body = h('div', { class: 'settings' });
  const dlg = modal({ title: t('Settings'), body, size: 'wide', actions: [{ label: t('Done'), kind: 'primary', onClick: (c) => c() }] });

  // ---------------- language
  const langSel = h('select', { 'aria-label': t('App language') });
  for (const l of UI_LANGS) langSel.append(h('option', { value: l.id, text: l.name, lang: l.locale, selected: l.id === uiLang() }));
  langSel.addEventListener('change', () => setUiLang(langSel.value));
  const langSec = h(
    'section',
    { id: 'set-language' },
    h('h3', { text: t('Language') }),
    h('div', { class: 'row' }, h('div', { style: { minWidth: '220px' } }, field(t('App language'), langSel))),
    h('p', { class: 'hint', text: t('Menus and buttons use this language. You choose the language of each video when you make it.') })
  );

  // ---------------- voices
  const voiceSec = h('section', { id: 'set-voice' });
  const renderVoice = async () => {
    clear(voiceSec);
    const cached = await isModelCached();
    const gpuAvail = !!navigator.gpu;
    const gpu = await kvGet('voiceGpu', false);
    const german = await cachedPiperVoices();
    const st = engine.snapshot();
    const kokoroBusy = st.kind === 'kokoro' && (st.status === 'loading' || st.status === 'ready');
    const dl = h('button', { class: 'btn small', disabled: kokoroBusy }, icon('download', 14), cached ? t('Load voices now') : t('Download voices ({mb} MB)', { mb: ENGINE_SIZES.q8 }));
    dl.addEventListener('click', async () => {
      dl.disabled = true;
      const off = engine.on((s) => (dl.textContent = s.status === 'loading' && s.total ? t('Downloading {pct}%', { pct: Math.round(s.progress * 100) }) : t('Loading…')));
      try {
        await engine.load();
        toast(t('AI voices are ready'));
      } catch (e) {
        toast(e.message, { kind: 'error' });
      }
      off();
      renderVoice();
    });
    const rm = h('button', { class: 'btn small danger', disabled: !cached && !german.length }, icon('trash', 14), t('Remove downloaded voices'));
    rm.addEventListener('click', async () => {
      if (!(await confirmDialog(t('Remove the AI voices from this PC? They download again the next time you make a voiceover.'), { okLabel: t('Remove'), danger: true }))) return;
      await clearModelCache();
      forgetClipsInMemory();
      renderVoice();
    });
    voiceSec.append(...[
      h('h3', { text: t('AI voices') }),
      h('p', { text: cached ? t('The voice pack is on this PC. Voiceovers are made offline and nothing is uploaded.') : t('Voiceovers are made on this PC. The voice pack downloads once, the first time you need it.') }),
      h('p', { class: 'hint', text: t('The voice pack speaks English, Spanish, French, Portuguese and Hindi. The German voice downloads separately (about {mb} MB) the first time you use it.', { mb: GERMAN_MB }) }),
      german.length ? h('p', { class: 'hint', text: t('German voices on this PC: {names}', { names: german.map((v) => v.name).join(', ') }) }) : null,
      h('div', { class: 'row' }, dl, rm),
      gpuAvail
        ? toggle(
            t('Use the graphics card for faster voiceovers'),
            gpu,
            async (v) => {
              await kvSet('voiceGpu', v);
              engine.terminate();
              toast(v ? t('Faster mode is on. It downloads a larger voice pack ({mb} MB) once.', { mb: ENGINE_SIZES.fp32 }) : t('Standard mode is on.'));
            },
            { hint: t('Downloads a larger {mb} MB pack once. Turn off if voices sound wrong on your PC.', { mb: ENGINE_SIZES.fp32 }) }
          )
        : null,
    ].filter(Boolean));
  };
  renderVoice();

  // ---------------- stock
  const keyInput = h('input', { type: 'password', placeholder: t('Paste your Pexels API key'), value: (await kvGet('pexelsKey', '')) || '', autocomplete: 'off', spellcheck: false, dir: 'ltr' });
  const show = h('button', { class: 'btn small ghost', type: 'button', text: t('Show') });
  show.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    show.textContent = keyInput.type === 'password' ? t('Show') : t('Hide');
  });
  const saveKey = h('button', { class: 'btn small primary' }, t('Save key'));
  saveKey.addEventListener('click', async () => {
    const k = keyInput.value.trim();
    if (k) {
      try {
        const r = await fetch('https://api.pexels.com/v1/search?query=nature&per_page=1', { headers: { Authorization: k } });
        if (!r.ok) throw new Error();
      } catch {
        toast(t('Pexels did not accept that key. Check it and try again.'), { kind: 'error' });
        return;
      }
    }
    await kvSet('pexelsKey', k);
    toast(k ? t('Stock footage is on') : t('Pexels key removed'));
  });
  const stockSec = h(
    'section',
    { id: 'set-stock' },
    h('h3', { text: t('Stock footage (Pexels)') }),
    h('p', {}, ...tx('Free vertical clips and photos for your scenes. Create a free key at {link}, then paste it here. Your key stays on this PC.', { link: h('a', { href: 'https://www.pexels.com/api/', target: '_blank', rel: 'noopener' }, 'pexels.com/api') })),
    h('div', { class: 'row' }, h('div', { style: { flex: '1', minWidth: '220px' } }, keyInput), show, saveKey)
  );

  // ---------------- AI writer
  const aiPref = await kvGet('aiWriter', 'auto');
  const od = await onDeviceStatus();
  const cfg = (await kvGet('aiRemote', null)) || {};
  const baseUrl = h('input', { type: 'url', placeholder: 'https://api.openai.com/v1', value: cfg.baseUrl || '', dir: 'ltr' });
  const apiKey = h('input', { type: 'password', placeholder: t('API key'), value: cfg.apiKey || '', autocomplete: 'off', dir: 'ltr' });
  const model = h('input', { type: 'text', placeholder: t('Model name, e.g. gpt-4o-mini'), value: cfg.model || '', dir: 'ltr' });
  let remoteOn = !!cfg.enabled;
  const saveRemote = async () => kvSet('aiRemote', { baseUrl: baseUrl.value.trim(), apiKey: apiKey.value.trim(), model: model.value.trim(), enabled: remoteOn });
  [baseUrl, apiKey, model].forEach((el) => el.addEventListener('change', saveRemote));
  const test = h('button', { class: 'btn small' }, t('Test connection'));
  test.addEventListener('click', async () => {
    await saveRemote();
    test.disabled = true;
    try {
      await testRemote({ baseUrl: baseUrl.value.trim(), apiKey: apiKey.value.trim(), model: model.value.trim() });
      toast(t('Connected. Scripts will be written by your AI.'));
    } catch (e) {
      toast(t('Connection failed: {error}', { error: e.message }), { kind: 'error' });
    }
    test.disabled = false;
  });
  const odText = {
    available: t('Built-in on-device AI is available and will write scripts for topics.'),
    downloadable: t('Your browser offers on-device AI. It downloads on first use.'),
    downloading: t('On-device AI is downloading.'),
    unavailable: t('No built-in on-device AI on this PC. AutoShorts uses its own writer and Wikipedia facts.'),
  };
  const aiSec = h(
    'section',
    { id: 'set-ai' },
    h('h3', { text: t('Script writer') }),
    h('p', { text: odText[od] || odText.unavailable }),
    toggle(t('Use an AI writer when one is available'), aiPref !== 'off', (v) => kvSet('aiWriter', v ? 'auto' : 'off'), { hint: t('Off means scripts always come from the built-in writer') }),
    h('p', { text: t('Optional: connect any OpenAI-compatible service with your own key (OpenAI, Groq, OpenRouter, or a local LM Studio server). The key stays on this PC and is only sent to the address you enter.') }),
    h('div', { style: { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } }, field(t('Address'), baseUrl), field(t('API key'), apiKey), field(t('Model'), model)),
    h('div', { class: 'row' }, toggle(t('Use this service'), remoteOn, (v) => ((remoteOn = v), saveRemote())), test)
  );

  // ---------------- storage
  const est = await storageEstimate();
  const usageText = (bytes) => t('AutoShorts is using {size} on this PC (videos, voice lines, media and the voice pack).', { size: fmtBytes(bytes || 0) });
  const usage = h('p', { text: usageText(est.usage) });
  const tidy = h('button', { class: 'btn small' }, icon('refresh', 14), t('Free up space'));
  tidy.addEventListener('click', async () => {
    tidy.disabled = true;
    try {
      const r = await cleanupStorage({ minAgeMs: 10 * 60 * 1000 });
      const parts = [];
      if (r.voices) parts.push(t('{n} unused voice lines', { n: r.voices }));
      if (r.tracks) parts.push(t('{n} unused music tracks', { n: r.tracks }));
      toast(r.removed ? t('Removed {what} ({size})', { what: parts.join(', '), size: fmtBytes(r.bytes) }) : t('Nothing to remove. Everything stored is used by your videos.'));
      const now = await storageEstimate();
      usage.textContent = usageText(now.usage);
    } catch (e) {
      toast(t('Could not free up space: {error}', { error: e.message }), { kind: 'error' });
    } finally {
      tidy.disabled = false;
    }
  });
  const storeSec = h(
    'section',
    {},
    h('h3', { text: t('Storage') }),
    usage,
    h('p', { class: 'hint', text: t('Free up space removes old voice lines and music tracks that none of your videos use. Your videos, photos and clips stay.') }),
    h('div', { class: 'row' }, tidy, h('button', {
      class: 'btn small danger',
      on: {
        click: async () => {
          if (!(await confirmDialog(t('Delete every video project, recording and imported file? The voice pack stays. This can’t be undone.'), { title: t('Delete all videos'), okLabel: t('Delete everything'), danger: true }))) return;
          await db.clear('projects');
          await db.clear('assets');
          forgetClipsInMemory();
          toast(t('All videos deleted'));
          location.hash = '#/';
          location.reload();
        },
      },
    }, icon('trash', 14), t('Delete all videos')))
  );

  // ---------------- about
  const aboutSec = h(
    'section',
    {},
    h('h3', { text: t('About') }),
    h('div', { class: 'kv' }, h('span', { text: t('Version') }), h('b', { text: APP_VERSION }), h('span', { text: t('Support') }), h('b', {}, h('a', { href: `mailto:${SUPPORT_EMAIL}` }, SUPPORT_EMAIL)), h('span', { text: t('Privacy') }), h('b', {}, h('a', { href: 'privacy.html', target: '_blank' }, t('Privacy policy'))), h('span', { text: t('Credits') }), h('b', {}, h('a', { href: 'licenses.html', target: '_blank' }, t('Open-source licenses'))))
  );

  body.append(langSec, voiceSec, stockSec, aiSec, storeSec, aboutSec);
  if (focus) {
    const el = body.querySelector(`#set-${focus}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }
  return dlg;
}
