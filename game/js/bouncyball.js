// bouncyball.js — the BOUNCY BALL weapon's projectile.
//
// Ported from the author's own Scratch prototype (Bouncy_Ball.sprite3): hold
// fire to charge, release to launch a ball whose speed scales with how long
// it was held; it never breaks on contact the way a normal Bullet does — it
// bounces. The prototype only ever bounced off Cyan/Purple; generalized here
// into the ball's whole identity: anything it can destroy (Hittable.
// canBeDestroyedBy, same rule Bullet uses) it kills AND bounces off; anything
// it can't (Purple always, DarkBlue unless fully charged) it just bounces off
// with no damage — so unlike either existing weapon, it never simply breaks.
// A screen edge normally ends it too (or a lifetime cap, belt-and-suspenders) —
// EXCEPT a fully charged shot, which also bounces off edges (see `charged`
// below) and is drawn fully orange (`amber` tint) to read as visibly upgraded.
// To compensate for a charged ball being able to ricochet indefinitely off
// both hazards and edges, the player can never have more than `maxHP` balls
// (charged or not) alive on screen at once — enforced in player.js's
// `fireBouncy`, not here, since that's where the player's HP lives.
//
// Fixes three bugs in the original Scratch script:
//  - Speed had a hard cliff (flat 4 below a charge threshold, then jumping
//    straight to the raw charge value above it) instead of scaling smoothly.
//  - The bounce re-triggered every single frame while still overlapping the
//    same hazard (no debounce), reading as a jittery multi-redirect instead
//    of one clean bounce — fixed by nudging the ball just clear of whatever
//    it bounced off, in its new direction, the instant it redirects.
//  - The "bounce" wasn't a real reflection: it picked a fresh random
//    direction offset from the *original launch angle* every time, so it
//    forgot every previous bounce. Replaced with an actual reflection of the
//    ball's current velocity across the surface normal (approximated as the
//    vector from the thing it hit to the ball), so consecutive bounces
//    compound correctly off whatever it's actually touching now.
import { buildSprite, paletteColor } from './retro.js';
import { isMonoSkin, skinSound } from './costumes.js';
import { toScreen, HALF_W, HALF_H, dist, wallHit, playerHit, playerBossHit } from './core.js';

const MIN_SPEED = 6, MAX_SPEED = 18;   // world units/s, scaled by charge ratio
const RADIUS = 0.18;
const LIFETIME = 6;   // safety cap — normal play always reaches a screen edge first
// Clears the ball of what it just bounced off, so the next frame's hit test
// doesn't immediately re-trigger the same bounce.
const NUDGE = 0.02;
// One ball can damage the same target at most once per HIT_COOLDOWN seconds
// (bosses included). Without it a ball that started inside something --
// fired while standing on a crystal or Showman, or flush against a wall --
// re-bounced and re-hit every single frame it stayed overlapping, a
// point-blank multi-hit "kill switch".
const HIT_COOLDOWN = 0.6;

export class BouncyBall {
  constructor(world, x, y, dir, chargeRatio, shot = null) {
    this.shot = shot;   // DEVIL FISH's streak token (player.js)
    this.world = world;
    this.x = x; this.y = y;
    const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.max(0, Math.min(1, chargeRatio));
    this.vx = dir.x * speed;
    this.vy = dir.y * speed;
    this.charged = chargeRatio >= 1;   // full charge: pierces DarkBlue and bounces off edges too
    this.radius = RADIUS;
    this.life = LIFETIME;
    this.alive = true;
    this.t = 0;
    this.lastHit = new Map();   // target -> this.t of its last damaging hit

    const buildOpts = { lineWidth: 2, scale: 1 };
    if (this.charged) buildOpts.tint = paletteColor('amber');   // fully orange when charged
    if (isMonoSkin(world)) buildOpts.tint = 0xffffff;             // DELTA: white, like the boss's ball
    this.container = buildSprite('BouncyBall', buildOpts);
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.t += dt;

    if (this.charged) {
      // A charged ball also bounces off screen edges — clamp it back inside
      // and reflect off the crossed wall exactly like it would off a hazard.
      if (this.x < -HALF_W) { this.x = -HALF_W; this.bounce(1, 0); }
      else if (this.x > HALF_W) { this.x = HALF_W; this.bounce(-1, 0); }
      if (this.y < -HALF_H) { this.y = -HALF_H; this.bounce(0, 1); }
      else if (this.y > HALF_H) { this.y = HALF_H; this.bounce(0, -1); }
    }

    this.place();
    // A solid maze wall (wall.js) bounces the ball off it exactly like any
    // other hazard — never breaks it, matching the rest of this class's own
    // "everything bounces, nothing just breaks" identity. Same centre-to-ball
    // approximation checkHits() uses below, since a wall has no exact edge
    // geometry to reflect off either. A colour-tinted wall (plasmadrache.js's
    // own ring/cobalt walls) that this charge state can actually destroy
    // (the same CYAN/DARKBLUE rule any other Hittable follows) still bounces
    // the ball off — "kills and bounces off" is this weapon's own identity
    // for anything it CAN destroy, same as checkHits() below.
    const wall = wallHit(this.world, this.x, this.y, this.radius);
    if (wall) {
      if (wall.canBeDestroyedBy(this.charged)) {
        wall.destroy();
        this.world.audio.play(wall.color === 'darkblue' ? 'destroyIndigo' : 'destroyCyan', 0.6);
      }
      const [nx, ny] = wallNormal(wall, this.x, this.y);
      this.bounceIfApproaching(nx, ny);
    }
    this.checkHits();
    if (this.life <= 0 ||
        (!this.charged &&
         (this.x < -HALF_W - 1 || this.x > HALF_W + 1 ||
          this.y < -HALF_H - 1 || this.y > HALF_H + 1))) {
      this.destroy();
    }
  }

