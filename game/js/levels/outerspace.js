// levels/outerspace.js — "OUTER SPACE", the final stage. Not reachable from
// the hub like every other level — per direct request ("Instead of adding
// it into stage menu, add option 'Enter the Outer Space' which will appear
// on main menu ONLY after you have all weapons"), it's its own title-screen
// entry (menu.js's MENU_ITEMS), shown only once every weapon's own level
// (SHAPE LIMBO/CYBER ZOO/CRAZY CARNIVAL/OCCÜLTACRESBURG) has been cleared —
// the same "you've earned the Charge Cannon, the Cyber Shotgun, Bouncy
// Ball, and Line Slasher" gate `weapon.js`'s own availableWeaponOrder
// already reads, just checked directly against all four at once rather than
// gating any one weapon in the [V] cycle.
//
// **Split into two selectable stages** — per direct request ("split 'Outer
// Space' level in 2 stages (for now when you click 'Enter to Outer space'
// there will be 'Stage 1' (everything up to Trap Circle Delta, including
// it) and 'Stage 2' (Everything after it)"): what used to be one long
// six-phase `Director.run()` is now two separate exports, `runStage1` and
// `runStage2`, each with its own small `Director` class and its own
// intro/title card. `menu.js`'s own `ENTER THE OUTER SPACE` row now opens a
// small STAGE 1/STAGE 2 submenu (`showOuterSpaceMenu`) instead of resolving
// straight into a single level — see that file's own header comment for the
// gating (STAGE 2 locked until STAGE 1 is cleared, same `isCleared`/
// `DEV_ALWAYS_SHOW_OUTERSPACE` testing bypass the original single-row gate
// already used).
//
// **STAGE 1 is phases 1-4** (ASTEROIDS, the DISRUPTOR, vertical lasers +
// COMET, the boss TRAP CIRCLE DELTA) exactly as before, renumbered to run
// standalone and ending in an ordinary Stage Clear the instant Trap Circle
// Delta falls. **The mid-run checkpoint (`checkpoint.js`'s
// `activateCheckpoint`/`showCheckpointTitle`) that used to fire right after
// that boss fight is gone** — it existed only to carry the player from Trap
// Circle Delta into the Boss Rush without a death wiping that progress
// (see `checkpoint.js`'s own header for the original mechanic), and a real
// stage boundary (a Stage Clear screen, a fresh level load) already does
// that job on its own; the checkpoint machinery itself isn't deleted
// (`checkpoint.js` stays intact, just unused by this level for now) in case
// Stage 2 — or some future level — wants its own internal checkpoint later.
//
// **STAGE 2 is phases 5-6 as they were** (C.R.O.C.K., then the Boss Rush
// boss KANGUNROO DELTA), renumbered to `PHASE 1`/`PHASE 2` of its own run
// (the HUD text no longer reads "PHASE 5"/"PHASE 6" now that they're a
// fresh stage's own first two phases) with its own intro/title card
// ("OUTER SPACE — STAGE 2"). `w.checkpoint = null` at the top of its own
// Boss Rush phase is kept exactly as it was (defensive, in case a future
// checkpoint gets added somewhere earlier in Stage 2 itself) even though
// nothing in Stage 2 currently sets one.
//
// **Stage 2 grew two more phases since**: `PHASE 3` is Showman's Delta Maze
// (see that phase's own comment below for the full translation) and
// `PHASE 4` is **PLASMADRACHE DELTA, Boss Rush's own closing fight** — per
// direct request ("it's time for last boss of boss rush: Plasmadrache
// Delta"). See `plasmadrachedelta.js`'s own header for the full two-phase
// mechanic (150 HP body-only phase vs. 50 HP chin-only phase, the exact
// damage table, the touch-instakill). Clearing it is what the stage's own
// final `w.wait(1)` beat leads into Stage Clear from.
//
// registry.js keeps both stages out of `LEVELS` (the array that actually
// drives the hub's 4-triangle emblem — stageselect_visuals.js's TRIANGLES
// only has entries for the 4 real stages, so a 5th/6th LEVELS entry would
// silently break its index/row mapping) but still exports them
// (`OUTER_SPACE_STAGE1`/`OUTER_SPACE_STAGE2`) and folds them into
// levelById's own lookup, so the save-state cheat (cheat.js's Save/Load)
// and Game Over's own TRY AGAIN both still work on either stage exactly
// like any other level — both round-trip through levelById(id) on the
// next boot.
//
// Built out one phase at a time, same state CRAZY CARNIVAL started in (see
// level3.js's own header comment from before its phases existed).
// First-pass, open to building out further like every other level's own
// hazards.
//
// **Has its own backdrop** (`starfield.js`'s `StarField`, ported from the
// author's own `Outer_Space_BG.sb3` upload) — a deliberately faint 3-layer
// parallax star scroll, kept well below the source's own busier numbers per
// direct request ("Make this background as LEAST distractive as possible").
// See that file's own header comment for the full translation and why it's
// toned down. Each stage's own Director starts/tears down its own copy —
// it's a stage-scoped backdrop now, not a whole-level one, since the two
// stages are separate `run()` entry points with no shared lifetime.
//
// **Phase 1, ASTEROIDS** (`asteroid.js`) — per direct request, alongside the
// upload of the source Scratch sprite ("This is phase 1. So you know how
// asteroids in 'Asteroid' works? Well this is basically exact same thing"),
// pointing straight at `meteor.js`'s own already-shipped drift/bounce/spin
// hazard pattern as the mechanic to reuse: a timed survival
// (`ASTEROID_TIME`, 30s, same `runFor` shape CYBER ZOO's own C.R.O.C.K/BEAM
// phases already use) against a field of slow, spinning, screen-edge-
// bouncing purple rocks, one more spawned every `ASTEROID_INTERVAL` (4s).
// Touching one hurts and breaks it into 3 smaller fragments (the source's
// own `repeat 3 { create clone of myself }` at `100/3` size); a fragment's
// own touch just destroys it, no further breaking — see `asteroid.js`'s own
// header for the full source translation. First-pass — the interval/
// duration/cap are all open to tuning like everything else in this doc.
//
// **Superseded: phase 2 is now PRESSES + BOMBS** (see phase2() below); the
// DISRUPTOR text that follows is the old phase's history.
// **Phase 2, the DISRUPTOR** (`disruptor.js`) + `splash.js` — per direct
// request ("Phase 2 will contain splash.js and this guy. In order to
// destroy him, break both solar pannels before you can hit him"): a
// stationary ship-like hazard with two shootable solar panels; destroying
// both exposes its own core, which then takes real damage. A `splashBurst`
// (the same purple dot-ring `splash.js` already uses in SHAPE LIMBO's own
// phase 2) fires periodically for extra pressure while it's fought — see
// `disruptor.js`'s own header for the full source translation (a 3-target
// Scratch project, Stage/Ship/Wave, not a single `.sprite3`) and the real
// gap it had to fill (neither Ship nor Wave actually reacted to anything
// in the source). First-pass — the splash cadence is open to tuning, same
// as `disruptor.js`'s own numbers.
//
// **Phase 3, the vertical lasers + COMET** (`laser.js`'s `opts.vertical`,
// `comet.js`) — per direct request: "Phase 3 is vertical variation of
// lazer.js (flip them by 90 degrees and strech them over the screen) with
// these [Comet.sprite3]." A timed survival (`COMET_TIME`, 30s, the same
// `runFor` shape phase 1's own ASTEROIDS already uses): a wide beam
// sweeps in from the top or bottom edge every `LASER_INTERVAL` (6s, the
// same spacing SHAPE LIMBO's own horizontal sweeper settled on), its cyan
// block riding left/middle/right — shoot the block to drop that beam, same
// as any other `LaserWall`. A `Comet` streaks in from a random edge every
// `COMET_INTERVAL` (3.5s), aimed once at wherever the player was standing
// at launch, leaving a fading purple dust trail behind it — see
// `laser.js`'s and `comet.js`'s own header comments for the full source
// translation of each. First-pass — both cadences are open to tuning, same
// as everything else in this doc.
//
// **Phase 4, the boss TRAP CIRCLE DELTA** (`trapcircledelta.js`) — per
// direct request, alongside an upload of `Trap_Circle_Delta.sprite3` and
// `Trap_Circle_Beats.wav`: "Boss is a buffed version of a boss from Shape
// Limbo - Trap Circle (Here it's a Trap Circle Delta)." Preceded by the
// same "! WARNING !" flash (4x, 0.5s on/off, `bossIntro` + `warning`
// sounds) every other boss in this game uses. See `trapcircledelta.js`'s
// own header for the full translation, hit rules, and the combined
// `bossTheme`+`trapCircleBeats` soundtrack. **Beating it is now Stage 1's
// own Stage Clear**, not a mid-run beat — see this file's own "split into
// two selectable stages" note above for why the checkpoint that used to
// follow it is gone.
//
// **STAGE 2, Phase 1, C.R.O.C.K.** (`crock.js`) — per direct follow-up
// request ("Between Checkpoint and Kangunroo delta put extra phase that
// contains C.R.O.C.K.js", from back when this was still one continuous
// run): the exact same survival hazard CYBER ZOO's own phase 2 already
// uses (`Crock`/`QUARTERS` — surfaces into a random screen quarter, spits
// three jellyfish toward the middle, retreats; DARK BLUE, 3 hits), reused
// wholesale here as Stage 2's own opening breather rather than building a
// second near-duplicate hazard.
//
// **STAGE 2, Phase 2, Boss Rush — KANGUNROO DELTA** (`kangunroodelta.js`) —
// per direct request, alongside an upload of `Kangunroo_Delta.sb3`: "After
// first checkpoint there will be Boss Rush of buffed bosses. First one is
// buffed Cyber Zoo's Boss (Kangunroo)." Same "! WARNING !" intro as every
// other boss here. See `kangunroodelta.js`'s own header for the full
// source translation, the 50-HP shootable phase, and the "final stand"
// hand-off into `kangaroo.js`'s own reflex duel at 0 HP.
import { readyIntro } from './readyintro.js';
import { input } from '../input.js';
import { HALF_H, HALF_W, SCREEN_W, SCREEN_H, rand, randInt } from '../core.js';
import { StarField } from '../starfield.js';
import { livesCap } from '../costumes.js';
import { spawnAsteroid, Asteroid } from '../asteroid.js';
import { unlockAchievement, resetLevelChallenges, checkLevelChallenges } from '../achievements.js';
import { spawnPress } from '../press.js';
import { Bomb } from '../bomb.js';
import { spawnVerticalLaser } from '../laser.js';
import { spawnComet } from '../comet.js';
import { TrapCircleDelta } from '../trapcircledelta.js';
import { KangunrooDelta } from '../kangunroodelta.js';
import { Crock, QUARTERS } from '../crock.js';
import { spawnMaze } from '../wall.js';
import { Showman } from '../showman.js';
import { PlasmadracheDelta } from '../plasmadrachedelta.js';
import { Fleet, FLEET_SIZE } from '../fleet.js';
import { MothershipBoss, DEFEAT_SEQUENCE_TIME } from '../finale.js';
import { loadPoly, unloadPoly, PolyField, PolyHazard } from '../polytope.js';
import { spawnHealOrb } from '../heal.js';
import { DeltaBoss, startSphereBackdrop } from '../delta.js';
import { markCleared, setLives } from '../progress.js';

