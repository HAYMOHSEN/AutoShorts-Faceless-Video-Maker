// Editor: scene list, live 9:16 preview with transport and timeline strip, inspector, export.

import { h, icon, toast, clear, autosize, modal } from './ui.js';
import { loadProject, saveProject } from './project.js';
import { buildTimeline, sceneAt } from './timeline.js';
import { buildChunks, clearCaptionCache } from './captions.js';
import { Renderer, snapshot } from './renderer.js';
import { Player } from './player.js';
import { PreviewMedia } from './media.js';
import { renderMusic } from './music.js';
import { mixdown } from './mixer.js';
import { engine, voiceClip, clipKey, loadClip, storeClip } from './tts.js';
import { alignWords } from './align.js';
import { analyzeLine, hookOptions } from './script.js';
import { drawTheme, lookById, sceneTheme } from './visuals.js';
import { EMOJI_PICKS } from './emoji.js';
import { db } from './db.js';
import { debounce, fmtTime, hashString, uid } from './util.js';
import { loadFonts } from './fonts.js';
import { buildInspector } from './inspector.js';
import { openExport } from './exportflow.js';
import { openRecorder } from './recorder.js';
import { license } from './license.js';
import { t, N_, fmtNum, joinList } from './i18n.js';
import { langMeta, pack } from './langs.js';

export async function renderEditor(root, id, ctx) {
  const project = await loadProject(id);
  if (!project) {
    toast(t('That video could not be found.'));
    ctx.navigate('#/');
    return () => {};
  }
  const ed = new Editor(root, project, ctx);
  await ed.init();
  return () => ed.dispose();
}

const KIND_LABEL = { hook: N_('Hook'), body: N_('Scene'), cta: N_('Call to action') };

export class Editor {
  constructor(root, project, ctx) {
    this.root = root;
    this.project = project;
    this.ctx = ctx;
    this.clips = new Map();
    this.timeline = null;
    this.chunks = [];
    this.mix = null;
    this.selected = 0;
    this.voiceBusy = new Set();
    this.voiceRunning = false;
    this.voiceAgain = false;
    this.voiceError = project.voiceError || '';
    delete project.voiceError;
    this.engineState = engine.snapshot();
    this.mixVersion = 0;
    this.saving = false;
    this.disposed = false;
    this.customMusic = null;
    this.thumbCache = new Map();
    this.save = debounce(() => this.saveNow(), 700);
    this.scheduleRebuild = debounce(() => this.rebuildTimeline(), 90);
    this.scheduleMix = debounce(() => this.rebuildMix(), 350);
    this.scheduleVoice = debounce(() => this.runVoiceQueue(), 1100);
  }

