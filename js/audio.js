// Tiny synthesized sound effects + spoken facts (no audio files needed).
const Sound = {
  ctx: null,

  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  get on() { return Save.data && Save.data.settings.sound && this.ctx; },

  tone(freq, dur, { type = 'sine', vol = 0.18, slide = null, delay = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  noise(dur, vol = 0.2) {
    if (!this.on) return;
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain();
    g.gain.value = vol;
    s.buffer = buf;
    s.connect(g).connect(c.destination);
    s.start();
  },

  correct() { this.tone(660, 0.12, { type: 'triangle' }); this.tone(990, 0.2, { type: 'triangle', delay: 0.09 }); },
  wrong() { this.tone(240, 0.3, { type: 'sawtooth', vol: 0.1, slide: 120 }); },
  jump() { this.tone(260, 0.32, { type: 'square', vol: 0.06, slide: 900 }); },
  fall() { this.tone(900, 0.9, { type: 'sine', vol: 0.14, slide: 110 }); },
  bonk() { this.tone(140, 0.2, { type: 'square', vol: 0.16, slide: 60 }); this.noise(0.15, 0.25); },
  click() { this.tone(520, 0.05, { type: 'square', vol: 0.05 }); },
  ticket() { this.tone(1400, 0.07, { type: 'triangle', vol: 0.07 }); },
  tick() { this.tone(440, 0.1, { type: 'square', vol: 0.06 }); },
  go() { this.tone(880, 0.3, { type: 'square', vol: 0.07 }); },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.14, delay: i * 0.12 })); },

  // onend fires when speaking finishes (or immediately if speech is off/unavailable).
  say(text, { rate = 0.95, pitch = 1.1, onend = null, force = false } = {}) {
    if ((!Save.data.settings.voice && !force) || !window.speechSynthesis) { if (onend) onend(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.pitch = pitch;
      if (onend) { u.onend = onend; u.onerror = onend; }
      speechSynthesis.speak(u);
    } catch (e) { if (onend) onend(); }
  },
};
