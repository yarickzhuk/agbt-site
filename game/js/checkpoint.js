// checkpoint.js — OUTER SPACE's own mid-level checkpoint, per direct
// request alongside an upload of `Checkpoint.sprite3` and
// `Checkpoint_reach.wav`: "this level will have mid stage checkpoints,
// next one be activated after defeating a boss (2nd sound). If you die in
// next stage, you'll rewive at that checkpoint."
//
// Scoped to this one level on purpose, the same "built for the level that
// asked for it" call every other level-specific mechanic in this doc makes
// (Showman's own Force field, Plasmadrache's own chomp) — `world.checkpoint`
// is a plain data field nothing else in the game ever sets, so every other
// level's own death handling is bit-for-bit unaffected; only `player.js`'s
// `takeDamage()` needs a single generic hook reading it (see below), not a
// parallel death system of its own.
//
// **Not the same "checkpoint" `cheat.js` already uses** — that one is the
// hidden Konami-code save-state (any phase, any time, player-triggered,
// persists across a reload) built specifically because a *real* NES-style
// checkpoint felt like it broke this game's whole "no checkpoints" 1980s
// arcade identity. This one is the opposite on every axis: always on (no
// code to unlock), automatic (the level itself decides when, not the
// player), scoped to a single in-progress run (never written anywhere,
// gone the moment the tab closes same as any other live `world` state),
// and a true in-place revive rather than a page reload back to a phase's
// own start. The two happen to share an English word, not a mechanism.
//
// **`Checkpoint.sprite3` is almost another pure-art upload, not quite
// `blocks: {}` this time** — its one real script is `when green flag
// clicked -> switch to образ1 -> repeat 6 { switch to a random costume
// 2-6; play Checkpoint_revive } -> switch to образ1 -> broadcast Reset`.
// That's a flag-click preview/test script, not a touch- or event-driven
// gameplay trigger — nothing in it ever reacts to the player at all, so
// the actual activate/revive mechanic below is built fresh from the brief,
// the same "thin skeleton" situation this session has hit repeatedly
// (`Level_select.sprite3`, `Trap_Circle_Delta.sprite3`). Its own costume
// churn (6 near-identical frames, a flicker/flutter animation) is reused
// here as a flavour, not traced literally — the same "sell the flicker
// with alpha/scale instead of real costume-swapping" call `flame.js`'s own
// multi-costume pulsing-circle source already made.
//
// **`Checkpoint.json` is a flat-vector redraw**, not a raster asset — the
// source SVG is already all straight lines and two simple circles (no
// bezier curves anywhere, confirmed by inspection), so it traces cleanly
// with `retro.buildSprite`'s own primitives: two solid end-post rects (the
// source's own two pillar boxes), two ring circles strung between them,
// a thin connecting cord, and a few short dangling "tassel" capsules for
// the source's own fringe detail. Tinted `hull` (`#FFE400`) at build time,
// matching the source's own `#ffe000` stroke almost exactly.
import { buildSprite, getShape, paletteColor } from './retro.js';
import { toScreen, HALF_W, SCREEN_W, SCREEN_H } from './core.js';

// How long the activation banner holds before fading out -- purely a
// celebratory confirmation, not a permanent landmark; its own underlying
// state (world.checkpoint) is what actually matters for a later revive,
// independent of whether this visual is still on screen when that happens.
const BANNER_HOLD = 1.6;
const BANNER_FADE = 0.9;
const REVIVE_INVULN = 2.0;   // s of grace after a revive -- more than the ordinary hit window

// Stretched to actually span the screen -- reported back as looking wrong
// at its native size (`scale: 1` read as a small badge parked at screen
// centre, not the wide finish-line-style gate the source art is). Solved
// `Wheel.json`'s own "doesn't cover all screen" bug the same way (see that
// shape's own CLAUDE.md note): derive the scale from `HALF_W` instead of a
// guessed constant, so it tracks the shape's own true design-unit width
// (`Checkpoint.json`'s own 610.77, /100 for world units) rather than
// picking a number that would silently go stale if either changed.
const BANNER_MARGIN = 0.92;   // fraction of the full screen width to fill
function bannerScale() {
  const s = getShape('Checkpoint');
  const nativeWidth = (s ? s.width : 610.77) / 100;
  return (HALF_W * 2 * BANNER_MARGIN) / nativeWidth;
}

// Registers its own ticker step rather than going through world.add() --
// the same choice bomb.js's own explosion flash and starfield.js's backdrop
// already make for a visual that has to outlive whatever world.clearEntities()
// call the level's own phase transition makes right after triggering it
// (phase4() calls this, then clearEntities(), on consecutive lines); going
// through world.updatables would get the banner wiped mid-fade, before a
// player ever actually saw it.
class CheckpointBanner {
  constructor(world, x, y) {
    this.world = world;
    this.t = 0;
    this.container = buildSprite('Checkpoint', { scale: bannerScale(), lineWidth: 3, tint: paletteColor('hull') });
    world.stage.addChild(this.container);
    const [sx, sy] = toScreen(x, y);
    this.container.position.set(sx, sy);
    this.container.alpha = 0;

    this.step = () => {
      if (world.paused) return;
      this.update(Math.min(world.app.ticker.deltaMS / 1000, 0.05));
    };
    world.app.ticker.add(this.step);
  }

