// Inspector tabs for the editor: Captions, Visuals, Voice, Music, Publish.

import { h, icon, seg, toggle, slider, clear, toast, copyText, pickFiles, confirmDialog } from './ui.js';
import { CAPTION_STYLES, HIGHLIGHTS, drawStyleSample } from './captions.js';
import { LOOKS, THEME_NAMES, THEME_IDS, lookById, drawLookSwatch, drawTheme, sceneTheme, PALETTES } from './visuals.js';
import { VOICES, voiceById, previewVoice, engine, isModelCached, ENGINE_SIZES } from './tts.js';
import { MOODS, previewMusic, moodById } from './music.js';
import { importMedia, listMedia } from './media.js';
import { searchStock, downloadStock, autoStock, pexelsKey } from './stock.js';
import { buildPublishKit, UPLOAD_LINKS } from './publish.js';
import { allowed } from './license.js';
import { playPreview, stopPreview } from './player.js';
import { db } from './db.js';
import { hashString, uid } from './util.js';

const TABS = [
  ['captions', 'Captions', 'text'],
  ['visuals', 'Visuals', 'image'],
  ['voice', 'Voice', 'voice'],
  ['music', 'Music', 'music'],
  ['publish', 'Publish', 'external'],
];

export function buildInspector(ed) {
  let active = 'captions';
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { class: 'tab-body', role: 'tabpanel' });
  const el = h('div', { style: { display: 'contents' } }, tabBar, body);
  const openPro = (why) => ed.ctx.openPro(why);
  let visualsSub = null;

  function renderTabs() {
    clear(tabBar);
    for (const [id, label] of TABS) {
      tabBar.append(
        h('button', { role: 'tab', 'aria-selected': String(id === active), on: { click: () => show(id) } }, label)
      );
    }
  }

  function show(id) {
    active = id;
    renderTabs();
    renderBody();
  }

  function renderBody() {
    stopPreview();
    clear(body);
    const S = ed.project.settings;
    if (active === 'captions') body.append(...captionsTab(ed, S, openPro).filter(Boolean));
    if (active === 'visuals') body.append(...visualsTab(ed, S, openPro, (sub) => (visualsSub = sub), () => visualsSub).filter(Boolean));
    if (active === 'voice') body.append(...voiceTab(ed, S, openPro).filter(Boolean));
    if (active === 'music') body.append(...musicTab(ed, S, openPro).filter(Boolean));
    if (active === 'publish') body.append(...publishTab(ed).filter(Boolean));
  }

  renderTabs();
  renderBody();
  return {
    el,
    show,
    refresh(part) {
      if (part === 'scene' && active !== 'visuals') return;
      if (part === 'voice' && active !== 'voice') return;
      const scroll = body.scrollTop;
      renderBody();
      body.scrollTop = scroll;
    },
  };
}

