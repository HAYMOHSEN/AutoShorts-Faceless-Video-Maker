// "Generate video": topic / article / own script → a ready-to-edit project.

import { buildScript, scriptFromLines, starterOutline, topicAsQuestion } from './script.js';
import { wikipediaFacts, onDeviceStatus, writeOnDevice, remoteConfig, writeRemote } from './ai.js';
import { autoLook } from './visuals.js';
import { defaultSettings, createProject, saveProject, highlightForLook } from './project.js';
import { prepareMusic } from './music.js';
import { autoStock, pexelsKey } from './stock.js';
import { engine, voiceClip, defaultVoice, hasAiVoice } from './tts.js';
import { allowed } from './license.js';
import { kvGet } from './db.js';
import { normLang, pack } from './langs.js';
import { t } from './i18n.js';

export class NeedsScriptError extends Error {
  constructor(message, outline) {
    super(message);
    this.outline = outline;
  }
}

/**
 * @param {object} o  { mode, input, lang, format, seconds, voiceId, voiceMode, mood, look, captionStyle, visuals: 'animated'|'stock' }
 * @param {object} cb { onStep(id, label, detail), signal }
 */
export async function generateProject(o, { onStep = () => {}, signal } = {}) {
  const check = () => {
    if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  const input = String(o.input || '').trim();
  if (!input) throw new Error(t('Type a topic, paste an article or write your script first.'));
  const lang = normLang(o.lang);
  const job = { mode: o.mode, input, format: o.format, seconds: o.seconds, lang };

  // 1. script
  onStep('script', t('Writing the script'));
  let script = null;
  const source = {};
  if (o.mode === 'script') {
    script = buildScript({ mode: 'script', input, format: o.format, seconds: o.seconds, lang });
    if (!script.scenes.length) throw new Error(t('Write at least one line of text for your video.'));
  } else {
    const writerPref = await kvGet('aiWriter', 'auto');
    if (writerPref !== 'off') {
      let lines = null;
      try {
        const remote = await remoteConfig();
        if (remote.enabled) {
          onStep('script', t('Writing the script'), t('Using your AI writer'));
          lines = await writeRemote(job, { signal });
        } else if ((await onDeviceStatus(lang)) === 'available') {
          onStep('script', t('Writing the script'), t('Using on-device AI'));
          lines = await writeOnDevice(job, { signal });
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.warn('AI writer failed, using the built-in writer', e);
      }
      if (lines && lines.length >= 3) {
        script = scriptFromLines(lines, { format: o.format, input: o.mode === 'topic' ? input : '', lang });
        source.writer = 'ai';
      }
    }
    check();
    if (!script && o.mode === 'article') {
      script = buildScript({ mode: 'article', input, format: o.format, seconds: o.seconds, lang });
      if (!script.hasBody) throw new NeedsScriptError(t('That text is too short to summarise. Paste a longer article or write the lines yourself.'), starterOutline(script.topic || input, o.format, lang));
    }
    if (!script && o.mode === 'topic') {
      onStep('script', t('Writing the script'), t('Looking up facts'));
      let wiki = null;
      try {
        wiki = await wikipediaFacts(input, { signal, lang });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        const offline = !navigator.onLine;
        throw new NeedsScriptError(
          offline ? t('You are offline, so facts can’t be looked up. We started an outline for you — fill in your points.') : t('No facts were found for that topic. We started an outline for you — fill in your points, or paste an article.'),
          starterOutline(input, o.format, lang)
        );
      }
      script = buildScript({ mode: 'topic', input, source: wiki.text, sourceTitle: wiki.title, format: o.format, seconds: o.seconds, lang });
      source.attribution = pack(lang).credits.facts(wiki.title);
      source.url = wiki.url;
      if (!script.hasBody) throw new NeedsScriptError(t('Not enough facts were found for that topic. We started an outline for you.'), starterOutline(input, o.format, lang));
    }
  }
  check();
  if (!script || !script.scenes.length) throw new NeedsScriptError(t('No usable lines were found. We started an outline for you.'), starterOutline(input, o.format, lang));

  // 2. look & settings
  onStep('look', t('Choosing visuals'));
  const text = [input.slice(0, 400), script.topic, script.title, ...script.scenes.map((s) => s.keyword)].join(' ');
  const lookId = o.look === 'auto' || !o.look ? autoLook(text, allowed, lang) : o.look;
  const settings = defaultSettings({ lang, look: lookId, voiceId: o.voiceId || defaultVoice(lang), mood: o.mood, captionStyle: o.captionStyle, highlight: highlightForLook(lookId) });
  if (o.voiceMode) settings.voice.mode = o.voiceMode;
  if (settings.voice.mode === 'ai' && !hasAiVoice(lang)) settings.voice.mode = 'mic';
  const project = createProject({ script, lang, mode: o.mode, input, format: o.format, seconds: o.seconds, settings, source });
  project.question = o.mode === 'topic' ? topicAsQuestion(input, lang) : '';

  if (o.visuals === 'stock' && (await pexelsKey())) {
    onStep('look', t('Choosing visuals'), t('Finding stock footage'));
    try {
      const assets = await autoStock(project.scenes, {
        kind: 'video',
        topic: script.topic,
        lang,
        signal,
        onProgress: (d, n) => onStep('look', t('Choosing visuals'), t('Stock footage {d} of {total}', { d, total: n })),
      });
      for (const sc of project.scenes) {
        const a = assets.get(sc.id);
        if (a) sc.visual = { type: 'media', assetId: a.id, mediaType: a.mediaType, credit: a.credit, thumb: a.thumb };
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      onStep('look', t('Choosing visuals'), e.message);
    }
  }
  check();

  // 3. music (warm the loop in the background)
  if (settings.music.enabled) prepareMusic(settings.music.mood);

  // 4. voice: load the engine and record the hook so the preview starts with sound
  if (settings.voice.mode === 'ai') {
    onStep('voice', t('Preparing the AI voice'));
    const off = engine.on((s) => {
      if (s.status === 'loading' && s.total) {
        const pct = Math.round(s.progress * 100);
        const what = s.kind === 'piper' ? t('Downloading the voice {name} (one time) {pct}%', { name: s.voiceName, pct }) : t('Downloading voices (one time) {pct}%', { pct });
        onStep('voice', t('Preparing the AI voice'), what, s.progress);
      }
    });
    try {
      await engine.load(settings.voice.id);
      check();
      onStep('voice', t('Recording the voiceover'), t('First line'));
      await voiceClip(project.scenes[0].text, settings.voice.id, settings.voice.speed, { signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      project.voiceError = e.message;
    } finally {
      off();
    }
  }
  check();
  await saveProject(project);
  return project;
}