const ASTEROID_TIME = 30;
const ASTEROID_INTERVAL = 4;
const PRESS_TIME = 30;         // Stage 1 phase 2: survive the presses + bombs
const PRESS_INTERVAL = 1.5;    // SHAPE LIMBO's presses come every 0.85s
const PRESS_SLOW = 1.5;        // telegraph/retract stretched 1.5x
const PRESS_BOMBS = 8;
const ASTEROID_LATE = 8;       // rocks spawned in the last 8s don't count for Coincidence
const COMET_TIME = 30;
const LASER_INTERVAL = 6;
const COMET_INTERVAL = 3.5;
const CROCK_TIME = 28;
const CROCK_INTERVAL = 4.5;

// --- Showman's Delta Maze (Stage 2, phase 3) ---
// Traced from the author's own Boss_maze.sprite3 upload — a thin skeleton,
// same situation most of this project's sources are in: its only real
// script is a 100-second sensing_timer wait (MAZE_TIME below started
// there, since tightened to 15s by request) plus an ambient sound loop; nothing in it actually
// moves a sprite or tests a collision, so the walk-through-it mechanic is
// built fresh, same as corn.js/knight.js/etc. The wall layout itself comes
// from the costume art (28 solid rectangles, traced from the SVG's own
// path coordinates — image1's muted #775692 stroke is this upload's own
// "violet," image2's #ff00a0 a never-triggered palette swap off a dead
// script branch that nothing actually calls). That literal trace turned
// out *unplayable*, though: its corridors are 0.1-0.6 world units wide,
// well under twice the player's old 0.35 hitRadius (now 0.22), and uniform scaling
// can't fix a ratio problem — scaling enough to open a corridor blows the
// whole maze past the arena's own bounds (confirmed by a flood-fill check
// at 2x scale: the only fully-connected region left was the open moat
// *outside* the maze's own footprint, not any interior path). So, like
// Trap_Circle_Delta.sprite3/Checkpoint.sprite3/Level_select.sprite3's own
// "pure reference, build the real thing fresh" sources elsewhere in this
// project, MAZE_WALLS below is a fresh layout instead of the literal
// trace.
//
// **First pass at the fresh layout was a single 4-lane back-and-forth
// snake — reported back as nerfed too hard** compared to the source's own
// dense 28-rectangle grid. A plain back-and-forth corridor is barely a
// maze at all (one turn per lane, no actual decisions), nothing like what
// the uploaded art reads as. Replaced with a real generated maze: a grid
// of cells (COLS/ROWS), walls carved by a randomized DFS spanning tree (a
// fixed seed, so the layout is static and reproducible like every other
// hand-placed maze in this game, not re-rolled per playthrough) — a
// "perfect maze" in the standard sense, exactly one path between the
// entrance and exit cells.
//
// **Still not hard enough — a second follow-up request** ("make it HARD")
// took this further: a 6x5 grid in a modest box was replaced with a 9x7
// grid filling nearly the whole arena (`BX0..BX1`/`BY0..BY1`, 12x9 world
// units, still comfortably inside `HALF_W`≈6.43/`HALF_H`=5 — the arena's
// own screen clamp was never relied on as a second border, same reasoning
// as before) — 63 cells instead of 30, more than double the path length
// and search space under the same unmoved 100s clock, which is the real
// lever for "hard" here (DFS's own long, winding, low-branching corridors
// — the generated layout came out with only 3 true dead ends out of 63
// cells, i.e. mostly one long serpentine route rather than a many-branched
// one — already make it harder to read at a glance than a shorter,
// bushier maze would, on top of simply being a much bigger area to cross
// against the clock). Cell size shrank slightly too (1.33 x 1.29 world
// units, wall thickness up from 0.16 to 0.2 for clearer visibility at
// this bigger scale) — clear corridor still ~1.13 x 1.09 world units, well
// over twice the player's old 0.35 hitRadius (now 0.22), so "hard" comes from the
// maze's own size/shape, not from corridors tight enough to feel like
// collision jank. Re-verified solvable the identical flood-fill way
// (entrance to exit, grid inflated by the player's own radius) before
// wiring it in. 52 wall segments now (4 border + 48 internal) — nearly
// double the source upload's own 28-rectangle count, and this time
// genuinely harder to solve, not just bigger on paper.
//
// "Violet color means that you can't penetrate it by any mean (charged
// shot or dash won't work)" needed no new mechanic at all: wall.js's
// own default `grape` role is already unconditionally solid against every
// weapon, charged shots included (only a `ring`/`cobalt` role is ever
// shootable) — these walls are spawned with that default, unchanged. The
// "or dash won't work" half turned up a real, separate bug while checking
// it: player.js's updateDash() moved the player in a straight line
// clamped only to the screen edges, never once calling blockedByWalls()
// the way every other form of player movement already does — a dash
// could barrel clean through any wall in the game, this maze's included.
// Fixed at the source (player.js), not special-cased here.
//
// MAZE_TIME dropped from the original request's own literal 100s (which
// also happened to match the source sprite's own sensing_timer==100 wait,
// see the header note above) to 30s per a direct follow-up ("Lower time
// limit of maze to 30 seconds") — a deliberate tuning call on top of the
// source's own number, not a re-reading of it; the maze/Showman/HP are
// all unchanged, this is purely a tighter clock.
// Dropped a second time, 30s -> 15s, per a further direct request
// ("reduse time to 15, for boss 30 is still pretty slow") — read as a
// complaint about the *boss half* of this phase specifically: at 30s a
// player could spend real time wandering the (now much bigger, 9x7/63-cell)
// maze and still have a comfortable window left to actually fight Showman,
// which doesn't read as urgent for a boss encounter. Same deal as the first
// cut: purely a tighter clock, nothing about the maze layout, Showman's HP/
// scale, or the win/timeout mechanics changed.
// Raised again, 15s -> 20s ("Raise timer to 20 (25 seconds removes that
// 'tension' of a boss fight)"): the shortest walk to a clear shot at him is
// ~59 world units, ~8.5s at full speed but ~17s at the Cyber Shotgun's half
// speed, so at 15s the shotgun could never make it.
const MAZE_TIME = 20;
const MAZE_SHOWMAN_HP = 10;
// Showman himself is also much smaller here than his CRAZY CARNIVAL
// self (showman.js's own default scale/radius 1.3, more than the whole
// width of one maze cell) -- per the same follow-up request ("make
// showman smaller so he can fit into it"), MAZE_SHOWMAN_SCALE (0.4) sizes
// him down to comfortably sit inside the exit cell's own ~1.1-unit clear
// interior, visual size and hitbox shrinking together (showman.js's own
// opts.scale drives both at once, the same "stays locked together" rule
// TrapWheel's own weak sector already follows).
const MAZE_SHOWMAN_SCALE = 0.4;
const MAZE_WALLS = [
  // the boxed-in border -- this maze now fills nearly the whole arena (see
  // the comment above), unlike showman.js's own smaller CRAZY CARNIVAL
  // maze, but still keeps its own explicit border rather than leaning on
  // the screen's own clamp, since the two don't quite coincide.
  { x0: -6.1, x1: -5.9, y0: -4.6, y1: 4.6 },
  { x0: 5.9, x1: 6.1, y0: -4.6, y1: 4.6 },
  { x0: -6.1, x1: 6.1, y0: -4.6, y1: -4.4 },
  { x0: -6.1, x1: 6.1, y0: 4.4, y1: 4.6 },
  // internal dividers -- a randomized-DFS spanning-tree maze over a 9x7
  // grid (fixed seed, static layout).
  { x0: -4.767, x1: -4.567, y0: -0.643, y1: 0.643 },
  { x0: -4.767, x1: -4.567, y0: 0.643, y1: 1.929 },
  { x0: -3.433, x1: -3.233, y0: -1.929, y1: -0.643 },
  { x0: -3.433, x1: -3.233, y0: -0.643, y1: 0.643 },
  { x0: -3.433, x1: -3.233, y0: 1.929, y1: 3.214 },
  { x0: -3.433, x1: -3.233, y0: 3.214, y1: 4.5 },
  { x0: -2.1, x1: -1.9, y0: -3.214, y1: -1.929 },
  { x0: -2.1, x1: -1.9, y0: -1.929, y1: -0.643 },
  { x0: -0.767, x1: -0.567, y0: -4.5, y1: -3.214 },
  { x0: -0.767, x1: -0.567, y0: -0.643, y1: 0.643 },
  { x0: 0.567, x1: 0.767, y0: 0.643, y1: 1.929 },
  { x0: 1.9, x1: 2.1, y0: -3.214, y1: -1.929 },
  { x0: 1.9, x1: 2.1, y0: -0.643, y1: 0.643 },
  { x0: 3.233, x1: 3.433, y0: -1.929, y1: -0.643 },
  { x0: 3.233, x1: 3.433, y0: 0.643, y1: 1.929 },
  { x0: 4.567, x1: 4.767, y0: -3.214, y1: -1.929 },
  { x0: 4.567, x1: 4.767, y0: -1.929, y1: -0.643 },
  { x0: 4.567, x1: 4.767, y0: -0.643, y1: 0.643 },
  { x0: 4.567, x1: 4.767, y0: 0.643, y1: 1.929 },
  { x0: 4.567, x1: 4.767, y0: 1.929, y1: 3.214 },
  { x0: -4.667, x1: -3.333, y0: -3.314, y1: -3.114 },
  { x0: -3.333, x1: -2.0, y0: -3.314, y1: -3.114 },
  { x0: -0.667, x1: 0.667, y0: -3.314, y1: -3.114 },
  { x0: 2.0, x1: 3.333, y0: -3.314, y1: -3.114 },
  { x0: 3.333, x1: 4.667, y0: -3.314, y1: -3.114 },
  { x0: -6.0, x1: -4.667, y0: -2.029, y1: -1.829 },
  { x0: -4.667, x1: -3.333, y0: -2.029, y1: -1.829 },
  { x0: -2.0, x1: -0.667, y0: -2.029, y1: -1.829 },
  { x0: -0.667, x1: 0.667, y0: -2.029, y1: -1.829 },
  { x0: 0.667, x1: 2.0, y0: -2.029, y1: -1.829 },
  { x0: -0.667, x1: 0.667, y0: -0.743, y1: -0.543 },
  { x0: 0.667, x1: 2.0, y0: -0.743, y1: -0.543 },
  { x0: 2.0, x1: 3.333, y0: -0.743, y1: -0.543 },
  { x0: -3.333, x1: -2.0, y0: 0.543, y1: 0.743 },
  { x0: -2.0, x1: -0.667, y0: 0.543, y1: 0.743 },
  { x0: 3.333, x1: 4.667, y0: 0.543, y1: 0.743 },
  { x0: -4.667, x1: -3.333, y0: 1.829, y1: 2.029 },
  { x0: -3.333, x1: -2.0, y0: 1.829, y1: 2.029 },
  { x0: -2.0, x1: -0.667, y0: 1.829, y1: 2.029 },
  { x0: -0.667, x1: 0.667, y0: 1.829, y1: 2.029 },
  { x0: 0.667, x1: 2.0, y0: 1.829, y1: 2.029 },
  { x0: 2.0, x1: 3.333, y0: 1.829, y1: 2.029 },
  { x0: -6.0, x1: -4.667, y0: 3.114, y1: 3.314 },
  { x0: -2.0, x1: -0.667, y0: 3.114, y1: 3.314 },
  { x0: -0.667, x1: 0.667, y0: 3.114, y1: 3.314 },
  { x0: 0.667, x1: 2.0, y0: 3.114, y1: 3.314 },
  { x0: 2.0, x1: 3.333, y0: 3.114, y1: 3.314 },
  { x0: 3.333, x1: 4.667, y0: 3.114, y1: 3.314 },
];
const MAZE_ENTRANCE = { x: -5.33, y: 3.86 };
// Showman's own cell -- not the top-right grid corner any more (see the
// comment block above this const's own definition site for why: a BFS over
// the maze's real spanning tree found the corner was only 42 steps from the
// entrance, while cell (7,4) is a genuine 61 steps away, the actual farthest
// -- "the end of the path" -- point in the whole 63-cell maze).
const MAZE_EXIT = { x: 4.0, y: 1.29 };