// ---------------------------------------------------------------------- captions
function captionsTab(ed, S, openPro) {
  const C = S.captions;
  const grid = h('div', { class: 'style-grid', role: 'radiogroup', 'aria-label': 'Caption style' });
  for (const st of CAPTION_STYLES) {
    const ok = allowed(st);
    const c = h('canvas', { width: 240, height: 180 });
    const tile = h('button', { class: 'style-tile', role: 'radio', 'aria-checked': String(C.style === st.id), title: ok ? st.name : `${st.name} (Pro)` }, c, h('span', { text: st.name }), ok ? null : icon('lock', 11));
    requestAnimationFrame(() => drawStyleSample(c, st.id, C.highlight));
    tile.addEventListener('click', () => {
      if (!ok) return openPro('captions');
      ed.change((p) => {
        p.settings.captions.style = st.id;
        p.settings.captions.maxWords = null;
        p.settings.captions.uppercase = null;
      }, 'captions');
      ed.inspector.refresh();
    });
    grid.append(tile);
  }
  const pos = seg(
    [
      { value: 'top', label: 'Top' },
      { value: 'middle', label: 'Middle' },
      { value: 'bottom', label: 'Bottom' },
    ],
    C.position,
    (v) => {
      ed.change((p) => (p.settings.captions.position = v), 'captions');
      pos.set(v);
    },
    { label: 'Caption position', className: 'full' }
  );
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Highlight colour' });
  const pal = PALETTES[lookById(S.visuals.look).palette];
  const colors = [...new Set([pal.hi.toUpperCase(), ...HIGHLIGHTS])];
  for (const col of colors) {
    const b = h('button', { class: 'swatch', role: 'radio', 'aria-checked': String(C.highlight.toUpperCase() === col.toUpperCase()), 'aria-label': col, style: { background: col } });
    b.addEventListener('click', () => {
      ed.change((p) => (p.settings.captions.highlight = col), 'captions');
      ed.inspector.refresh();
    });
    swatches.append(b);
  }
  const customInput = h('input', { type: 'color', value: C.highlight, 'aria-label': 'Custom highlight colour' });
  customInput.addEventListener('change', () => {
    ed.change((p) => (p.settings.captions.highlight = customInput.value.toUpperCase()), 'captions');
    ed.inspector.refresh();
  });
  swatches.append(h('label', { class: 'swatch custom', title: 'Custom colour' }, customInput));

  const style = CAPTION_STYLES.find((s) => s.id === C.style) || CAPTION_STYLES[0];
  const words = seg(
    [{ value: null, label: 'Auto' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))],
    C.maxWords,
    (v) => {
      ed.change((p) => (p.settings.captions.maxWords = v), 'captions');
      words.set(v);
    },
    { label: 'Words on screen', className: 'full' }
  );
  return [
    h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Style' }), grid),
    h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Position' }), pos),
    slider('Size', C.size, { min: 0.7, max: 1.4, step: 0.05, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => ed.change((p) => (p.settings.captions.size = v), 'captions') }),
    h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Highlight colour' }), swatches),
    h('div', { class: 'group' }, h('h4', { class: 'group-title' }, 'Words on screen', h('span', { class: 'meta', text: `Auto is ${style.maxWords}` })), words),
    h(
      'div',
      { class: 'group' },
      toggle('All caps', C.uppercase ?? style.upper, (v) => ed.change((p) => (p.settings.captions.uppercase = v), 'captions')),
      toggle('Colour key words', C.keywords !== false, (v) => ed.change((p) => (p.settings.captions.keywords = v), 'captions'), { hint: 'Numbers, the scene’s key word and power words' })
    ),
  ];
}