  // Reflects (vx,vy) across the surface normal `nx,ny` (must be unit length).
  canHit(target) {
    const last = this.lastHit.get(target);
    return last == null || this.t - last >= HIT_COOLDOWN;
  }

  // Reflect only if moving into the surface; a ball already moving away
  // (e.g. spawned inside a wall) is left to slide out instead of flipping
  // back in every frame.
  bounceIfApproaching(nx, ny) {
    if (this.vx * nx + this.vy * ny < 0) this.bounce(nx, ny);
  }

  bounce(nx, ny) {
    const d = this.vx * nx + this.vy * ny;
    this.vx -= 2 * d * nx;
    this.vy -= 2 * d * ny;
    const speed = Math.hypot(this.vx, this.vy) || 1;
    this.x += (this.vx / speed) * NUDGE;
    this.y += (this.vy / speed) * NUDGE;
    this.place();
    this.world.audio.play(skinSound(this.world, 'bouncyBounce'), 0.6);
  }

  checkHits() {
    const boss = this.world.boss;
    // pierces, never breaks -- but a boss only takes one hit per cooldown,
    // or a ball passing slowly through it would land a hit every frame
    if (boss && this.canHit(boss) && playerBossHit(this.world, boss, this.x, this.y, this.charged)) {
      this.lastHit.set(boss, this.t);
      return;
    }

    for (const h of this.world.hittables) {
      if (!h || h.dead) continue;
      const within = h.hitTest ? h.hitTest(this.x, this.y, this.radius)
                               : dist(this.x, this.y, h.x, h.y) <= this.radius + h.radius;
      if (!within) continue;

      // Same 3-damage-when-charged rule bullet.js's own charged hits use —
      // "acts like a torpedo" against DarkBlue multi-hit hazards.
      const dx = this.x - h.x, dy = this.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      // Only a ball actually moving INTO the target hits and bounces. One
      // already heading out (it spawned inside, or just bounced) passes on
      // through -- reflecting it again would turn it back inward, trapping
      // it in a bounce every frame.
      if (this.vx * dx + this.vy * dy >= 0) continue;
      if (h.canBeDestroyedBy(this.charged) && this.canHit(h)) {
        this.lastHit.set(h, this.t);
        playerHit(this.world, h, this.charged ? 3 : 1);
      }
      this.bounce(dx / d, dy / d);
      return;   // one bounce per frame — never react to two overlaps at once
    }
  }

  destroy() {
    if (this.shot) { const s = this.shot; this.shot = null; s.end(); }
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// Outward normal of an axis-aligned wall at the ball's position: from the
// closest point on the rectangle, or -- when the ball's centre is inside --
// out through the nearest face. (The old centre-to-ball direction was wrong
// for long thin walls: beside a long bar it pointed along the bar.)
function wallNormal(w, x, y) {
  const cx = Math.max(w.x0, Math.min(w.x1, x)), cy = Math.max(w.y0, Math.min(w.y1, y));
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (d > 1e-6) return [dx / d, dy / d];
  const left = x - w.x0, right = w.x1 - x, top = y - w.y0, bottom = w.y1 - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [-1, 0];
  if (m === right) return [1, 0];
  if (m === top) return [0, -1];
  return [0, 1];
}
