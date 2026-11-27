// levels/level4.js — "OCCÜLTACRESBURG". LINE SLASHER is introduced and
// locked in here (see CLAUDE.md's weapons section, and lineslasher.js for
// the weapon itself) the same way CYBER ZOO introduces the Cyber Shotgun and
// CRAZY CARNIVAL introduces Bouncy Ball: an uncleared run is forced onto
// this level's own new weapon (main.js's world.weaponForced), and clearing
// it once unlocks Line Slasher for free [V] switching everywhere else.
//
// Phase 1, "THE KNIGHTS": destroy KNIGHT_COUNT (4) Knights (knight.js) to
// clear it, one at a time — each Knight comes in fresh once the last one
// falls, not all four at once. A DARK BLUE, 3-HP hazard that closes the
// distance itself (glides straight at the player, then swings), it's the
// level's whole reason for existing: a charged shot one-shots it (3 damage,
// "acts like a torpedo"), but Line Slasher's own SLASH only deals 1 per
// swing, needing three separate hits — the deliberate melee-vs-ranged
// tradeoff this fight exists to teach. A light meteor.js spam (METEOR_BATCH
// every METEOR_INTERVAL) runs the whole phase for extra pressure while
// closing with each Knight — purely a dodge, doesn't count toward clearing.
//
// Phase 2, "THE HAUNTING": destroy GHOST_COUNT (5) Ghosts (ghost.js) — up to
// GHOST_CAP (2) sneaking around disguised at once, replenished every
// GHOST_SPAWN_INTERVAL as they're killed (same cap+replenish shape
// level3.js's own FIREWORKS phase uses for its rockets). Each one is nearly
// invisible and harmless until touched, at which point it reveals itself
// and starts repeatedly divebombing until killed — see ghost.js for the
// full state machine. Alongside the Ghosts, for the same open-ended
// duration, a steady stream of Flames (flame.js, ported from
// `Flame.sprite3`) drift in from random edges and pulse as they cross —
// PURPLE, unkillable, a "chip bullet" to dodge like pirania.js's own
// piranhas. `flameIdle` loops for the whole phase, the same "one ambient
// loop regardless of instance count" pattern the hub's own `stageMenu`
// theme uses.
//
// Phase 3, "THE MAZE": a MAZE_TIME survival — every GEM_INTERVAL a shrinking
// gem telegraph (gemwarning.js, ported from `Mase.sprite3`) appears somewhere
// in the arena and, once it finishes shrinking, drops a solid wall (wall.js)
// in its place, boxing the player in a little more as the phase goes on.
// Spears (spear.js, ported from `Spear.sprite3`) fly straight at wherever
// the player was standing when they launched — CYAN, killed by any shot, a
// shoot-it-or-get-hit hazard on top of the maze's own dodge-the-walls
// pressure.
//
// Phase 4, "THE WHEEL": a WHEEL_TIME survival against a single big spinning
// obstacle (wheel.js, ported from `Wheel.sprite3`) — touch-hurts along its
// whole spinning silhouette, but its small central hub is always shootable
// (any weapon) regardless of rotation. Each hit cycles it through spinning
// right, spinning left, and briefly idle before spinning right again; it's
// present for the full duration no matter how it's hit, then it's gone and
// the phase (and the level) ends.
//
// Phase 5, the boss: PLASMADRACHE (plasmadrache.js, ported from
// `Plasmadrache_Bossfight.sb3`) — a stationary dragon head, DARK BLUE, 30 HP,
// that alternates summoning walls (wall.js) and spitting fireballs
// (plasmaflame.js) forever until destroyed. See plasmadrache.js's own header
// for the two named bug fixes (the fire-spit animation timing, walls no
// longer able to spawn through his own body) and the chomp easter egg — an
// instant-kill + cutscene triggered by landing a hit too close to his open
// mouth, which heals him by this stage's own collected heal-orb count and
// taunts the player (varying by a persisted per-run chomp tally) before the
// normal Game Over flow takes over.
//
// Same title-card intro() every other level uses, and the same
// run(startPhase) contract (so the save-state cheat's phase-skip hook slots
// in with no rework).
import { input } from '../input.js';
import { readyIntro } from './readyintro.js';
import { edgeSpawn, HALF_H, HALF_W, SCREEN_W, SCREEN_H, rand } from '../core.js';
import { Knight } from '../knight.js';
import { Ghost } from '../ghost.js';
import { spawnGemWarning } from '../gemwarning.js';
import { spawnFlame } from '../flame.js';
import { spawnSpear } from '../spear.js';
import { Wheel } from '../wheel.js';
import { Plasmadrache } from '../plasmadrache.js';
import { spawnMeteorBatch } from '../meteor.js';
import { spawnHealOrb } from '../heal.js';
import { Crystal } from '../crystal.js';
import { Mothership } from '../mothership.js';
import { Bomb } from '../bomb.js';
import { runWeaponTutorial } from './tutorial.js';
import { unlockAchievement } from '../achievements.js';

