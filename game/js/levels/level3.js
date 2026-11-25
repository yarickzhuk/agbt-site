// levels/level3.js — "CRAZY CARNIVAL". BOUNCY BALL is introduced and locked
// in here -- see CLAUDE.md's weapons section -- and this level's own boss
// (phase 5, below) is built around that forced weapon.
//
// Phase 1 is the CORN (corn.js): a two-hit hazard with a seed-spewing
// wind-up in between. The phase simply ends once it's destroyed.
//
// Phase 2 is FIREWORKS (firework.js): light up LIGHT_TARGET rockets by
// shooting each one's fuse and letting it fly to the top.
//
// Phase 3 is the CLOWN + LOLLIPOPS (clown.js/lollypop.js): destroy the
// wandering clown and all 4 lollipops to clear it, plus a couple of
// bomb.js's own Bomb (the same one SHAPE LIMBO's phase 1 uses) drifting
// loose for extra pressure.
//
// Phase 4 is DARTS (dart.js), the last phase before the boss: DART_WAVES
// waves thrown from either edge, 20 total. Dodge each wave's crossing,
// then destroy every dart once it sticks. peanut.js's Peanut also makes
// two unannounced cameos here -- pure gag, no kill-count gate.
//
// Phase 5 is SHOWMAN (showman.js/clowntarget.js/forcefield.js/wall.js) --
// the level's boss, "Cruel Clownhouse": a maze intro (pop 5 Clown Targets
// with the Bouncy Ball before a timer runs out, dodging solid maze walls)
// then the duel itself, guarded by a shrinking Force field border that
// resets the boss's HP (not the player's) on contact.
//
// Phase 6 is THE ESCAPE, mirrored from CYBER ZOO's own (level1.js's
// phase6): 4 static laser gates, then shoot a crystal 9 times while a
// mothership wall closes in. Mirrored left-right -- crystal on the LEFT,
// mothership (mothership.js's MothershipChase, `mirror: true`) chasing in
// from the RIGHT instead -- and the crystal itself is orange, not yellow.
//
// A brief interlude (clear field + heal orb, mirroring level1.js/
// level2.js's own) sits between every phase up through SHOWMAN -- CRAZY
// CARNIVAL had no healing at all before this.
//
// Contract unchanged: export `run(world, hud)`, resolve when the level ends
// (win = player alive).
import { input } from '../input.js';
import { readyIntro } from './readyintro.js';
import { HALF_H, HALF_W, SCREEN_W, SCREEN_H, rand } from '../core.js';
import { Corn } from '../corn.js';
import { FireworkRocket } from '../firework.js';
import { Clown } from '../clown.js';
import { spawnMeteorBatch } from '../meteor.js';
import { Lollypop } from '../lollypop.js';
import { Bomb } from '../bomb.js';
import { splashBurst } from '../splash.js';
import { Peanut } from '../peanut.js';
import { unlockAchievement } from '../achievements.js';
import { spawnHealOrb } from '../heal.js';
import { spawnDartWave } from '../dart.js';
import { spawnMaze } from '../wall.js';
import { ClownTarget } from '../clowntarget.js';
import { Showman, TARGET_POSITIONS, MAZE_WALLS, MAZE_START } from '../showman.js';
import { ForceField } from '../forcefield.js';
import { spawnStaticLaser } from '../laser.js';
import { Crystal } from '../crystal.js';
import { MothershipChase } from '../mothership.js';
import { runWeaponTutorial } from './tutorial.js';

const LIGHT_TARGET = 10;
const ROCKET_CAP = 3;            // never more than this many idle/rising at once
const ROCKET_INTERVAL = 2.2;     // seconds between new rocket spawns

const LOLLYPOP_COUNT = 4;        // one planted against each of the 4 edges
const BOMB_COUNT = 2;
// A splash burst every SPLASH_INTERVAL seconds during phase 3 ("current that
// phase is a total joke... just to increase the spam"). First-pass.
const SPLASH_FIRST = 2.5, SPLASH_INTERVAL = 5;

const DART_WAVES = 5;
const DARTS_PER_SIDE = 2;        // per wave, per side -- 5 waves * 2 * 2 = 20 total
const DART_WAVE_INTERVAL = 3;    // seconds between waves
const PEANUT_TIMES = [4, 11];    // seconds into phase 4 -- pure gag, no kill-count gate

