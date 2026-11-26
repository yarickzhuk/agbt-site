// levels/level1.js — "CYBER ZOO" (rebuild in progress).
//
//   1. the SAW — spins in place at centre; periodically bursts a splash of
//      tiny purple clone shards to dodge; 3 charged hits destroy it
//   2. C.R.O.C.K — surfaces at a random quarter and spits jellyfish (survive)
//   3. the BEAM — a cyan sweep you can't kill; shoot it to reverse its spin,
//      while purple piranhas spawn every 2s (survive)
//   4. the SWARM — dark-blue devil fish streak across and telegraphed atoms
//      appear, spin and shrink; charged shots kill them (survive)
//   5. K.A.N.G — a Punch-Out reflex-duel boss: wait for the tell, then strike
//   6. THE ESCAPE — a mothership wall chases from the left; drop 4 static laser
//      gates to reach the yellow crystal on the right and extract it
//   (more phases to come)
//
// The finished original five-phase version is preserved as `cyberzoo_v1.js.bak`
// in this folder (and in git history). Contract unchanged: export
// `run(world, hud)`, resolve when the level ends (win = player alive).
import { unlockAchievement } from '../achievements.js';
import { input } from '../input.js';
import { readyIntro } from './readyintro.js';
import { HALF_H, HALF_W, SCREEN_W, SCREEN_H, randInt } from '../core.js';
import { Saw } from '../saw.js';
import { Crock, QUARTERS } from '../crock.js';
import { Beam } from '../beam.js';
import { spawnPirania } from '../pirania.js';
import { spawnDevilFish } from '../devilfish.js';
import { spawnAtom } from '../atom.js';
import { Kangaroo } from '../kangaroo.js';
import { spawnStaticLaser } from '../laser.js';
import { Crystal } from '../crystal.js';
import { MothershipChase } from '../mothership.js';
import { spawnHealOrb } from '../heal.js';
import { runWeaponTutorial } from './tutorial.js';

class Director {
  constructor(world, hud) { this.world = world; this.hud = hud; }

  // `startPhase` (1-6) lets the savestate cheat (pause.js/savestate.js) jump
  // straight to a phase's fresh start, skipping the intro and every earlier
  // phase + interlude, instead of resuming the exact frame — see CLAUDE.md's
  // "Save-state cheat" note for why (no per-hazard serialization exists).
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

  // --- 6. THE ESCAPE: chase from the left, extract the yellow crystal ---
  // The mothership advances as a wall from the left (its right edge is death);
  // drop the 4 static laser gates and reach the crystal on the right, then
  // shoot it to extract. Pulling the crystal sends the mothership fleeing.
  async phase6() {
    const w = this.world, p = w.player;
    w.clearEntities();
    // 4 immobile stage-1 laser walls; shoot each cyan block to drop its beam
    const gates = [[-2.4, 'down'], [-0.4, 'up'], [1.6, 'middle'], [3.4, 'up']];
    // Spawn just left of the leftmost wall, clear of its beam.
    p.x = gates[0][0] - 0.8; p.y = 0; p.facing = { x: 1, y: 0 }; p.frozen = false; p.render();
    this.hud.setPhaseText('');
    this.hud.setCenter('GET THE CRYSTAL');
    await w.wait(1.4);
    this.hud.setCenter('');

    for (const [gx, pos] of gates) spawnStaticLaser(w, gx, pos);

    // yellow crystal on the right, mothership chasing from the left
    const crystal = new Crystal(w, { x: HALF_W - 0.9, y: 0, tint: 0xFFE400 });
    w.add(crystal);
    const ship = new MothershipChase(w);
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
    // The mothership can flee off-screen well before the crystalExtract
    // jingle (~3.8s) finishes; hold here so it plays out instead of getting
    // cut off by the Stage Clear jingle that follows.
    if (collectedAt != null && !p.dead) {
      const EXTRACT_JINGLE = 3.9;
      const elapsed = w.time - collectedAt;
      if (elapsed < EXTRACT_JINGLE) await w.wait(EXTRACT_JINGLE - elapsed);
    }
    w.clearEntities();
  }