// ---------------------------------------------------------------------- visuals
function visualsTab(ed, S, openPro, setSub, getSub) {
  const V = S.visuals;
  const i = ed.selected;
  const sc = ed.project.scenes[i];
  const looks = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Look' });
  for (const l of LOOKS) {
    const ok = allowed(l);
    const c = h('canvas', { width: 90, height: 160 });
    drawLookSwatch(c, l.id);
    const b = h('button', { class: 'theme-tile', role: 'radio', 'aria-checked': String(V.look === l.id), title: ok ? l.name : `${l.name} (Pro)` }, c, h('span', { text: l.name }), ok ? null : h('span', { class: 'badge' }, 'Pro'));
    b.addEventListener('click', () => {
      if (!ok) return openPro('looks');
      ed.change((p) => {
        p.settings.visuals.look = l.id;
        p.settings.captions.highlight = PALETTES[l.palette].hi;
      }, 'visuals');
      ed.renderScenes();
      ed.inspector.refresh();
    });
    looks.append(b);
  }

  // this scene
  const cur = sc && sc.visual ? (sc.visual.type === 'media' ? 'media' : 'animated') : 'animated';
  let sub = getSub() || cur;
  const subHost = h('div', { class: 'group' });
  const subSeg = seg(
    [
      { value: 'animated', label: 'Animated' },
      { value: 'media', label: 'My media' },
      { value: 'stock', label: 'Stock' },
    ],
    sub,
    (v) => {
      sub = v;
      setSub(v);
      subSeg.set(v);
      renderSub();
    },
    { label: 'Background source', className: 'full' }
  );
  const sceneId = sc && sc.id;
  const assign = (visual) => {
    if (!ed.project.scenes.some((s) => s.id === sceneId)) return; // scene was deleted meanwhile
    ed.change((p) => {
      const target = p.scenes.find((s) => s.id === sceneId);
      if (target) target.visual = visual;
    }, visual && visual.type === 'media' ? 'media' : 'visuals');
    ed.renderScenes();
    ed.inspector.refresh();
  };

  function renderSub() {
    clear(subHost);
    if (!sc) return;
    if (sub === 'animated') {
      const grid = h('div', { class: 'theme-grid' });
      const look = lookById(V.look);
      const auto = sceneTheme(look.id, i);
      const options = [['__auto', `Look default`], ...THEME_IDS.map((t) => [t, THEME_NAMES[t] || t])];
      for (const [t, name] of options) {
        const theme = t === '__auto' ? auto : t;
        const c = h('canvas', { width: 72, height: 128 });
        drawTheme(c.getContext('2d'), 72, 128, theme, look.palette, hashString(sc.id), 2.2);
        const checked = t === '__auto' ? !sc.visual : sc.visual && sc.visual.type === 'theme' && sc.visual.theme === t;
        const b = h('button', { class: 'theme-tile', role: 'radio', 'aria-checked': String(!!checked) }, c, h('span', { text: name }));
        b.addEventListener('click', () => assign(t === '__auto' ? null : { type: 'theme', theme: t }));
        grid.append(b);
      }
      subHost.append(grid);
    } else if (sub === 'media') {
      const grid = h('div', { class: 'theme-grid' });
      const importBtn = h('button', { class: 'btn small' }, icon('upload', 15), 'Import photos or videos');
      importBtn.addEventListener('click', async () => {
        const files = await pickFiles({ accept: 'image/*,video/mp4,video/webm,video/quicktime', multiple: true });
        if (!files.length) return;
        importBtn.disabled = true;
        let first = null;
        for (const f of files) {
          try {
            const a = await importMedia(f, { source: 'own' });
            first = first || a;
          } catch (e) {
            toast(e.message, { kind: 'error' });
          }
        }
        importBtn.disabled = false;
        if (first) assign({ type: 'media', assetId: first.id, mediaType: first.mediaType, thumb: first.thumb, credit: null });
        else renderSub();
      });
      subHost.append(h('div', { class: 'media-actions' }, importBtn), grid);
      listMedia().then((items) => {
        if (!items.length) {
          grid.replaceWith(h('p', { class: 'hint', text: 'Photos and clips you import stay on this PC. Wide photos pan slowly across the frame.' }));
          return;
        }
        for (const a of items) {
          const checked = sc.visual && sc.visual.type === 'media' && sc.visual.assetId === a.id;
          const b = h('button', { class: 'theme-tile', role: 'radio', 'aria-checked': String(!!checked), title: a.name }, h('img', { src: a.thumb, alt: '' }), h('span', { text: a.mediaType === 'video' ? `Video ${a.duration ? Math.round(a.duration) + 's' : ''}` : 'Photo' }));
          b.addEventListener('click', () => assign({ type: 'media', assetId: a.id, mediaType: a.mediaType, thumb: a.thumb, credit: a.credit }));
          grid.append(b);
        }
      });
    } else {
      stockPanel(ed, i, subHost, assign);
    }
    if (sc.visual && sc.visual.credit && sc.visual.credit.name) subHost.append(h('p', { class: 'credit' }, `Footage: ${sc.visual.credit.name} on ${sc.visual.credit.source || 'Pexels'}`));
  }
  renderSub();

  const trans = h('select', { 'aria-label': 'Transitions' });
  for (const [v, l] of [['auto', 'Mixed (zoom, slide, fade, whip)'], ['zoom', 'Zoom punch'], ['slide', 'Slide up'], ['fade', 'Cross-fade'], ['whip', 'Whip pan'], ['cut', 'Hard cut']]) trans.append(h('option', { value: v, text: l, selected: V.transition === v }));
  trans.addEventListener('change', () => ed.change((p) => (p.settings.visuals.transition = trans.value), 'visuals'));
  const banner = seg(
    [
      { value: 'off', label: 'Off' },
      { value: 'hook', label: 'During hook' },
      { value: 'always', label: 'Whole video' },
    ],
    V.titleBanner || 'off',
    (v) => {
      ed.change((p) => (p.settings.visuals.titleBanner = v), 'visuals');
      banner.set(v);
    },
    { label: 'Title at top', className: 'full' }
  );

  return [
    h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Look' }), looks),
    h('div', { class: 'divider' }),
    h('div', { class: 'group' }, h('h4', { class: 'group-title' }, `Scene ${i + 1} background`, h('span', { class: 'meta', text: sc ? (sc.keyword ? `Key word: ${sc.keyword}` : '') : '' })), subSeg),
    subHost,
    h('div', { class: 'divider' }),
    h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Title at top' }), banner),
    h(
      'div',
      { class: 'group' },
      toggle('Emoji stickers', V.stickers, (v) => ed.change((p) => (p.settings.visuals.stickers = v), 'timeline')),
      toggle('Big number cards', V.stats, (v) => ed.change((p) => (p.settings.visuals.stats = v), 'timeline'), { hint: 'Counts up numbers like “70%” or “3 hearts”' }),
      toggle('Progress bar', V.progress, (v) => ed.change((p) => (p.settings.visuals.progress = v), 'visuals')),
      toggle('Slow zoom on photos and clips', V.motion !== false, (v) => ed.change((p) => (p.settings.visuals.motion = v), 'visuals'))
    ),
    slider('Darken background', V.dim, { min: 0, max: 0.6, step: 0.05, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => ed.change((p) => (p.settings.visuals.dim = v), 'visuals') }),
    h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Transitions' }), trans),
  ];
}

