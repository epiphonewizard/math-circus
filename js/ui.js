// All HTML overlays: menus, HUD, question banner, cards, wardrobe, grown-ups panel.
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const OUTFITS = [
  { id: 'pomni', name: 'Pomni', cost: 0, colors: ['#d9263b', '#2f5be0'] },
  { id: 'pomni-gold', name: 'Golden Pomni', cost: 60, colors: ['#ffc21a', '#e07f00'] },
  { id: 'pomni-glitch', name: 'Glitch Pomni', cost: 150, colors: ['#8a2be2', '#00d9c0'] },
  { id: 'jax', name: 'Jax', cost: null, unlock: 'Finish the ×5 act to unlock', colors: ['#8e6ad6', '#2f4aa8'] },
  { id: 'jax-gold', name: 'Golden Jax', cost: 250, needs: 'jax', colors: ['#e8b923', '#7a2bb0'] },
];

const UI = {
  screens: ['title', 'map', 'intro', 'correct', 'result', 'pause', 'wardrobe', 'parents'],

  init() {
    const tap = (el, fn) => el.addEventListener('click', () => { Sound.unlock(); Sound.click(); fn(); });
    tap($('#btn-play'), () => this.showMap());
    tap($('#btn-wardrobe'), () => this.showWardrobe());
    this.holdButton($('#btn-parents'), () => this.showParents());
    $$('[data-back]').forEach(b => tap(b, () => {
      if (b.dataset.back === 'map') this.showMap(); else this.show(b.dataset.back);
    }));
    $$('.ans').forEach(b => b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Sound.unlock();
      Game.choose(Number(b.dataset.lane));
    }));
    $$('#keypad button').forEach(b => b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Sound.unlock();
      Game.key(b.dataset.k);
    }));
    tap($('#corr-go'), () => Game.afterCard());
    $('#pause-btn').addEventListener('click', () => Game.pause());
    tap($('#btn-resume'), () => Game.resume());
    tap($('#btn-quit'), () => Game.quit());

    document.addEventListener('keydown', (e) => {
      const lanes = { '1': 0, '2': 1, '3': 2, ArrowLeft: 0, ArrowUp: 1, ArrowDown: 1, ArrowRight: 2 };
      const q = Game.run && Game.run.q;
      if (Game.state === 'ask' && q && q.mode === 'keypad') {
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); Game.key(e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); Game.key('del'); }
        else if (e.key === 'Enter') { e.preventDefault(); Game.key('ok'); }
      }
      else if (e.key in lanes && Game.state === 'ask') { e.preventDefault(); Game.choose(lanes[e.key]); }
      else if ((e.key === ' ' || e.key === 'Enter') && Game.state === 'card' && !$('#corr-go').disabled) { e.preventDefault(); Game.afterCard(); }
      else if ((e.key === ' ' || e.key === 'Enter') && Game.state === 'intro') { e.preventDefault(); Game.beginRun(); }
      else if (e.key === 'Escape') { if (Game.state === 'paused') Game.resume(); else Game.pause(); }
    });
    document.addEventListener('pointerdown', () => Sound.unlock());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    this.refreshTickets();
  },

  show(name) {
    for (const s of this.screens) $('#scr-' + s).classList.toggle('hidden', s !== name);
    if (['title', 'map', 'intro', 'wardrobe', 'parents'].includes(name)) $('#bubble').classList.add('hidden');
    this.refreshTickets();
  },

  hud(on) { $('#hud').classList.toggle('hidden', !on); },

  refreshTickets() { $$('.tix').forEach(e => { e.textContent = Save.data.tickets; }); },

  holdButton(el, fn) {
    let timer = null;
    const start = (e) => {
      e.preventDefault();
      el.classList.add('holding');
      timer = setTimeout(() => { el.classList.remove('holding'); Sound.unlock(); fn(); }, 1600);
    };
    const stop = () => { el.classList.remove('holding'); clearTimeout(timer); };
    el.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, stop));
  },

  stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); },

  // ---------- MAP ----------
  showMap() {
    const grid = $('#level-grid');
    grid.innerHTML = '';
    LEVEL_ORDER.forEach((n, i) => {
      const L = Save.data.levels[i];
      const open = Game.isUnlocked(i);
      const pickDone = !!(L && L.pick.done);
      const b = document.createElement('button');
      b.className = 'lvl' + (open ? '' : ' locked') + (L && L.done ? ' done' : pickDone ? ' half' : '');
      b.innerHTML = `<div class="lvl-act">Act ${i + 1}</div><div class="lvl-num">×${n}</div>` + (open
        ? `<div class="lvl-round">👆 <span class="lvl-stars">${this.stars(L ? L.pick.stars : 0)}</span></div>` +
          `<div class="lvl-round">${pickDone || Save.data.settings.unlockAll ? '🎤' : '🔒'} <span class="lvl-stars">${this.stars(L ? L.recall.stars : 0)}</span></div>`
        : '<div class="lvl-stars">🔒</div>');
      b.addEventListener('click', () => {
        Sound.unlock();
        if (!open) { this.toast('Finish the act before this one first!'); return; }
        Sound.click();
        Game.startLevel(i);
      });
      grid.appendChild(b);
    });
    const bossOpen = Game.isUnlocked(BOSS_LEVEL);
    const B = Save.data.boss;
    const boss = document.createElement('button');
    boss.className = 'lvl boss' + (bossOpen ? '' : ' locked');
    boss.innerHTML = `<div class="lvl-num">🎪 GRAND FINALE</div><div class="lvl-act">${bossOpen
      ? `Every fact, 0–12 · Stage ${B.stage + 1} of ${BOSS_STAGES}${B.done ? ' · ✅ Beaten' : ''}${B.legend ? ' · 👑 Legend' : ''}`
      : '🔒 Finish all 13 acts to unlock'}</div>`;
    boss.addEventListener('click', () => {
      Sound.unlock();
      if (!bossOpen) { this.toast('Finish all 13 acts to unlock the Grand Finale!'); return; }
      Sound.click();
      Game.startLevel(BOSS_LEVEL);
    });
    grid.appendChild(boss);
    this.show('map');
  },

  // ---------- INTRO (Caine) ----------
  showIntro(r) {
    let speech, tip;
    const btns = $('#intro-buttons');
    btns.innerHTML = '';
    if (r.boss) {
      speech = `Ladies, gentlemen and jesters... the GRAND FINALE! Every fact from 0 to 12. Answer each one in under ${r.limit} seconds!`;
      tip = `4 stages with checkpoints — you're starting at stage ${r.stage + 1}. Hearts refill at every checkpoint.`;
      this.button(btns, 'Start the Finale! ▶', 'big', () => Game.beginRun());
    } else {
      const n = LEVEL_ORDER[r.levelIdx];
      const recall = r.round === 'recall';
      speech = r.practice
        ? `Practice time for the ${n}s! No timer, no hearts. Take your time!`
        : recall
          ? `Round two, the ${n}s! No choices this time. Say it or type it, straight from your brain!`
          : `Welcome, welcome! Today's adventure: THE ${n}s!`;
      tip = `💡 ${TIPS[n]}<br><small>${recall
        ? 'Round 2: no answers to pick from — remember it yourself! Win this round to finish the act.'
        : `Round 1: pick the right answer. Win it to unlock Round 2 (say it or type it).`}</small>`;
      if (r.practice) {
        this.button(btns, 'Start practice ▶', 'big', () => Game.beginRun());
      } else {
        this.button(btns, 'Practice first (no timer)', 'ghost', () => Game.startLevel(r.levelIdx, true, r.round));
        this.button(btns, 'PLAY! ▶', 'big', () => Game.beginRun());
      }
    }
    this.button(btns, '◀ Map', 'small ghost', () => Game.quit());
    this.renderRounds(r);
    this.renderModes(r);
    $('#intro-text').textContent = speech;
    $('#intro-tip').innerHTML = tip;
    this.show('intro');
    return speech;
  },

  // Round 1 / Round 2 tabs on an act's intro.
  renderRounds(r) {
    const row = $('#round-row');
    row.innerHTML = '';
    row.classList.toggle('hidden', r.boss);
    if (r.boss) return;
    const L = Game.level(r.levelIdx);
    const open2 = Game.recallUnlocked(r.levelIdx);
    [['pick', 'Round 1 · 👆 Pick it', L.pick], ['recall', 'Round 2 · 🎤 Say or type', L.recall]].forEach(([id, label, rec]) => {
      const b = document.createElement('button');
      const locked = id === 'recall' && !open2;
      b.className = 'round' + (r.round === id ? ' on' : '') + (locked ? ' off' : '');
      b.innerHTML = `${label}<small>${locked ? '🔒 Win Round 1 first' : this.stars(rec.stars)}</small>`;
      b.addEventListener('click', () => { Sound.unlock(); Sound.click(); Game.setRound(id); });
      row.appendChild(b);
    });
  },

  // Answer-mode chips: Say it / Type it for Round 2; all three for the Grand Finale.
  renderModes(r) {
    const row = $('#mode-row');
    row.innerHTML = '';
    const key = r.boss ? 'bossMode' : 'recallMode';
    const show = r.boss || r.round === 'recall';
    row.classList.toggle('hidden', !show);
    if (!show) return;
    const cur = Game.modeFor(r);
    const opts = [['voice', '🎤 Say it', Voice.available ? 'Say the answer' : Voice.whyUnavailable],
      ['keypad', '⌨️ Type it', 'Type the answer']];
    if (r.boss) opts.unshift(['choice', '👆 Tap it', 'Pick from 3']);
    opts.forEach(([id, label, sub]) => {
      const b = document.createElement('button');
      const off = id === 'voice' && !Voice.available;
      b.className = 'mode' + (cur === id ? ' on' : '') + (off ? ' off' : '');
      b.innerHTML = `${label}<small>${sub}</small>`;
      b.addEventListener('click', () => {
        Sound.unlock();
        if (off) { this.toast(`🎤 ${Voice.whyUnavailable}. Try “Type it”!`, 2400); return; }
        Sound.click();
        Save.data.settings[key] = id;
        Save.save();
        this.renderModes(r);
      });
      row.appendChild(b);
    });
  },

  button(parent, label, cls, fn) {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.innerHTML = label;
    b.addEventListener('click', () => { Sound.unlock(); Sound.click(); fn(); });
    parent.appendChild(b);
    return b;
  },

  // ---------- HUD ----------
  updateHud(r) {
    $('#hearts').innerHTML = r.practice
      ? '<span class="pill">Practice · no timer</span>'
      : [0, 1, 2].map(i => `<span class="${i < r.hearts ? 'heart' : 'heart lost'}">♥</span>`).join('');
    $('#level-label').textContent = r.boss
      ? `Grand Finale · Stage ${r.stage + 1}/${BOSS_STAGES}`
      : `Act ${r.levelIdx + 1} · ×${LEVEL_ORDER[r.levelIdx]} · Round ${r.round === 'pick' ? 1 : 2}`;
    $('#progress-fill').style.width = `${Math.round(r.session.progress * 100)}%`;
    $('#streak').textContent = r.streak >= 2 ? `🔥${r.streak}` : '';
    this.refreshTickets();
  },

  showQuestion(q, practice) {
    $('#problem').classList.remove('hidden');
    $('#problem').className = 'problem';
    $('#problem-text').textContent = `${q.a} × ${q.b} = ?`;
    $('#timer').classList.toggle('hidden', practice);
    $('#timer-fill').style.width = '100%';
    $('#answers').classList.toggle('hidden', q.mode !== 'choice');
    $('#keypad').classList.toggle('hidden', q.mode !== 'keypad');
    $('#keypad').classList.remove('done');
    $('#mic').classList.toggle('hidden', q.mode !== 'voice');
    $('#problem-note').textContent = '';
    if (q.mode === 'choice') {
      $$('.ans').forEach((b, i) => {
        b.textContent = q.options[i];
        b.className = 'ans';
      });
    } else if (q.mode === 'voice') this.mic('listen');
  },

  typed(q) {
    $('#problem-text').textContent = `${q.a} × ${q.b} = ${q.typed || '?'}`;
  },

  mic(state, text) {
    const el = $('#mic');
    el.className = 'mic ' + state;
    $('#mic-text').textContent = text
      ? (state === 'hearing' ? `“${text}”` : text)
      : state === 'hearing' ? 'Listening…' : 'Say the answer!';
  },

  lockRecall(q) {
    $('#problem-text').textContent = `${q.a} × ${q.b} = ${q.given}`;
    $('#keypad').classList.add('done');
    $('#mic').classList.add('hidden');
    this.timer(null);
  },

  lockAnswer(lane) {
    $$('.ans').forEach((b, i) => b.classList.add(i === lane ? 'locked' : 'dim'));
    this.timer(null);
  },

  reveal(q, ok) {
    if (q.mode === 'choice') {
      const btns = $$('.ans');
      btns[q.correctLane].classList.remove('dim');
      btns[q.correctLane].classList.add('right');
      if (!ok && q.locked !== null) btns[q.locked].classList.add('wrong');
    } else {
      $('#keypad').classList.add('hidden');
      $('#mic').classList.add('hidden');
      $('#problem-note').textContent = ok ? '' : q.locked === null ? "Out of time!" : `You ${q.mode === "voice" ? "said" : "typed"} ${q.given}`;
    }
    $('#problem-text').textContent = `${q.a} × ${q.b} = ${q.a * q.b}`;
    $('#problem').classList.add(ok ? 'good' : 'bad');
    $('#timer').classList.add('hidden');
    this.timer(null);
  },

  clearQuestion() {
    $('#problem').classList.add('hidden');
    $('#answers').classList.add('hidden');
    $('#keypad').classList.add('hidden');
    $('#mic').classList.add('hidden');
    this.timer(null);
  },

  timer(frac) {
    const gl = $('#glitch');
    if (frac === null) { gl.classList.remove('on'); return; }
    $('#timer-fill').style.width = `${frac * 100}%`;
    gl.classList.toggle('on', frac < 0.3);
  },

  countdown(text) {
    const el = $('#countdown');
    if (!text) { el.classList.add('hidden'); return; }
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  },

  say(who, text, kind) {
    const el = $('#bubble');
    el.className = 'bubble ' + kind;
    el.querySelector('.who').textContent = who;
    el.querySelector('.say').textContent = text;
    clearTimeout(this._bubbleT);
    this._bubbleT = setTimeout(() => el.classList.add('hidden'), 2600);
  },

  toast(text, ms = 1800) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.add('hidden'), ms);
  },

  // ---------- CORRECTION CARD ----------
  showCorrection(q, tip) {
    const c = q.a * q.b;
    $('#corr-fact').textContent = `${q.a} × ${q.b} = ${c}`;
    $('#corr-turn').textContent = q.a !== q.b
      ? `Turnaround: ${q.b} × ${q.a} = ${c} too!`
      : `A square fact: ${q.a} groups of ${q.a}.`;
    $('#corr-tip').textContent = `💡 ${tip}`;
    $('#corr-note').textContent = Game.run.practice || Game.run.hearts > 0
      ? "This one will come back soon — you'll get it!"
      : '';
    const go = $('#corr-go');
    go.disabled = true;
    setTimeout(() => { go.disabled = false; }, 1500);
    this.show('correct');
  },

  // ---------- RESULTS ----------
  result(title, stars, body, buttons) {
    $('#res-title').textContent = title;
    $('#res-stars').textContent = stars === null ? '' : this.stars(stars);
    $('#res-body').innerHTML = body;
    const row = $('#res-buttons');
    row.innerHTML = '';
    buttons.forEach(([label, cls, fn]) => this.button(row, label, cls, fn));
    this.show('result');
  },

  statsLine(r) {
    const avg = r.rts.length ? r.rts.reduce((a, b) => a + b, 0) / r.rts.length / 1000 : 0;
    return `<div class="stats"><div><b>${r.correct}</b>correct</div><div><b>${r.misses}</b>misses</div>` +
      `<div><b>${r.best}</b>best streak</div><div><b>${avg.toFixed(1)}s</b>avg answer</div></div>` +
      (avg && avg < 3 ? '<div class="badge">⚡ Speedy! Under 3 seconds on average</div>' : '');
  },

  showLevelWin(r, stars, bonus, unlockMsg) {
    const n = LEVEL_ORDER[r.levelIdx];
    UI.say('Caine', pick(LINES.caine.win), 'caine');
    const next = r.levelIdx + 1;
    const btns = [];
    const round1 = r.round === 'pick';
    if (round1) {
      btns.push(['Round 2: Say or type it ▶', 'big', () => Game.startLevel(r.levelIdx, false, 'recall')]);
    } else if (next < LEVEL_ORDER.length) {
      btns.push([`Next act: ×${LEVEL_ORDER[next]} ▶`, 'big', () => Game.startLevel(next)]);
    } else if (Game.isUnlocked(BOSS_LEVEL)) {
      btns.push(['🎪 GRAND FINALE ▶', 'big', () => Game.startLevel(BOSS_LEVEL)]);
    }
    btns.push(['Play again', '', () => Game.startLevel(r.levelIdx, false, r.round)]);
    btns.push(['Map', 'ghost', () => Game.quit()]);
    this.result(round1 ? `Round 1 won — the ${n}s!` : `The ${n}s — act complete!`, stars,
      this.statsLine(r) +
      `<p>🎟 +${r.tickets} tickets (includes +${bonus} star bonus)</p>` +
      (round1 ? '<div class="badge big">🎤 Now prove it from memory — no choices in Round 2!</div>' : '') +
      (stars < 3 ? '<p class="hint">Play again with no misses for 3 stars!</p>' : '') +
      (unlockMsg ? `<div class="badge big">🐰 ${unlockMsg}</div>` : ''),
      btns);
  },

  showPracticeDone(r) {
    const n = LEVEL_ORDER[r.levelIdx];
    this.result(`Practice done!`, null,
      `<p>You practised every ×${n} fact. Ready for the real show with the timer?</p>` + this.statsLine(r),
      [['PLAY! ▶', 'big', () => Game.startLevel(r.levelIdx, false, r.round)], ['Practice again', '', () => Game.startLevel(r.levelIdx, true, r.round)], ['Map', 'ghost', () => Game.quit()]]);
  },

  showLevelFail(r) {
    const n = LEVEL_ORDER[r.levelIdx];
    const s = r.session;
    UI.say('Caine', pick(LINES.caine.lose), 'caine');
    this.result('Tumbled into the void!', null,
      `<p>You got <b>${s.total - s.pending.size} of ${s.total}</b> of the ×${n} facts. Every try makes your brain stronger!</p>` + this.statsLine(r),
      [['Try again ▶', 'big', () => Game.startLevel(r.levelIdx, false, r.round)], ['Practice first', '', () => Game.startLevel(r.levelIdx, true, r.round)], ['Map', 'ghost', () => Game.quit()]]);
  },

  showBossStageFail(r) {
    UI.say('Caine', pick(LINES.caine.lose), 'caine');
    this.result(`Stage ${r.stage + 1} of ${BOSS_STAGES}`, null,
      `<p>Out of hearts! Your checkpoint is saved — you'll restart at <b>stage ${r.stage + 1}</b>.</p>` + this.statsLine(r),
      [['Retry stage ▶', 'big', () => Game.startLevel(BOSS_LEVEL)], ['Map', 'ghost', () => Game.quit()]]);
  },

  showBossWin(r) {
    const legend = Save.data.settings.legend;
    UI.say('Caine', 'A TRUE STAR OF THE DIGITAL CIRCUS!', 'caine');
    this.result(legend ? '👑 MATH CIRCUS LEGEND!' : '🎪 GRAND FINALE COMPLETE!', 3,
      `<p>You answered <b>every multiplication fact from 0 to 12</b> in under ${r.limit} seconds!</p>` + this.statsLine(r) +
      `<p>🎟 +50 bonus tickets</p>` +
      (legend ? '' : '<p class="hint">Grown-ups can turn on Legend mode (2 seconds) for the ultimate challenge.</p>'),
      [['Map', 'big', () => Game.quit()]]);
  },

  // ---------- WARDROBE ----------
  showWardrobe() {
    const grid = $('#wardrobe-grid');
    grid.innerHTML = '';
    const D = Save.data;
    OUTFITS.forEach(o => {
      const owned = D.owned.includes(o.id);
      const equipped = D.outfit === o.id;
      const card = document.createElement('div');
      card.className = 'outfit' + (equipped ? ' equipped' : '');
      let action;
      if (equipped) action = '<span class="pill">Wearing</span>';
      else if (owned) action = '<button class="btn small">Wear</button>';
      else if (o.cost === null) action = `<span class="pill locked">🔒 ${o.unlock}</span>`;
      else if (o.needs && !D.owned.includes(o.needs)) action = '<span class="pill locked">🔒 Unlock Jax first</span>';
      else action = `<button class="btn small ${D.tickets >= o.cost ? '' : 'disabled'}">Buy · ${o.cost} 🎟</button>`;
      card.innerHTML = `<div class="swatch" style="background:linear-gradient(90deg,${o.colors[0]} 50%,${o.colors[1]} 50%)"></div>` +
        `<div class="outfit-name">${o.name}</div>${action}`;
      const btn = card.querySelector('button');
      if (btn) btn.addEventListener('click', () => {
        Sound.unlock();
        if (!owned) {
          if (D.tickets < o.cost) { this.toast(`You need ${o.cost - D.tickets} more tickets!`); return; }
          D.tickets -= o.cost;
          D.owned.push(o.id);
          Sound.fanfare();
        } else Sound.click();
        Game.setOutfit(o.id);
        this.showWardrobe();
      });
      grid.appendChild(card);
    });
    this.show('wardrobe');
  },

  // ---------- GROWN-UPS ----------
  showParents() {
    const D = Save.data;
    const counts = { fluent: 0, learning: 0, struggling: 0, unseen: 0 };
    Facts.allKeys().forEach(k => counts[Facts.status(k)]++);
    $('#parent-summary').innerHTML =
      `<div class="stats"><div class="st-fluent"><b>${counts.fluent}</b>fluent</div><div class="st-learning"><b>${counts.learning}</b>learning</div>` +
      `<div class="st-struggling"><b>${counts.struggling}</b>needs work</div><div class="st-unseen"><b>${counts.unseen}</b>not seen</div></div>` +
      `<p class="hint">Out of 91 unique facts (3×7 and 7×3 count as one). “Fluent” = right and under 3 seconds twice in a row. ` +
      `<b>${Facts.allKeys().filter(k => D.facts[k] && D.facts[k].recall).length}</b> facts answered correctly from memory (Say it / Type it). ` +
      `Say it times her from the moment she starts talking.</p>`;

    const hm = $('#heatmap');
    hm.innerHTML = '<div class="hm-h">×</div>' + NUMS.map(n => `<div class="hm-h">${n}</div>`).join('');
    for (const a of NUMS) {
      hm.insertAdjacentHTML('beforeend', `<div class="hm-h">${a}</div>`);
      for (const b of NUMS) {
        const key = factKey(a, b);
        hm.insertAdjacentHTML('beforeend', `<button class="hm-c st-${Facts.status(key)}" data-a="${a}" data-b="${b}">${a * b}</button>`);
      }
    }
    hm.querySelectorAll('.hm-c').forEach(c => c.addEventListener('click', () => {
      const a = +c.dataset.a, b = +c.dataset.b;
      const s = D.facts[factKey(a, b)];
      $('#hm-detail').textContent = s && s.seen
        ? `${a} × ${b} = ${a * b}: seen ${s.seen}×, right ${s.correct}, wrong ${s.wrong}, fast ${s.fast}, last answer ${(s.lastRt / 1000).toFixed(1)}s (${s.last}).` +
          (s.recallSeen ? ` From memory (said/typed): ${s.recall || 0} of ${s.recallSeen} right.` : '')
        : `${a} × ${b} = ${a * b}: not practised yet.`;
    }));

    const stats = Facts.allKeys().map(k => ({ k, s: D.facts[k] })).filter(x => x.s && x.s.seen);
    const weak = stats.filter(x => Facts.status(x.k) === 'struggling').sort((x, y) => y.s.wrong - x.s.wrong).slice(0, 8);
    const slow = stats.filter(x => x.s.last === 'right').sort((x, y) => y.s.lastRt - x.s.lastRt).slice(0, 6);
    const fmt = x => { const { a, b } = parseKey(x.k); return `<span class="chip">${a}×${b}</span>`; };
    $('#parent-lists').innerHTML =
      `<p><b>Needs practice:</b> ${weak.length ? weak.map(fmt).join(' ') : 'nothing yet 🎉'}</p>` +
      `<p><b>Slowest correct:</b> ${slow.length ? slow.map(x => fmt(x) + `<small>${(x.s.lastRt / 1000).toFixed(1)}s</small>`).join(' ') : '—'}</p>`;

    const set = D.settings;
    const box = $('#parent-settings');
    box.innerHTML = '';
    [['voice', 'Read missed facts out loud'], ['sound', 'Sound effects'],
      ['legend', 'Legend mode: Grand Finale needs answers in 2 seconds (default 3)'],
      ['unlockAll', 'Unlock all acts']].forEach(([k, label]) => {
      const row = document.createElement('label');
      row.className = 'toggle';
      row.innerHTML = `<input type="checkbox" ${set[k] ? 'checked' : ''}> <span>${label}</span>`;
      row.querySelector('input').addEventListener('change', (e) => { set[k] = e.target.checked; Save.save(); });
      box.appendChild(row);
    });
    const reset = document.createElement('button');
    reset.className = 'btn small red';
    reset.textContent = 'Reset all progress';
    reset.addEventListener('click', () => {
      if (confirm('Erase all progress, stars, tickets and outfits on this device?')) {
        Save.reset();
        Game.setOutfit('pomni');
        this.showParents();
      }
    });
    box.appendChild(reset);
    $('#hm-detail').textContent = 'Tap a square to see details.';
    this.show('parents');
  },
};
