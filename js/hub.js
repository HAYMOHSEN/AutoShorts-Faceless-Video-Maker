// Hub: create a new video and browse saved ones.

import { h, icon, seg, toast, modal, confirmDialog, clear } from './ui.js';
import { FORMATS, topicAsQuestion, analyzeLine, estimateSeconds } from './script.js';
import { VOICES, voiceById, previewVoice, engine, isModelCached, ENGINE_SIZES } from './tts.js';
import { MOODS, previewMusic, moodById } from './music.js';
import { LOOKS, lookById, drawLookSwatch, autoLook, paletteOf } from './visuals.js';
import { CAPTION_STYLES, buildChunks } from './captions.js';
import { Renderer } from './renderer.js';
import { buildTimeline } from './timeline.js';
import { defaultSettings, listProjects, deleteProject, duplicateProject } from './project.js';
import { generateProject, NeedsScriptError } from './generate.js';
import { license, allowed } from './license.js';
import { kvGet, kvSet } from './db.js';
import { playPreview, stopPreview } from './player.js';
import { pexelsKey } from './stock.js';
import { fmtTime, relativeDate } from './util.js';
import { loadFonts } from './fonts.js';

const IDEAS = [
  'Why do octopuses have three hearts?',
  'How the pyramids were built',
  'Why do cats purr?',
  'What is a black hole?',
  'How compound interest works',
  'Why do we dream?',
  'The history of coffee',
  'How honeybees make honey',
  'Why is the ocean salty?',
  'How does caffeine work?',
];

const LENGTHS = [15, 30, 45, 60, 90];