// A hand-rolled timer loop, not core.js's own runFor() -- runFor only ever
// resolves early on world.player.dead, with no hook for a third "the real
// objective was met early" outcome (Showman dying before the clock runs
// out). Same pause-gated, dt-clamped shape runFor already uses internally,
// just with that extra check added alongside the other two.
// Running out of time no longer kills (per direct request: "remove
// instakill on showman delta (at all)"): it costs 1 HP (killedBy
// 'mazetimeout' if it's the last one) and the clock starts over.
function runMazeTimer(world, hud, duration, isDefeated, label = 'PHASE 3') {
  return new Promise(resolve => {
    let t = 0;
    const step = () => {
      if (world.paused) return;
      if (isDefeated()) { world.app.ticker.remove(step); resolve('win'); return; }
      if (world.player.dead) { world.app.ticker.remove(step); resolve('dead'); return; }
      const dt = Math.min(world.app.ticker.deltaMS / 1000, 0.05);
      t += dt;
      const left = Math.max(0, duration - t);
      hud.setPhaseText(label + '  ' + Math.ceil(left));
      if (t >= duration) {
        t = 0;
        const p = world.player;
        p.invulnUntil = 0;
        p.takeDamage(1, 'mazetimeout');
        hud.setCenter('OUT OF TIME!');
        world.wait(1.2).then(() => { if (hud.center.text === 'OUT OF TIME!') hud.setCenter(''); });
      }
    };
    world.app.ticker.add(step);
  });
}