function stockPanel(ed, i, host, assign) {
  const sc = ed.project.scenes[i];
  let kind = 'video';
  const q = h('input', { type: 'search', value: sc.keyword || ed.project.topic || '', placeholder: 'Search free stock (Pexels)', 'aria-label': 'Search stock' });
  const kindSeg = seg(
    [
      { value: 'video', label: 'Videos' },
      { value: 'photo', label: 'Photos' },
    ],
    kind,
    (v) => {
      kind = v;
      kindSeg.set(v);
      run();
    },
    { label: 'Stock type' }
  );
  const results = h('div', { class: 'theme-grid' });
  const status = h('p', { class: 'hint' });
  const fillAll = h('button', { class: 'btn small' }, icon('wand', 15), 'Fill every scene with stock clips');
  const go = h('button', { class: 'btn small', 'aria-label': 'Search' }, icon('search', 15));
  host.append(h('div', { class: 'stock-form' }, q, go), kindSeg, status, results, fillAll);

  async function run() {
    clear(results);
    if (!(await pexelsKey())) {
      status.replaceChildren('Stock footage comes from Pexels and needs a free API key. ', h('a', { href: '#', on: { click: (e) => (e.preventDefault(), document.dispatchEvent(new CustomEvent('open-settings', { detail: 'stock' }))) } }, 'Add your key in Settings'));
      return;
    }
    status.textContent = 'Searching…';
    try {
      const items = await searchStock(q.value.trim() || 'abstract', { kind });
      status.textContent = items.length ? 'Photos and videos provided by Pexels.' : 'Nothing found. Try another word.';
      for (const it of items) {
        const b = h('button', { class: 'theme-tile', title: it.credit.name ? `By ${it.credit.name}` : '' }, h('img', { src: it.thumb, alt: '', loading: 'lazy', crossorigin: 'anonymous' }), h('span', { text: it.kind === 'video' ? `${it.duration || ''}s clip` : 'Photo' }));
        b.addEventListener('click', async () => {
          status.textContent = 'Downloading…';
          b.disabled = true;
          try {
            const a = await downloadStock(it);
            assign({ type: 'media', assetId: a.id, mediaType: a.mediaType, thumb: a.thumb, credit: a.credit });
          } catch (e) {
            status.textContent = e.message || 'Download failed.';
            b.disabled = false;
          }
        });
        results.append(b);
      }
    } catch (e) {
      status.textContent = e.message;
    }
  }
  go.addEventListener('click', run);
  q.addEventListener('keydown', (e) => e.key === 'Enter' && run());
  fillAll.addEventListener('click', async () => {
    if (!(await pexelsKey())) return run();
    if (!(await confirmDialog('Download one stock clip for every scene, based on each scene’s key word? Scenes you already set keep their background.', { title: 'Fill scenes with stock', okLabel: 'Fill scenes' }))) return;
    fillAll.disabled = true;
    const targets = ed.project.scenes.filter((s) => !s.visual || s.visual.type !== 'media');
    try {
      const assets = await autoStock(targets, { kind, topic: ed.project.topic, onProgress: (d, n) => (status.textContent = `Downloading ${d} of ${n}…`) });
      ed.change((p) => {
        for (const s of p.scenes) {
          const a = assets.get(s.id);
          if (a) s.visual = { type: 'media', assetId: a.id, mediaType: a.mediaType, thumb: a.thumb, credit: a.credit };
        }
      }, 'media');
      ed.renderScenes();
      status.textContent = `Added ${assets.size} clips.`;
    } catch (e) {
      status.textContent = e.message;
    }
    fillAll.disabled = false;
  });
  if (sc.keyword || ed.project.topic) run();
}

