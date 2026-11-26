// lineslasher.js — LINE SLASHER, a melee weapon ported from the author's own
// Scratch prototype (Line_Slasher.sprite3, plus Player.sprite3's own "Dash"
// receiver script for the charged release below).
//
// Three real bugs fixed from the source scripts:
//  - the slash's 6 arc "clones" were all `create clone of myself` inside a
//    `repeat` loop with no `wait` between iterations, so the whole sweep
//    appeared on a single script tick instead of animating as a sweep —
//    staggered here over SWEEP_TIME so it's a real animated fan, the same
//    "no wait between iterations -> unreadable instant, not something a
//    player can actually see" bug class dart.js's own flight already fixed.
//  - each clone's own fade-out script repeated the bug: `repeat 10 {
//    change GHOST effect by 10 }` with no `wait` either, so a clone ramped
//    straight to fully transparent and deleted itself in the same tick it
//    was created — it likely never rendered a single visible frame. Given a
//    real fade over FADE_TIME instead (plain PixiJS alpha, this game's own
//    flat-stroke convention, rather than Scratch's GHOST effect).
//  - the arc itself was off-centre: the source points to (Angle-60), then
//    turns +20 degrees *before* the first clone is ever created, so the six
//    clones only ever cover Angle-40..+60 (a lopsided 100 degrees) instead
//    of the evidently-intended symmetric +-60 (120 degrees) fan around
//    facing. Fixed by sampling six angles symmetrically instead.
//
// Audio: both `Line_slasher_slash.wav`/`Line_slasher_dash.wav` uploaded
// alongside the sprite export have the same "64-second export tool
// artifact" already fixed once this session for Peanut_1.wav/
// Firework_fly.wav — the real ~0.4s/~1.4s stinger repeats every 4s over 64s
// of dead air. The clean short clips already embedded inside the
// .sprite3 itself (assets/sounds/Line_slasher_slash.wav /
// Line_slasher_dash.wav) are the ones actually wired up here.
//
// Tap fire: SLASH — an instant melee sweep, matching the standard gun's own
// tap-fires-a-bullet timing. Hold to full charge and release for a DASH
// instead (mirroring Player.sprite3's own "Power == 85 -> broadcast Dash"
// branch — we don't have the stage script that fills a Scratch `Power`
// variable, so it's re-tied here to this game's own existing charge-hold
// mechanic, the same one the standard gun's torpedo already uses). Both are
// driven from player.js (fireMelee/updateDash) — this module only owns the
// hit-tests and the purely visual slash arc / dash afterimages.
//
// **The DASH never damages anything — pure mobility/i-frames, not a second
// attack.** All the killing goes through SLASH, which the player can still
// fire mid-dash (player.js checks for a fresh fire press during
// updateDash() and calls swingSlash() directly, without interrupting the
// dash's own movement/timer) — so a dash-in, slash, dash-out flows as one
// continuous motion rather than forcing a stop to attack.
//
// SLASH deals only 1 damage per swing (see knight.js for the first hazard
// that actually counts hits rather than dying to any qualifying shot): a
// charged shot from any other weapon (bullet.js's torpedo/shotgun pellet,
// bouncyball.js's fully-charged ball) deals 3, "acting like a torpedo" —
// the deliberate tradeoff melee exists to teach, needing three swings where
// a ranged charged shot needs one.
import { makeSkinSprite, isMonoSkin, skinSound } from './costumes.js';
import { buildSprite, paletteColor } from './retro.js';
import { toScreen, wallOnLine, PPU, playerHit, playerBossHit } from './core.js';

const SLASH_RANGE = 1.5;                 // world units
const SLASH_ARC = 60 * Math.PI / 180;    // half-angle either side of facing (120 total)
const SWEEP_SEGMENTS = 6;
const SWEEP_TIME = 0.18;                 // total time to stagger all 6 segments over
const FADE_TIME = 0.16;                  // each segment's own fade-out

export const DASH_SPEED = 16;            // world units/s while dashing
export const DASH_TIME = 0.22;           // total dash duration
export const DASH_GHOST_INTERVAL = 0.03; // spawn an afterimage every this-many seconds
const GHOST_FADE_TIME = 0.25;