// Shared by both stages: the starfield backdrop runs on its own ticker
// step, not through world.add()/world.updatables -- a phase's own
// clearEntities() call (the "clear field + heal orb" interlude pattern
// every other multi-phase level uses between phases) would otherwise wipe
// it out the instant the first real phase/interlude lands, same as it
// wipes every other updatable. Returns a teardown function.
// Every OUTER SPACE boss opens with this instead of the rest of the game's
// `! WARNING !` flash (bossIntro + warning_robot): an "INTRUDER ALERT"
// siren + voice line, per direct request. Same 4x 0.5s on/off flash and
// timing. The siren upload is a 16s continuous alarm, so it's looped just
// for the flash and faded out once it ends rather than played whole (it
// would otherwise blare 12s into the fight); the ~4.3s voice line fits the
// flash as a plain one-shot.
async function intruderAlert(w, hud) {
  const p = w.player;
  w.audio.loop('intruderAlarm', 0.6, 0.05);
  w.audio.play('intruderVoice', 1);
  try {
    for (let i = 0; i < 4 && !p.dead; i++) {
      hud.setCenter('! INTRUDER ALERT !');
      await w.wait(0.5);
      hud.setCenter('');
      await w.wait(0.5);
    }
  } finally {
    w.audio.stopLoop('intruderAlarm', 0.4);
  }
}

