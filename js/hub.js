// Hub: create a new video and browse saved ones.

import { h, icon, seg, toast, modal, confirmDialog, clear } from './ui.js';
import { FORMATS, topicAsQuestion, analyzeLine, estimateSeconds } from './script.js';
import { voiceById, voicesFor, defaultVoice, accentLabel, previewVoice, voiceReady, downloadSize } from './tts.js';
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
import { fmtTime } from './util.js';
import { loadFonts } from './fonts.js';
import { t, uiLang, relativeDate, langName } from './i18n.js';
import { VIDEO_LANGS, langMeta, normLang, pack } from './langs.js';

const IDEAS_EN = [
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

// voice choices besides the AI voices
const MIC = '__mic';
const NONE = '__none';

export async function renderHub(root, { navigate, openPro }) {
  const prefs = Object.assign(
    { mode: 'topic', seconds: 30, format: 'facts', voiceId: 'af_heart', mood: 'lofi', look: 'auto', captionStyle: 'pop', visuals: 'animated' },
    (await kvGet('hubPrefs', {})) || {}
  );
  // videos are made in the interface language until another one is picked here
  prefs.lang = normLang(prefs.lang || uiLang());
  prefs.voiceByLang = prefs.voiceByLang || { en: prefs.voiceId };
  const drafts = (await kvGet('hubDrafts', {})) || {};
  let disposed = false;
  const save = () => kvSet('hubPrefs', prefs);
  const saveDraft = () => kvSet('hubDrafts', drafts);
  // the voice for the current video language: an AI voice of that language, "My voice" or none
  const voiceFor = (lang) => {
    const v = prefs.voiceByLang[lang];
    if (v === MIC || v === NONE) return v;
    if (v && voiceById(v).id === v && voiceById(v).lang === lang && allowed(voiceById(v))) return v;
    return defaultVoice(lang) || MIC;
  };
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
      { value: 'topic', label: t('Topic') },
      { value: 'article', label: t('Article') },
      { value: 'script', label: t('My script') },
    ],
    prefs.mode,
    (v) => {
      prefs.mode = v;
      modeSeg.set(v);
      save();
      buildInput();
      refreshPreview();
    },
    { label: t('What you are starting from') }
  );

  // video language: script, captions, voice and post text
  const langSelect = h('select', { class: 'lang-select', 'aria-label': t('Video language'), title: t('Video language') });
  for (const id of VIDEO_LANGS) langSelect.append(h('option', { value: id, text: langMeta(id).native, selected: id === prefs.lang }));
  langSelect.addEventListener('change', () => {
    prefs.lang = langSelect.value;
    save();
    buildInput();
    fillVoices();
    refreshPreview();
  });
  const langPick = h('label', { class: 'lang-pick' }, icon('globe', 16), h('span', { class: 'sr-only', text: t('Video language') }), langSelect);

  function buildInput() {
    clear(inputHost);
    clear(suggest);
    const m = prefs.mode;
    const L = langMeta(prefs.lang);
    const ideaList = prefs.lang === 'en' ? IDEAS_EN : pack(prefs.lang).ideas;
    if (m === 'topic') {
      inputEl = h('input', { type: 'text', class: 'topic-input', placeholder: ideaList[0], value: drafts.topic || '', 'aria-label': t('Video topic'), maxlength: 160, dir: 'auto' });
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startGenerate();
      });
      // suggest other topics than the one already typed
      const bare = (s) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const typed = bare(drafts.topic || '');
      const ideas = ideaList.filter((s) => bare(s) !== typed).sort(() => Math.random() - 0.5).slice(0, 4);
      for (const idea of ideas) {
        suggest.append(
          h('button', {
            class: 'chip',
            type: 'button',
            text: idea,
            lang: L.id,
            dir: L.dir,
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
          ? t('Paste an article, blog post or notes. AutoShorts picks the strongest facts and writes a hook and a call to action.')
          : t('Write one line per scene.\nThe first line is your hook.\nThe last line can be your call to action.');
      inputEl = h('textarea', { class: 'article-input', placeholder, value: drafts[m] || '', 'aria-label': m === 'article' ? t('Article text') : t('Your script'), rows: 8, dir: 'auto' });
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
    LENGTHS.map((s) => ({ value: s, label: t('{s}s', { s }) })),
    prefs.seconds,
    (v) => {
      prefs.seconds = v;
      lengthSeg.set(v);
      save();
    },
    { label: t('Video length') }
  );
  const formatSeg = seg(
    FORMATS.map((f) => ({ value: f.id, label: t(f.name), title: t(f.hint) })),
    prefs.format,
    (v) => {
      prefs.format = v;
      formatSeg.set(v);
      save();
    },
    { label: t('Format') }
  );

  // voice
  const voiceSelect = h('select', { 'aria-label': t('Voice') });
  const voiceNote = h('small', { class: 'hint voice-note' });
  const fillVoices = () => {
    clear(voiceSelect);
    const lang = prefs.lang;
    const current = voiceFor(lang);
    const groups = new Map();
    for (const v of voicesFor(lang)) {
      if (!groups.has(v.accent)) groups.set(v.accent, h('optgroup', { label: accentLabel(v.accent) }));
      const ok = allowed(v);
      groups.get(v.accent).append(h('option', { value: v.id, text: `${v.name} — ${t(v.desc)}${ok ? '' : ` (${t('Pro')})`}`, disabled: !ok, selected: v.id === current }));
    }
    voiceSelect.append(...groups.values());
    voiceSelect.append(
      h('option', { value: MIC, text: t('My voice (record each line)'), selected: current === MIC }),
      h('option', { value: NONE, text: t('No voice (captions and music only)'), selected: current === NONE })
    );
    voicePlay.hidden = current === MIC || current === NONE;
    voiceNote.textContent = groups.size ? '' : t('AI voices don’t speak {lang} yet. Record the lines yourself or make a video with captions only.', { lang: langName(lang) });
    voiceNote.hidden = !!groups.size;
  };
  voiceSelect.addEventListener('change', () => {
    prefs.voiceByLang[prefs.lang] = voiceSelect.value;
    save();
    voicePlay.hidden = voiceSelect.value === MIC || voiceSelect.value === NONE;
  });
  const voicePlay = h('button', { class: 'btn icon', type: 'button', 'aria-label': t('Play voice sample'), title: t('Play a sample') }, icon('play'));
  fillVoices();
  voicePlay.addEventListener('click', async () => {
    const voiceId = voiceFor(prefs.lang);
    if (voiceId === NONE || voiceId === MIC) return;
    if (!(await confirmVoiceDownload(voiceId))) return;
    voicePlay.disabled = true;
    const closeToast = (await voiceReady(voiceId)) ? null : toast(t('Getting the AI voice ready…'), { timeout: 60000 });
    try {
      const clip = await previewVoice(voiceId);
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
  const musicSelect = h('select', { 'aria-label': t('Music') });
  const fillMusic = () => {
    clear(musicSelect);
    for (const m of MOODS) {
      const ok = allowed(m);
      musicSelect.append(h('option', { value: m.id, text: `${t(m.name)} — ${t(m.desc)}${ok ? '' : ` (${t('Pro')})`}`, disabled: !ok, selected: m.id === prefs.mood }));
    }
    musicSelect.append(h('option', { value: 'none', text: t('No music'), selected: prefs.mood === 'none' }));
  };
  fillMusic();
  musicSelect.addEventListener('change', () => {
    prefs.mood = musicSelect.value;
    save();
    refreshPreview();
  });
  let musicPlaying = false;
  const musicPlay = h('button', { class: 'btn icon', type: 'button', 'aria-label': t('Play music sample'), title: t('Play a sample') }, icon('play'));
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
  const capSelect = h('select', { 'aria-label': t('Caption style') });
  for (const s of CAPTION_STYLES) {
    const ok = allowed(s);
    capSelect.append(h('option', { value: s.id, text: t(s.name) + (ok ? '' : ` (${t('Pro')})`), disabled: !ok, selected: s.id === prefs.captionStyle }));
  }
  if (!allowed(CAPTION_STYLES.find((s) => s.id === prefs.captionStyle))) prefs.captionStyle = 'pop';
  capSelect.value = prefs.captionStyle;
  capSelect.addEventListener('change', () => {
    prefs.captionStyle = capSelect.value;
    save();
    refreshPreview();
  });

  // looks
  const looksRow = h('div', { class: 'looks', role: 'radiogroup', 'aria-label': t('Look') });
  const renderLooks = () => {
    clear(looksRow);
    const autoBtn = h('button', { class: 'look auto', type: 'button', role: 'radio', 'aria-checked': String(prefs.look === 'auto'), title: t('Pick a look that matches the topic') }, h('span', { class: 'lk' }, h('canvas', { width: 54, height: 96 })), h('span', { text: t('Match topic') }));
    autoBtn.addEventListener('click', () => setLook('auto'));
    looksRow.append(autoBtn);
    for (const l of LOOKS) {
      const ok = allowed(l);
      const c = h('canvas', { width: 108, height: 192 });
      drawLookSwatch(c, l.id);
      const b = h('button', { class: 'look', type: 'button', role: 'radio', 'aria-checked': String(prefs.look === l.id), title: ok ? t(l.name) : `${t(l.name)} (${t('Pro')})` }, h('span', { class: 'lk' }, c, ok ? null : icon('lock', 11)), h('span', { text: t(l.name) }));
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
      { value: 'animated', label: t('Animated backgrounds') },
      { value: 'stock', label: t('Stock footage') },
    ],
    prefs.visuals,
    async (v) => {
      if (v === 'stock' && !(await pexelsKey())) {
        toast(t('Add your free Pexels API key in Settings to use stock footage.'), { action: t('Open Settings'), onAction: () => document.dispatchEvent(new CustomEvent('open-settings', { detail: 'stock' })) });
        return;
      }
      prefs.visuals = v;
      visualsSeg.set(v);
      save();
    },
    { label: t('Background visuals') }
  );

  const genBtn = h('button', { class: 'btn primary big', type: 'button', on: { click: () => startGenerate() } }, icon('sparkle', 20), t('Generate video'));
  const fine = h('span', { class: 'fine' });
  const updateFine = async () => {
    const { quota, resetText } = await import('./license.js');
    if (license.pro) fine.textContent = t('Pro: unlimited 1080p exports, no watermark.');
    else {
      const q = await quota();
      fine.textContent = t('Free plan: {left} of {limit} exports left this week (720p with a small watermark). {reset}.', { left: q.left, limit: q.limit, n: q.limit, reset: resetText(q.resets) });
    }
  };
  updateFine();

  const compose = h(
    'div',
    { class: 'compose' },
    h('h1', { class: 'display', text: t('What’s your video about?') }),
    h('div', { class: 'mode-row' }, modeSeg, langPick),
    inputHost,
    suggest,
    h(
      'div',
      { class: 'options' },
      h('span', { class: 'label', text: t('Length') }),
      lengthSeg,
      h('span', { class: 'label', text: t('Format') }),
      formatSeg,
      h('span', { class: 'label', text: t('Voice') }),
      h('div', { class: 'inline-pick' }, voiceSelect, voicePlay, voiceNote),
      h('span', { class: 'label', text: t('Music') }),
      h('div', { class: 'inline-pick' }, musicSelect, musicPlay),
      h('span', { class: 'label', text: t('Captions') }),
      h('div', { class: 'inline-pick' }, capSelect),
      h('span', { class: 'label', text: t('Look') }),
      looksRow,
      h('span', { class: 'label', text: t('Visuals') }),
      visualsSeg
    )
  );

  // ---------------------------------------------------------- live hook preview
  const pv = h('canvas', { width: 540, height: 960, 'aria-label': t('Preview of your hook') });
  const stageCol = h(
    'div',
    { class: 'stage-col' },
    h('div', { class: 'phone' }, pv),
    h('p', { class: 'stage-note', text: t('Live preview of your opening line.') }),
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
    if (!raw) return pack(prefs.lang).hookPlaceholder;
    if (prefs.mode === 'topic') return topicAsQuestion(raw, prefs.lang) || raw.charAt(0).toUpperCase() + raw.slice(1);
    const first = raw.split('\n').map((l) => l.trim()).find(Boolean) || raw;
    return first.length > 110 ? first.slice(0, 107).replace(/\s+\S*$/, '') + '…' : first;
  }

  async function refreshPreview() {
    const lang = prefs.lang;
    await loadFonts(lang);
    if (disposed) return;
    const text = hookText();
    const a = analyzeLine(text, 'hook', lang);
    const lookId = prefs.look === 'auto' ? autoLook(text, allowed, lang) : prefs.look;
    const settings = defaultSettings({ lang, look: lookId, captionStyle: prefs.captionStyle, mood: prefs.mood, highlight: paletteOf(lookId).hi });
    settings.voice.mode = 'none';
    settings.music.beatSync = false;
    settings.visuals.titleBanner = 'off';
    const project = { id: 'preview', lang, title: '', scenes: [{ id: 'pv-' + lookId, kind: 'hook', text, keyword: a.keyword, emoji: a.emoji, stat: null, visual: null }], settings };
    const tl = buildTimeline(project, new Map());
    tl.duration = Math.max(tl.duration + 0.8, estimateSeconds(text, 1, lang) + 1.2);
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
      const time = ((performance.now() - pvStart) / 1000) % d;
      renderer.draw(time);
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
  hub.append(h('section', { class: 'library' }, h('div', { class: 'library-head' }, h('h2', { text: t('Your videos') }), libCount), libGrid));

  async function renderLibrary() {
    const list = await listProjects();
    clear(libGrid);
    libCount.textContent = list.length ? t('{n} saved on this PC', { n: list.length }) : '';
    if (!list.length) {
      libGrid.append(h('div', { class: 'empty' }, h('strong', { text: t('No videos yet') }), h('span', { text: t('Type a topic above and press Generate video. Your projects are saved here automatically.') })));
      return;
    }
    for (const p of list) {
      const frame = h('button', { class: 'proj-frame', type: 'button', 'aria-label': t('Open {title}', { title: p.title }), on: { click: () => navigate(`#/edit/${p.id}`) } });
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
          title: t('Duplicate'),
          'aria-label': t('Duplicate'),
          on: {
            click: async () => {
              await duplicateProject(p);
              renderLibrary();
            },
          },
        }, icon('dup', 15)),
        h('button', {
          class: 'btn icon small',
          title: t('Delete'),
          'aria-label': t('Delete'),
          on: {
            click: async () => {
              if (await confirmDialog(t('Delete “{title}”? This can’t be undone.', { title: p.title }), { title: t('Delete video'), okLabel: t('Delete'), danger: true })) {
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
          h('div', { class: 'proj-title', text: p.title, lang: langMeta(p.lang).id, dir: 'auto' }),
          h(
            'div',
            { class: 'proj-meta' },
            h('span', { text: p.duration ? fmtTime(p.duration) : t('{s}s', { s: p.seconds }) }),
            h('span', { text: relativeDate(p.updated) }),
            normLang(p.lang) !== uiLang() ? h('span', { class: 'lang-tag', title: langMeta(p.lang).native, text: normLang(p.lang).toUpperCase() }) : null
          )
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
  async function confirmVoiceDownload(voiceId) {
    if (await voiceReady(voiceId)) return true;
    if (!navigator.onLine) {
      toast(t('Connect to the internet once to download the AI voices.'), { kind: 'error' });
      return false;
    }
    const v = voiceById(voiceId);
    // the main voice pack is asked about once; the German voices are a separate download
    const key = v.engine === 'piper' ? `voiceConsent:${v.path}` : 'voiceConsent';
    if (await kvGet(key, false)) return true;
    const mb = downloadSize(voiceId);
    const ok =
      v.engine === 'piper'
        ? await confirmDialog(t('AutoShorts makes voiceovers on your PC. The voice {name} (about {mb} MB) downloads once and then works offline.', { name: v.name, mb }), { title: t('Download voice'), okLabel: t('Download') })
        : await confirmDialog(t('AutoShorts makes voiceovers on your PC. The voice pack (about {mb} MB) downloads once and then works offline.', { mb }), { title: t('Download AI voices'), okLabel: t('Download') });
    if (ok) await kvSet(key, true);
    return ok;
  }

  async function startGenerate() {
    const input = inputEl ? inputEl.value.trim() : '';
    if (!input) {
      toast(prefs.mode === 'topic' ? t('Type a topic first.') : prefs.mode === 'article' ? t('Paste an article first.') : t('Write a few lines first.'));
      inputEl && inputEl.focus();
      return;
    }
    const lang = prefs.lang;
    const choice = voiceFor(lang);
    const voiceOn = choice !== NONE && choice !== MIC;
    if (voiceOn && !(await confirmVoiceDownload(choice))) return;
    stopPreview();
    const ctrl = new AbortController();
    const stepsEl = h('ol', { class: 'steps' });
    const STEP_LIST = [
      ['script', t('Writing the script')],
      ['look', t('Choosing visuals')],
      ...(voiceOn ? [['voice', t('Preparing the AI voice')]] : []),
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
      title: t('Making your video'),
      body: h('div', { style: { display: 'grid', gap: '16px' } }, stepsEl, bar),
      actions: [{ label: t('Cancel'), onClick: (close) => (ctrl.abort(), close()) }],
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
          lang,
          format: prefs.format,
          seconds: prefs.seconds,
          voiceId: voiceOn ? choice : defaultVoice(lang) || 'af_heart',
          voiceMode: voiceOn ? 'ai' : choice === MIC ? 'mic' : 'none',
          mood: prefs.mood,
          look: prefs.look,
          captionStyle: prefs.captionStyle,
          visuals: prefs.visuals,
        },
        { onStep, signal: ctrl.signal }
      );
      dlg.close();
      if (project.voiceError) toast(t('Voice: {error}', { error: project.voiceError }), { kind: 'error', timeout: 7000 });
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
      toast(e.message || t('Something went wrong while making the video.'), { kind: 'error', timeout: 7000 });
    }
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    offLicense();
    stopPreview();
  };
}
