// Game flow: menus, level runs, question gates, success / fail, checkpoints.
const BASE_SPEED = 11;
const START_LIMIT = 8;     // seconds for the first question of a level
const JUMP_DUR = 0.62;
// Extra seconds for answer modes. Voice gets none: her time is measured to when she
// STARTS talking, and the gate waits while the recognizer works.
const MODE_BONUS = { choice: 0, keypad: 1, voice: 0 };
const VOICE_GRACE_MS = 4000;   // max time per question the gate waits on "she started talking"

const LINES = {
  jax: {
    fail: ['Wow. Riveting.', 'Gravity: 1. You: 0.', "Ooh, that's gonna leave a mark.", 'Nice try, jester.', 'Heh. Classic.', 'Did you even LOOK at the numbers?'],
    timeout: ['Tick tock, jester!', 'Snooze, you lose!', 'Were you taking a nap?'],
    streak5: ['Lucky guess. Probably.', 'Hm. Not bad... for a jester.'],
    streak10: ["Okay... that's kind of impressive. Whatever.", "Ugh. Fine. You're good at this."],
  },
  // Default: still sarcastic, but on her side (Grown-ups → "Friendly Jax").
  jaxFriendly: {
    fail: ['Okay, okay, that one was sneaky. Next!', 'Eh, even I miss sometimes. Rarely. But sometimes.', 'Shake it off, jester!', "That one's coming back. You'll get it."],
    timeout: ["Too slow! ...You'll get the next one.", 'Tick tock! You got this.'],
    streak5: ['Huh. Not bad, jester.', "Okay, you're actually good at this."],
    streak10: ["TEN?! Fine. I'm impressed.", 'Who taught you math? ...Was it me? It was me.'],
  },
  pomni: {
    fail: ['Oh no oh no oh no!', 'Are you okay?! ...Next one!', "Deep breaths. We've got this!"],
    timeout: ['Hurry, Jax!', 'Pick one, pick one!'],
    streak5: ["Woah! You're on fire!", 'That was amazing!'],
    streak10: ['TEN in a row?! How?!', "You're a math legend!"],
  },
  caine: {
    win: ['MAGNIFICENT!', 'Spectacular! Stupendous! Mathematical!', 'Bravo! What a performance!'],
    lose: ['Oh dear! Not to worry, every star performer stumbles!', 'A small tumble into the void! Happens to the best of us!'],
  },
};