// ---------------------------------------------------------------------- voice
function voiceTab(ed, S, openPro) {
  const Vs = S.voice;
  const modeSeg = seg(
    [
      { value: 'ai', label: 'AI voice' },
      { value: 'mic', label: 'My voice' },
      { value: 'none', label: 'No voice' },
    ],
    Vs.mode,
    (v) => {
      ed.change((p) => (p.settings.voice.mode = v), 'voice');
      ed.renderScenes();
      ed.inspector.refresh();
    },
    { label: 'Voice source', className: 'full' }
  );
  const out = [h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Voiceover' }), modeSeg)];

  if (Vs.mode === 'ai') {
    const st = engine.snapshot();
    const statusNote = h('div', { class: 'note' });
    const renderStatus = async () => {
      clear(statusNote);
      if (st.status === 'loading') {
        statusNote.append(h('strong', { text: 'Downloading AI voices' }), h('div', { class: 'progress' }, h('i', { style: { width: `${Math.round(st.progress * 100)}%` } })), h('span', { text: 'One-time download. After this, voices work offline.' }));
      } else if (ed.voiceError) {
        statusNote.classList.add('warn');
        statusNote.append(h('strong', { text: 'The voice isn’t ready' }), h('span', { text: ed.voiceError }), h('div', { class: 'row' }, h('button', { class: 'btn small', on: { click: () => ed.runVoiceQueue() } }, icon('refresh', 14), 'Try again')));
      } else {
        const cached = st.status === 'ready' || (await isModelCached());
        statusNote.append(h('strong', { text: cached ? 'AI voices are on this PC' : 'AI voices download on first use' }), h('span', { text: cached ? `Voiceovers are made on your PC${st.device === 'webgpu' ? ' using your graphics card' : ''}. Nothing is uploaded.` : `About ${ENGINE_SIZES.q8} MB, one time.` }));
      }
    };
    renderStatus();
    const list = h('div', { class: 'voice-list', role: 'radiogroup', 'aria-label': 'Voice' });
    for (const accent of ['American', 'British']) {
      list.append(h('div', { class: 'list-label', text: `${accent} English` }));
      for (const v of VOICES.filter((x) => x.accent === accent)) {
        const ok = allowed(v);
        const play = h('button', { class: 'btn icon', 'aria-label': `Play ${v.name}`, title: 'Play a sample' }, icon('play', 15));
        play.addEventListener('click', async (e) => {
          e.stopPropagation();
          play.disabled = true;
          try {
            playPreview(await previewVoice(v.id, Vs.speed));
          } catch (err) {
            toast(err.message, { kind: 'error' });
          }
          play.disabled = false;
        });
        const row = h('div', { class: 'voice-row', role: 'radio', tabindex: 0, 'aria-checked': String(Vs.id === v.id) }, h('div', {}, h('span', { class: 'v-name' }, v.name, ok ? null : icon('lock', 12)), h('small', { text: `${v.gender}, ${v.desc}` })), play);
        const pickIt = () => {
          if (!ok) return openPro('voices');
          if (Vs.id === v.id) return;
          ed.change((p) => (p.settings.voice.id = v.id), 'voice');
          ed.inspector.refresh();
        };
        row.addEventListener('click', pickIt);
        row.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickIt()));
        list.append(row);
      }
    }
    let speedTimer = 0;
    out.push(
      statusNote,
      h('div', { class: 'group' }, h('h4', { class: 'group-title' }, 'Voice', h('span', { class: 'meta', text: voiceById(Vs.id).name })), list),
      slider('Speed', Vs.speed, {
        min: 0.8,
        max: 1.3,
        step: 0.05,
        format: (v) => `${v.toFixed(2)}×`,
        onChange: (v) => {
          clearTimeout(speedTimer);
          speedTimer = setTimeout(() => ed.change((p) => (p.settings.voice.speed = v), 'voice'), 100);
        },
      })
    );
  } else if (Vs.mode === 'mic') {
    const sc = ed.project.scenes[ed.selected];
    out.push(
      h(
        'div',
        { class: 'note' },
        h('strong', { text: 'Record each line yourself' }),
        h('span', { text: 'Use the microphone button on each scene. Captions follow your timing automatically. Works for any language, including Arabic.' }),
        h('div', { class: 'row' }, h('button', { class: 'btn rec small', on: { click: () => ed.recordScene(ed.selected) } }, icon('mic', 15), `Record scene ${ed.selected + 1}`))
      )
    );
    if (sc && sc.recId) out.push(h('p', { class: 'hint', text: `Scene ${ed.selected + 1} has a recording.` }));
  } else {
    out.push(h('div', { class: 'note' }, h('strong', { text: 'Captions only' }), h('span', { text: 'Each line stays on screen long enough to read. Music and captions still play.' })));
  }
  const pacing = seg(
    [
      { value: 'tight', label: 'Tight' },
      { value: 'natural', label: 'Natural' },
      { value: 'relaxed', label: 'Relaxed' },
    ],
    S.pacing || 'natural',
    (v) => {
      ed.change((p) => (p.settings.pacing = v), 'timeline');
      pacing.set(v);
    },
    { label: 'Pause between lines', className: 'full' }
  );
  out.push(h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Pause between lines' }), pacing));
  return out;
}