// Boss Rush bosses (Trap Circle Delta, Kangunroo Delta, Showman's Delta
// Maze, Plasmadrache Delta) use the game's normal boss warning -- the same
// "! WARNING !" flash + bossIntro/warning ("warning, boss battle incoming")
// as level2.js's TrapWheel -- per direct request. So does THE FINALE's
// mothership; the intruder alert above stays for Stage 3's fleet only.
export async function bossWarning(w, hud) {
  const p = w.player;
  w.audio.play('bossIntro', 0.8);
  w.audio.play('warning', 0.9);
  for (let i = 0; i < 4 && !p.dead; i++) {
    hud.setCenter('! WARNING !');
    await w.wait(0.5);
    hud.setCenter('');
    await w.wait(0.5);
  }
}

// THE FINALE's last boss swaps the intruder siren for its own two uploads
// ("Last 2 files will be instead boss alert"): Final_battle_alert.wav and the
// "This is the end, prepare to meet your doom, Player" voice line, both ~5s,
// played once under a 5-beat flash.
async function finalBattleAlert(w, hud) {
  const p = w.player;
  // The voice line was barely audible under the alarm ("barely hearable"):
  // the file is now raised ~18 dB (soft-limited) and the alarm sits lower.
  w.audio.play('finalAlert', 0.5);
  w.audio.play('finalVoice', 1);
  for (let i = 0; i < 5 && !p.dead; i++) {
    hud.setCenter('! FINAL BATTLE !');
    await w.wait(0.5);
    hud.setCenter('');
    await w.wait(0.5);
  }
}

// A breather between phases ("add delays with healing orbs between
// phases"): clear the field, drop a heal orb, and hold until it's picked
// up (or lapses), at least BREATHER_MIN and at most BREATHER_MAX seconds,
// so it's never wiped by the next phase before the player can reach it.
// Showman's Delta Maze (Stage 2 phase 3, and an ENDLESS MODE boss).
export async function showmanDeltaMaze(w, hud, label) {
  w.clearEntities();
  w.checkpoint = null;   // no revive net
  const p = w.player;
  p.frozen = true;
  hud.setPhaseText('');

  await bossWarning(w, hud);
  if (p.dead) return;

  spawnMaze(w, MAZE_WALLS);
  p.x = MAZE_ENTRANCE.x; p.y = MAZE_ENTRANCE.y;
  p.frozen = false;
  const boss = new Showman(w, true, { x: MAZE_EXIT.x, y: MAZE_EXIT.y, maxHp: MAZE_SHOWMAN_HP, scale: MAZE_SHOWMAN_SCALE, mustache: 'core' });
  w.add(boss);

  w.audio.loop('showmanTheme', 0.55);
  try {
    await runMazeTimer(w, hud, MAZE_TIME, () => boss.dead, label);
  } finally {
    w.audio.stopLoop('showmanTheme');
  }
  hud.setPhaseText('');
  hud.setCenter('');
  w.clearEntities();
}

const BREATHER_MIN = 1.5, BREATHER_MAX = 6;
export async function breather(w, hud, label) {
  w.clearEntities();
  hud.setPhaseText(label);
  hud.setCenter('');
  const orb = spawnHealOrb(w);
  let t = 0;
  await w.waitUntil(() => {
    t += Math.min(w.app.ticker.deltaMS / 1000, 0.05);
    return w.player.dead || (t >= BREATHER_MIN && (!orb.alive || t >= BREATHER_MAX));
  });
  hud.setPhaseText('');
}

export function startStarfield(w) {
  const stars = new StarField(w);
  const starStep = () => {
    if (w.paused) return;
    stars.update(Math.min(w.app.ticker.deltaMS / 1000, 0.05));
  };
  w.app.ticker.add(starStep);
  return () => { w.app.ticker.remove(starStep); stars.destroy(); };
}

// The shared READY card (readyintro.js): wait for a key, then fly the ship in.
function intro(world, hud) { return readyIntro(world, hud); }

// --- STAGE 1: ASTEROIDS -> PRESSES + BOMBS -> vertical lasers + COMET -> TRAP CIRCLE DELTA ---
class Stage1Director {
  constructor(world, hud) { this.world = world; this.hud = hud; }

  // `startPhase` mirrors every other level's own save-state-cheat hook
  // (pause.js).
  async run(startPhase = 0) {
    const w = this.world;
    const stopStars = startStarfield(w);
    try {
      if (startPhase === 0) {
        await intro(w, this.hud);
        if (w.player.dead) return;
      }
      if (startPhase <= 1) {
        w.currentPhase = 1;
        await this.phase1();
        if (w.player.dead) return;
      }
      if (startPhase <= 2) {
        w.currentPhase = 2;
        if (startPhase < 2) { await breather(w, this.hud, 'PHASE 2'); if (w.player.dead) return; }
        await this.phase2();
        if (w.player.dead) return;
      }
      if (startPhase <= 3) {
        w.currentPhase = 3;
        if (startPhase < 3) { await breather(w, this.hud, 'PHASE 3'); if (w.player.dead) return; }
        await this.phase3();
        if (w.player.dead) return;
      }
      if (startPhase <= 4) {
        w.currentPhase = 4;
        if (startPhase < 4) { await breather(w, this.hud, 'PHASE 4'); if (w.player.dead) return; }
        await this.phase4();
        if (w.player.dead) return;
      }
      await w.wait(1);   // brief beat before Stage Clear
    } finally {
      stopStars();
    }
  }

  // --- 1. ASTEROIDS: survive a field of drifting, fragmenting purple rocks ---
  async phase1() {
    const w = this.world;
    w.asteroidTouched = false;
    let next = 1;
    await w.runFor(ASTEROID_TIME, (t, left) => {
      if (t >= next) {
        const a = spawnAsteroid(w);
        a.late = t > ASTEROID_TIME - ASTEROID_LATE;   // too late to clear in time
        next += ASTEROID_INTERVAL;
      }
      this.hud.setPhaseText('PHASE 1  ' + Math.ceil(left));
    });
    this.hud.setPhaseText('');
    // Achievement "Coincidence? I THINK NOT!": wearing THE OG, every asteroid
    // (and every fragment) destroyed by the end, none broken by touching it.
    if (!w.player.dead && w.player.skin === 'og' && !w.asteroidTouched &&
        !w.updatables.some(u => u instanceof Asteroid && !u.dead && !u.late)) unlockAchievement(w, 'coincidence');
    w.clearEntities();
  }