// Seconds to pop all 5 Clown Targets before Showman appears. Was 30 with
// the old open layout; 22 against the real maze ("lower time in it too"),
// whose shortest route through all 5 targets is ~15s of pure walking.
const MAZE_TIME = 30;
// The maze's start cell (showman.js) -- clear of every wall, see phase5()'s
// own comment for why the player is reset here.
const MAZE_SAFE_SPOT = MAZE_START;
// Duel pressure ("add some spam (like clowns or meteors) cuz now it's way
// too easy to just delete him"): a meteor pair every DUEL_METEOR_INTERVAL,
// and one wandering dark-blue Clown at a time, back DUEL_CLOWN_RESPAWN after
// the last one dies.
const DUEL_METEOR_INTERVAL = 4;
const DUEL_METEOR_COUNT = 2;
const DUEL_CLOWN_RESPAWN = 3;
const DUEL_CLOWN_CLEAR = 2.5;   // don't drop a clown right on the player

// Plants a Lollypop stick-first into the nearest wall (rather than dropped
// stick-down in open field) -- `edge` is 'top'/'bottom'/'left'/'right'.
// Lollypop.json's stick points local +Y (down) at rotation 0; each edge
// gets the rotation that turns "down" into "toward that wall".
const EDGE_ROTATION = { bottom: 0, top: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
function spawnLollypop(world, edge) {
  const margin = 0.8;
  let x, y;
  switch (edge) {
    case 'top':    x = rand(-HALF_W * 0.6, HALF_W * 0.6); y = -HALF_H + margin; break;
    case 'bottom': x = rand(-HALF_W * 0.6, HALF_W * 0.6); y =  HALF_H - margin; break;
    case 'left':   x = -HALF_W + margin; y = rand(-HALF_H * 0.6, HALF_H * 0.6); break;
    default:       x =  HALF_W - margin; y = rand(-HALF_H * 0.6, HALF_H * 0.6); break;
  }
  return new Lollypop(world, x, y, EDGE_ROTATION[edge]);
}

class Director {
  constructor(world, hud) { this.world = world; this.hud = hud; }

  // `startPhase` mirrors level1.js's save-state-cheat hook (pause.js) --
  // kept here from the start so future phases can slot in later without
  // reworking this signature.
  async run(startPhase = 0) {
    if (startPhase === 0) {
      await this.intro();
      if (this.world.player.dead) return;
      // first play of an uncleared stage: its weapon's tutorial (tutorial.js)
      if (this.world.weaponTutorial && !await runWeaponTutorial(this.world, this.hud, this.world.weaponTutorial)) return;
    }
    if (startPhase <= 1) {
      this.world.currentPhase = 1;
      await this.phase1();
      if (this.world.player.dead) return;
      await this.interlude();
      if (this.world.player.dead) return;
    }
    if (startPhase <= 2) {
      this.world.currentPhase = 2;
      await this.phase2();
      if (this.world.player.dead) return;
      await this.interlude();
      if (this.world.player.dead) return;
    }
    if (startPhase <= 3) {
      this.world.currentPhase = 3;
      await this.phase3();
      if (this.world.player.dead) return;
      await this.interlude();
      if (this.world.player.dead) return;
    }
    if (startPhase <= 4) {
      this.world.currentPhase = 4;
      await this.phase4();
      if (this.world.player.dead) return;
      await this.interlude();
      if (this.world.player.dead) return;
    }
    if (startPhase <= 5) {
      this.world.currentPhase = 5;
      await this.phase5();
      if (this.world.player.dead) return;
      await this.interlude();
      if (this.world.player.dead) return;
    }
    if (startPhase <= 6) {
      this.world.currentPhase = 6;
      await this.phase6();
      if (this.world.player.dead) return;
    }
    await this.world.wait(1);   // brief beat before Stage Clear
  }

  // Clear field + a heal orb + a short breather -- mirrors level1.js/
  // level2.js's own interlude() exactly. CRAZY CARNIVAL had no healing at
  // all before this.
  async interlude(seconds = 1.5) {
    this.world.clearEntities();
    spawnHealOrb(this.world);
    this.hud.setPhaseText('');
    await this.world.wait(seconds);
    this.world.clearEntities();
  }

  // --- 1. the CORN ---
  // Destroying it (2 hits, with a seed-spewing wind-up in between) clears
  // the phase. See corn.js for the full mechanic.
  async phase1() {
    const w = this.world;
    const corn = new Corn(w);
    w.add(corn);
    this.hud.setPhaseText('PHASE 1');
    await w.waitUntil(() => corn.dead || w.player.dead);
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 2. FIREWORKS ---
  // Light up LIGHT_TARGET rockets (shoot the fuse, let it fly to the top).
  // Open-ended (no fixed timer) -- ends the moment the target is hit, so
  // this runs its own ticker step rather than world.runFor's fixed-duration
  // one.
  async phase2() {
    const w = this.world;
    let lit = 0;
    const rockets = [];
    this.hud.setPhaseText(`PHASE 2  0/${LIGHT_TARGET}`);

    await new Promise(resolve => {
      let t = 0, nextRocket = 0;
      const step = () => {
        if (w.paused) return;
        t += Math.min(w.app.ticker.deltaMS / 1000, 0.05);

        for (let i = rockets.length - 1; i >= 0; i--) if (rockets[i].dead) rockets.splice(i, 1);
        if (t >= nextRocket && rockets.length < ROCKET_CAP && lit + rockets.length < LIGHT_TARGET) {
          const x = rand(-HALF_W * 0.75, HALF_W * 0.75);
          const rocket = new FireworkRocket(w, x);
          rocket.onLit = () => { lit++; this.hud.setPhaseText(`PHASE 2  ${lit}/${LIGHT_TARGET}`); };
          w.add(rocket);
          rockets.push(rocket);
          nextRocket = t + ROCKET_INTERVAL;
        }

        if (lit >= LIGHT_TARGET || w.player.dead) { w.app.ticker.remove(step); resolve(); }
      };
      w.app.ticker.add(step);
    });

    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 3. the CLOWN + LOLLIPOPS ---
  // Destroy the wandering clown and all LOLLYPOP_COUNT lollipops to clear
  // the phase. See clown.js/lollypop.js for each hazard's own mechanic.
  // A couple of bomb.js's own Bomb (the same hazard SHAPE LIMBO's phase 1
  // uses) drift loose the whole time for extra pressure -- they don't
  // count toward clearing the phase, just something else to dodge/pop.
  async phase3() {
    const w = this.world;
    const clown = new Clown(w);
    w.add(clown);
    const EDGES = ['top', 'bottom', 'left', 'right'];
    const lollypops = EDGES.slice(0, LOLLYPOP_COUNT).map(edge => w.add(spawnLollypop(w, edge)));
    for (let i = 0; i < BOMB_COUNT; i++) w.add(new Bomb(w, rand(-2, 2), rand(-2, 2)));
    this.hud.setPhaseText('PHASE 3');
    let splashT = SPLASH_FIRST;
    const splashStep = () => {
      if (w.paused) return;
      splashT -= Math.min(w.app.ticker.deltaMS / 1000, 0.05);
      if (splashT <= 0) { splashBurst(w); splashT += SPLASH_INTERVAL; }
    };
    w.app.ticker.add(splashStep);
    try {
      await w.waitUntil(() => (clown.dead && lollypops.every(l => l.dead)) || w.player.dead);
    } finally {
      w.app.ticker.remove(splashStep);
    }
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 4. DARTS -- the last phase before the boss ---
  // DART_WAVES waves of DARTS_PER_SIDE Dart_L + DARTS_PER_SIDE Dart_R
  // (20 total). Dodge each wave's crossing, then destroy every dart once
  // it sticks. Open-ended like phase 2's own ticker step. A Peanut also
  // makes a couple of unannounced cameos (PEANUT_TIMES) -- pure gag, not
  // gated on a kill count and not required to clear the phase.
  async phase4() {
    const w = this.world;
    const darts = [];
    const total = DART_WAVES * DARTS_PER_SIDE * 2;
    let wavesSpawned = 0, peanutsSpawned = 0;
    w.greenPeanuts = 0;   // "2 for 1 price" (peanut.js)
    this.hud.setPhaseText(`PHASE 4  0/${total}`);

    await new Promise(resolve => {
      let t = 0, nextWave = 0;
      const step = () => {
        if (w.paused) return;
        t += Math.min(w.app.ticker.deltaMS / 1000, 0.05);

        if (t >= nextWave && wavesSpawned < DART_WAVES) {
          spawnDartWave(w, darts, DARTS_PER_SIDE);
          wavesSpawned++;
          nextWave = t + DART_WAVE_INTERVAL;
        }
        if (peanutsSpawned < PEANUT_TIMES.length && t >= PEANUT_TIMES[peanutsSpawned]) {
          w.add(new Peanut(w));
          peanutsSpawned++;
        }

        const destroyed = darts.reduce((n, d) => n + (d.dead ? 1 : 0), 0);
        this.hud.setPhaseText(`PHASE 4  ${destroyed}/${total}`);

        if ((wavesSpawned >= DART_WAVES && darts.every(d => d.dead)) || w.player.dead) {
          w.app.ticker.remove(step); resolve();
        }
      };
      w.app.ticker.add(step);
    });

    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 5. SHOWMAN -- "Cruel Clownhouse" boss ---
  // Sub-phase A: a maze intro -- pop all 5 Clown Targets within MAZE_TIME,
  // while solid walls (wall.js) block movement, matching the source
  // backdrop's maze. Sub-phase B: the same "! WARNING !" flash CYBER ZOO's
  // own boss uses (only before the first duel attempt), then the duel
  // itself -- Showman (15 HP, any shot) guarded by a shrinking Force field
  // border. Touching the field is a real punishment, not a speed bump: it
  // costs 1 HP (forcefield.js's RESET_DAMAGE) and sends the whole encounter
  // back to a fresh maze intro (new timer, new targets, new walls) rather
  // than just refilling Showman's HP -- so the loop below re-runs the maze
  // sub-phase every time the field catches the player, until Showman's
  // actually dead or the player is.
  async phase5() {
    const w = this.world;
    this.hud.setPhaseText('');

    let warned = false;
    let attempt = 0;
    for (;;) {
      attempt++;
      // A real bug fixed here: MAZE_WALLS is a fixed layout (traced from the
      // source backdrop), spawned wherever the player happens to already be
      // standing -- e.g. right after phase 4's own DARTS, or after a Force
      // field reset mid-duel (see below). If that spot lands inside one of
      // the new wall rects, blockedByWalls() rejects every candidate move
      // the instant it's tried (the new position still overlaps the same
      // wall the old one did), so the player is stuck the moment the maze
      // appears -- reported directly ("you can stuck in walls of the phase
      // where you need to shoot clowns"). MAZE_SAFE_SPOT is clear of every
      // rect in MAZE_WALLS (checked by hand, with the player's own
      // hitRadius as margin), so resetting the player there right before
      // each spawn guarantees they never start entombed in one.
      w.player.x = MAZE_SAFE_SPOT.x; w.player.y = MAZE_SAFE_SPOT.y;
      spawnMaze(w, MAZE_WALLS);
      const targets = TARGET_POSITIONS.map(t => w.add(new ClownTarget(w, t.x, t.y)));
      w.audio.loop('clownhouseMaze', 0.5);
      await w.runFor(MAZE_TIME, (t, left) => {
        this.hud.setPhaseText('POP THE CLOWNS  ' + Math.ceil(left) + 's');
      });
      w.audio.stopLoop('clownhouseMaze');
      const popped = targets.filter(t => t.popped).length;
      this.hud.setPhaseText('');
      w.clearEntities();   // clears the maze walls + any un-popped targets
      if (w.player.dead) return;
      // Achievement "LEEROY JENKINS": all 5 popped on the first maze run
      if (attempt === 1 && popped === TARGET_POSITIONS.length) unlockAchievement(w, 'leeroy');

      if (!warned) {
        warned = true;
        w.audio.play('bossIntro', 0.8);
        w.audio.play('warning', 0.9);
        for (let i = 0; i < 4 && !w.player.dead; i++) {
          this.hud.setCenter('! WARNING !');
          await w.wait(0.5);
          this.hud.setCenter('');
          await w.wait(0.5);
        }
        if (w.player.dead) return;
      }

      const showman = new Showman(w, popped === TARGET_POSITIONS.length);
      w.add(showman);
      const field = new ForceField(w);
      w.add(field);
      let reset = false;
      field.onReset = () => { reset = true; };
      w.audio.play('showmanVoice', 0.8);
      w.audio.loop('showmanTheme', 0.55);
      const stopSpam = this.duelSpam();
      await w.waitUntil(() => {
        this.hud.setPhaseText(showman.shielded ? 'SHOWMAN  SHIELDED' : 'SHOWMAN  ' + Math.max(0, showman.hp));
        // A shielded Showman can't be beaten: if the field closes without
        // ever catching the player, send them back to the maze anyway.
        if (showman.shielded && field.dead) reset = true;
        return showman.dead || w.player.dead || reset;
      });
      stopSpam();
      // Captured before clearEntities(), which destroy()s showman regardless
      // of why the duel ended -- that sets showman.dead=true as ordinary
      // teardown, not a signal that he was actually defeated, so checking it
      // after the clear would treat every reset as a win too.
      const defeated = showman.dead;
      w.audio.stopLoop('showmanTheme');
      this.hud.setPhaseText('');
      w.clearEntities();
      if (w.player.dead || defeated) return;
      // else: the field caught the player -- back to a fresh maze intro.
    }
  }

  // The duel's meteors + clown (see the DUEL_* constants). Its own ticker
  // step, gated on pause like runFor; returns a stop function. The hazards
  // themselves are ordinary world entities, so the clearEntities() after
  // the duel removes whatever's left.
  duelSpam() {
    const w = this.world;
    let meteorT = 1.5, clown = null, clownT = 1.5;
    const spawnClown = () => {
      const p = w.player;
      for (let i = 0; i < 6; i++) {
        const c = new Clown(w);
        if (i === 5 || Math.hypot(c.x - p.x, c.y - p.y) >= DUEL_CLOWN_CLEAR) return w.add(c);
        c.destroy();
      }
    };
    const step = () => {
      if (w.paused) return;
      const dt = Math.min(w.app.ticker.deltaMS / 1000, 0.05);
      meteorT -= dt;
      if (meteorT <= 0) { meteorT = DUEL_METEOR_INTERVAL; spawnMeteorBatch(w, DUEL_METEOR_COUNT); }
      if (!clown || clown.dead) {
        clownT -= dt;
        if (clownT <= 0) { clown = spawnClown(); clownT = DUEL_CLOWN_RESPAWN; }
      }
    };
    w.app.ticker.add(step);
    return () => w.app.ticker.remove(step);
  }

  // --- 6. THE ESCAPE, mirrored -- chase from the right, extract the
  // crystal on the left ---
  // Same mechanic as CYBER ZOO's own THE ESCAPE (level1.js's phase6): drop
  // 4 static laser gates, then shoot the crystal 9 times while the
  // mothership wall closes in. Mirrored left-right here: the crystal sits
  // on the LEFT, and the mothership (MothershipChase's `mirror` option --
  // see mothership.js) advances as a wall from the RIGHT instead, its
  // LEFT edge the instant-death one, fleeing back off the right edge once
  // the crystal is pulled.
  async phase6() {
    const w = this.world, p = w.player;
    w.clearEntities();
    // Same 4 gates as CYBER ZOO's, mirrored in x but kept in the same
    // "distance from spawn" order (nearest gate first).
    const gates = [[2.4, 'down'], [0.4, 'up'], [-1.6, 'middle'], [-3.4, 'up']];
    // Spawn just right of the rightmost (nearest) wall, clear of its beam,
    // facing left toward the crystal.
    p.x = gates[0][0] + 0.8; p.y = 0; p.facing = { x: -1, y: 0 }; p.frozen = false; p.render();
    this.hud.setPhaseText('');
    this.hud.setCenter('GET THE CRYSTAL');
    await w.wait(1.4);
    this.hud.setCenter('');

    for (const [gx, pos] of gates) spawnStaticLaser(w, gx, pos);

    // orange crystal on the left (CYBER ZOO's own is yellow), mothership
    // chasing from the right
    const crystal = new Crystal(w, { x: -HALF_W + 0.9, y: 0, tint: 0xFFA000 });
    w.add(crystal);
    const ship = new MothershipChase(w, { mirror: true });
    w.add(ship);
    let fled = false, collectedAt = null;
    crystal.onCollected = () => { collectedAt = w.time; ship.crystalCollected(); };
    ship.onEscape = () => { fled = true; };

    await w.waitUntil(() => {
      this.hud.setPhaseText(crystal.done ? 'ESCAPE' : 'PHASE 6  ' + (9 - crystal.hits));
      return (crystal.collected && fled) || p.dead;
    });
    this.hud.setPhaseText('');
    this.hud.setCenter('');
    // Same jingle-timing belt-and-suspenders as level1.js's own phase6 --
    // the mothership can flee off-screen well before crystalExtract's
    // jingle (~3.9s) finishes, so hold here rather than cutting it off
    // with the Stage Clear jingle that follows.
    if (collectedAt != null && !p.dead) {
      const EXTRACT_JINGLE = 3.9;
      const elapsed = w.time - collectedAt;
      if (elapsed < EXTRACT_JINGLE) await w.wait(EXTRACT_JINGLE - elapsed);
    }
    w.clearEntities();
  }

  _anyKeyDown() {
    return (input.touching() || ['left', 'right', 'up', 'down', 'fire', 'lock'].some(k => input.isDown(k)));
  }

  // The shared READY card (readyintro.js): wait for a key, then fly the ship in.
  intro() { return readyIntro(this.world, this.hud); }
}

export async function run(world, hud, opts) { return new Director(world, hud).run(opts && opts.startPhase); }