// ---------------------------------------------------------------------- music
function musicTab(ed, S, openPro) {
  const M = S.music;
  const list = h('div', { class: 'voice-list', role: 'radiogroup', 'aria-label': 'Music mood' });
  let playingId = null;
  for (const m of MOODS) {
    const ok = allowed(m);
    const play = h('button', { class: 'btn icon', 'aria-label': `Play ${m.name}` }, icon('play', 15));
    play.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (playingId === m.id) {
        stopPreview();
        playingId = null;
        play.replaceChildren(icon('play', 15));
        return;
      }
      play.disabled = true;
      const buf = await previewMusic(m.id);
      play.disabled = false;
      list.querySelectorAll('.voice-row .btn').forEach((b) => b.replaceChildren(icon('play', 15)));
      playingId = m.id;
      play.replaceChildren(icon('stop', 15));
      playPreview(buf, { onEnd: () => playingId === m.id && (play.replaceChildren(icon('play', 15)), (playingId = null)) });
    });
    const row = h('div', { class: 'voice-row', role: 'radio', tabindex: 0, 'aria-checked': String(M.enabled && M.mood === m.id) }, h('div', {}, h('span', { class: 'v-name' }, m.name, ok ? null : icon('lock', 12)), h('small', { text: `${m.desc}, ${m.bpm} BPM` })), play);
    const pickIt = () => {
      if (!ok) return openPro('music');
      ed.change((p) => {
        p.settings.music.mood = m.id;
        p.settings.music.enabled = true;
      }, 'timeline');
      ed.inspector.refresh();
    };
    row.addEventListener('click', pickIt);
    row.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickIt()));
    list.append(row);
  }
  const customRow = h('div', { class: 'voice-row', role: 'radio', tabindex: 0, 'aria-checked': String(M.enabled && M.mood === 'custom') }, h('div', {}, h('span', { class: 'v-name' }, 'My own track'), h('small', { text: M.customName ? M.customName : 'Import an MP3, WAV or M4A you have the rights to use' })), h('span', { class: 'btn icon', 'aria-hidden': 'true' }, icon('upload', 15)));
  customRow.addEventListener('click', async () => {
    const [f] = await pickFiles({ accept: 'audio/*' });
    if (!f) return;
    const id = uid('a');
    await db.put('assets', { id, kind: 'music', blob: f, name: f.name, created: Date.now() });
    ed.change((p) => {
      p.settings.music.mood = 'custom';
      p.settings.music.customAssetId = id;
      p.settings.music.customName = f.name;
      p.settings.music.enabled = true;
    }, 'timeline');
    ed.inspector.refresh();
  });
  list.append(customRow);
  return [
    h('div', { class: 'group' }, toggle('Background music', M.enabled, (v) => (ed.change((p) => (p.settings.music.enabled = v), 'timeline'), ed.inspector.refresh()), { hint: 'Original music made on your PC, free to use anywhere' })),
    h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Mood' }), list),
    slider('Music volume', M.volume, { min: 0, max: 0.8, step: 0.02, format: (v) => `${Math.round(v * 100)}%`, onChange: (v) => ed.change((p) => (p.settings.music.volume = v), 'mix') }),
    h(
      'div',
      { class: 'group' },
      toggle('Lower music while the voice speaks', M.duck, (v) => ed.change((p) => (p.settings.music.duck = v), 'mix')),
      toggle('Cut scenes on the beat', M.beatSync, (v) => ed.change((p) => (p.settings.music.beatSync = v), 'timeline'), { hint: M.mood === 'custom' ? 'Not available with your own track' : `Every cut lands on the ${moodById(M.mood).bpm} BPM grid` }),
      toggle('Transition sounds', M.sfx, (v) => ed.change((p) => (p.settings.music.sfx = v), 'mix'), { hint: 'Soft whoosh on cuts, pop on stickers' })
    ),
  ];
}