  // --- 2. PRESSES + BOMBS: slower presses slam in while 8 bombs drift ---
  // Replaced the DISRUPTOR per direct request ("replace pulsator phase with
  // phase of presses (but slower) and 8 bombs").
  async phase2() {
    const w = this.world, p = w.player;
    for (let i = 0; i < PRESS_BOMBS; i++) {
      let bx, by;
      do {
        bx = rand(-HALF_W + 0.6, HALF_W - 0.6);
        by = rand(-HALF_H + 0.6, HALF_H - 0.6);
      } while (Math.hypot(bx - p.x, by - p.y) < 2);   // never on top of the player
      w.add(new Bomb(w, bx, by));
    }
    let next = 1;
    await w.runFor(PRESS_TIME, (t, left) => {
      if (t >= next) { spawnPress(w, { slow: PRESS_SLOW }); next += PRESS_INTERVAL; }
      this.hud.setPhaseText('PHASE 2  ' + Math.ceil(left));
    });
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 3. VERTICAL LASERS + COMET: survive the wide sweeps and the streaks ---
  async phase3() {
    const w = this.world;
    let nextLaser = 1, nextComet = 2;
    await w.runFor(COMET_TIME, (t, left) => {
      if (t >= nextLaser) {
        spawnVerticalLaser(w, Math.random() < 0.5 ? 'top' : 'bottom');
        nextLaser += LASER_INTERVAL;
      }
      if (t >= nextComet) { spawnComet(w); nextComet += COMET_INTERVAL; }
      this.hud.setPhaseText('PHASE 3  ' + Math.ceil(left));
    });
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 4. warning, then the TRAP CIRCLE DELTA boss -- Stage 1's own finale ---
  async phase4() {
    const w = this.world;
    w.clearEntities();
    const p = w.player;
    p.x = 0; p.y = 0; p.frozen = true;
    this.hud.setPhaseText('');

    await bossWarning(w, this.hud);
    p.frozen = false;
    if (p.dead) return;

    const boss = new TrapCircleDelta(w);
    w.add(boss);
    let defeated = false;
    boss.onDefeated = () => { defeated = true; };
    await w.waitUntil(() => defeated || w.player.dead);

    this.hud.setPhaseText('');
    w.clearEntities();
  }
}

// --- STAGE 2: C.R.O.C.K. -> Boss Rush: KANGUNROO DELTA ---
class Stage2Director {
  constructor(world, hud) { this.world = world; this.hud = hud; }

  async run(startPhase = 0) {
    const w = this.world;
    const stopStars = startStarfield(w);
    try {
      if (startPhase === 0) {
        await intro(w, this.hud);
        if (w.player.dead) return;
      }
      if (startPhase <= 1) {
        w.currentPhase = 1;
        await this.phase1();
        if (w.player.dead) return;
      }
      if (startPhase <= 2) {
        w.currentPhase = 2;
        if (startPhase < 2) { await breather(w, this.hud, 'PHASE 2'); if (w.player.dead) return; }
        await this.phase2();
        if (w.player.dead) return;
      }
      if (startPhase <= 3) {
        w.currentPhase = 3;
        if (startPhase < 3) { await breather(w, this.hud, 'PHASE 3'); if (w.player.dead) return; }
        await this.phase3();
        if (w.player.dead) return;
      }
      if (startPhase <= 4) {
        w.currentPhase = 4;
        if (startPhase < 4) { await breather(w, this.hud, 'PHASE 4'); if (w.player.dead) return; }
        await this.phase4();
        if (w.player.dead) return;
      }
      await w.wait(1);   // brief beat before Stage Clear
    } finally {
      stopStars();
    }
  }

  // --- 1. C.R.O.C.K.: the same survival hazard CYBER ZOO's own phase 2
  // uses, reused wholesale as Stage 2's own opening breather.
  async phase1() {
    const w = this.world;
    let next = 0.5, lastQ = -1;
    await w.runFor(CROCK_TIME, (t, left) => {
      if (t >= next) {
        let qi;
        do { qi = randInt(4); } while (qi === lastQ);
        lastQ = qi;
        w.add(new Crock(w, QUARTERS[qi]));
        next += CROCK_INTERVAL;
      }
      this.hud.setPhaseText('PHASE 1  ' + Math.ceil(left));
    });
    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 2. Boss Rush: KANGUNROO DELTA, a buffed K.A.N.G with a shootable
  // 50-HP pool and a reflex-duel "final stand" at 0 HP --- see
  // kangunroodelta.js's own header for the full mechanic.
  async phase2() {
    const w = this.world;
    w.clearEntities();
    // Defensive, kept from when this was one continuous run with a
    // checkpoint set earlier -- a checkpoint revive would completely
    // undercut this fight's own "higher stakes" lose rule (a real loss is
    // supposed to cost 2 HP and reset the boss, not get erased by an
    // unrelated safety net). Nothing in Stage 2 currently sets
    // world.checkpoint, but clearing it here costs nothing and guards
    // against a future phase added earlier in this stage doing so.
    w.checkpoint = null;
    const p = w.player;
    p.x = 0; p.y = 0; p.frozen = true;
    this.hud.setPhaseText('');

    await bossWarning(w, this.hud);
    p.frozen = false;
    if (p.dead) return;

    const boss = new KangunrooDelta(w, this.hud);
    w.add(boss);
    let defeated = false;
    boss.onDefeated = () => { defeated = true; };
    await w.waitUntil(() => defeated || w.player.dead);

    this.hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 3. Showman's Delta Maze: navigate a boxed-in maze of impenetrable
  // walls and defeat a 10-HP Showman waiting at its exit, all under one
  // MAZE_TIME (15s) clock -- miss it and the run ends on the spot. See the
  // MAZE_* constants above for the full translation/rebuild notes.
  async phase3() {
    await showmanDeltaMaze(this.world, this.hud, 'PHASE 3');
  }

  async phase4() {
    const w = this.world, hud = this.hud;
    w.clearEntities();
    w.checkpoint = null;   // same defensive null as phase2/phase3 -- no revive net
    const p = w.player;
    p.x = 0; p.y = HALF_H - 0.8; p.frozen = true;
    hud.setPhaseText('');

    await bossWarning(w, hud);
    p.frozen = false;
    if (p.dead) return;

    const boss = w.add(new PlasmadracheDelta(w, 0, 0));
    w.audio.loop('plasmaDeltaTheme', 0.5);
    await w.waitUntil(() => {
      hud.setPhaseText('PHASE 4  ' + Math.max(0, boss.hp));
      return boss.dead || p.dead;
    });
    w.audio.stopLoop('plasmaDeltaTheme');
    w.audio.stopLoop('plasmaDeltaHeadTheme');
    hud.setPhaseText('');
    hud.setCenter('');
    w.clearEntities();
  }
}

// Stage 3: straight into the boss -- no warm-up phase (the fireworks +
// clowns opener was cut per direct request: the stage should open on the
// INTRUDER ALERT).
class Stage3Director {
  constructor(world, hud) { this.world = world; this.hud = hud; }

  async run(startPhase = 0) {
    const w = this.world;
    const stopStars = startStarfield(w);
    try {
      if (startPhase === 0) {
        await intro(w, this.hud);
        if (w.player.dead) return;
      }
      if (startPhase <= 1) {
        w.currentPhase = 1;
        await this.phase1();
        if (w.player.dead) return;
      }
      await w.wait(1);   // brief beat before Stage Clear
    } finally {
      stopStars();
    }
  }

  // --- 1. the boss: DELTA UNIT, a 102-ship armada (fleet.js) ---
  // INTRUDER ALERT, then 8 Galaga-style waves; cleared once every ship is
  // down. Trap Circle Delta's percussion stem (trapCircleBeats) loops the
  // whole fight; fleet.js lays each wave's Delta_Unit part over it.
  async phase1() {
    const w = this.world, hud = this.hud;
    w.clearEntities();
    w.checkpoint = null;
    const p = w.player;
    p.x = 0; p.y = HALF_H - 1; p.frozen = true;
    hud.setPhaseText('');
    await intruderAlert(w, hud);
    p.frozen = false;
    if (p.dead) return;

    const fleet = w.add(new Fleet(w, hud));
    w.audio.loop('trapCircleBeats', 0.5);
    await w.waitUntil(() => {
      hud.setPhaseText(`PHASE 1  DELTA UNIT ${fleet.remaining}/${FLEET_SIZE}`);
      return fleet.defeated || p.dead;
    });
    w.audio.stopLoop('trapCircleBeats');
    hud.setPhaseText('');
    hud.setCenter('');
    w.clearEntities();
  }
}

// THE FINALE: the final boss level. Phase 1/3 is the mothership itself
// (finale.js) -- it sinks just far enough to be seen and spams the machine
// gun / bullet generator / spear attacks until its 200 HP run out. Phases
// 2 and 3 aren't specified yet, so clearing phase 1 currently clears the
// level.
const SURVIVE_TIME = 60;   // THE FINALE phases 4/5: "survive 1 minute each"

class FinaleDirector {
  constructor(world, hud) { this.world = world; this.hud = hud; }

  async run(startPhase = 0) {
    const w = this.world;
    const stopStars = startStarfield(w);
    // Phases 2-5 each bring their own polytope sprite sheets; prefetch the
    // next one while the current phase plays (polytope.js loads per phase).
    const keys = [null, null, 'tesseract', 'pentachoron', 'icositetrachoron', 'hecatonicosachoron'];
    const prefetch = n => { if (keys[n]) loadPoly(keys[n]).catch(() => {}); };
    try {
      if (startPhase === 0) {
        prefetch(2);
        await intro(w, this.hud);
        if (w.player.dead) return;
      }
      if (startPhase <= 1) {
        prefetch(2);
        w.currentPhase = 1;
        await this.phase1();
        if (w.player.dead) return;
      }
      for (let n = 2; n <= 5; n++) {
        if (startPhase > n) continue;
        w.currentPhase = n;
        prefetch(n); prefetch(n + 1);
        await this.interlude(n);
        if (w.player.dead) return;
        if (n <= 3) await this.fieldPhase(n, keys[n]);
        else await this.survivePhase(n, keys[n]);
        unloadPoly(keys[n]);
        if (w.player.dead) return;
      }
      if (startPhase <= 6) {
        w.currentPhase = 6;
        await this.interlude(6);
        if (w.player.dead) return;
        await this.phase6();
      }
    } finally {
      stopStars();
    }
  }

  // Breather between phases: clear the field, a heal orb, a short beat.
  async interlude(n) {
    await breather(this.world, this.hud, `PHASE ${n}/6`);
  }

  // --- 2/3. the tesseract / 5-cell: 200 HP shared by field + crystal ---
  async fieldPhase(n, key) {
    const w = this.world, hud = this.hud, p = w.player;
    const data = await loadPoly(key);
    if (p.dead) return;
    const field = w.add(new PolyField(w, key, data));
    await w.waitUntil(() => {
      hud.setPhaseText(`PHASE ${n}/6  FIELD ${field.hp}`);
      return field.defeated || p.dead;
    });
    hud.setPhaseText('');
    // the beaten crystal plays the extract jingle and fades out (polytope.js)
    if (!p.dead) await w.waitUntil(() => field.dead || p.dead);
    w.clearEntities();
  }

  // --- 4/5. the 24-cell / 120-cell: survive a minute ---
  async survivePhase(n, key) {
    const w = this.world, hud = this.hud, p = w.player;
    const data = await loadPoly(key);
    if (p.dead) return;
    w.add(new PolyHazard(w, key, data));
    await w.runFor(SURVIVE_TIME, (t, left) => hud.setPhaseText(`PHASE ${n}/6  SURVIVE ${Math.ceil(left)}`));
    hud.setPhaseText('');
    w.clearEntities();
  }

  // --- 6. DELTA (delta.js): the player's own double, the last fight ---
  // The moment he falls the level ends straight away -- main.js shows the
  // victory screen (and its own Destroyed_Delta.wav) instead of Stage Clear.
  async phase6() {
    const w = this.world, hud = this.hud, p = w.player;
    w.clearEntities();
    w.checkpoint = null;
    const stopSphere = startSphereBackdrop(w);
    try {
      p.x = 0; p.y = HALF_H - 1.2; p.frozen = true;
      hud.setPhaseText('');
      await finalBattleAlert(w, hud);
      p.frozen = false;
      if (p.dead) return;
      w.audio.loop('deltaTheme', 0.6);
      const boss = w.add(new DeltaBoss(w));
      await w.waitUntil(() => {
        hud.setPhaseText(`PHASE 6/6  DELTA ${boss.hp}`);
        return boss.defeated || p.dead;
      });
      hud.setPhaseText('');
      hud.setCenter('');
      if (!p.dead) w.clearEntities();
    } finally {
      w.audio.stopLoop('deltaTheme', 0.3);
      stopSphere();
    }
  }

  async phase1() {
    const w = this.world, hud = this.hud;
    w.clearEntities();
    w.checkpoint = null;
    const p = w.player;
    p.x = 0; p.y = HALF_H - 1.2; p.frozen = true;
    hud.setPhaseText('');
    await bossWarning(w, hud);   // the normal warning, per direct request
    p.frozen = false;
    if (p.dead) return;

    const boss = w.add(new MothershipBoss(w));
    await w.waitUntil(() => {
      hud.setPhaseText(`PHASE 1/6  MOTHERSHIP ${boss.hp}`);
      return boss.defeated || p.dead;
    });
    if (!p.dead) {
      // the destruction sequence: build-up, blast, the track's own ending
      hud.setPhaseText('');
      await w.wait(DEFEAT_SEQUENCE_TIME);
    }
    hud.setPhaseText('');
    hud.setCenter('');
    w.clearEntities();
  }
}


// --- OUTER SPACE as ONE run -------------------------------------------------
// Per direct request ("merge all stages of Outer Space into one, but if you
// die, you respawn at stage where you died, and lives are restored when you
// reached next stage"): ENTER THE OUTER SPACE now plays Stage 1 -> Stage 2 ->
// Stage 3 -> THE FINALE back to back, no Stage Clear screens in between (each
// stage still opens with its own title card). Each stage is still marked
// cleared as it's beaten (the save code still records them one by one).
// - **Death**: main.js spends a life as usual; while lives remain it sets
//   `world.respawning` instead of showing Game Over. The stage's run returns
//   (every stage already bails out on `player.dead`), and `respawn()` here
//   clears the field, revives the player at full HP and restarts *that
//   stage* from its title card. Out of lives -> the normal Game Over.
// - **Reaching the next stage refills lives** to the difficulty's
//   `startLives` (and HP to full).
// - THE FINALE's double max HP (main.js used to apply it for the old `finale`
//   level id) now applies here, the moment the finale stage starts.
// - The save-state cheat records `world.currentStage` alongside the phase, so
//   a load lands in the right stage (`opts.startStage`).
export const OUTER_SPACE_STAGES = [
  { id: 'outerspace1', label: 'STAGE 1', Director: Stage1Director },
  { id: 'outerspace2', label: 'STAGE 2', Director: Stage2Director },
  { id: 'outerspace3', label: 'STAGE 3', Director: Stage3Director },
  { id: 'finale', label: 'THE FINALE', Director: FinaleDirector },
];
// THE FINALE's double max HP -- off for good: the author playtested it at
// normal max HP and kept it ("I got 2 hits in mother ship... and got 2
// hits from delta. Keep it like that"). Set to true to bring it back.
const FINALE_DOUBLE_HP = false;
const STAGE_CLEAR_HOLD = 3;     // seconds of "STAGE n CLEAR" before the next title card
const ROAST_TAIL = 0.2;         // a beat after a roast line before the stage restarts
const RESPAWN_HOLD = 1.6;       // seconds between dying and the stage restarting

export async function runOuterSpace(world, hud, opts = {}) {
  const w = world, p = w.player;
  const baseMaxHP = p.maxHP;
  let stage = Math.max(0, Math.min(OUTER_SPACE_STAGES.length - 1, opts.startStage || 0));
  let phase = opts.startPhase || 0;
  let fresh = !phase;            // a cheat load keeps its saved HP for that first stage
  w.canRespawn = true;
  try {
    while (stage < OUTER_SPACE_STAGES.length) {
      const st = OUTER_SPACE_STAGES[stage];
      w.currentStage = stage;
      p.maxHP = st.id === 'finale' && FINALE_DOUBLE_HP ? baseMaxHP * 2 : baseMaxHP;
      if (fresh) p.hp = p.maxHP; else p.hp = Math.min(p.hp, p.maxHP);
      await new st.Director(w, hud).run(phase);
      if (!p.dead) {
        markCleared(st.id);
        checkLevelChallenges(w, 0.5);   // each OUTER SPACE stage counts as a level
        resetLevelChallenges(w);
        stage++;
        phase = 0; fresh = true;
        if (stage >= OUTER_SPACE_STAGES.length) break;   // Delta's down: main.js shows the victory screen
        if (w.speedrun) {
          // SPEEDRUN MODE (speedrun.js): one life for the whole game, no
          // title cards or STAGE CLEAR beats -- straight into the next stage
          phase = 1;
          w.clearEntities(); w.boss = null; w.audio.stopAllLoops();
          hud.setPhaseText(''); hud.setCenter('');
          continue;
        }
        w.lives = livesCap(w, p.skin);                   // reached the next stage: lives restored (DEVIL FISH: one less)
        setLives(w.lives);
        await stageClearBeat(w, hud, st.label);
        if (p.dead) return;
        continue;
      }
      // Died. With lives left main.js flagged a respawn; otherwise it's
      // already showing Game Over and the run is over.
      await w.wait(0.05);
      if (!w.respawning) return;
      await respawn(w, hud);
      phase = 0; fresh = true;
    }
  } finally {
    w.canRespawn = false;
  }
}

async function stageClearBeat(w, hud, label) {
  w.clearEntities();
  w.boss = null;
  hud.setPhaseText('');
  hud.setCenter(label + ' CLEAR');
  w.audio.play('stageClear', 0.9);
  await w.wait(STAGE_CLEAR_HOLD);
  hud.setCenter('');
}

async function respawn(w, hud) {
  const p = w.player;
  hud.setCenter(w.lives === 1 ? 'LAST LIFE!' : w.lives + ' LIVES LEFT');
  await new Promise(res => setTimeout(res, RESPAWN_HOLD * 1000));   // real time: the world isn't ticking for us
  // TOXIC MODE: don't restart the stage over a roast line that's still playing
  // (roast.js sets roastEnd on the audio clock).
  const left = (w.roastEnd || 0) - w.audio.now();
  if (left > 0) await new Promise(res => setTimeout(res, (left + ROAST_TAIL) * 1000));
  w.roastEnd = 0;
  resetLevelChallenges(w);   // the stage starts over
  w.clearEntities();
  w.boss = null;
  w.checkpoint = null;
  w.audio.stopAllLoops();
  hud.setCenter('');
  hud.setPhaseText('');
  hud.setNearHp && hud.setNearHp('');
  p.dead = false;
  p.frozen = false;
  p.charging = false;
  p.dashing = false;
  p.hp = p.maxHP;
  p.invulnUntil = 0;
  p.x = 0; p.y = 2.5;
  if (p.container) p.container.visible = true;
  p.render();
  w.respawning = false;
}