const Game = {
  mode: 'menu',
  state: 'idle',
  run: null,
  playerLane: 1,
  runPhase: 0,
  t: 0,
  laughT: 0,

  init() {
    Save.load();
    World.init(document.getElementById('game'));
    this.caine = Characters.makeCaine();
    this.caine.root.visible = false;
    World.scene.add(this.caine.root);
    this.dizzy = this.makeDizzy();
    if (!Save.data.owned.includes(Save.data.outfit)) Save.data.outfit = 'pomni';
    this.setOutfit(Save.data.outfit);
    UI.init();
    this.toMenu('title');
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });

    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      World.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  makeDizzy() {
    const g = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(0.13);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(geo, mat);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      g.add(s);
    }
    g.visible = false;
    return g;
  },

  setOutfit(id) {
    if (this.player) World.scene.remove(this.player.root);
    this.player = Characters.make(id);
    this.player.root.rotation.y = Math.PI;              // face down the track (-z)
    this.player.root.position.x = (this.playerLane - 1) * LANE_W;
    this.player.root.add(this.dizzy);
    this.dizzy.position.y = this.player.headY + 0.5;
    World.scene.add(this.player.root);
    const sideKind = id.startsWith('jax') ? 'pomni' : 'jax';
    if (!this.sidekick || this.sidekick.kind !== sideKind) {
      if (this.sidekick && this.sidekick.root.parent) this.sidekick.root.parent.remove(this.sidekick.root);
      this.sidekick = Characters.make(sideKind);
    }
    Save.data.outfit = id;
    Save.save();
  },

  // An act is "done" only when Round 2 (say/type) is won.
  isUnlocked(i) {
    const L = Save.data.levels;
    if (Save.data.settings.unlockAll) return true;
    if (i === BOSS_LEVEL) return LEVEL_ORDER.every((_, k) => L[k] && L[k].done);
    return i === 0 || !!(L[i - 1] && L[i - 1].done);
  },

  level(i) {
    if (!Save.data.levels[i]) {
      Save.data.levels[i] = { pick: { done: false, stars: 0 }, recall: { done: false, stars: 0 }, done: false, bestStreak: 0 };
    }
    return Save.data.levels[i];
  },

  // ---------- SKIPPING (grown-up only) ----------
  // A skipped act counts as complete (both rounds) with no stars; she can still play it for stars.
  setSkipped(i, on) {
    if (on) {
      const L = this.level(i);
      if (L.done) return;
      L.pick.done = true;
      L.recall.done = true;
      L.done = true;
      L.skipped = true;
    } else {
      delete Save.data.levels[i];   // back to not started
    }
    Save.save();
  },

  // Mark every act before `idx` as known (idx = BOSS_LEVEL unlocks the Grand Finale).
  skipTo(idx) {
    for (let k = 0; k < Math.min(idx, LEVEL_ORDER.length); k++) this.setSkipped(k, true);
  },

  recallUnlocked(i) { return Save.data.settings.unlockAll || this.level(i).pick.done; },

  // Round 1 until it's won, then Round 2.
  defaultRound(i) { return this.level(i).pick.done ? 'recall' : 'pick'; },

  // Effective answer mode for Round 2 / the Finale (falls back to typing if the mic can't be used).
  modeFor(r) {
    const s = Save.data.settings;
    let m = r.boss ? (s.bossMode || 'choice') : r.round === 'pick' ? 'choice' : (s.recallMode || 'voice');
    if (m === 'voice' && !Voice.available) m = 'keypad';
    return m;
  },

  setRound(round) {
    const r = this.run;
    if (!r || this.state !== 'intro' || r.boss) return;
    if (round === 'recall' && !this.recallUnlocked(r.levelIdx)) {
      UI.toast('Win Round 1 first — then you can say it or type it!', 2400);
      return;
    }
    r.round = round;
    UI.updateHud(r);
    UI.showIntro(r);
  },

  toMenu(screen) {
    this.mode = 'menu';
    this.state = 'idle';
    this.run = null;
    Voice.stop();
    World.clearGates();
    this.playerLane = 1;
    this.resetPose();
    this.caine.root.visible = false;
    UI.hud(false);
    UI.clearQuestion();
    if (screen === 'map') UI.showMap(); else UI.show(screen);
  },

  resetPose() {
    const p = this.player;
    p.root.position.set((this.playerLane - 1) * LANE_W, 0, 0);
    p.rig.rotation.set(0, 0, 0);
    this.dizzy.visible = false;
  },

  // ---------- STARTING A RUN ----------
  startLevel(idx, practice = false, round = null) {
    this.mode = 'run';
    World.clearGates();
    this.playerLane = 1;
    this.resetPose();
    const boss = idx === BOSS_LEVEL;
    if (!boss) {
      round = round || this.defaultRound(idx);
      if (round === 'recall' && !this.recallUnlocked(idx)) round = 'pick';
    }
    const r = this.run = {
      levelIdx: idx, practice, boss, round: boss ? null : round, hearts: 3, misses: 0, correct: 0, streak: 0, best: 0,
      rts: [], tickets: 0, q: null, stage: 0,
    };
    if (boss) {
      r.stage = Save.data.boss.stage;
      r.session = buildBossSession(r.stage);
      r.limit = r.floor = Save.data.settings.legend ? 2 : 3;
    } else {
      r.session = buildLevelSession(idx);
      const s = Save.data.settings;
      r.start = r.limit = s.startTime || START_LIMIT;                       // Grown-ups → timer settings
      r.floor = Math.min(r.start, s.minTime || levelTimerFloor(idx));
    }
    UI.show(null);
    UI.hud(true);
    UI.clearQuestion();
    UI.updateHud(r);
    this.state = 'intro';
    this.caine.root.visible = true;
    this.caine.root.position.set(0, 3.7, -3);
    this.caine.root.rotation.set(0, 0, 0);
    r.caineLeaving = false;
    const speech = UI.showIntro(r);
    Sound.say(speech, { pitch: 1.35, rate: 1.05 });
  },

  beginRun() {
    const r = this.run;
    if (!r || this.state !== 'intro') return;
    Sound.unlock();
    if (window.speechSynthesis) speechSynthesis.cancel();
    UI.show(null);
    r.mode = this.modeFor(r);
    if (r.mode === 'voice') Voice.warmup();
    this.state = 'countdown';
    r.cd = 3;
    r.cdShown = null;
    r.caineLeaving = true;
  },

  // ---------- QUESTIONS ----------
  ask() {
    const r = this.run;
    const q = r.session.next();
    if (!q) { this.finishSession(); return; }
    r.q = q;
    q.mode = r.mode;
    q.answer = q.a * q.b;
    if (q.mode === 'choice') {
      q.options = Facts.options(q.a, q.b);
      q.correctLane = q.options.indexOf(q.answer);
    } else {
      // Recall modes: no choices shown, Pomni runs down the middle lane.
      q.options = ['', '?', ''];
      q.correctLane = 1;
      this.playerLane = 1;
      q.typed = '';
    }
    q.kind = Math.random() < 0.6 ? 'cliff' : 'curtain';
    const readAloud = Save.data.settings.readAloud;
    q.limit = (r.practice ? 4 : r.limit) + MODE_BONUS[q.mode] + (readAloud ? 1 : 0);
    q.locked = null;
    q.hearingAt = null;
    q.retried = false;
    const contactZ = q.kind === 'cliff' ? -1.0 : -0.5;
    q.gate = World.spawnGate(q.kind, q.options, contactZ - BASE_SPEED * q.limit);
    q.spawnDist = q.gate.contactZ - q.gate.z;
    if (q.kind === 'curtain') {
      const sk = this.sidekick;
      sk.root.position.set(TRACK_W / 2 + 1.3, 0, 0.9);
      sk.root.rotation.set(0, -0.5, 0);
      q.gate.group.add(sk.root);
    }
    q.t0 = performance.now();
    // Impulse brake: answers are ignored for the first moment of the next few questions.
    q.lockUntil = 0;
    if (r.brakeQs > 0 && q.mode === 'choice') { r.brakeQs--; q.lockUntil = q.t0 + 700; }
    this.state = 'ask';
    UI.showQuestion(q, r.practice, q.lockUntil ? 700 : 0);
    if (readAloud) {
      // In Say it mode, only start the mic after the game has finished speaking,
      // so it can't hear "seven times eight" and take 8 as her answer.
      let started = false;
      const go = () => {
        if (started || r.q !== q || this.state !== 'ask' || q.locked !== null) return;
        started = true;
        q.t0 = performance.now();      // her time starts once the problem has been read
        this.listen();
      };
      Sound.say(`${q.a} times ${q.b}`, { rate: 1.05, force: true, onend: q.mode === 'voice' ? go : null });
      if (q.mode === 'voice') setTimeout(go, 2500);  // in case the speech engine never reports "done"
    } else if (q.mode === 'voice') this.listen();
  },

  // ---------- SAY IT ----------
  listen() {
    const r = this.run, q = r.q;
    const ok = Voice.listen(q.answer, {
      onStart: (at) => {
        if (r.q !== q || q.locked !== null) return;
        q.spokeAt = q.spokeAt || at;
        if (!q.noHold) q.hearingAt = at;
        UI.mic('hearing');
      },
      onHeard: (text) => { if (r.q === q) UI.mic('hearing', text); },
      onResult: (n, text, at) => this.onSpoken(q, n, text, at),
      onError: () => this.voiceFailed(),
    });
    if (!ok) this.voiceFailed();
  },

  onSpoken(q, n, text, at) {
    const r = this.run;
    if (!r || r.q !== q || this.state !== 'ask' || q.locked !== null) return;
    // "Fourteen" vs "forty": ask again instead of marking it wrong.
    if (n !== q.answer && soundsAlike(n, q.answer) && !q.retried) {
      q.retried = true;
      q.hearingAt = null;
      UI.mic('retry', `Did you say ${n}? Say it again!`);
      this.listen();
      return;
    }
    this.submit(n, at);
  },

  voiceFailed() {
    const r = this.run;
    if (!r || r.mode !== 'voice') return;
    r.mode = 'keypad';
    UI.toast('🎤 Can’t use the microphone — switching to Type it', 2600);
    if (this.state === 'ask' && r.q.locked === null) {
      r.q.mode = 'keypad';
      r.q.typed = '';
      UI.showQuestion(r.q, r.practice);
    }
  },

  // ---------- TYPE IT ----------
  key(k) {
    const r = this.run;
    if (this.state !== 'ask' || !r || r.q.mode !== 'keypad' || r.q.locked !== null) return;
    const q = r.q;
    if (k === 'del') q.typed = q.typed.slice(0, -1);
    else if (k === 'ok') { if (q.typed) this.submit(parseInt(q.typed, 10), q.firstKeyAt); return; }
    else if (q.typed.length < 3) {
      if (!q.typed) q.firstKeyAt = performance.now();
      q.typed += k;
    }
    Sound.click();
    UI.typed(q);
    // Auto-submit once enough digits are typed, so speed isn't about finding the ✓ key.
    if (q.typed.length >= String(q.answer).length) this.submit(parseInt(q.typed, 10), q.firstKeyAt);
  },

  // A recall answer (said or typed). `at` = when she started answering.
  submit(value, at) {
    const r = this.run, q = r.q;
    if (this.state !== 'ask' || q.locked !== null) return;
    Voice.stop();
    q.given = value;
    q.locked = value === q.answer ? q.correctLane : -1;
    q.rt = (at || performance.now()) - q.t0;
    UI.lockRecall(q);
    if (q.kind === 'curtain' && q.locked === q.correctLane) World.openCurtain(q.gate, q.correctLane);
  },

  choose(lane) {
    const r = this.run;
    if (this.state !== 'ask' || !r || !r.q || r.q.locked !== null || r.q.mode !== 'choice') return;
    if (performance.now() < r.q.lockUntil) return;   // impulse brake: read it first
    const q = r.q;
    q.locked = lane;
    q.rt = performance.now() - q.t0;
    this.playerLane = lane;
    UI.lockAnswer(lane);
    Sound.click();
    if (q.kind === 'curtain' && lane === q.correctLane) World.openCurtain(q.gate, lane);
  },

  updateAsk(dt) {
    const r = this.run, q = r.q, g = q.gate;
    if (q.locked === null && q.hearingAt) {
      // The gate may be held for at most VOICE_GRACE_MS per question in total, so a noisy
      // room (TV, siblings) can't freeze the timer forever.
      q.heldMs = (q.heldMs || 0) + dt * 1000;
      if (q.heldMs > VOICE_GRACE_MS) {
        q.hearingAt = null;        // it was noise, not an answer: let the clock run again
        q.noHold = true;
        Voice.resetSpeech();
        UI.mic('listen');
      }
    }
    if (q.locked === null && q.hearingAt) {
      // She started talking in time: hold the gate while the recognizer catches up.
      World.speed = BASE_SPEED * THREE.MathUtils.clamp((-5 - g.z) / 8, 0, 1);
    } else if (q.locked === null) {
      if (r.practice) {
        // Practice: the gate glides in and waits for an answer.
        World.speed = BASE_SPEED * THREE.MathUtils.clamp((-16 - g.z) / 12, 0, 1);
      } else {
        World.speed = BASE_SPEED;
        UI.timer(THREE.MathUtils.clamp((g.contactZ - g.z) / q.spawnDist, 0, 1));
      }
    } else {
      // Answer locked in: dash toward the gate.
      World.speed = g.z < -12 ? Math.min(90, Math.max(BASE_SPEED, (-12 - g.z) / 0.3)) : BASE_SPEED;
    }
    if (g.z >= g.contactZ) this.resolve();
  },

  resolve() {
    const r = this.run, q = r.q;
    const timeout = q.locked === null;
    const ok = !timeout && q.locked === q.correctLane;
    Voice.stop();
    Facts.record(q.a, q.b, ok, timeout ? q.limit * 1000 : q.rt, q.mode);
    r.session.report(q, ok);
    UI.reveal(q, ok);

    // Impulse brake: two super-fast wrong taps in a row → "read it first".
    if (q.mode === 'choice' && !ok && !timeout && q.rt < 600) r.fastWrong = (r.fastWrong || 0) + 1;
    else r.fastWrong = 0;
    if (r.fastWrong >= 2) {
      r.fastWrong = 0;
      r.brakeQs = 3;
      setTimeout(() => UI.say('Pomni', 'Whoa, read it first! Take a breath.', 'pomni'), 900);
    }

    // Halfway checkpoint (normal acts only; the Finale has its own stages).
    if (ok && !r.boss && !r.practice && !r.checkpoint && r.session.progress >= 0.5) {
      r.checkpoint = { session: r.session.snapshot(), misses: r.misses, correct: r.correct, rts: r.rts.slice(), limit: r.limit };
      setTimeout(() => UI.toast('✅ Checkpoint! Halfway there!', 2000), 300);
    }

    if (ok) this.onCorrect(); else this.onWrong(timeout);
    Save.save();
    UI.updateHud(r);
  },

  // Out of hearts after the checkpoint: continue from the halfway point with full hearts.
  resumeCheckpoint() {
    const r = this.run;
    if (!r || !r.checkpoint) return;
    const c = r.checkpoint;
    r.session.restore(c.session);
    r.correct = c.correct;         // misses are kept, so continuing from a checkpoint can't earn 3 stars
    r.rts = c.rts.slice();
    r.limit = c.limit;
    r.hearts = 3;
    r.streak = 0;
    r.usedCheckpoint = true;
    World.clearGates();
    this.playerLane = 1;
    this.resetPose();
    UI.show(null);
    UI.updateHud(r);
    this.state = 'countdown';
    r.cd = 3;
    r.cdShown = null;
  },

  onCorrect() {
    const r = this.run, q = r.q;
    r.correct++;
    r.streak++;
    r.best = Math.max(r.best, r.streak);
    r.rts.push(q.rt);
    if (!r.practice && !r.boss) r.limit = Math.max(r.floor, r.limit - 0.35);
    let tix = 1;
    if (r.streak % 5 === 0) tix += 3;
    // Surprise prize box: unpredictable rewards keep it exciting.
    else if (Math.random() < 0.12) {
      const prize = 2 + Math.floor(Math.random() * 5);
      tix += prize;
      setTimeout(() => { UI.toast(`🎁 Surprise box! +${prize} 🎟`, 1600); Sound.fanfare(); }, 350);
    }
    r.tickets += tix;
    Save.data.tickets += tix;
    Sound.correct();
    setTimeout(() => Sound.ticket(), 160);
    const p = this.player.root.position;
    World.confetti(new THREE.Vector3(p.x, 1.6, p.z - 0.5), 36);
    if (r.streak === 5 || (r.streak > 0 && r.streak % 10 === 0)) {
      this.sidekickLine(r.streak >= 10 ? 'streak10' : 'streak5');
      UI.toast(`🔥 ${r.streak} in a row! +3 🎟`);
    }
    if (q.kind === 'cliff') {
      this.state = 'jump';
      r.jumpT = 0;
      r.flip = r.streak >= 3;
      World.bouncePad(q.gate, q.correctLane);
      Sound.jump();
    } else {
      this.state = 'gap';
      r.gapT = 0.6;
    }
  },

  onWrong(timeout) {
    const r = this.run, q = r.q;
    r.streak = 0;
    r.misses++;
    if (!r.practice) r.hearts--;
    if (!r.practice && !r.boss) r.limit = Math.min(r.start, r.limit + 1);
    Sound.wrong();
    r.cardShown = false;
    if (q.kind === 'cliff') {
      this.state = 'fall';
      r.falling = false;
      r.vy = 0;
      World.fizzlePad(q.gate, this.playerLane);
    } else {
      this.state = 'bonk';
      r.bonkT = 0;
      World.speed = 0;
      World.punch(q.gate, this.playerLane);
      Sound.bonk();
      this.dizzy.visible = true;
      this.laughT = 1.4;
    }
    setTimeout(() => this.sidekickLine(timeout ? 'timeout' : 'fail'), 250);
  },

  sidekickLine(type) {
    const kind = this.sidekick.kind;
    const pool = kind === 'jax' && Save.data.settings.friendlyJax ? LINES.jaxFriendly : LINES[kind];
    UI.say(kind === 'jax' ? 'Jax' : 'Pomni', pick(pool[type]), kind);
  },

  showCorrection() {
    const r = this.run, q = r.q;
    r.cardShown = true;
    this.state = 'card';
    UI.showCorrection(q, Facts.tipFor(q.a, q.b));
    Sound.say(`${q.a} times ${q.b} equals ${q.a * q.b}`);
  },

  afterCard() {
    const r = this.run;
    if (this.state !== 'card' || !r) return;
    UI.show(null);
    World.removeGate(r.q.gate);
    this.resetPose();
    UI.clearQuestion();
    if (!r.practice && r.hearts <= 0) { this.outOfHearts(); return; }
    this.state = 'gap';
    r.gapT = 0.9;
  },

  // ---------- END OF LEVEL / STAGE ----------
  finishSession() {
    const r = this.run;
    UI.clearQuestion();
    if (r.boss) {
      const B = Save.data.boss;
      B.stage = r.stage + 1;
      if (B.stage >= BOSS_STAGES) {
        B.done = true;
        if (Save.data.settings.legend) B.legend = true;
        B.stage = 0;
        B.order = null;
        Save.data.tickets += 50;
        r.tickets += 50;
        Save.save();
        this.state = 'done';
        Sound.fanfare();
        UI.showBossWin(r);
        return;
      }
      Save.save();
      r.stage = B.stage;
      r.hearts = 3;
      r.session = buildBossSession(r.stage);
      Sound.fanfare();
      UI.toast(`✅ Checkpoint! Stage ${r.stage + 1} of ${BOSS_STAGES} — hearts refilled!`, 2600);
      UI.say('Caine', pick(LINES.caine.win), 'caine');
      UI.updateHud(r);
      this.state = 'gap';
      r.gapT = 2.2;
      return;
    }
    this.state = 'done';
    if (r.practice) { UI.showPracticeDone(r); Sound.fanfare(); return; }

    const stars = r.misses === 0 ? 3 : r.misses === 1 ? 2 : 1;
    const L = this.level(r.levelIdx);
    const R = L[r.round];
    R.done = true;
    R.stars = Math.max(R.stars || 0, stars);
    L.done = L.recall.done;            // the act is complete once Round 2 is won
    L.bestStreak = Math.max(L.bestStreak || 0, r.best);
    const bonus = stars * 5;
    Save.data.tickets += bonus;
    r.tickets += bonus;
    r.dailyMsg = this.countDailyWin(r);
    let unlockMsg = null;
    if (L.done && LEVEL_ORDER[r.levelIdx] === 5 && !Save.data.owned.includes('jax')) {
      Save.data.owned.push('jax');
      unlockMsg = "You beat Jax's act! Jax is now playable — find him in the Wardrobe.";
    }
    Save.save();
    Sound.fanfare();
    UI.showLevelWin(r, stars, bonus, unlockMsg);
  },

  // ---------- DAILY GOAL & BREAKS ----------
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },

  daily() {
    const D = Save.data;
    if (!D.daily || D.daily.date !== this.today()) D.daily = { date: this.today(), wins: 0, rewarded: false };
    return D.daily;
  },

  countDailyWin(r) {
    const d = this.daily();
    d.wins++;
    const goal = Save.data.settings.dailyGoal;
    if (goal && !d.rewarded && d.wins >= goal) {
      d.rewarded = true;
      Save.data.tickets += 20;
      r.tickets += 20;
      return `🎯 Daily goal done — ${goal} round${goal > 1 ? 's' : ''} won today! +20 🎟`;
    }
    return goal && !d.rewarded ? `🎯 Today: ${d.wins} of ${goal} rounds won` : null;
  },

  // Returns a stretch-break nudge once she has played for a while (then starts counting again).
  breakDue() {
    const mins = Save.data.settings.breakMinutes;
    if (!mins || this.playSec < mins * 60) return null;
    this.playSec = 0;
    return `🧘 You've been playing for ${mins} minutes. Great time for a stretch, a drink of water, or a wiggle break!`;
  },

  outOfHearts() {
    const r = this.run;
    this.state = 'done';
    UI.clearQuestion();
    if (r.boss) UI.showBossStageFail(r); else UI.showLevelFail(r);
    Sound.say(pick(LINES.caine.lose), { pitch: 1.35, rate: 1.05 });
  },

  // ---------- PAUSE ----------
  pause() {
    if (this.mode !== 'run' || !['countdown', 'gap', 'ask', 'jump', 'fall', 'bonk'].includes(this.state)) return;
    this.prevState = this.state;
    this.state = 'paused';
    Voice.stop();
    this.pausedAt = performance.now();
    UI.show('pause');
  },

  resume() {
    if (this.state !== 'paused') return;
    if (this.run && this.run.q) this.run.q.t0 += performance.now() - this.pausedAt;
    this.state = this.prevState;
    UI.show(null);
    const q = this.run && this.run.q;
    if (this.state === 'ask' && q && q.mode === 'voice' && q.locked === null) { q.hearingAt = null; UI.mic('listen'); this.listen(); }
  },

  quit() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    this.toMenu('map');
  },

  // ---------- FRAME ----------
  update(dt) {
    this.t += dt;
    if (this.state === 'paused') return;
    if (this.mode === 'run' && !['intro', 'done'].includes(this.state)) this.playSec = (this.playSec || 0) + dt;
    if (this.mode === 'run') this.updateRun(dt);
    else World.speed += (6 - World.speed) * Math.min(1, dt * 2);
    World.update(dt);
    this.updatePlayer(dt);
    this.updateSidekick(dt);
    this.updateCaine(dt);
    this.updateCamera(dt);
  },

  updateRun(dt) {
    const r = this.run;
    const ease = (target, rate) => { World.speed += (target - World.speed) * Math.min(1, dt * rate); };
    switch (this.state) {
      case 'intro':
        ease(0, 3);
        break;
      case 'countdown': {
        ease(BASE_SPEED, 1.5);
        r.cd -= dt;
        const n = Math.ceil(r.cd);
        if (n !== r.cdShown) {
          r.cdShown = n;
          if (n > 0) { UI.countdown(String(n)); Sound.tick(); } else { UI.countdown('GO!'); Sound.go(); }
        }
        if (r.cd <= -0.5) { UI.countdown(null); this.state = 'gap'; r.gapT = 0.2; }
        break;
      }
      case 'gap':
        ease(BASE_SPEED, 3);
        r.gapT -= dt;
        if (r.gapT <= 0) this.ask();
        break;
      case 'ask':
        this.updateAsk(dt);
        break;
      case 'jump': {
        World.speed = BASE_SPEED;
        r.jumpT += dt / JUMP_DUR;
        const t = Math.min(1, r.jumpT);
        this.player.root.position.y = 4 * 2.4 * t * (1 - t);
        if (r.flip) this.player.rig.rotation.x = -t * Math.PI * 2;
        if (r.jumpT >= 1) {
          this.player.root.position.y = 0;
          this.player.rig.rotation.x = 0;
          this.state = 'gap';
          r.gapT = 0.35;
        }
        break;
      }
      case 'fall': {
        const p = this.player;
        if (!r.falling) {
          World.speed = BASE_SPEED;
          if (r.q.gate.z >= 0.25) { r.falling = true; Sound.fall(); }
        } else {
          World.speed *= Math.pow(0.02, dt);
          r.vy -= 28 * dt;
          p.root.position.y += r.vy * dt;
          p.rig.rotation.x += dt * 5;
          p.rig.rotation.z += dt * 3;
          if (p.root.position.y < -9 && !r.cardShown) this.showCorrection();
        }
        break;
      }
      case 'bonk': {
        World.speed = 0;
        r.bonkT += dt;
        const k = Math.min(1, r.bonkT / 0.25);
        this.player.root.position.z = Math.sin((k * Math.PI) / 2) * 1.4;
        this.player.rig.rotation.x = 0.5 * k;
        if (r.bonkT > 1.1 && !r.cardShown) this.showCorrection();
        break;
      }
      case 'card':
      case 'done':
        ease(0, 4);
        break;
    }
  },

  updatePlayer(dt) {
    const p = this.player;
    const tx = (this.playerLane - 1) * LANE_W;
    const dx = tx - p.root.position.x;
    p.root.position.x += dx * Math.min(1, dt * 12);
    const st = this.state;
    if (st !== 'fall' && st !== 'bonk') p.rig.rotation.z = THREE.MathUtils.clamp(dx * 0.12, -0.35, 0.35);
    const running = World.speed > 0.5 && st !== 'fall' && st !== 'bonk' && st !== 'jump';
    this.runPhase += dt * (running ? 6 + World.speed * 0.35 : 2.2);
    Characters.animate(p, this.runPhase, running ? 1 : 0.12, st === 'jump');
    if (this.dizzy.visible) this.dizzy.rotation.y += dt * 6;
  },

  updateSidekick(dt) {
    const s = this.sidekick;
    if (!s.root.parent) return;
    this.laughT = Math.max(0, this.laughT - dt);
    if (this.laughT > 0) {
      s.root.position.y = Math.abs(Math.sin(this.t * 14)) * 0.45;
      s.armL.rotation.x = s.armR.rotation.x = -2.6;
      s.legL.rotation.x = s.legR.rotation.x = 0;
    } else {
      s.root.position.y = 0;
      Characters.animate(s, this.t * 2.5, 0.12, false);
      s.armR.rotation.x = -0.4 + Math.sin(this.t * 3) * 0.2;
    }
  },

  updateCaine(dt) {
    const c = this.caine;
    if (!c.root.visible) return;
    c.rig.position.y = Math.sin(this.t * 2) * 0.15;
    c.rig.rotation.z = Math.sin(this.t * 1.3) * 0.08;
    c.glL.position.y = -0.8 + Math.sin(this.t * 3) * 0.12;
    c.glR.position.y = -0.6 + Math.sin(this.t * 3 + 1.5) * 0.2;
    if (this.run && this.run.caineLeaving) {
      c.root.position.y += dt * 6;
      c.root.position.z -= dt * 10;
      c.root.rotation.y += dt * 4;
      if (c.root.position.y > 18) c.root.visible = false;
    }
  },

  updateCamera(dt) {
    const cam = World.camera, look = World.camLook;
    const px = this.player.root.position.x;
    let pos, at;
    if (this.mode === 'menu') { pos = [2.4, 2.0, -4.6]; at = [0, 1.35, 0]; }
    else if (this.state === 'intro') { pos = [0, 2.6, 6.5]; at = [0, 2.0, -6]; }
    else { pos = [px * 0.55, 4.5, 7.2]; at = [px * 0.35, 1.5, -12]; }
    const k = Math.min(1, dt * 3);
    cam.position.x += (pos[0] - cam.position.x) * k;
    cam.position.y += (pos[1] - cam.position.y) * k;
    cam.position.z += (pos[2] - cam.position.z) * k;
    look.x += (at[0] - look.x) * k;
    look.y += (at[1] - look.y) * k;
    look.z += (at[2] - look.z) * k;
    cam.lookAt(look);
  },
};

window.addEventListener('load', () => Game.init());
