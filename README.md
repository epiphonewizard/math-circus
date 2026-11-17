# The Amazing Digital Math Circus

A 3D runner for practising multiplication facts 0–12, featuring fan-made versions of Pomni,
Jax and Caine. Made for home use on a tablet.

## Play it

**Live:** https://epiphonewizard.github.io/math-circus/ (open in Safari on the tablet, then
Share → Add to Home Screen). Pushing to `main` updates it within a minute or two.

**On this Mac:** run `./serve.sh`, then open http://localhost:8000

**On the tablet (same Wi-Fi):** run `./serve.sh` on the Mac and open the `http://192.168.x.x:8000`
address it prints in Safari or Chrome on the tablet. In Safari tap **Share → Add to Home Screen**
so it opens full screen like an app. Progress is saved on the tablet itself.

To play without the Mac running, upload this folder to any free static host
(GitHub Pages, Netlify Drop), open that URL on the tablet, and add it to the Home Screen.

## How it works

- **13 acts**, introduced in order of difficulty: ×0, ×1, ×2, ×10, ×5, ×11, ×9, ×3, ×4, ×6, ×7, ×8, ×12.
  Each act asks **every** fact for its number (n×0 … n×12) and mixes in review from earlier
  acts, weighted toward weak facts.
- Each question is a 3-lane gate. Tap the right answer to jump the cliff (or open the
  correct curtain). A wrong answer or running out of time drops you into the void (or into
  Jax's boxing-glove trap) and costs a heart. 3 hearts per act.
- **After every miss** a card shows the correct fact, its turnaround and a strategy tip, and
  reads it aloud. That fact comes back 3 questions later and again near the end of the act.
- **Timer** starts at 8 seconds and gets 0.35s shorter with each correct answer (down to
  4.5s → 3.5s in later acts), and backs off by 1s after a miss.
- **Two rounds per act.** Round 1 (👆 *Pick it*): choose from 3 answers. Winning it unlocks
  Round 2, where there are no choices and she must **say it or type it**. The act only counts as
  complete (and the next act only unlocks) once Round 2 is won. Each round has its own stars.
  The Grand Finale lets her choose any of the three answer modes.
- **Answer modes** for Round 2 / the Finale (chosen on the intro screen, remembered):
  - 🎤 **Say it**: no choices; she says the answer. Her time is measured from when she *starts
    talking*. Once she starts, the timer freezes and the gate waits (up to 4s) for the recognizer,
    so processing delay never costs her. Sound-alikes like 14/40 get a "Say it again!" instead of
    a miss. Needs the game on **https or localhost**, so it works at http://localhost:8000 on the
    Mac, but not on the tablet over http://192.168… until it's hosted on HTTPS.
  - ⌨️ **Type it**: number pad, auto-submits once enough digits are typed. +1s on the timer;
    her time is measured to her first key press. Works everywhere, offline.
- **Practice mode** (from each act's intro): no timer, no hearts.
- **Stars:** 3 = no misses, 2 = one miss, 1 = finished. **Tickets** buy outfits in the Wardrobe.
  Finishing the ×5 act unlocks Jax as a playable character.
- **Grand Finale:** all 91 facts in 4 stages with checkpoints, 3 seconds per answer
  (2 seconds with Legend mode).

## Focus-friendly features (helpful for ADHD)

- **Halfway checkpoint** in every act: running out of hearts after it offers *Continue from
  checkpoint* with full hearts (earlier misses still count toward stars).
- **Friendly Jax** (on by default): teasing but supportive lines instead of mocking ones.
- **Impulse brake** (Round 1): two very fast wrong taps in a row → "Whoa, read it first!" and
  the answer buttons wake up after a short pause on the next 3 questions.
- **Adjustable timer**: starting time and shortest time are set in Grown-ups.
- **Calm mode**: no flickering screen edges, no floating background shapes.
- **Daily goal** (default 2 rounds/day, +20 tickets) shown as dots on the title screen, and a
  **stretch-break reminder** after 15 minutes of play.
- **Surprise prize boxes**: ~1 in 8 correct answers gives 2–6 bonus tickets.
- **Read aloud**: speaks each problem (+1s on the timer). In Say it mode the microphone waits
  until the game finishes speaking, so it never hears the question as her answer.

## Grown-ups

Press and hold **Grown-ups** on the title screen. It shows a 13×13 heat map
(fluent / learning / needs work / not seen), the weakest and slowest facts, and settings:
voice, sounds, Legend mode, unlock all acts, reset progress.

"Fluent" = answered correctly in under 3 seconds twice in a row.

## Files

- `index.html`, `css/style.css`: layout and screens
- `js/facts.js`: curriculum, question scheduling, wrong-answer generation, mastery tracking
- `js/game.js`: game flow (levels, timer, hearts, checkpoints)
- `js/world.js`: 3D track, gates, scenery
- `js/characters.js`: Pomni, Jax and Caine models
- `js/ui.js`: menus, HUD, wardrobe, grown-ups panel
- `vendor/three.min.js`: Three.js r158, bundled so it works offline

Fan-made for personal use. The Amazing Digital Circus characters belong to Glitch Productions.
