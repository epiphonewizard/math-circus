// Saves progress on this device (localStorage). Everything is wrapped so the
// game still works if storage is blocked (private browsing etc).
const SAVE_KEY = 'digital-math-circus-v1';

const Save = {
  data: null,

  defaults() {
    return {
      version: 1,
      levels: {},          // levelIndex -> { done, stars, bestStreak, bestAvg }
      facts: {},           // "3x7" -> stats (see Facts.record)
      tickets: 0,
      owned: ['pomni'],
      outfit: 'pomni',
      boss: { stage: 0, order: null, done: false, legend: false },
      // recallMode: how Round 2 is answered ('voice' | 'keypad'); bossMode: Grand Finale ('choice' | 'voice' | 'keypad')
      settings: {
        voice: true, sound: true, legend: false, unlockAll: false, recallMode: null, bossMode: 'choice',
        friendlyJax: true,   // Jax teases gently instead of mocking
        calmMode: false,     // no screen flicker, fewer floating shapes
        readAloud: false,    // speak each problem as it appears
        startTime: 8,        // seconds for the first question of an act
        minTime: 0,          // shortest the timer gets (0 = automatic: 4.5s early acts → 3.5s later)
        dailyGoal: 2,        // rounds to win per day for a bonus (0 = off)
        breakMinutes: 15,    // stretch-break reminder (0 = off)
      },
      daily: null,           // { date, wins, rewarded }
    };
  },

  load() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) { parsed = null; }
    const d = this.defaults();
    this.data = Object.assign(d, parsed || {});
    this.data.settings = Object.assign(this.defaults().settings, this.data.settings || {});
    this.data.boss = Object.assign(this.defaults().boss, this.data.boss || {});
    // Older saves had one result per act; that becomes Round 1 (Pick it).
    for (const k of Object.keys(this.data.levels)) {
      const L = this.data.levels[k];
      if (!L.pick) {
        this.data.levels[k] = {
          pick: { done: !!L.done, stars: L.stars || 0 },
          recall: { done: false, stars: 0 },
          done: false,
          bestStreak: L.bestStreak || 0,
        };
      }
    }
  },

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },

  reset() {
    this.data = this.defaults();
    this.save();
  },
};