export async function renderHub(root, { navigate, openPro }) {
  const prefs = Object.assign(
    { mode: 'topic', seconds: 30, format: 'facts', voiceId: 'af_heart', mood: 'lofi', look: 'auto', captionStyle: 'pop', visuals: 'animated' },
    (await kvGet('hubPrefs', {})) || {}
  );
  const drafts = (await kvGet('hubDrafts', {})) || {};
  let disposed = false;
  const save = () => kvSet('hubPrefs', prefs);
  const saveDraft = () => kvSet('hubDrafts', drafts);
  if (prefs.voiceId !== '__none' && !allowed(voiceById(prefs.voiceId))) prefs.voiceId = 'af_heart';
  if (prefs.mood !== 'none' && !allowed(moodById(prefs.mood))) prefs.mood = 'lofi';
  if (prefs.look !== 'auto' && !allowed(lookById(prefs.look))) prefs.look = 'auto';

  clear(root);
  const hub = h('div', { class: 'hub' });
  root.append(hub);

  // ---------------------------------------------------------- compose column
  const inputHost = h('div');
  const suggest = h('div', { class: 'suggest' });
  let inputEl = null;

  const modeSeg = seg(
    [
      { value: 'topic', label: 'Topic' },
      { value: 'article', label: 'Article' },
      { value: 'script', label: 'My script' },
    ],
    prefs.mode,
    (v) => {
      prefs.mode = v;
      modeSeg.set(v);
      save();
      buildInput();
      refreshPreview();
    },
    { label: 'What you are starting from' }
  );

  function buildInput() {
    clear(inputHost);
    clear(suggest);
    const m = prefs.mode;
    if (m === 'topic') {
      inputEl = h('input', { type: 'text', class: 'topic-input', placeholder: 'Why do octopuses have three hearts?', value: drafts.topic || '', 'aria-label': 'Video topic', maxlength: 160 });
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startGenerate();
      });
      const ideas = [...IDEAS].sort(() => Math.random() - 0.5).slice(0, 4);
      for (const idea of ideas) {
        suggest.append(
          h('button', {
            class: 'chip',
            type: 'button',
            text: idea,
            on: {
              click: () => {
                inputEl.value = idea;
                drafts.topic = idea;
                saveDraft();
                refreshPreview();
                inputEl.focus();
              },
            },
          })
        );
      }
    } else {
      const placeholder =
        m === 'article'
          ? 'Paste an article, blog post or notes. AutoShorts picks the strongest facts and writes a hook and a call to action.'
          : 'Write one line per scene.\nThe first line is your hook.\nThe last line can be your call to action.';
      inputEl = h('textarea', { class: 'article-input', placeholder, value: drafts[m] || '', 'aria-label': m === 'article' ? 'Article text' : 'Your script', rows: 8 });
    }
    inputEl.addEventListener('input', () => {
      drafts[prefs.mode] = inputEl.value;
      saveDraft();
      refreshPreview();
    });
    inputHost.append(inputEl);
    suggest.hidden = m !== 'topic';
  }

  const lengthSeg = seg(
    LENGTHS.map((s) => ({ value: s, label: `${s}s` })),
    prefs.seconds,
    (v) => {
      prefs.seconds = v;
      lengthSeg.set(v);
      save();
    },
    { label: 'Video length' }
  );
  const formatSeg = seg(
    FORMATS.map((f) => ({ value: f.id, label: f.name, title: f.hint })),
    prefs.format,
    (v) => {
      prefs.format = v;
      formatSeg.set(v);
      save();
    },
    { label: 'Format' }
  );

  // voice
  const voiceSelect = h('select', { 'aria-label': 'Voice' });
  const fillVoices = () => {
    clear(voiceSelect);
    const groups = { American: h('optgroup', { label: 'American English' }), British: h('optgroup', { label: 'British English' }) };
    for (const v of VOICES) {
      const ok = allowed(v);
      groups[v.accent].append(h('option', { value: v.id, text: `${v.name} — ${v.desc}${ok ? '' : ' (Pro)'}`, disabled: !ok, selected: v.id === prefs.voiceId }));
    }
    voiceSelect.append(groups.American, groups.British, h('option', { value: '__none', text: 'No voice (captions and music only)', selected: prefs.voiceId === '__none' }));
  };
  fillVoices();
  voiceSelect.addEventListener('change', () => {
    prefs.voiceId = voiceSelect.value;
    save();
  });
  const voicePlay = h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Play voice sample', title: 'Play a sample' }, icon('play'));
  voicePlay.addEventListener('click', async () => {
    if (prefs.voiceId === '__none') return;
    if (!(await confirmVoiceDownload())) return;
    voicePlay.disabled = true;
    const closeToast = engine.status === 'ready' ? null : toast('Getting the AI voices ready…', { timeout: 60000 });
    try {
      const clip = await previewVoice(prefs.voiceId);
      closeToast && closeToast();
      playPreview(clip);
    } catch (e) {
      closeToast && closeToast();
      toast(e.message, { kind: 'error' });
    } finally {
      voicePlay.disabled = false;
    }
  });

  // music
  const musicSelect = h('select', { 'aria-label': 'Music' });
  const fillMusic = () => {
    clear(musicSelect);
    for (const m of MOODS) {
      const ok = allowed(m);
      musicSelect.append(h('option', { value: m.id, text: `${m.name} — ${m.desc}${ok ? '' : ' (Pro)'}`, disabled: !ok, selected: m.id === prefs.mood }));
    }
    musicSelect.append(h('option', { value: 'none', text: 'No music', selected: prefs.mood === 'none' }));
  };
  fillMusic();
  musicSelect.addEventListener('change', () => {
    prefs.mood = musicSelect.value;
    save();
    refreshPreview();
  });
  let musicPlaying = false;
  const musicPlay = h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Play music sample', title: 'Play a sample' }, icon('play'));
  musicPlay.addEventListener('click', async () => {
    if (musicPlaying) {
      stopPreview();
      return;
    }
    if (prefs.mood === 'none') return;
    musicPlay.disabled = true;
    try {
      const buf = await previewMusic(prefs.mood);
      musicPlaying = true;
      musicPlay.replaceChildren(icon('stop'));
      playPreview(buf, {
        onEnd: () => {
          musicPlaying = false;
          musicPlay.replaceChildren(icon('play'));
        },
      });
    } finally {
      musicPlay.disabled = false;
    }
  });

  // captions
  const capSelect = h('select', { 'aria-label': 'Caption style' });
  for (const s of CAPTION_STYLES) {
    const ok = allowed(s);
    capSelect.append(h('option', { value: s.id, text: s.name + (ok ? '' : ' (Pro)'), disabled: !ok, selected: s.id === prefs.captionStyle }));
  }
  if (!allowed(CAPTION_STYLES.find((s) => s.id === prefs.captionStyle))) prefs.captionStyle = 'pop';
  capSelect.value = prefs.captionStyle;
  capSelect.addEventListener('change', () => {
    prefs.captionStyle = capSelect.value;
    save();
    refreshPreview();
  });

  // looks
  const looksRow = h('div', { class: 'looks', role: 'radiogroup', 'aria-label': 'Look' });
  const renderLooks = () => {
    clear(looksRow);
    const autoBtn = h('button', { class: 'look auto', type: 'button', role: 'radio', 'aria-checked': String(prefs.look === 'auto'), title: 'Pick a look that matches the topic' }, h('span', { class: 'lk' }, h('canvas', { width: 54, height: 96 })), h('span', { text: 'Match topic' }));
    autoBtn.addEventListener('click', () => setLook('auto'));
    looksRow.append(autoBtn);
    for (const l of LOOKS) {
      const ok = allowed(l);
      const c = h('canvas', { width: 108, height: 192 });
      drawLookSwatch(c, l.id);
      const b = h('button', { class: 'look', type: 'button', role: 'radio', 'aria-checked': String(prefs.look === l.id), title: ok ? l.name : `${l.name} (Pro)` }, h('span', { class: 'lk' }, c, ok ? null : icon('lock', 11)), h('span', { text: l.name }));
      b.addEventListener('click', () => (ok ? setLook(l.id) : openPro('looks')));
      looksRow.append(b);
    }
  };
  const setLook = (id) => {
    prefs.look = id;
    save();
    renderLooks();
    refreshPreview();
  };

  // visuals source
  const visualsSeg = seg(
    [
      { value: 'animated', label: 'Animated backgrounds' },
      { value: 'stock', label: 'Stock footage' },
    ],
    prefs.visuals,
    async (v) => {
      if (v === 'stock' && !(await pexelsKey())) {
        toast('Add your free Pexels API key in Settings to use stock footage.', { action: 'Open Settings', onAction: () => document.dispatchEvent(new CustomEvent('open-settings', { detail: 'stock' })) });
        return;
      }
      prefs.visuals = v;
      visualsSeg.set(v);
      save();
    },
    { label: 'Background visuals' }
  );

  const genBtn = h('button', { class: 'btn primary big', type: 'button', on: { click: () => startGenerate() } }, icon('sparkle', 20), 'Generate video');
  const fine = h('span', { class: 'fine' });
  const updateFine = async () => {
    const { quota, resetText } = await import('./license.js');
    if (license.pro) fine.textContent = 'Pro: unlimited 1080p exports, no watermark.';
    else {
      const q = await quota();
      fine.textContent = `Free plan: ${q.left} of ${q.limit} exports left this week (720p with a small watermark). ${resetText(q.resets)}.`;
    }
  };
  updateFine();

  const compose = h(
    'div',
    { class: 'compose' },
    h('h1', { class: 'display', text: 'What’s your video about?' }),
    h('div', { class: 'mode-row' }, modeSeg),
    inputHost,
    suggest,
    h(
      'div',
      { class: 'options' },
      h('span', { class: 'label', text: 'Length' }),
      lengthSeg,
      h('span', { class: 'label', text: 'Format' }),
      formatSeg,
      h('span', { class: 'label', text: 'Voice' }),
      h('div', { class: 'inline-pick' }, voiceSelect, voicePlay),
      h('span', { class: 'label', text: 'Music' }),
      h('div', { class: 'inline-pick' }, musicSelect, musicPlay),
      h('span', { class: 'label', text: 'Captions' }),
      h('div', { class: 'inline-pick' }, capSelect),
      h('span', { class: 'label', text: 'Look' }),
      looksRow,
      h('span', { class: 'label', text: 'Visuals' }),
      visualsSeg
    )
  );

  // ---------------------------------------------------------- live hook preview
  const pv = h('canvas', { width: 540, height: 960, 'aria-label': 'Preview of your hook' });
  const stageCol = h(
    'div',
    { class: 'stage-col' },
    h('div', { class: 'phone' }, pv),
    h('p', { class: 'stage-note', text: 'Live preview of your opening line.' }),
    h('div', { class: 'generate-row' }, genBtn, fine)
  );
  hub.append(h('div', { class: 'compose-wrap' }, compose, stageCol));

  const renderer = new Renderer(pv);
  let pvData = null;
  let pvStart = performance.now();
  let raf = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hookText() {
    const raw = inputEl ? inputEl.value.trim() : '';
    if (!raw) return 'Your topic becomes the hook';
    if (prefs.mode === 'topic') return topicAsQuestion(raw) || raw.charAt(0).toUpperCase() + raw.slice(1);
    const first = raw.split('\n').map((l) => l.trim()).find(Boolean) || raw;
    return first.length > 110 ? first.slice(0, 107).replace(/\s+\S*$/, '') + '…' : first;
  }

  async function refreshPreview() {
    await loadFonts();
    if (disposed) return;
    const text = hookText();
    const a = analyzeLine(text, 'hook');
    const lookId = prefs.look === 'auto' ? autoLook(text, allowed) : prefs.look;
    const settings = defaultSettings({ look: lookId, captionStyle: prefs.captionStyle, mood: prefs.mood, highlight: paletteOf(lookId).hi });
    settings.voice.mode = 'none';
    settings.music.beatSync = false;
    settings.visuals.titleBanner = 'off';
    const project = { id: 'preview', title: '', scenes: [{ id: 'pv-' + lookId, kind: 'hook', text, keyword: a.keyword, emoji: a.emoji, stat: null, visual: null }], settings };
    const tl = buildTimeline(project, new Map());
    tl.duration = Math.max(tl.duration + 0.8, estimateSeconds(text) + 1.2);
    tl.scenes[0].end = tl.duration;
    const chunks = buildChunks(tl, project, settings.captions);
    pvData = { project, timeline: tl, chunks, media: null, watermark: false };
    renderer.setData(pvData);
    pvStart = performance.now();
    if (reduced) renderer.draw(Math.min(tl.duration - 0.2, 2.2));
  }

  const loop = () => {
    if (disposed) return;
    if (pvData && !reduced && document.visibilityState === 'visible') {
      const d = pvData.timeline.duration;
      const t = ((performance.now() - pvStart) / 1000) % d;
      renderer.draw(t);
    }
    raf = requestAnimationFrame(loop);
  };

  buildInput();
  renderLooks();
  refreshPreview();
  raf = requestAnimationFrame(loop);

  // ---------------------------------------------------------- library
  const libGrid = h('div', { class: 'projects' });
  const libCount = h('span', { class: 'fine' });
  hub.append(h('section', { class: 'library' }, h('div', { class: 'library-head' }, h('h2', { text: 'Your videos' }), libCount), libGrid));

  async function renderLibrary() {
    const list = await listProjects();
    clear(libGrid);
    libCount.textContent = list.length ? `${list.length} saved on this PC` : '';
    if (!list.length) {
      libGrid.append(h('div', { class: 'empty' }, h('strong', { text: 'No videos yet' }), h('span', { text: 'Type a topic above and press Generate video. Your projects are saved here automatically.' })));
      return;
    }
    for (const p of list) {
      const frame = h('button', { class: 'proj-frame', type: 'button', 'aria-label': `Open ${p.title}`, on: { click: () => navigate(`#/edit/${p.id}`) } });
      if (p.thumb) frame.append(h('img', { src: p.thumb, alt: '' }));
      else {
        const c = h('canvas', { width: 108, height: 192, style: { width: '100%', height: '100%', display: 'block' } });
        drawLookSwatch(c, p.settings.visuals.look);
        frame.append(c);
      }
      const menu = h(
        'div',
        { class: 'proj-menu' },
        h('button', {
          class: 'btn icon small',
          title: 'Duplicate',
          'aria-label': 'Duplicate',
          on: {
            click: async () => {
              await duplicateProject(p);
              renderLibrary();
            },
          },
        }, icon('dup', 15)),
        h('button', {
          class: 'btn icon small',
          title: 'Delete',
          'aria-label': 'Delete',
          on: {
            click: async () => {
              if (await confirmDialog(`Delete “${p.title}”? This can’t be undone.`, { title: 'Delete video', okLabel: 'Delete', danger: true })) {
                await deleteProject(p.id);
                renderLibrary();
              }
            },
          },
        }, icon('trash', 15))
      );
      libGrid.append(
        h(
          'div',
          { class: 'proj' },
          frame,
          menu,
          h('div', { class: 'proj-title', text: p.title }),
          h('div', { class: 'proj-meta' }, h('span', { text: p.duration ? fmtTime(p.duration) : `${p.seconds}s` }), h('span', { text: relativeDate(p.updated) }))
        )
      );
    }
  }
  renderLibrary();

  const offLicense = license.on(() => {
    fillVoices();
    fillMusic();
    renderLooks();
    updateFine();
  });

  // ---------------------------------------------------------- generate
  async function confirmVoiceDownload() {
    if (engine.status === 'ready' || (await isModelCached())) return true;
    if (!navigator.onLine) {
      toast('Connect to the internet once to download the AI voices.', { kind: 'error' });
      return false;
    }
    if (await kvGet('voiceConsent', false)) return true;
    const ok = await confirmDialog(`AutoShorts makes voiceovers on your PC. The voice pack (about ${ENGINE_SIZES.q8} MB) downloads once and then works offline.`, { title: 'Download AI voices', okLabel: 'Download' });
    if (ok) await kvSet('voiceConsent', true);
    return ok;
  }

  async function startGenerate() {
    const input = inputEl ? inputEl.value.trim() : '';
    if (!input) {
      toast(prefs.mode === 'topic' ? 'Type a topic first.' : prefs.mode === 'article' ? 'Paste an article first.' : 'Write a few lines first.');
      inputEl && inputEl.focus();
      return;
    }
    const voiceOn = prefs.voiceId !== '__none';
    if (voiceOn && !(await confirmVoiceDownload())) return;
    stopPreview();
    const ctrl = new AbortController();
    const stepsEl = h('ol', { class: 'steps' });
    const STEP_LIST = [
      ['script', 'Writing the script'],
      ['look', 'Choosing visuals'],
      ...(voiceOn ? [['voice', 'Preparing the AI voice']] : []),
    ];
    const items = new Map();
    for (const [id, label] of STEP_LIST) {
      const sub = h('span', { class: 'sub' });
      const li = h('li', {}, h('span', {}, h('span', { class: 'lbl', text: label }), sub));
      items.set(id, { li, sub, lbl: li.querySelector('.lbl') });
      stepsEl.append(li);
    }
    const bar = h('div', { class: 'progress', hidden: true }, h('i'));
    const dlg = modal({
      title: 'Making your video',
      body: h('div', { style: { display: 'grid', gap: '16px' } }, stepsEl, bar),
      actions: [{ label: 'Cancel', onClick: (close) => (ctrl.abort(), close()) }],
      dismissable: false,
      size: 'small',
    });
    let current = null;
    const onStep = (id, label, detail = '', progress) => {
      const ids = [...items.keys()];
      const idx = ids.indexOf(id);
      ids.forEach((k, i) => {
        const it = items.get(k);
        it.li.className = i < idx ? 'done' : i === idx ? 'active' : '';
      });
      const it = items.get(id);
      if (it) {
        it.lbl.textContent = label;
        it.sub.textContent = detail || '';
      }
      if (typeof progress === 'number') {
        bar.hidden = false;
        bar.firstChild.style.width = `${Math.round(progress * 100)}%`;
      } else if (current !== id) bar.hidden = true;
      current = id;
    };
    try {
      const project = await generateProject(
        {
          mode: prefs.mode,
          input,
          format: prefs.format,
          seconds: prefs.seconds,
          voiceId: voiceOn ? prefs.voiceId : 'af_heart',
          voiceMode: voiceOn ? 'ai' : 'none',
          mood: prefs.mood,
          look: prefs.look,
          captionStyle: prefs.captionStyle,
          visuals: prefs.visuals,
        },
        { onStep, signal: ctrl.signal }
      );
      dlg.close();
      if (project.voiceError) toast(`Voice: ${project.voiceError}`, { kind: 'error', timeout: 7000 });
      navigate(`#/edit/${project.id}`);
    } catch (e) {
      dlg.close();
      if (e.name === 'AbortError') return;
      if (e instanceof NeedsScriptError) {
        prefs.mode = 'script';
        drafts.script = e.outline;
        saveDraft();
        save();
        modeSeg.set('script');
        buildInput();
        refreshPreview();
        toast(e.message, { timeout: 8000 });
        inputEl.focus();
        return;
      }
      console.error(e);
      toast(e.message || 'Something went wrong while making the video.', { kind: 'error', timeout: 7000 });
    }
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    offLicense();
    stopPreview();
  };
}
