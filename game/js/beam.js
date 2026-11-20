// beam.js — CYBER ZOO phase-3 hazard. A diep.io-style cannon at screen centre
// (cyan round body + barrel) firing a long purple beam that sweeps around it.
// The whole thing is a CYAN Hittable, so any shot registers — but instead of
// being destroyed it **reverses its spin direction**. You can't kill it; you
// shoot it to steer which way the sweep goes and open a gap to hide in. The
// purple beam touch-hurts the player along its whole length.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen } from './core.js';

const LEN = 7.8;        // beam reach in world units (matches Beam.json geometry)
const HALFW = 0.22;     // half-thickness for the hit test
const HUB_R = 0.44;     // emitter radius
const OMEGA = 1.15;     // sweep speed, rad/s

// Shortest distance from point (px,py) to the segment a->b.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-6;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Spawn warning ("make warning sprites for these attacks"): for WARN_TIME
// after it appears it only blinks faintly in place -- no damage, no
// movement, shots ignored -- so it can never pop in on top of the player.
const WARN_TIME = 1.5;

export class Beam extends Hittable {
  constructor(world, angle = 0) {
    super(world, { x: 0, y: 0, color: CYAN, radius: HUB_R, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    this.angle = angle;
    this.purpleTouch = true;   // its hurt is the purple beam (FIREWORK's +1, player.js)
    this.dir = Math.random() < 0.5 ? 1 : -1;   // spin direction (flips on hit)
    this.flash = 0;
    this.warnT = WARN_TIME;

    this.container = buildSprite('Beam', { scale: 1, lineWidth: 2.5 });
    this.container.zIndex = 5;
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(0, 0);
    this.container.position.set(sx, sy);
    this.container.rotation = this.angle;
  }

  // The beam's tip in world space (hub is at the origin).
  tip() { return [Math.cos(this.angle) * LEN, Math.sin(this.angle) * LEN]; }

  // Bullets test against the beam segment, not a point.
  hitTest(x, y, r) {
    const [tx, ty] = this.tip();
    return segDist(x, y, 0, 0, tx, ty) <= HALFW + r;
  }

  // Any shot flips the spin instead of destroying it.
  canBeDestroyedBy(charged) { return this.warnT <= 0 && super.canBeDestroyedBy(charged); }

  die() {
    if (this.warnT > 0) return;
    this.dir *= -1;
    this.flash = 0.09;
    this.world.audio.play('bossHurt', 0.5);
  }

  update(dt) {
    if (this.warnT > 0) {
      this.warnT -= dt;
      this.container.alpha = Math.floor(this.warnT / 0.15) % 2 ? 0.15 : 0.45;
      return;
    }
    this.angle += this.dir * OMEGA * dt;
    this.place();

    // Brief alpha blink acknowledges the flip (Graphics tint can only darken,
    // so we blink rather than flash white).
    if (this.flash > 0) { this.flash -= dt; this.container.alpha = 0.35; }
    else this.container.alpha = 1;

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead) {
      const [tx, ty] = this.tip();
      if (p.touchesSeg(0, 0, tx, ty, HALFW)) p.takeDamage(this.damage);
    }
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { const [tx, ty] = this.tip(); return { shapes: [{ seg: [0, 0, tx, ty, HALFW] }] }; }
  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