  // ------------------------------------------------------------------ lifecycle
  async init() {
    await loadFonts(this.project.lang);
    this.media = new PreviewMedia(() => {
      if (this.player && !this.player.playing) this.player.draw();
    });
    this.buildLayout();
    this.offEngine = engine.on((s) => {
      this.engineState = s;
      this.setStatus();
    });
    this.offLicense = license.on(() => {
      this.renderer.setData(this.renderData());
      this.player.draw();
      this.inspector.refresh();
    });
    await this.media.ensure(this.mediaIds());
    await this.loadExistingClips();
    this.rebuildTimeline();
    this.renderScenes();
    this.select(0, { seek: false });
    this.player.seek(this.posterTime());
    this.runVoiceQueue();
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKey);
    if (this.voiceError) toast(this.voiceError, { kind: 'error', timeout: 7000 });
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.offEngine && this.offEngine();
    this.offLicense && this.offLicense();
    this.ro && this.ro.disconnect();
    this.player && this.player.dispose();
    this.media && this.media.dispose();
    this.save.cancel && this.save.cancel();
    this.saveNow();
  }

  posterTime() {
    if (!this.timeline || !this.chunks.length) return 0;
    return Math.min(this.timeline.duration - 0.05, this.chunks[0].start + 0.45);
  }

  mediaIds() {
    return this.project.scenes.filter((s) => s.visual && s.visual.type === 'media').map((s) => s.visual.assetId);
  }

  renderData() {
    return { project: this.project, timeline: this.timeline, chunks: this.chunks, media: this.media, watermark: !license.pro };
  }

  async saveNow() {
    try {
      if (this.timeline) this.project.duration = this.timeline.duration;
      await saveProject(this.project);
      this.lastSaved = Date.now();
      this.setStatus();
    } catch (e) {
      console.warn('save failed', e);
    }
  }

  async updateThumb() {
    if (!this.timeline) return;
    const c = document.createElement('canvas');
    c.width = 270;
    c.height = 480;
    const r = new Renderer(c);
    r.setData({ ...this.renderData(), watermark: false });
    let at = Math.min(this.timeline.duration - 0.1, (this.timeline.scenes[0]?.end || 2) * 0.7);
    // land on a settled caption, not on a word that is still popping in (the renderer shows the
    // last caption that has started, so look it up the same way)
    const chunks = this.chunks || [];
    const idx = chunks.findLastIndex((c) => c.start <= at);
    const chunk = chunks[idx];
    if (chunk && at < chunk.end) {
      const shownUntil = Math.min(chunk.end, chunks[idx + 1] ? chunks[idx + 1].start : Infinity);
      const word = chunk.words.findLast((w) => w.start <= at) || chunk.words[0];
      const begin = Math.max(chunk.start, word.start);
      if (at - begin < 0.25) at = Math.max(at, Math.min(shownUntil - 0.02, begin + 0.25));
    }
    this.project.thumb = snapshot(r, at, 216);
    this.save();
  }

  // ------------------------------------------------------------------ voice
  expectedKey(sc) {
    const v = this.project.settings.voice;
    if (v.mode === 'ai') return clipKey(sc.text, v.id, v.speed);
    if (v.mode === 'mic') return sc.recId || null;
    return null;
  }

  clipFresh(sc) {
    const key = this.expectedKey(sc);
    const c = this.clips.get(sc.id);
    return !!(key && c && c.id === key);
  }

  freshClips() {
    const m = new Map();
    for (const sc of this.project.scenes) if (this.clipFresh(sc)) m.set(sc.id, this.clips.get(sc.id));
    return m;
  }

  async loadExistingClips() {
    const v = this.project.settings.voice;
    for (const sc of this.project.scenes) {
      const key = this.expectedKey(sc);
      if (!key) continue;
      const clip = await loadClip(key);
      if (clip) {
        if (v.mode === 'mic' && sc.recText !== sc.text) {
          clip.words = alignWords(sc.text, clip.pcm, clip.sampleRate).words;
          sc.recText = sc.text;
        }
        this.clips.set(sc.id, clip);
      }
    }
  }

  pendingVoices() {
    if (this.project.settings.voice.mode !== 'ai') return [];
    return this.project.scenes.filter((sc) => !this.clipFresh(sc) && sc.text.trim());
  }

  async runVoiceQueue() {
    if (this.disposed) return;
    if (this.voiceRunning) {
      this.voiceAgain = true;
      return;
    }
    this.voiceRunning = true;
    this.voiceError = '';
    try {
      do {
        this.voiceAgain = false;
        const need = this.pendingVoices();
        this.voiceTotal = need.length;
        this.voiceDone = 0;
        for (const sc of need) {
          if (this.disposed || this.voiceAgain) break;
          if (this.clipFresh(sc)) continue;
          const v = this.project.settings.voice;
          if (v.mode !== 'ai') break;
          this.voiceBusy.add(sc.id);
          this.updateSceneMeta(sc.id);
          this.setStatus();
          const text = sc.text;
          const clip = await voiceClip(text, v.id, v.speed);
          this.voiceBusy.delete(sc.id);
          if (sc.text === text) this.clips.set(sc.id, clip);
          this.voiceDone++;
          this.updateSceneMeta(sc.id);
          this.scheduleRebuild();
        }
      } while (this.voiceAgain && !this.disposed);
    } catch (e) {
      console.warn(e);
      this.voiceError = e.message || t('The voice engine stopped.');
      this.voiceBusy.clear();
      this.renderScenes();
      toast(t('Voice: {error}', { error: this.voiceError }), { kind: 'error', action: t('Retry'), onAction: () => this.runVoiceQueue(), timeout: 9000 });
    } finally {
      this.voiceRunning = false;
      this.setStatus();
      if (this.inspector) this.inspector.refresh('voice');
    }
  }

  async waitForVoices(onProgress) {
    if (this.project.settings.voice.mode !== 'ai') return true;
    if (!this.pendingVoices().length) return true;
    this.runVoiceQueue();
    while (this.pendingVoices().length) {
      if (this.disposed) return false;
      if (!this.voiceRunning && this.voiceError) return false;
      onProgress && onProgress(this.voiceDone || 0, this.voiceTotal || this.pendingVoices().length);
      await new Promise((r) => setTimeout(r, 250));
    }
    return true;
  }

  async recordScene(i) {
    const sc = this.project.scenes[i];
    const result = await openRecorder(sc.text, this.project.lang);
    if (!result) return;
    const id = uid('r_');
    const clip = await storeClip(id, sc.text, result.pcm, result.sampleRate, 'mic');
    sc.recId = id;
    sc.recText = sc.text;
    this.clips.set(sc.id, clip);
    this.updateSceneMeta(sc.id);
    this.scheduleRebuild();
    this.save();
  }

  // ------------------------------------------------------------------ timeline & mix
  rebuildTimeline() {
    if (this.disposed) return;
    this.timeline = buildTimeline(this.project, this.freshClips());
    clearCaptionCache();
    this.chunks = buildChunks(this.timeline, this.project, this.project.settings.captions);
    this.renderer.setData(this.renderData());
    this.player.setDuration(this.timeline.duration);
    this.renderStrip();
    this.updateDurations();
    this.player.draw();
    this.scheduleMix();
  }

  rebuildChunks() {
    clearCaptionCache();
    this.chunks = buildChunks(this.timeline, this.project, this.project.settings.captions);
    this.renderer.setData(this.renderData());
    this.player.draw();
  }

  async musicBuffer(duration) {
    const m = this.project.settings.music;
    if (!m.enabled) return null;
    if (m.mood === 'custom' && m.customAssetId) {
      if (!this.customMusic || this.customMusic.id !== m.customAssetId) {
        const a = await db.get('assets', m.customAssetId);
        if (!a) return null;
        const ctx = new OfflineAudioContext(2, 48000, 48000);
        let buf;
        try {
          buf = await ctx.decodeAudioData(await a.blob.arrayBuffer());
        } catch {
          throw new Error(t('Your music file couldn’t be read. Choose another track in Music, or turn music off.'));
        }
        this.customMusic = { id: m.customAssetId, buf };
      }
      return this.customMusic.buf;
    }
    return renderMusic(m.mood, duration, 1);
  }

  /** Mix voice, music and sound effects for a timeline. Throws on failure. */
  async buildMix(tl) {
    const m = this.project.settings.music;
    const music = await this.musicBuffer(tl.duration);
    const voices = tl.scenes.filter((s) => s.clip).map((s) => ({ start: s.voiceStart, clip: s.clip }));
    return mixdown({
      duration: tl.duration,
      voices,
      music,
      musicVolume: m.volume,
      duck: m.duck,
      loopMusic: m.mood === 'custom',
      sfx: m.sfx,
      cuts: tl.cuts,
      pops: tl.pops,
    });
  }

  /** Freeze the current timeline, captions and a fresh audio mix for export. */
  async exportSnapshot() {
    for (const d of [this.scheduleRebuild, this.scheduleMix, this.scheduleVoice]) d.cancel && d.cancel();
    this.rebuildTimeline();
    this.scheduleMix.cancel && this.scheduleMix.cancel();
    const timeline = this.timeline;
    const chunks = this.chunks;
    const mix = await this.buildMix(timeline);
    return { timeline, chunks, mix };
  }

  async rebuildMix() {
    if (this.disposed || !this.timeline) return;
    const version = ++this.mixVersion;
    const tl = this.timeline;
    try {
      const mix = await this.buildMix(tl);
      if (version !== this.mixVersion || this.disposed) return;
      this.mix = mix;
      this.player.setBuffer(mix);
      if (!this.thumbDone) {
        this.thumbDone = true;
        this.updateThumb();
      }
    } catch (e) {
      console.warn('mix failed', e);
      if (e && e.message && e.message !== this.lastMixError) toast(e.message, { kind: 'error', timeout: 7000 });
      this.lastMixError = e && e.message;
    }
  }

  // ------------------------------------------------------------------ settings
  /** Change settings or scenes, then refresh whatever depends on them. */
  change(fn, kind = 'visuals') {
    fn(this.project);
    switch (kind) {
      case 'captions':
        this.rebuildChunks();
        break;
      case 'timeline':
        this.rebuildTimeline();
        break;
      case 'mix':
        this.scheduleMix();
        break;
      case 'voice':
        this.clips.clear();
        this.loadExistingClips().then(() => {
          this.rebuildTimeline();
          this.renderScenes();
          this.runVoiceQueue();
        });
        break;
      case 'media':
        this.media.ensure(this.mediaIds()).then(() => {
          this.renderer.setData(this.renderData());
          this.player.draw();
          this.renderScenes();
        });
        break;
      default:
        this.renderer.setData(this.renderData());
        this.player.draw();
    }
    this.save();
  }

  // ------------------------------------------------------------------ layout
  buildLayout() {
    clear(this.root);
    const p = this.project;
    // top bar
    const L = langMeta(p.lang);
    this.titleInput = h('input', { class: 'ed-title', type: 'text', value: p.title, 'aria-label': t('Video title'), maxlength: 120, lang: L.id, dir: 'auto' });
    this.titleInput.addEventListener('input', () => {
      p.title = this.titleInput.value;
      this.renderer.setData(this.renderData());
      this.player.draw();
      this.save();
    });
    this.statusEl = h('span', { class: 'ed-status', role: 'status' });
    this.exportBtn = h('button', { class: 'btn primary', on: { click: () => this.openExport() } }, icon('download'), t('Export MP4'));
    const back = h('button', { class: 'btn ghost', on: { click: () => this.ctx.navigate('#/') } }, icon('back'), t('Videos'));
    const top = h('div', { class: 'ed-top' }, back, this.titleInput, h('span', { class: 'spacer' }), this.statusEl, this.exportBtn);

    // scenes
    this.sceneList = h('ol', { class: 'scene-list', 'aria-label': t('Scenes') });
    this.sceneMeta = h('span', { class: 'meta' });
    const addBtn = h('button', { class: 'btn small add-scene', on: { click: () => this.addScene(this.project.scenes.length - 1) } }, icon('plus', 15), t('Add scene'));
    const scenes = h('aside', { class: 'scenes' }, h('div', { class: 'panel-head' }, h('h3', { text: t('Scenes') }), this.sceneMeta), this.sceneList, addBtn);

    // stage
    this.canvas = h('canvas', { 'aria-label': t('Video preview') });
    this.phone = h('div', { class: 'phone' }, this.canvas);
    this.playBtn = h('button', { class: 'btn icon', 'aria-label': t('Play'), title: t('Play (Space)'), on: { click: () => this.player.toggle() } }, icon('play'));
    this.timeEl = h('span', { class: 'time', text: '0:00 / 0:00' });
    this.scrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': t('Position') });
    this.scrub.addEventListener('input', () => this.player.seek((this.scrub.value / 1000) * (this.timeline ? this.timeline.duration : 0)));
    this.safeBtn = h('button', { class: 'btn icon', 'aria-label': t('Show app safe zones'), title: t('Show where TikTok and Shorts buttons sit'), 'aria-pressed': 'false' }, icon('safe'));
    this.safeBtn.addEventListener('click', () => {
      this.renderer.safeZones = !this.renderer.safeZones;
      this.safeBtn.setAttribute('aria-pressed', String(this.renderer.safeZones));
      this.safeBtn.classList.toggle('primary', this.renderer.safeZones);
      this.player.draw();
    });
    // time runs left to right in every language
    this.strip = h('div', { class: 'strip', 'aria-label': t('Timeline'), dir: 'ltr' });
    this.head = h('div', { class: 'head' });
    const stage = h(
      'section',
      { class: 'stage' },
      h('div', { class: 'monitor' }, this.phone),
      h('div', { class: 'transport', dir: 'ltr' }, this.playBtn, this.timeEl, this.scrub, this.safeBtn),
      this.strip
    );

    this.inspector = buildInspector(this);
    const inspector = h('aside', { class: 'inspector' }, this.inspector.el);
    this.root.append(h('div', { class: 'editor' }, top, scenes, stage, inspector));

    this.renderer = new Renderer(this.canvas);
    this.player = new Player({
      draw: (time) => this.drawFrame(time),
      onTime: (time) => this.onTime(time),
      onState: (playing) => {
        this.renderer.playing = playing;
        this.playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
        this.playBtn.setAttribute('aria-label', playing ? t('Pause') : t('Play'));
        if (!playing) this.media.pauseAll();
      },
    });
    this.sizeCanvas();
    this.ro = new ResizeObserver(() => {
      this.sizeCanvas();
      this.player.draw();
    });
    this.ro.observe(this.phone);
    this.onResize = debounce(() => {
      this.sceneList.querySelectorAll('textarea').forEach((ta) => {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 2 + 'px';
      });
    }, 150);
    window.addEventListener('resize', this.onResize);
    this.setStatus();
  }

  sizeCanvas() {
    const rect = this.phone.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(180, Math.round(rect.width * dpr));
    const h = Math.round((w * 16) / 9);
    if (this.canvas.width !== w) {
      this.canvas.width = w;
      this.canvas.height = h;
      clearCaptionCache();
    }
  }

  drawFrame(time) {
    if (!this.timeline) return;
    this.renderer.draw(time);
  }

  onTime(time) {
    if (!this.timeline) return;
    const d = this.timeline.duration;
    this.timeEl.textContent = `${fmtTime(time)} / ${fmtTime(d)}`;
    if (document.activeElement !== this.scrub) this.scrub.value = String(Math.round((time / Math.max(0.01, d)) * 1000));
    this.head.style.left = `${(time / Math.max(0.01, d)) * 100}%`;
    const i = sceneAt(this.timeline, time);
    if (i !== this.playingIndex) {
      this.playingIndex = i;
      [...this.sceneList.children].forEach((li, k) => li.classList.toggle('playing', k === i));
      [...this.strip.querySelectorAll('.blk')].forEach((b, k) => b.classList.toggle('cur', k === i));
    }
  }

  setStatus() {
    if (!this.statusEl) return;
    clear(this.statusEl);
    const s = this.engineState;
    const mode = this.project.settings.voice.mode;
    if (mode === 'ai' && s.status === 'loading') {
      const pct = s.total ? Math.round(s.progress * 100) : null;
      const label = pct == null ? t('Starting the voice engine') : s.kind === 'piper' ? t('Downloading the voice {name} {pct}%', { name: s.voiceName, pct }) : t('Downloading AI voices {pct}%', { pct });
      this.statusEl.append(label, h('span', { class: 'bar' }, h('i', { style: { width: `${pct || 5}%` } })));
      return;
    }
    if (mode === 'ai' && this.voiceRunning && this.voiceTotal) {
      const done = this.voiceDone || 0;
      this.statusEl.append(t('Creating voiceover {i} of {total}', { i: Math.min(done + 1, this.voiceTotal), total: this.voiceTotal }), h('span', { class: 'bar' }, h('i', { style: { width: `${Math.round((done / this.voiceTotal) * 100)}%` } })));
      return;
    }
    if (mode === 'ai' && this.voiceError) {
      const retry = h('button', { class: 'btn small', on: { click: () => this.runVoiceQueue() } }, icon('refresh', 14), t('Retry voice'));
      this.statusEl.append(t('Voice not ready'), retry);
      return;
    }
    this.statusEl.append(this.lastSaved ? t('Saved on this PC') : '');
  }

  // ------------------------------------------------------------------ scenes panel
  sceneThumb(sc, i) {
    const v = sc.visual;
    if (v && v.type === 'media' && v.thumb) return h('img', { src: v.thumb, alt: '' });
    const look = lookById(this.project.settings.visuals.look);
    const theme = v && v.type === 'theme' ? v.theme : sceneTheme(look.id, i);
    const key = `${theme}|${look.palette}|${sc.id}`;
    let url = this.thumbCache.get(key);
    if (!url) {
      const c = document.createElement('canvas');
      c.width = 44;
      c.height = 78;
      drawTheme(c.getContext('2d'), 44, 78, theme, look.palette, hashString(sc.id), 2);
      url = c.toDataURL();
      this.thumbCache.set(key, url);
    }
    return h('img', { src: url, alt: '' });
  }

  voiceTag(sc) {
    const mode = this.project.settings.voice.mode;
    if (mode === 'none') return null;
    if (this.voiceBusy.has(sc.id)) return h('span', { class: 'tag voice-busy', text: t('Voicing…') });
    if (this.clipFresh(sc)) return h('span', { class: 'tag voice-ok', title: t('Voice ready'), text: t('Voice ✓') });
    if (mode === 'mic') return h('span', { class: 'tag voice-missing', title: t('Use the microphone button to record this line'), text: t('No take') });
    return h('span', { class: 'tag voice-busy', text: this.voiceError ? t('Voice failed') : t('Queued') });
  }

  renderScenes() {
    clear(this.sceneList);
    const mode = this.project.settings.voice.mode;
    const L = langMeta(this.project.lang);
    this.project.scenes.forEach((sc, i) => {
      const ta = h('textarea', { class: 'scene-text', rows: 1, value: sc.text, 'aria-label': t('Scene {n} text', { n: i + 1 }), spellcheck: true, lang: L.id, dir: 'auto' });
      autosize(ta);
      ta.addEventListener('focus', () => this.select(i, { seek: true }));
      ta.addEventListener('input', () => this.editText(i, ta.value));
      const num = h('button', { class: 'scene-num', text: String(i + 1), title: t('Play from here'), on: { click: () => this.select(i, { seek: true, play: true }) } });
      const emojiBtn = h('button', { class: 'emoji-btn', title: t('Change sticker'), 'aria-label': t('Change emoji sticker'), text: sc.emoji || '＋', on: { click: () => this.pickEmoji(i) } });
      const visBtn = h('button', { class: 'vis-btn', title: t('Change background'), 'aria-label': t('Change background'), on: { click: () => (this.select(i), this.inspector.show('visuals')) } }, this.sceneThumb(sc, i));
      const meta = h(
        'div',
        { class: 'scene-meta' },
        sc.kind !== 'body' ? h('span', { class: 'tag', text: t(KIND_LABEL[sc.kind]) }) : null,
        h('span', { class: 'tag dur', text: '' }),
        h('span', { class: 'vt' }, this.voiceTag(sc)),
        h(
          'span',
          { class: 'meta-tools' },
          mode === 'mic' ? h('button', { class: 'btn icon small', title: t('Record this line'), 'aria-label': t('Record this line'), on: { click: () => this.recordScene(i) } }, icon('mic', 15)) : null,
          emojiBtn,
          visBtn
        )
      );
      const actions = h(
        'div',
        { class: 'scene-actions' },
        sc.kind === 'hook' ? h('button', { class: 'btn ghost icon small', title: t('Try another hook'), 'aria-label': t('Try another hook'), on: { click: () => this.nextHook(i) } }, icon('wand', 15)) : null,
        h('button', { class: 'btn ghost icon small', title: t('Move up'), 'aria-label': t('Move up'), disabled: i === 0, on: { click: () => this.moveScene(i, -1) } }, icon('up', 15)),
        h('button', { class: 'btn ghost icon small', title: t('Move down'), 'aria-label': t('Move down'), disabled: i === this.project.scenes.length - 1, on: { click: () => this.moveScene(i, 1) } }, icon('down', 15)),
        h('button', { class: 'btn ghost icon small', title: t('Add a scene after this one'), 'aria-label': t('Add scene after'), on: { click: () => this.addScene(i) } }, icon('plus', 15)),
        h('button', { class: 'btn ghost icon small', title: t('Delete scene'), 'aria-label': t('Delete scene'), disabled: this.project.scenes.length <= 1, on: { click: () => this.deleteScene(i) } }, icon('trash', 15))
      );
      const li = h('li', { class: `scene${i === this.selected ? ' sel' : ''}`, dataset: { id: sc.id } }, num, h('div', {}, ta, meta, actions));
      this.sceneList.append(li);
    });
    this.updateDurations();
  }

  updateSceneMeta(sceneId) {
    const li = this.sceneList.querySelector(`li[data-id="${sceneId}"]`);
    if (!li) return;
    const sc = this.project.scenes.find((s) => s.id === sceneId);
    const vt = li.querySelector('.vt');
    if (vt && sc) vt.replaceChildren(...[this.voiceTag(sc)].filter(Boolean));
  }

  updateDurations() {
    if (!this.timeline) return;
    const total = this.timeline.duration;
    this.sceneMeta.textContent = joinList(t('{n} scenes', { n: this.project.scenes.length }), fmtTime(total));
    this.timeline.scenes.forEach((s, i) => {
      const li = this.sceneList.children[i];
      if (!li) return;
      const d = li.querySelector('.dur');
      if (d) d.textContent = t('{s}s', { s: fmtNum(s.end - s.start, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
    });
  }

  renderStrip() {
    clear(this.strip);
    if (!this.timeline) return;
    const total = this.timeline.duration;
    this.timeline.scenes.forEach((s, i) => {
      const b = h('button', { class: `blk${i === this.selected ? ' sel' : ''}`, style: { width: `calc(${((s.end - s.start) / total) * 100}% - 2px)` }, title: this.project.scenes[i].text, text: String(i + 1) });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(i, { seek: true });
      });
      this.strip.append(b);
    });
    this.strip.append(this.head);
    this.strip.onclick = (e) => {
      const r = this.strip.getBoundingClientRect();
      this.player.seek(((e.clientX - r.left) / r.width) * total);
    };
  }

  select(i, { seek = false, play = false } = {}) {
    i = Math.max(0, Math.min(this.project.scenes.length - 1, i));
    this.selected = i;
    [...this.sceneList.children].forEach((li, k) => li.classList.toggle('sel', k === i));
    [...this.strip.querySelectorAll('.blk')].forEach((b, k) => b.classList.toggle('sel', k === i));
    if (seek && this.timeline && this.timeline.scenes[i]) {
      const at = this.timeline.scenes[i].start + (i === 0 ? 0 : 0.02);
      this.player.seek(at + (this.player.playing ? 0 : 0.6));
      if (play) {
        this.player.seek(at);
        this.player.play();
      }
    }
    this.inspector.refresh('scene');
  }

  // ------------------------------------------------------------------ scene actions
  editText(i, text) {
    const sc = this.project.scenes[i];
    sc.text = text;
    const a = analyzeLine(text, sc.kind, this.project.lang);
    sc.keyword = a.keyword || sc.keyword;
    if (!sc.emojiManual) sc.emoji = a.emoji || sc.emoji;
    sc.stat = a.stat;
    const li = this.sceneList.children[i];
    if (li) {
      const eb = li.querySelector('.emoji-btn');
      if (eb) eb.textContent = sc.emoji || '＋';
    }
    const mode = this.project.settings.voice.mode;
    if (mode === 'mic' && sc.recId && this.clips.get(sc.id)) {
      const clip = this.clips.get(sc.id);
      clip.words = alignWords(text, clip.pcm, clip.sampleRate).words;
      sc.recText = text;
    }
    this.updateSceneMeta(sc.id);
    this.scheduleRebuild();
    if (mode === 'ai') this.scheduleVoice();
    this.save();
  }

  nextHook(i) {
    const p = this.project;
    const opts = hookOptions(p.format, { topic: p.topic || pack(p.lang).yourTopic, n: p.scenes.filter((s) => s.kind === 'body').length, question: p.question || '' }, p.lang);
    const cur = opts.indexOf(p.scenes[i].text);
    const next = opts[(cur + 1) % opts.length];
    const li = this.sceneList.children[i];
    const ta = li && li.querySelector('textarea');
    if (ta) {
      ta.value = next;
      ta.dispatchEvent(new Event('input'));
    } else this.editText(i, next);
  }

  addScene(after) {
    const sc = { id: uid('s'), kind: 'body', text: pack(this.project.lang).newLine, keyword: '', emoji: '', stat: null, visual: null };
    this.project.scenes.splice(after + 1, 0, sc);
    this.renderScenes();
    this.rebuildTimeline();
    this.scheduleVoice();
    this.select(after + 1);
    const ta = this.sceneList.children[after + 1]?.querySelector('textarea');
    if (ta) {
      ta.focus();
      ta.select();
    }
    this.save();
  }

  async deleteScene(i) {
    const removed = this.project.scenes.splice(i, 1)[0];
    this.renderScenes();
    this.rebuildTimeline();
    this.select(Math.min(i, this.project.scenes.length - 1));
    this.save();
    toast(t('Scene deleted'), {
      action: t('Undo'),
      onAction: () => {
        if (this.disposed) return;
        i = Math.min(i, this.project.scenes.length);
        this.project.scenes.splice(i, 0, removed);
        this.renderScenes();
        this.rebuildTimeline();
        this.select(i);
        this.save();
      },
    });
  }

  moveScene(i, dir) {
    const j = i + dir;
    const s = this.project.scenes;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    this.renderScenes();
    this.rebuildTimeline();
    this.select(j);
    this.save();
  }

  pickEmoji(i) {
    const sc = this.project.scenes[i];
    const custom = h('input', { type: 'text', placeholder: t('Or type/paste any emoji'), maxlength: 8, value: '' });
    const grid = h('div', { class: 'emoji-pick' });
    let dlg;
    const choose = (e) => {
      sc.emoji = e;
      sc.emojiManual = true;
      this.renderScenes();
      this.change(() => {}, 'visuals');
      dlg.close();
    };
    for (const e of [...new Set([sc.emoji, ...EMOJI_PICKS].filter(Boolean))]) grid.append(h('button', { type: 'button', text: e, on: { click: () => choose(e) } }));
    dlg = modal({
      title: t('Sticker for this scene'),
      size: 'small',
      body: h('div', { style: { display: 'grid', gap: '12px' } }, grid, custom),
      actions: [
        { label: t('No sticker'), onClick: () => choose('') },
        { label: t('Use typed emoji'), kind: 'primary', onClick: () => custom.value.trim() && choose(custom.value.trim()) },
      ],
    });
  }

  // ------------------------------------------------------------------ keyboard & export
  handleKey(e) {
    if (document.body.classList.contains('has-dialog')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if (e.code === 'Space' && !typing) {
      e.preventDefault();
      this.player.toggle();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.saveNow();
      toast(t('Saved'));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      this.openExport();
    } else if (!typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      this.player.seek(this.player.time + (e.key === 'ArrowRight' ? 1 : -1));
    }
  }

  openExport() {
    this.player.pause();
    openExport(this);
  }
}