const KNIGHT_COUNT = 4;
const METEOR_INTERVAL = 5;   // seconds between spam batches
const METEOR_BATCH = 2;

const GHOST_COUNT = 5;
const GHOST_CAP = 2;             // never more than this many loose (disguised or revealed) at once
const GHOST_SPAWN_INTERVAL = 3;  // seconds between spawns while still under cap
// FLAME_INTERVAL: doubled from 1.4s to 2.8s (reported back as too much
// Flame spam) -- Flames each drift until they clear the screen on their
// own (flame.js), so a short interval let them pile up over a phase that
// can easily run long enough to kill all GHOST_COUNT ghosts.
const FLAME_INTERVAL = 2.8;      // seconds between Flame spawns, alongside the Ghosts

const MAZE_TIME = 30;            // survival duration, THE MAZE
// GEM_INTERVAL: dropped from 3.5s (reported back as wanting more gem spam —
// only ~8 telegraphs across the whole 30s phase, leaving long stretches
// with nothing to dodge). WARN_TIME (gemwarning.js) is 1.1s, so 1.4s still
// keeps telegraphs mostly non-overlapping while roughly doubling how often
// they appear.
const GEM_INTERVAL = 1.4;        // seconds between gem telegraphs
const SPEAR_INTERVAL = 1.8;      // seconds between Spear spawns, alongside the maze

const WHEEL_TIME = 30;           // survival duration, THE WHEEL (matches the source's own 30s)

const PLASMADRACHE_POS = { x: 0, y: -1.3 };   // his own centre; see plasmadrache.js's MOUTH_OFFSET_Y

const BOMB_COUNT = 8;         // loose bomb.js hazards to dodge during THE ESCAPE
const CRYSTAL_TINT = 0xFF2020; // red -- swapped with CRAZY CARNIVAL's orange per direct request

class Director {
  constructor(world, hud) { this.world = world; this.hud = hud; }

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
  // level2.js/level3.js's own interlude() exactly.
  async interlude(seconds = 1.5) {
    this.world.clearEntities();
    spawnHealOrb(this.world);
    this.hud.setPhaseText('');
    await this.world.wait(seconds);
    this.world.clearEntities();
  }

