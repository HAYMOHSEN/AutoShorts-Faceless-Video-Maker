// Preview playback: plays the mixed audio and drives canvas redraws in sync with the audio clock.

export class Player {
  constructor({ draw, onTime, onState }) {
    this.drawFn = draw;
    this.onTime = onTime || (() => {});
    this.onState = onState || (() => {});
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.gain = null;
    this.duration = 0;
    this.pausedAt = 0;
    this.anchor = 0;
    this.perfAnchor = 0;
    this._playing = false;
    this.raf = 0;
    this.volume = 1;
  }

  get playing() {
    return this._playing;
  }

  get time() {
    if (!this._playing) return this.pausedAt;
    if (this.source && this.ctx) {
      const lat = this.ctx.outputLatency || this.ctx.baseLatency || 0;
      return Math.max(0, this.ctx.currentTime - this.anchor - lat);
    }
    return Math.max(0, performance.now() / 1000 - this.perfAnchor);
  }

  setDuration(d) {
    this.duration = d;
    if (this.pausedAt > d) this.pausedAt = d;
  }

  setBuffer(buf) {
    const t = this.time;
    this.buffer = buf;
    if (this._playing) {
      this.stopSource();
      this.startAt(t);
    }
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  startAt(t) {
    if (this.buffer) {
      this.ensureCtx();
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.gain);
      const offset = Math.min(Math.max(0, t), Math.max(0, this.buffer.duration - 0.01));
      src.start(0, offset);
      this.source = src;
      this.anchor = this.ctx.currentTime - t;
    } else {
      this.source = null;
      this.perfAnchor = performance.now() / 1000 - t;
    }
  }

  stopSource() {
    if (this.source) {
      try {
        this.source.stop();
      } catch {}
      this.source.disconnect();
      this.source = null;
    }
  }

  play() {
    if (this._playing) return;
    if (this.pausedAt >= this.duration - 0.05) this.pausedAt = 0;
    this._playing = true;
    this.startAt(this.pausedAt);
    this.onState(true);
    this.loop();
  }

  pause() {
    if (!this._playing) return;
    this.pausedAt = Math.min(this.time, this.duration);
    this._playing = false;
    this.stopSource();
    cancelAnimationFrame(this.raf);
    this.onState(false);
    this.draw();
  }

  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  seek(t) {
    t = Math.max(0, Math.min(this.duration, t));
    if (this._playing) {
      this.stopSource();
      this.startAt(t);
    } else {
      this.pausedAt = t;
      this.draw();
    }
    this.onTime(t);
  }

  draw() {
    const t = this.time;
    this.drawFn(t);
    this.onTime(t);
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this._playing) return;
      const t = this.time;
      if (t >= this.duration) {
        this.pausedAt = this.duration;
        this._playing = false;
        this.stopSource();
        this.drawFn(this.duration);
        this.onTime(this.duration);
        this.onState(false);
        return;
      }
      this.drawFn(t);
      this.onTime(t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  dispose() {
    this.pause();
    cancelAnimationFrame(this.raf);
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}

/** One-shot audio preview (voice samples, music moods). Returns a stop function. */
let previewCtx = null;
let previewSrc = null;
export function playPreview(buffer, { onEnd } = {}) {
  stopPreview();
  if (!previewCtx) previewCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (previewCtx.state === 'suspended') previewCtx.resume();
  let audio = buffer;
  if (!(buffer instanceof AudioBuffer)) {
    audio = previewCtx.createBuffer(1, buffer.pcm.length, buffer.sampleRate);
    audio.copyToChannel(buffer.pcm, 0);
  }
  const src = previewCtx.createBufferSource();
  src.buffer = audio;
  src.connect(previewCtx.destination);
  src.onended = () => {
    if (previewSrc === src) previewSrc = null;
    onEnd && onEnd();
  };
  src.start();
  previewSrc = src;
  return stopPreview;
}

export function stopPreview() {
  if (previewSrc) {
    try {
      previewSrc.stop();
    } catch {}
    previewSrc = null;
  }
}
