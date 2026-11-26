// levels/level2.js — "SHAPE LIMBO". The original five-phase Cyber Zoo run,
// kept here as its own stage after CYBER ZOO (level1.js) was rebuilt from
// scratch with an all-new phase set (SAW / C.R.O.C.K / BEAM / SWARM /
// K.A.N.G / THE ESCAPE):
//
//   1. meteors + the bomb                      (timed)
//   2. laser walls + splash                    (timed)
//   3. presses + meteors                       (timed)
//   4. warning -> TrapWheel boss               (event)
//   5. boss dies -> mothership + crystal        (event)
//
// Used to open with the MOVE/SHOOT/TORPEDO/DODGE tutorial as its own phase 0
// (doubling as `registry.FIRST_LEVEL`, so a brand-new player had to clear
// this WHOLE level — five more phases and a boss — just to reach the hub).
// Split out into its own `tutorial.js`, which is `registry.FIRST_LEVEL`
// instead now; SHAPE LIMBO goes back to being just another
// `unlockedBy: null` stage, freely selectable and skippable.
//
// Each level is a self-contained module: it composes the shared hazard
// primitives into its own sequence and exports `run(world, hud)`. Edit this
// file freely without touching any other level. `run` resolves when the level
// ends; main.js decides win vs. loss from whether the player is still alive.
import { input } from '../input.js';
import { readyIntro } from './readyintro.js';
import { HALF_H, SCREEN_W, SCREEN_H } from '../core.js';
import { spawnMeteorBatch } from '../meteor.js';
import { Bomb } from '../bomb.js';
import { spawnLaser } from '../laser.js';
import { splashBurst } from '../splash.js';
import { spawnPress } from '../press.js';
import { TrapWheel } from '../boss.js';
import { Mothership } from '../mothership.js';
import { Crystal } from '../crystal.js';
import { spawnHealOrb } from '../heal.js';
import { runWeaponTutorial } from './tutorial.js';

class Director {
  constructor(world, hud) { this.world = world; this.hud = hud; }

  // `startPhase` (1-5) lets the savestate cheat (pause.js/savestate.js) jump
  // straight to a phase's fresh start, skipping every earlier phase +
  // interlude, instead of resuming the exact frame — see CLAUDE.md's
  // "Save-state cheat" note for why.
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
    }
    if (startPhase <= 5) {
      this.world.currentPhase = 5;
      await this.phase5();
    }
  }

  _anyKeyDown() {
    return (input.touching() || ['left', 'right', 'up', 'down', 'fire', 'lock'].some(k => input.isDown(k)));
  }

  // The shared READY card (readyintro.js): wait for a key, then fly the ship in.
  intro() { return readyIntro(this.world, this.hud); }

  // Short breather between phases: clear whatever the last phase left flying,
  // drop the heal orb into the calm so it can actually be grabbed, then pause a
  // beat before the next wave. Without this the phases slam into one another and
  // the run is brutally hard.
  async interlude(seconds = 1.5) {
    this.world.clearEntities();
    spawnHealOrb(this.world);
    this.hud.setPhaseText('');
    await this.world.wait(seconds);
  }

  // --- 1. meteors + the bomb ---
  async phase1() {
    this.world.add(new Bomb(this.world, 0, -1));
    let next = 0;
    const every = 5, batch = 3;
    await this.world.runFor(20, (t, left) => {
      if (t >= next) { spawnMeteorBatch(this.world, batch); next += every; }
      this.hud.setPhaseText('PHASE 1   ' + Math.ceil(left));
    });
  }

  // --- 2. laser walls every 6s, alternating sides, + splash ---
  // Spacing loosened from 2.5s (paired with laser.js's own slower sweep
  // speed) so it's usually one beam sweeping the screen at a time, with
  // only a brief overlap as the next one enters — at the old pace, two
  // beams closing in from both sides was close to the norm for almost the
  // whole phase, brutal for what's meant to be an early, still-learning
  // level.
  async phase2() {
    this.hud.setCenter('');
    let nextLaser = 0, nextSplash = 6, side = 0;
    await this.world.runFor(25, (t, left) => {
      if (t >= nextLaser) {
        spawnLaser(this.world, (side++ % 2 === 0) ? 'left' : 'right');
        nextLaser += 6;
      }
      if (t >= nextSplash) { splashBurst(this.world); nextSplash += 6; }
      this.hud.setPhaseText('PHASE 2   ' + Math.ceil(left));
    });
  }

  // --- 3. presses + meteors ---
  // Splash bursts dropped (was presses + splash + meteors, all three at
  // once) — three simultaneous hazards was too much for this early a level.
  async phase3() {
    this.hud.setCenter('');
    let nextPress = 0, nextMeteor = 1.5;
    await this.world.runFor(26, (t, left) => {
      if (t >= nextPress) { spawnPress(this.world); nextPress += 0.85; }
      if (t >= nextMeteor) { spawnMeteorBatch(this.world, 2); nextMeteor += 6; }
      this.hud.setPhaseText('PHASE 3   ' + Math.ceil(left));
    });
  }

  // --- 4. warning, then the TrapWheel boss ---
  async phase4() {
    this.world.clearEntities();
    const p = this.world.player;
    p.x = 0; p.y = 0; p.frozen = true;
    this.hud.setPhaseText('');

    this.world.audio.play('bossIntro', 0.8);
    this.world.audio.play('warning', 0.9);
    for (let i = 0; i < 4 && !p.dead; i++) {
      this.hud.setCenter('! WARNING !');
      await this.world.wait(0.5);
      this.hud.setCenter('');
      await this.world.wait(0.5);
    }
    p.frozen = false;
    if (p.dead) return;

    const boss = new TrapWheel(this.world);
    this.world.add(boss);
    let defeated = false;
    boss.onDefeated = () => { defeated = true; };
    await this.world.waitUntil(() => defeated || this.world.player.dead);
  }

  // --- 5. boss down -> mothership descends + crystal ---
  async phase5() {
    this.hud.setPhaseText('');
    this.world.clearEntities();               // clear any stragglers after the boss
    await this.world.wait(2.5);               // a clear beat before the crystal appears
    if (this.world.player.dead) return;

    const ship = new Mothership(this.world);
    this.world.add(ship);
    const crystal = new Crystal(this.world);
    this.world.add(crystal);

    this.hud.setCenter('SHOOT THE CRYSTAL');
    this.world.wait(2).then(() => {
      if (this.hud.center.text === 'SHOOT THE CRYSTAL') this.hud.setCenter('');
    });

    let collected = false;
    ship.onEscape = () => {};
    crystal.onCollected = () => { ship.crystalCollected(); this.hud.setCenter(''); collected = true; };

    await this.world.waitUntil(() => collected || this.world.player.dead);
    if (this.world.player.dead) return;

    // Let the extract theme (~3.8s) and the fly-away play out before main.js
    // shows the Stage Clear screen — otherwise victory lands mid-theme.
    await this.world.wait(3.5);
    // level clear is handled by main.js (marks progress + shows the screen)
  }
}

export async function run(world, hud, opts) { return new Director(world, hud).run(opts && opts.startPhase); }
