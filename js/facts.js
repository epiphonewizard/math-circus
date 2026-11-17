// Curriculum, per-fact mastery tracking, answer options and question scheduling.

// Easiest patterns first: 0, 1, 2, 10, 5, 11, then the harder tables.
const LEVEL_ORDER = [0, 1, 2, 10, 5, 11, 9, 3, 4, 6, 7, 8, 12];
const BOSS_LEVEL = LEVEL_ORDER.length;       // index 13 = Grand Finale
const BOSS_STAGES = 4;
const FAST_MS = 3000;                        // "fluent" = correct in under 3 seconds
const NUMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const TIPS = {
  0: 'Anything times 0 is 0. Zero groups means nothing at all!',
  1: 'Times 1 stays the same. One group of 7 is just 7!',
  2: 'Times 2 means DOUBLE it! 2 × 8 = 8 + 8 = 16',
  10: 'Times 10: just put a 0 on the end! 10 × 6 = 60',
  5: 'Count by 5s! The answer always ends in 0 or 5.',
  11: 'Up to 9, repeat the digit: 11 × 4 = 44. Then 110, 121, 132!',
  9: 'Nines trick: the digits add up to 9! 9 × 6 = 54 (5 + 4 = 9)',
  3: 'Double it, then add one more group: 3 × 6 = 12 + 6 = 18',
  4: 'Double, then double again! 4 × 6 → 12 → 24',
  6: 'Do 5 groups, then add one more: 6 × 7 = 35 + 7 = 42',
  7: '7 × 8 = 56 — think 5, 6, 7, 8! Or do 5 groups + 2 groups.',
  8: 'Double, double, double! 8 × 3 → 6 → 12 → 24',
  12: 'Do 10 groups + 2 groups: 12 × 4 = 40 + 8 = 48',
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function factKey(a, b) { return a <= b ? `${a}x${b}` : `${b}x${a}`; }
function parseKey(k) { const [a, b] = k.split('x').map(Number); return { a, b }; }

const Facts = {
  allKeys() {
    const keys = [];
    for (let a = 0; a <= 12; a++) for (let b = a; b <= 12; b++) keys.push(`${a}x${b}`);
    return keys; // 91 unique facts (turnarounds count once)
  },

  stat(key) {
    const f = Save.data.facts;
    if (!f[key]) f[key] = { seen: 0, correct: 0, wrong: 0, fast: 0, fastStreak: 0, lastRt: 0, last: null, t: 0 };
    return f[key];
  },

  record(a, b, correct, rt, mode = 'choice') {
    const s = this.stat(factKey(a, b));
    s.seen++;
    if (mode !== 'choice') {        // said or typed = recalled from memory, no choices to pick from
      s.recallSeen = (s.recallSeen || 0) + 1;
      if (correct) s.recall = (s.recall || 0) + 1;
    }
    if (correct) {
      s.correct++;
      if (rt <= FAST_MS) { s.fast++; s.fastStreak++; } else s.fastStreak = 0;
    } else {
      s.wrong++;
      s.fastStreak = 0;
    }
    s.lastRt = Math.round(rt);
    s.last = correct ? 'right' : 'wrong';
    s.t = Date.now();
  },

  // unseen | struggling | learning | fluent
  status(key) {
    const s = Save.data.facts[key];
    if (!s || !s.seen) return 'unseen';
    if (s.last === 'wrong' || s.correct / s.seen < 0.6) return 'struggling';
    if (s.fastStreak >= 2) return 'fluent';
    return 'learning';
  },

  // Strategy tip: use the factor with the easiest strategy (earliest in LEVEL_ORDER).
  tipFor(a, b) {
    const n = LEVEL_ORDER.indexOf(a) <= LEVEL_ORDER.indexOf(b) ? a : b;
    return TIPS[n];
  },

  // One right answer + two *plausible* wrong answers (common mistakes).
  options(a, b) {
    const c = a * b;
    const pool = [];
    const add = (v, w) => { if (v >= 0 && v !== c) pool.push({ v, w }); };
    add(a * (b + 1), 3); add(a * (b - 1), 3); add((a + 1) * b, 3); add((a - 1) * b, 3); // one row off
    add(a + b, 2);                                                                     // added instead
    add(c + 1, 1); add(c - 1, 1); add(c + 2, 1); add(c - 2, 1); add(c + 10, 1); add(c - 10, 1);
    const picks = [];
    let guard = 0;
    while (picks.length < 2 && guard++ < 50) {
      const cands = pool.filter(p => !picks.includes(p.v));
      if (!cands.length) break;
      const tot = cands.reduce((s, p) => s + p.w, 0);
      let r = Math.random() * tot;
      let chosen = cands[cands.length - 1];
      for (const p of cands) { r -= p.w; if (r <= 0) { chosen = p; break; } }
      picks.push(chosen.v);
    }
    let k = 1;
    while (picks.length < 2) { const v = c + k++; if (!picks.includes(v)) picks.push(v); }
    return shuffle([c, ...picks]);
  },
};

// Schedules questions: every required fact must be answered correctly, missed
// facts come back a few questions later AND again near the end, and earlier
// tables are mixed in as review (weighted toward weak facts).
class QuestionSession {
  constructor({ newFacts, reviewPool = [], reviewRate = 0, replayGap = 3 }) {
    this.queue = shuffle(newFacts.slice());
    this.pending = new Set(newFacts.map(f => factKey(f.a, f.b)));
    this.total = this.pending.size;
    this.reviewPool = reviewPool;
    this.reviewRate = reviewRate;
    this.replayGap = replayGap;
    this.replays = [];     // {a, b, due}
    this.endReplays = [];  // {a, b}
    this.q = 0;
    this.lastKey = null;
  }

  _take(f, tag) {
    this.lastKey = factKey(f.a, f.b);
    // Randomise order so turnarounds get practised (3×7 and 7×3).
    const flip = Math.random() < 0.5;
    return { a: flip ? f.b : f.a, b: flip ? f.a : f.b, key: this.lastKey, tag };
  }

  _pickReview() {
    const weight = { struggling: 5, unseen: 2, learning: 2, fluent: 0.6 };
    const cands = this.reviewPool.filter(f => factKey(f.a, f.b) !== this.lastKey);
    const w = f => weight[Facts.status(factKey(f.a, f.b))];
    const tot = cands.reduce((s, f) => s + w(f), 0);
    let r = Math.random() * tot;
    for (const f of cands) { r -= w(f); if (r <= 0) return f; }
    return cands[cands.length - 1];
  }

  next() {
    this.q++;
    const notLast = f => factKey(f.a, f.b) !== this.lastKey;
    const hasReview = this.reviewPool.length > 1;

    const due = this.replays.findIndex(r => r.due <= this.q && notLast(r));
    if (due >= 0) return this._take(this.replays.splice(due, 1)[0], 'replay');

    if (this.queue.length) {
      if (hasReview && this.q > 2 && Math.random() < this.reviewRate) return this._take(this._pickReview(), 'review');
      let j = this.queue.findIndex(notLast);
      if (j < 0) j = 0;
      return this._take(this.queue.splice(j, 1)[0], 'new');
    }
    for (const [list, tag] of [[this.replays, 'replay'], [this.endReplays, 'final']]) {
      if (!list.length) continue;
      if (list === this.replays) list.sort((x, y) => x.due - y.due);
      let k = list.findIndex(notLast);
      if (k < 0) {
        if (hasReview) return this._take(this._pickReview(), 'review');
        k = 0;
      }
      return this._take(list.splice(k, 1)[0], tag);
    }
    return null; // finished
  }

  report(q, correct) {
    if (correct) { this.pending.delete(q.key); return; }
    this.replays.push({ a: q.a, b: q.b, due: this.q + this.replayGap });
    if (!this.endReplays.some(r => factKey(r.a, r.b) === q.key)) this.endReplays.push({ a: q.a, b: q.b });
  }

  get progress() { return (this.total - this.pending.size) / this.total; }
}

function buildLevelSession(levelIdx) {
  const n = LEVEL_ORDER[levelIdx];
  const newFacts = NUMS.map(k => ({ a: n, b: k }));
  const seen = new Set();
  const reviewPool = [];
  for (const p of LEVEL_ORDER.slice(0, levelIdx)) {
    for (const k of NUMS) {
      if (k === n) continue;
      const key = factKey(p, k);
      if (!seen.has(key)) { seen.add(key); reviewPool.push({ a: p, b: k }); }
    }
  }
  return new QuestionSession({ newFacts, reviewPool, reviewRate: levelIdx > 0 ? 0.3 : 0, replayGap: 3 });
}

function buildBossSession(stage) {
  const B = Save.data.boss;
  if (!B.order) { B.order = shuffle(Facts.allKeys()); Save.save(); }
  const per = Math.ceil(B.order.length / BOSS_STAGES);
  const keys = B.order.slice(stage * per, (stage + 1) * per);
  return new QuestionSession({ newFacts: keys.map(parseKey), replayGap: 4 });
}

// Timer gets shorter as the child answers correctly, never below this floor.
function levelTimerFloor(idx) { return idx < 3 ? 4.5 : idx < 8 ? 4 : 3.5; }