// ---------------------------------------------------------------------- publish
function publishTab(ed) {
  const p = ed.project;
  const kit = buildPublishKit(p);
  const block = (label, text, rows = 3) => {
    const ta = h('textarea', { rows, value: text, 'aria-label': label });
    return h('div', { class: 'kit-block' }, h('div', { class: 'head' }, h('span', { text: label }), h('button', { class: 'btn small ghost', on: { click: () => copyText(ta.value) } }, icon('copy', 14), 'Copy')), ta);
  };
  const regen = h('button', { class: 'btn small' }, icon('refresh', 14), 'Write new captions');
  regen.addEventListener('click', () => {
    p.publish = { seed: ((p.publish && p.publish.seed) || 0) + 1 };
    ed.save();
    ed.inspector.refresh();
  });
  const links = h('div', { class: 'media-actions' });
  for (const l of UPLOAD_LINKS) links.append(h('a', { class: 'btn small', href: l.url, target: '_blank', rel: 'noopener' }, icon('external', 14), l.label));
  return [
    h('div', { class: 'group' }, h('h4', { class: 'group-title' }, 'Post kit', regen), h('div', { class: 'hashtags' }, ...kit.hashtags.map((t) => h('span', { text: t })))),
    h('div', { class: 'kit' }, block('TikTok caption', kit.tiktok, 4), block('YouTube Shorts title', kit.youtubeTitle, 2), block('YouTube description', kit.youtubeDesc, 5), block('Instagram Reels caption', kit.instagram, 4)),
    kit.credits.length ? h('div', { class: 'note' }, h('strong', { text: 'Credits to keep in your description' }), ...kit.credits.map((c) => h('span', { text: c }))) : null,
    h('div', { class: 'group' }, h('h4', { class: 'group-title', text: 'Upload' }), links),
  ].filter(Boolean);
}
