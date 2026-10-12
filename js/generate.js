// "Generate video": topic / article / own script → a ready-to-edit project.

import { buildScript, scriptFromLines, starterOutline, topicAsQuestion } from './script.js';
import { wikipediaFacts, onDeviceStatus, writeOnDevice, remoteConfig, writeRemote } from './ai.js';
import { autoLook } from './visuals.js';
import { defaultSettings, createProject, saveProject, highlightForLook } from './project.js';
import { prepareMusic } from './music.js';
import { autoStock, pexelsKey } from './stock.js';
import { engine, voiceClip } from './tts.js';
import { allowed } from './license.js';
import { kvGet } from './db.js';

export class NeedsScriptError extends Error {
  constructor(message, outline) {
    super(message);
    this.outline = outline;
  }
}

/**
 * @param {object} o  { mode, input, format, seconds, voiceId, mood, look, captionStyle, visuals: 'animated'|'stock' }
 * @param {object} cb { onStep(id, label, detail), signal }
 */
export async function generateProject(o, { onStep = () => {}, signal } = {}) {
  const check = () => {
    if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  const input = String(o.input || '').trim();
  if (!input) throw new Error('Type a topic, paste an article or write your script first.');

  // 1. script
  onStep('script', 'Writing the script');
  let script = null;
  const source = {};
  if (o.mode === 'script') {
    script = buildScript({ mode: 'script', input, format: o.format, seconds: o.seconds });
    if (!script.scenes.length) throw new Error('Write at least one line of text for your video.');
  } else {
    const writerPref = await kvGet('aiWriter', 'auto');
    if (writerPref !== 'off') {
      let lines = null;
      try {
        const remote = await remoteConfig();
        if (remote.enabled) {
          onStep('script', 'Writing the script', 'Using your AI writer');
          lines = await writeRemote({ mode: o.mode, input, format: o.format, seconds: o.seconds }, { signal });
        } else if ((await onDeviceStatus()) === 'available') {
          onStep('script', 'Writing the script', 'Using on-device AI');
          lines = await writeOnDevice({ mode: o.mode, input, format: o.format, seconds: o.seconds }, { signal });
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.warn('AI writer failed, using the built-in writer', e);
      }
      if (lines && lines.length >= 3) {
        script = scriptFromLines(lines, { format: o.format, input: o.mode === 'topic' ? input : '' });
        source.writer = 'ai';
      }
    }
    check();
    if (!script && o.mode === 'article') {
      script = buildScript({ mode: 'article', input, format: o.format, seconds: o.seconds });
      if (!script.hasBody) throw new NeedsScriptError('That text is too short to summarise. Paste a longer article or write the lines yourself.', starterOutline(script.topic || input, o.format));
    }
    if (!script && o.mode === 'topic') {
      onStep('script', 'Writing the script', 'Looking up facts');
      let wiki = null;
      try {
        wiki = await wikipediaFacts(input, { signal });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        const offline = !navigator.onLine;
        throw new NeedsScriptError(
          offline ? 'You are offline, so facts can’t be looked up. We started an outline for you — fill in your points.' : 'No facts were found for that topic. We started an outline for you — fill in your points, or paste an article.',
          starterOutline(input, o.format)
        );
      }
      script = buildScript({ mode: 'topic', input, source: wiki.text, sourceTitle: wiki.title, format: o.format, seconds: o.seconds });
      source.attribution = `Facts: Wikipedia, “${wiki.title}” (CC BY-SA 4.0)`;
      source.url = wiki.url;
      if (!script.hasBody) throw new NeedsScriptError('Not enough facts were found for that topic. We started an outline for you.', starterOutline(input, o.format));
    }
  }
  check();
  if (!script || !script.scenes.length) throw new NeedsScriptError('No usable lines were found. We started an outline for you.', starterOutline(input, o.format));

  // 2. look & settings
  onStep('look', 'Choosing visuals');
  const text = [input.slice(0, 400), script.topic, script.title, ...script.scenes.map((s) => s.keyword)].join(' ');
  const lookId = o.look === 'auto' || !o.look ? autoLook(text, allowed) : o.look;
  const settings = defaultSettings({ look: lookId, voiceId: o.voiceId, mood: o.mood, captionStyle: o.captionStyle, highlight: highlightForLook(lookId) });
  if (o.voiceMode) settings.voice.mode = o.voiceMode;
  const project = createProject({ script, mode: o.mode, input, format: o.format, seconds: o.seconds, settings, source });
  project.question = o.mode === 'topic' ? topicAsQuestion(input) : '';

  if (o.visuals === 'stock' && (await pexelsKey())) {
    onStep('look', 'Choosing visuals', 'Finding stock footage');
    try {
      const assets = await autoStock(project.scenes, {
        kind: 'video',
        topic: script.topic,
        signal,
        onProgress: (d, n) => onStep('look', 'Choosing visuals', `Stock footage ${d} of ${n}`),
      });
      for (const sc of project.scenes) {
        const a = assets.get(sc.id);
        if (a) sc.visual = { type: 'media', assetId: a.id, mediaType: a.mediaType, credit: a.credit, thumb: a.thumb };
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      onStep('look', 'Choosing visuals', e.message);
    }
  }
  check();

  // 3. music (warm the loop in the background)
  if (settings.music.enabled) prepareMusic(settings.music.mood);

  // 4. voice: load the engine and record the hook so the preview starts with sound
  if (settings.voice.mode === 'ai') {
    onStep('voice', 'Preparing the AI voice');
    const off = engine.on((s) => {
      if (s.status === 'loading' && s.total) onStep('voice', 'Preparing the AI voice', `Downloading voices (one time) ${Math.round(s.progress * 100)}%`, s.progress);
    });
    try {
      await engine.load();
      check();
      onStep('voice', 'Recording the voiceover', 'First line');
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
