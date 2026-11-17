// "Say it" mode: speech recognition (Web Speech API) + spoken-number parsing.
// Works in Safari (iPad) and Chrome, but only on https:// or localhost.

const SPOKEN = {
  zero: 0, oh: 0, nothing: 0, none: 0,
  one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, fore: 4,
  five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Returns the LAST number in the phrase, so "seven times eight is fifty-six" → 56.
function parseSpokenNumber(text) {
  const toks = String(text).toLowerCase().replace(/,/g, '').replace(/[-–]/g, ' ').split(/\s+/).filter(Boolean);
  const groups = [];
  let cur = null;
  const close = () => { if (cur !== null) { groups.push(cur); cur = null; } };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].replace(/[^a-z0-9]/g, '');
    if (!t) continue;
    if (/^\d+$/.test(t)) { close(); groups.push(parseInt(t, 10)); continue; }
    if (t === 'hundred') { cur = (cur || 1) * 100; continue; }
    if (t === 'a' && toks[i + 1] === 'hundred') { cur = 1; continue; }
    if (t === 'and' && cur !== null) continue;
    if (t in SPOKEN) {
      const v = SPOKEN[t];
      if (cur === null) cur = v;
      else if (cur >= 100 && cur % 100 === 0 && v < 100) cur += v;          // hundred + twenty
      else if (cur >= 20 && cur % 10 === 0 && v < 10) cur += v;              // fifty + six
      else if (cur === 1 && v >= 20 && v % 10 === 0) cur = 100 + v;         // "one forty (four)"
      else { close(); cur = v; }
      continue;
    }
    close();
  }
  close();
  return groups.length ? groups[groups.length - 1] : null;
}

// 14 ↔ 40, 13 ↔ 30 … easy for a recognizer to mix up.
function soundsAlike(a, b) {
  const twin = x => (x >= 13 && x <= 19 ? (x - 10) * 10 : x >= 30 && x <= 90 && x % 10 === 0 ? x / 10 + 10 : null);
  return twin(a) === b;
}

const Voice = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
  denied: false,
  rec: null,
  active: false,

  get available() { return !!this.SR && window.isSecureContext && !this.denied; },

  get whyUnavailable() {
    if (!this.SR) return 'This browser can’t listen';
    if (!window.isSecureContext) return 'Needs the game on https';
    if (this.denied) return 'Microphone is blocked';
    return '';
  },

  // Called from a button tap so the browser asks for microphone permission up front.
  warmup() {
    if (!this.available) return;
    try {
      const r = new this.SR();
      r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.denied = true; };
      r.onstart = () => { try { r.abort(); } catch (e) { /* ignore */ } };
      r.start();
    } catch (e) { /* ignore */ }
  },

  // Listen for an answer. Calls onResult(number, transcript, spokeAt) once.
  listen(target, handlers) {
    this.stop();
    if (!this.available) return false;
    this.target = target;
    this.handlers = handlers;
    this.active = true;
    this.speechAt = null;
    this._start();
    return true;
  },

  _start() {
    const r = this.rec = new this.SR();
    r.lang = 'en-US';
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    r.onspeechstart = () => { if (this.rec === r && this.active) this._spoke(performance.now()); };
    r.onresult = (e) => {
      if (this.rec !== r || !this.active) return;
      // Some browsers never fire speechstart; the first words arrive ~0.5s after she starts talking.
      if (!this.speechAt) this._spoke(performance.now() - 500);
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alts = [];
        for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
        const nums = alts.map(parseSpokenNumber).filter(n => n !== null);
        if (this.handlers.onHeard) this.handlers.onHeard(alts[0]);
        // Be generous: if ANY alternative is the right answer, count it.
        if (nums.includes(this.target)) { this._finish(this.target, alts[0]); return; }
        if (res.isFinal && nums.length) { this._finish(nums[0], alts[0]); return; }
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.denied = true;
        this.active = false;
        if (this.handlers.onError) this.handlers.onError(e.error);
      }
    };
    // Recognition stops after silence; keep listening until the question is over.
    r.onend = () => {
      if (this.rec === r && this.active) setTimeout(() => { if (this.rec === r && this.active) this._start(); }, 120);
    };
    try { r.start(); } catch (e) { setTimeout(() => { if (this.active) this._start(); }, 300); }
  },

  // Her response time = when she STARTED talking, not when recognition finished.
  _spoke(at) {
    if (this.speechAt) return;
    this.speechAt = at;
    if (this.handlers.onStart) this.handlers.onStart(at);
  },

  // Speech turned out to be noise / not a number: forget the start time.
  resetSpeech() { this.speechAt = null; },

  _finish(n, text) {
    const at = this.speechAt || performance.now();
    this.stop();
    this.handlers.onResult(n, text, at);
  },

  stop() {
    this.active = false;
    if (this.rec) {
      const r = this.rec;
      this.rec = null;
      try { r.abort(); } catch (e) { /* ignore */ }
    }
  },
};