  // A short breather between phases: clear the field and drop a heal orb.
  async interlude(seconds = 1.5) {
    this.world.clearEntities();
    spawnHealOrb(this.world);
    this.hud.setPhaseText('');
    await this.world.wait(seconds);
    this.world.clearEntities();
  }

  // --- 2. C.R.O.C.K: surfaces at a random quarter and spits jellyfish ---
  // No boss to kill here — just survive the swarm for the duration.
  async phase2() {
    this.world.crockSpilled = false;   // set by any Crock that gets to spit (crock.js)
    let next = 0.5, lastQ = -1;
    await this.world.runFor(28, (t, left) => {
      if (t >= next) {
        let qi;
        do { qi = randInt(4); } while (qi === lastQ);
        lastQ = qi;
        this.world.add(new Crock(this.world, QUARTERS[qi]));
        next += 4.5;
      }
      this.hud.setPhaseText('PHASE 2  ' + Math.ceil(left));
    });
    // Achievement "Crockodile Bully": through the whole phase, no C.R.O.C.K
    // got to spit a single jellyfish.
    if (!this.world.player.dead && !this.world.crockSpilled) unlockAchievement(this.world, 'crockbully');
    this.hud.setPhaseText('');
    this.world.clearEntities();
  }

  // --- 3. the BEAM: an unkillable cyan sweep + a spam of purple piranhas ---
  // Shoot the beam to reverse its spin and steer a gap; dodge the piranhas.
  async phase3() {
    this.world.add(new Beam(this.world));
    let next = 1;
    await this.world.runFor(30, (t, left) => {
      if (t >= next) { spawnPirania(this.world); next += 2; }
      this.hud.setPhaseText('PHASE 3  ' + Math.ceil(left));
    });
    this.hud.setPhaseText('');
    this.world.clearEntities();
  }

  // --- 4. the SWARM: dark-blue devil fish + purple telegraphed shrinking atoms ---
  // Devil fish die to a charged shot; atoms are unkillable, dodge only.
  async phase4() {
    let nextF = 0.5, nextA = 1.2;
    await this.world.runFor(30, (t, left) => {
      if (t >= nextF) { spawnDevilFish(this.world); nextF += 0.6; }
      if (t >= nextA) { spawnAtom(this.world); nextA += 2.2; }
      this.hud.setPhaseText('PHASE 4  ' + Math.ceil(left));
    });
    this.hud.setPhaseText('');
    this.world.clearEntities();
  }

  // --- 5. K.A.N.G: a Punch-Out reflex-duel boss ---
  // The player stands still and times the tell; the boss owns the beat.
  async phase5() {
    const w = this.world, p = w.player;
    p.x = 0; p.y = 2.4; p.facing = { x: 0, y: -1 }; p.frozen = true; p.render();
    this.hud.setPhaseText('');

    w.audio.play('bossIntro', 0.8);
    w.audio.play('warning', 0.9);
    for (let i = 0; i < 4 && !p.dead; i++) {
      this.hud.setCenter('! WARNING !');
      await w.wait(0.5);
      this.hud.setCenter('');
      await w.wait(0.5);
    }
    if (p.dead) return;

    const boss = new Kangaroo(w, this.hud);
    w.add(boss);
    await w.waitUntil(() => boss.defeated || p.dead);
    p.frozen = false;
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 1. the SAW: spins in place at centre, periodic splash attack, 3 charged
  // hits to destroy. Give the player a beat after it dies to dodge/clear any
  // shards still bouncing from its last attack before the field gets wiped.
  async phase1() {
    const saw = new Saw(this.world, 0, 0);
    this.world.add(saw);
    await this.world.waitUntil(() => {
      this.hud.setPhaseText('PHASE 1  ' + Math.max(0, saw.hp));
      return saw.dead || this.world.player.dead;
    });
    if (this.world.player.dead) return;
    this.hud.setPhaseText('DODGE');
    await this.world.wait(2.5);
    this.hud.setPhaseText('');
  }

  _anyKeyDown() {
    return (input.touching() || ['left', 'right', 'up', 'down', 'fire', 'lock'].some(k => input.isDown(k)));
  }

  // The shared READY card (readyintro.js): wait for a key, then fly the ship in.
  intro() { return readyIntro(this.world, this.hud); }
}

export async function run(world, hud, opts) { return new Director(world, hud).run(opts && opts.startPhase); }