  update(dt) {
    this.t += dt;
    if (this.t < BANNER_HOLD) {
      this.container.alpha = Math.min(1, this.t / 0.3);
      // the source's own idle flicker, approximated as a gentle alpha
      // shimmer rather than literal costume-swapping -- see this file's
      // own header for why.
      this.container.alpha *= 0.85 + 0.15 * Math.sin(this.t * 14);
    } else {
      const k = Math.max(0, 1 - (this.t - BANNER_HOLD) / BANNER_FADE);
      this.container.alpha = k;
      if (k <= 0) this.destroy();
    }
  }

  destroy() {
    this.world.app.ticker.remove(this.step);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// Called once a boss is actually defeated (not on a player death) --
// snapshots where to revive, plays the activation cue, and drops a brief
// banner at the boss's own position. Only position is kept, not a stale HP
// number: a revive always heals to full (see player.js's own hook) so a
// checkpoint is a real second chance, not just a teleport back to however
// little HP you had when you reached it. Also bumps `world.checkpointCount`
// (1-based) and returns it, for `showCheckpointTitle`'s own numbering below
// -- a level with more than one checkpoint would just see this climb to 2,
// 3, ... on each further call, same as `activateCheckpoint` itself already
// supports being called more than once (it just overwrites `world.checkpoint`).
export function activateCheckpoint(world, x, y) {
  world.checkpoint = { x, y };
  world.checkpointCount = (world.checkpointCount || 0) + 1;
  world.audio.play('checkpointReach', 0.8);
  new CheckpointBanner(world, x, y);
  if (world.hud) {
    world.hud.setCenter('CHECKPOINT REACHED');
    world.wait(1.4).then(() => { if (world.hud.center.text === 'CHECKPOINT REACHED') world.hud.setCenter(''); });
  }
  return world.checkpointCount;
}

// A brief stage-title-style card -- "CHECKPOINT n" / "READY" -- added per
// direct request ("can you make a 'Checkpoint Phase' so it would be like
// 'Checkpoint 1 [and under it] ready (like stage title)'"). Deliberately
// NOT the same shape every level's own intro() title card uses (fly the
// player in, hold on a blinking "PRESS ANY KEY" until a fresh keypress) --
// a checkpoint isn't a level transition the player chose to start, it's an
// automatic beat the level itself inserts, so this holds for a fixed
// `TITLE_HOLD` and auto-advances rather than waiting on input; nothing
// here reads `input` at all. Runs on its own ticker step (the same
// "survive a clearEntities() right after" reasoning `CheckpointBanner`'s
// own header already gives) rather than through `world.add()`, and is
// gated on `world.paused` the same way every other hand-rolled ticker step
// in this game is, so pausing mid-title doesn't quietly burn through the
// hold timer for free.
const TITLE_HOLD = 1.8;
export function showCheckpointTitle(world, n) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 150;
    const big = new PIXI.Text('CHECKPOINT ' + n, {
      fontFamily: 'Tektur, monospace', fontSize: 52, fill: 0xffffff, letterSpacing: 4, align: 'center',
    });
    big.anchor.set(0.5); big.position.set(SCREEN_W / 2, SCREEN_H / 2 - 30);
    const small = new PIXI.Text('READY', {
      fontFamily: 'Tektur, monospace', fontSize: 24, fill: paletteColor('hull'), letterSpacing: 6, align: 'center',
    });
    small.anchor.set(0.5); small.position.set(SCREEN_W / 2, SCREEN_H / 2 + 34);
    layer.addChild(big, small);
    world.stage.addChild(layer);

    let t = 0;
    const step = () => {
      if (world.paused) return;
      t += Math.min(world.app.ticker.deltaMS / 1000, 0.05);
      small.alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 6));   // blink, same cadence every other "hold" text uses
      if (t >= TITLE_HOLD) {
        world.app.ticker.remove(step);
        world.stage.removeChild(layer); layer.destroy({ children: true });
        resolve();
      }
    };
    world.app.ticker.add(step);
  });
}

// Called from player.js's takeDamage() the instant a hit would otherwise
// kill the player, in place of die() -- see that file's own hook for why
// this has to happen there rather than reacting to `player.dead` a frame
// later (main.js's own per-frame Game Over check would already have fired
// by then). Deliberately doesn't touch world.lives or world.score: this
// bypasses the normal death path entirely, so neither was ever touched in
// the first place -- a checkpoint revive costs nothing from the arcade
// lives economy, the whole point of it being a separate mercy from
// TRY AGAIN/GIVE UP, not a reskin of either.
export function reviveAtCheckpoint(world) {
  const p = world.player;
  const cp = world.checkpoint;
  p.x = cp.x; p.y = cp.y;
  p.hp = p.maxHP;
  p.invulnUntil = p.time + REVIVE_INVULN;
  p.charging = false;
  p.dashing = false;
  // A real bug: forcing `charging` false here (rather than going through
  // player.js's own release branch, `if (this.charging && input.wasReleased
  // ('fire'))`) skips the one place that ever calls stopLoop('chargeHold') --
  // so a player caught by a checkpoint mid-charge (holding fire when the
  // hit landed) was left with the charge-hold hum looping forever: charging
  // is already false by the time fire is actually released, so that branch
  // never runs again to silence it. Stopped directly here instead.
  world.audio.stopLoop('chargeHold');
  p.render();
  world.audio.play('checkpointRevive', 0.8);
  if (world.hud) {
    world.hud.setCenter('REVIVED AT CHECKPOINT');
    world.wait(1.2).then(() => { if (world.hud.center.text === 'REVIVED AT CHECKPOINT') world.hud.setCenter(''); });
  }
}