// One fading slash-arc segment — pure visual, no hitbox of its own; the
// swing already hit-tested everything in range up front, in swingSlash().
// Tinted `blood` (a saturated red, `assets/palette/vector.json`) rather
// than the shape's own default yellow stroke — a melee weapon reads as a
// wound, not a gunshot; this game's own no-glow rule stays intact (a flat
// red stroke, not a bloom/blur filter), same as every other tint override
// here (BouncyBall's charged shot, DashGhost's own trail).
class SlashSegment {
  constructor(world, x, y, angle) {
    this.world = world;
    this.alive = true;
    this.t = 0;
    this.container = buildSprite('LineSlash', { lineWidth: 3, tint: isMonoSkin(world) ? 0xffffff : paletteColor('blood') });
    this.container.rotation = angle;
    const [sx, sy] = toScreen(x, y);
    this.container.position.set(sx, sy);
    world.stage.addChild(this.container);
  }

  update(dt) {
    this.t += dt;
    this.container.alpha = Math.max(0, 1 - this.t / FADE_TIME);
    if (this.t >= FADE_TIME) this.destroy();
  }

  destroy() {
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// The DRAGON costume's SLASH look (costumes.js) — per direct request ("when
// you use dragon skin line slasher should be replaced with claw attack,
// because now it looks like you attacking with a TONGUE"): the red fan
// coming straight out of the dragon's open jaw read as a tongue. Instead,
// three parallel slanted claw marks rake across the space in front of the
// ship, drawn in over SWEEP_TIME, then faded over FADE_TIME. Flat
// `blood` strokes, tapered thick-in-the-middle like a scratch; no glow.
// Purely visual — the hit-test in swingSlash() is exactly the same.
const CLAW_MARKS = 3;
const CLAW_LEN = 1.1;                     // world units, each mark's length
const CLAW_GAP = 0.2;                     // spacing between the marks
const CLAW_DIST = 0.7;                    // how far in front of the ship they sit
const CLAW_TILT = 35 * Math.PI / 180;     // slant off square-across
const CLAW_STEPS = 12;
class ClawSwipe {
  constructor(world, x, y, angle) {
    this.world = world;
    this.alive = true;
    this.t = 0;
    this.g = new PIXI.Graphics();
    this.g.rotation = angle;              // drawn facing +X, turned to the swing
    const [sx, sy] = toScreen(x, y);
    this.g.position.set(sx, sy);
    world.stage.addChild(this.g);
    this.draw(0);
  }

  // `reveal` 0..1: how much of each mark is raked in so far.
  draw(reveal) {
    const g = this.g;
    g.clear();
    const color = paletteColor('blood');
    // Along each mark (slanted across the facing) and across the marks.
    const dx = Math.sin(CLAW_TILT), dy = Math.cos(CLAW_TILT);
    const nx = dy, ny = -dx;
    const steps = Math.max(1, Math.round(CLAW_STEPS * reveal));
    for (let m = 0; m < CLAW_MARKS; m++) {
      // Every mark is centred on the facing axis (stepped straight forward,
      // spaced so the perpendicular gap is CLAW_GAP), so the set sits in the
      // middle of the swing — stacking them along the slant shoved the whole
      // set off to one side (reported: "his claw slash being asimetrical").
      const o = (m - (CLAW_MARKS - 1) / 2) * CLAW_GAP / Math.cos(CLAW_TILT);
      const cx = CLAW_DIST + o, cy = 0;
      const pt = i => {
        const u = i / CLAW_STEPS - 0.5;
        const bow = 0.1 * (1 - 4 * u * u);   // a slight curve, like a raked scratch
        return [(cx - dx * u * CLAW_LEN + nx * bow) * PPU, (cy - dy * u * CLAW_LEN + ny * bow) * PPU];
      };
      for (let i = 0; i < steps; i++) {
        const u = (i + 0.5) / CLAW_STEPS;
        g.lineStyle({ width: 1.2 + 3.5 * Math.sin(Math.PI * u), color, cap: 'round' });
        const [x0, y0] = pt(i), [x1, y1] = pt(i + 1);
        g.moveTo(x0, y0); g.lineTo(x1, y1);
      }
    }
  }

  update(dt) {
    this.t += dt;
    if (this.t < SWEEP_TIME) { this.draw(this.t / SWEEP_TIME); return; }
    this.draw(1);
    this.g.alpha = Math.max(0, 1 - (this.t - SWEEP_TIME) / FADE_TIME);
    if (this.t >= SWEEP_TIME + FADE_TIME) this.destroy();
  }

  destroy() {
    this.alive = false;
    if (!this.g.destroyed) this.g.destroy();
  }
}

// A fading afterimage of the player's own sprite, left behind during a dash
// — mirrors the source's own "create clone of myself" trail exactly (it
// clones the Player sprite itself, not a separate ghost graphic).
class DashGhost {
  constructor(world, x, y, facing) {
    this.world = world;
    this.alive = true;
    this.t = 0;
    const skin = world.player && world.player.skin;
    this.container = skin && skin !== 'default'
      ? makeSkinSprite(skin, world.player.skinArt._skinKey)   // a costume's dash leaves its own afterimage
      : buildSprite('PlayerNormal', { lineWidth: 2, tint: paletteColor('hull') });
    this.container.rotation = Math.atan2(facing.y, facing.x);
    this.container.alpha = 0.5;
    const [sx, sy] = toScreen(x, y);
    this.container.position.set(sx, sy);
    world.stage.addChild(this.container);
  }

  update(dt) {
    this.t += dt;
    this.container.alpha = Math.max(0, 0.5 * (1 - this.t / GHOST_FADE_TIME));
    if (this.t >= GHOST_FADE_TIME) this.destroy();
  }

  destroy() {
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

export function spawnDashGhost(world, x, y, facing) {
  world.add(new DashGhost(world, x, y, facing));
}

// The DASH's own damage — per direct request ("allowing dash to deal damage,
// so you'd have burst attack. Dash will deal 1 damage per frame, it's
// balanced by it's short duration"). Called once per 60 Hz dash tick
// (player.js's updateDash): everything the dashing player's circle
// (DASH_HIT_R) overlaps that a charged hit could kill takes 1 damage, the
// world.boss slot included. Over DASH_TIME that's at most ~13 damage to
// something the whole dash stays inside. Purple still takes nothing.
export const DASH_HIT_R = 0.5;
export function dashHit(world, player) {
  const r = DASH_HIT_R;
  const list = world.hittables;
  let hit = false;
  for (let i = list.length - 1; i >= 0; i--) {   // backwards: die() can splice
    const h = list[i];
    if (!h || h.dead || !h.canBeDestroyedBy(true)) continue;
    const touching = h.hitTest ? h.hitTest(player.x, player.y, r)
      : Math.hypot(h.x - player.x, h.y - player.y) <= h.radius + r;
    if (!touching) continue;
    playerHit(world, h, 1);
    hit = true;
  }
  const boss = world.boss;
  if (boss && boss.tryHit && playerBossHit(world, boss, player.x, player.y, true, 1)) hit = true;
  return hit;
}

// Instant melee sweep: hits anything in range/arc right away (dodging it is
// about not being in range when it swings, not about outrunning a
// travelling hitbox), then plays the animated arc of fading segments as
// pure follow-through visual feedback. Treated like a charged shot — kills
// DarkBlue too, same as every other weapon's own charged-hit rule — since a
// full melee swing reads as a heavier hit than a tap of the standard gun.
export function swingSlash(world, player) {
  const baseAngle = Math.atan2(player.facing.y, player.facing.x);

  // A real bug fixed here: a wall was only ever destroyed as a side effect
  // of wallOnLine() below, which only runs when a real Hittable target is
  // found *beyond* it — a ring/cobalt wall with nothing else in range
  // behind it could never be targeted at all, reading exactly like a
  // permanently-solid grape/PURPLE wall even though it's supposed to follow
  // the CYAN/DARKBLUE rule (reported directly: "wall acts like it's purple"
  // at every colour state) — especially bad since OCCÜLTACRESBURG, the very
  // level Plasmadrache's coloured walls appear in, force-locks an uncleared
  // run to LINE SLASHER, so a player there had no way at all to destroy one
  // standing alone. Fixed by testing world.walls directly first, the same
  // "closest point on the rect" distance this file's own wallOnLine-found
  // walls get treated with, independent of any Hittable being behind it.
  for (const wall of world.walls) {
    const nx = Math.max(wall.x0, Math.min(player.x, wall.x1));
    const ny = Math.max(wall.y0, Math.min(player.y, wall.y1));
    const dx = nx - player.x, dy = ny - player.y;
    const d = Math.hypot(dx, dy);
    if (d > SLASH_RANGE) continue;
    if (d > 0.001) {
      let diff = Math.abs(Math.atan2(dy, dx) - baseAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff > SLASH_ARC) continue;
    }   // standing inside the wall's own rect (d ~ 0) -- always in arc
    if (wall.canBeDestroyedBy(true)) {
      wall.destroy();
      world.audio.play(wall.color === 'darkblue' ? 'destroyIndigo' : 'destroyCyan', 0.6);
    }
  }

  // Backwards by index, not for..of — h.die() can splice the dying entry
  // straight out of world.hittables (the default Hittable.destroy() does
  // exactly that), which would shift a live for..of cursor and silently
  // skip whatever was next in the list.
  const list = world.hittables;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    if (!h || h.dead || !h.canBeDestroyedBy(true)) continue;
    const dx = h.x - player.x, dy = h.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > SLASH_RANGE + h.radius) continue;
    let diff = Math.abs(Math.atan2(dy, dx) - baseAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > SLASH_ARC) continue;
    // A solid maze wall (wall.js -- Showman's own intro, THE MAZE, or
    // Plasmadrache's own summoned walls) blocks every other weapon
    // (bullet.js's own wallHit check each frame it moves), but a SLASH is
    // an instant point-blank hit-test with no travelling projectile to
    // ever run into one -- so without this it could reach straight through
    // a wall it stands right against. wallOnLine is the one-frame
    // equivalent: a full player-to-target line check instead of per-frame
    // points, since there's no "next frame" for an instant swing. SLASH
    // treats itself as charged, so a colour-tinted wall it can actually
    // destroy (the same CYAN/DARKBLUE rule any other Hittable follows) goes
    // down and the swing still lands; a plain (grape) or too-tough one just
    // blocks it, same as before.
    const wall = wallOnLine(world, player.x, player.y, h.x, h.y, w => w.pierceable && !w.canBeDestroyedBy(true));
    if (wall) {
      if (!wall.canBeDestroyedBy(true)) continue;
      wall.destroy();
      world.audio.play(wall.color === 'darkblue' ? 'destroyIndigo' : 'destroyCyan', 0.6);
    }
    playerHit(world, h, 1);
  }
  world.audio.play(skinSound(world, 'slasherSlash'), 0.6);

  if (player.skin === 'dragon') {   // claws, not a tongue — see ClawSwipe
    world.add(new ClawSwipe(world, player.x, player.y, baseAngle));
    return;
  }

  // Six segments sampled symmetrically across the full +-60 degree arc
  // (fixing the source's lopsided -40..+60 spread), staggered over
  // SWEEP_TIME so the fan visibly sweeps instead of flashing on at once.
  let spawned = 0;
  const spawnNext = () => {
    if (spawned >= SWEEP_SEGMENTS || player.dead) return;
    const k = spawned / (SWEEP_SEGMENTS - 1);
    const angle = baseAngle - SLASH_ARC + k * (2 * SLASH_ARC);
    world.add(new SlashSegment(world, player.x, player.y, angle));
    spawned++;
  };
  spawnNext();
  const interval = SWEEP_TIME / (SWEEP_SEGMENTS - 1);
  for (let i = 1; i < SWEEP_SEGMENTS; i++) {
    world.wait(interval * i).then(spawnNext);
  }
}