  // --- 1. THE KNIGHTS ---
  // KNIGHT_COUNT kills, one Knight alive at a time -- the next spawns the
  // moment the last one falls. A light meteor.js spam runs the whole phase
  // on its own open-ended ticker step (same "no fixed duration, ends on a
  // count" shape phase2/phase4 use in level3.js's own FIREWORKS/DARTS).
  async phase1() {
    const w = this.world;
    this.hud.setPhaseText(`PHASE 1  0/${KNIGHT_COUNT}`);

    let meteorT = 0;
    const meteorStep = () => {
      if (w.paused) return;
      meteorT += Math.min(w.app.ticker.deltaMS / 1000, 0.05);
      if (meteorT >= METEOR_INTERVAL) { meteorT = 0; spawnMeteorBatch(w, METEOR_BATCH); }
    };
    w.app.ticker.add(meteorStep);

    let killed = 0;
    while (killed < KNIGHT_COUNT && !w.player.dead) {
      const spot = edgeSpawn();
      const knight = w.add(new Knight(w, spot.x, spot.y));
      await w.waitUntil(() => knight.dead || w.player.dead);
      if (w.player.dead) break;
      killed++;
      this.hud.setPhaseText(`PHASE 1  ${killed}/${KNIGHT_COUNT}`);
    }

    w.app.ticker.remove(meteorStep);
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 2. THE HAUNTING ---
  // GHOST_COUNT kills, up to GHOST_CAP loose at once (disguised or already
  // revealed), replenished every GHOST_SPAWN_INTERVAL as they're killed and
  // more are still needed -- same cap+replenish shape level3.js's own
  // FIREWORKS phase uses for its rockets. Open-ended (no fixed duration),
  // so it runs its own ticker step rather than world.runFor's. Flames spawn
  // alongside the Ghosts for the same open-ended duration -- flameIdle loops
  // for the whole phase, the same "one ambient loop regardless of instance
  // count" pattern the hub's own stageMenu theme uses, and stops the moment
  // the phase actually ends.
  async phase2() {
    const w = this.world;
    this.hud.setPhaseText(`PHASE 2  0/${GHOST_COUNT}`);
    w.audio.loop('flameIdle', 0.12);
    let killed = 0;
    const ghosts = [];

    await new Promise(resolve => {
      let t = 0, nextSpawn = 0, flameT = 0;
      const step = () => {
        if (w.paused) return;
        const dt = Math.min(w.app.ticker.deltaMS / 1000, 0.05);
        t += dt;

        for (let i = ghosts.length - 1; i >= 0; i--) {
          if (ghosts[i].dead) {
            ghosts.splice(i, 1);
            killed++;
            this.hud.setPhaseText(`PHASE 2  ${killed}/${GHOST_COUNT}`);
          }
        }
        if (t >= nextSpawn && ghosts.length < GHOST_CAP && killed + ghosts.length < GHOST_COUNT) {
          const spot = edgeSpawn();
          ghosts.push(w.add(new Ghost(w, spot.x, spot.y)));
          nextSpawn = t + GHOST_SPAWN_INTERVAL;
        }

        flameT += dt;
        if (flameT >= FLAME_INTERVAL) { flameT = 0; spawnFlame(w); }

        if (killed >= GHOST_COUNT || w.player.dead) { w.app.ticker.remove(step); resolve(); }
      };
      w.app.ticker.add(step);
    });

    w.audio.stopLoop('flameIdle');
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 3. THE MAZE ---
  // MAZE_TIME survival: every GEM_INTERVAL a gem telegraph appears somewhere
  // in the arena and, once it shrinks away, leaves a solid wall behind.
  // Spears fly in alongside it too, on their own SPEAR_INTERVAL.
  async phase3() {
    const w = this.world;
    let gemT = 0, spearT = 0.6;
    await w.runFor(MAZE_TIME, (t, left) => {
      gemT += Math.min(w.app.ticker.deltaMS / 1000, 0.05);
      if (gemT >= GEM_INTERVAL) { gemT = 0; spawnGemWarning(w); }
      spearT += Math.min(w.app.ticker.deltaMS / 1000, 0.05);
      if (spearT >= SPEAR_INTERVAL) { spearT = 0; spawnSpear(w); }
      this.hud.setPhaseText('PHASE 3  ' + Math.ceil(left));
    });
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 4. THE WHEEL ---
  // WHEEL_TIME survival against one big spinning obstacle at screen centre.
  // Present for the whole duration regardless of how it's hit (matching the
  // source's own unconditional `wait 30 secs; hide`); the phase (and the
  // level) ends the moment the timer runs out.
  async phase4() {
    const w = this.world;
    w.add(new Wheel(w, 0, 0));
    // Achievement "Moai": the whole phase without the ship moving at all.
    const p = w.player, sx = p.x, sy = p.y;
    let moved = false;
    await w.runFor(WHEEL_TIME, (t, left) => {
      this.hud.setPhaseText('PHASE 4  ' + Math.ceil(left));
      if (Math.hypot(p.x - sx, p.y - sy) > 0.01) moved = true;
    });
    this.hud.setPhaseText('');
    if (!p.dead && !moved) unlockAchievement(w, 'moai');
    w.clearEntities();
  }

  // --- 5. PLASMADRACHE ---
  // The same `! WARNING !` flash (4x, 0.5s on/0.5s off, bossIntro + warning
  // sounds) every other boss in this game uses, then the fight itself:
  // plasmaTheme loops for its duration (stopped unconditionally the instant
  // the fight ends, win or lose, same pattern level3.js's own
  // showmanTheme/clownhouseMaze already follow), and the HUD tracks his
  // remaining HP. Ends the moment he's dead or the player is — including a
  // chomp: plasmadrache.js's own updateChomp() only actually sets
  // world.player.dead after its taunt cutscene has held on screen for
  // CUTSCENE_TIME, so this waitUntil (and the normal Game Over flow right
  // behind it) doesn't fire until that's already played out.
  async phase5() {
    const w = this.world, p = w.player;
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

    const boss = w.add(new Plasmadrache(w, PLASMADRACHE_POS.x, PLASMADRACHE_POS.y));
    w.audio.loop('plasmaTheme', 0.5);
    await w.waitUntil(() => {
      this.hud.setPhaseText('PHASE 5  ' + Math.max(0, boss.hp));
      return boss.dead || p.dead;
    });
    w.audio.stopLoop('plasmaTheme');
    this.hud.setPhaseText('');
    this.hud.setCenter('');
    this.hud.setNearHp('');
    w.clearEntities();
  }

  // --- 6. THE ESCAPE ---
  // The crystal-extraction finale every other level's own escape sequence
  // (level1.js/level3.js) ends on, reoriented vertically here per direct
  // request: instead of a MothershipChase wall closing in from a side, the
  // (plain) Mothership rises from the *bottom* (mothership.js's own new
  // opts.fromBottom -- its rising top edge is the death one), and instead
  // of the 4 static laser gates those other two finales use, BOMB_COUNT (8)
  // ordinary bomb.js hazards are scattered across the field to dodge (or
  // shoot, at the cost of triggering their own explosion) on the way to the
  // crystal -- no gate to clear, just a field to get through. The crystal
  // itself is CRYSTAL_TINT (red since the swap with CRAZY CARNIVAL; was amber/orange, the "amber" palette role
  // BOUNCY BALL already established), sitting near the top -- the safest
  // spot, furthest from where the mothership rises in from.
  async phase6() {
    const w = this.world, p = w.player;
    w.clearEntities();
    const crystalY = -HALF_H + 0.9;
    p.x = 0; p.y = crystalY + 2.2; p.facing = { x: 0, y: -1 }; p.frozen = false; p.render();
    this.hud.setPhaseText('');
    this.hud.setCenter('GET THE CRYSTAL');
    await w.wait(1.4);
    this.hud.setCenter('');

    for (let i = 0; i < BOMB_COUNT; i++) {
      let bx, by;
      do {
        bx = rand(-HALF_W + 0.6, HALF_W - 0.6);
        by = rand(crystalY + 1.2, HALF_H - 0.6);   // clear of the crystal itself and the player's own start
      } while (Math.abs(bx - p.x) < 1.2 && Math.abs(by - p.y) < 1.2);
      w.add(new Bomb(w, bx, by));
    }

    const crystal = new Crystal(w, { x: 0, y: crystalY, tint: CRYSTAL_TINT });
    w.add(crystal);
    const ship = new Mothership(w, { fromBottom: true });
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
    // cut off by the Stage Clear jingle that follows -- same
    // belt-and-suspenders level1.js's/level3.js's own escape finales use.
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
