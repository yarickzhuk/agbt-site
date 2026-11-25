// boss.js — the TrapWheel. A spinning ring that shrinks while the player is
// trapped inside it. Only its cyan weak sector (rotating with the ring) can be
// shot; each hit knocks off 1 HP and springs the ring back to full size. The
// lower its HP, the faster it closes in. Reaching min size crushes the player.
import { unlockAchievement } from './achievements.js';
import { buildSprite } from './retro.js';
import { toScreen, HALF_W, HALF_H } from './core.js';

const MAX_HP = 10;
const START_SCALE = 6, MIN_SCALE = 1.2;
const SHRINK = 0.6, SPEEDUP = 2.5;
const SPIN = 60;                 // deg/s
const ARC_HALF = 32;             // weak sector half-width, deg
const RING_THICK = 0.18;

function deltaAngle(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return d;
}

// ENDLESS MODE (levels/endless.js): `opts.follow` makes the ring drift after
// the player at FOLLOW_SPEED -- a supercharge can one-shot it, so there it
// has to keep you on the move. Everywhere else it sits at the centre.
const FOLLOW_SPEED = 1.1;

export class TrapWheel {
  constructor(world, opts = {}) {
    this.world = world;
    this.follow = !!opts.follow;
    this.cx = 0; this.cy = 0;
    this.hp = MAX_HP;
    this.scale = START_SCALE;
    this.angleDeg = 0;
    this.dead = false;
    this.alive = true;
    this.onDefeated = null;

    this.container = buildSprite('TrapWheel', { scale: START_SCALE, lineWidth: 3 });
    const [sx, sy] = toScreen(this.cx, this.cy);
    this.container.position.set(sx, sy);
    world.stage.addChild(this.container);

    world.boss = this;
    world.audio.loop('bossTheme', 0.6);
  }

  update(dt) {
    if (this.dead) return;
    this.angleDeg = (this.angleDeg + SPIN * dt) % 360;
    this.container.rotation = this.angleDeg * Math.PI / 180;
    const p = this.world.player;
    if (this.follow && p && !p.dead) {
      const dx = p.x - this.cx, dy = p.y - this.cy, d = Math.hypot(dx, dy);
      if (d > 0.01) {
        const step = Math.min(d, FOLLOW_SPEED * dt);
        this.cx += dx / d * step; this.cy += dy / d * step;
      }
      this.cx = Math.max(-HALF_W + 1, Math.min(HALF_W - 1, this.cx));
      this.cy = Math.max(-HALF_H + 1, Math.min(HALF_H - 1, this.cy));
      const [sx, sy] = toScreen(this.cx, this.cy);
      this.container.position.set(sx, sy);
    }

    // rebuild scale (shrink faster as HP drops)
    const t = 1 - this.hp / MAX_HP;
    const rate = SHRINK * (1 + (SPEEDUP - 1) * t);
    this.scale -= rate * dt;
    if (this.scale <= MIN_SCALE) { this.scale = MIN_SCALE; this.crush(); }
    this.applyScale();
  }

  applyScale() {
    // scale relative to the built size (START_SCALE)
    const k = this.scale / START_SCALE;
    this.container.scale.set(k);
  }

  crush() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    p.takeDamage(1);
    this.scale = Math.min(START_SCALE, this.scale + 1.5);
  }

  // called by bullets — returns true if it struck the weak sector. `dmg`
  // defaults to 1 (every pre-existing caller's own behavior) -- bullet.js's
  // own charged/supercharged Charge Cannon shots pass their real amount so
  // a supercharged hit actually knocks off more than an ordinary one.
  tryHit(px, py, charged, dmg = 1) {
    if (this.dead) return false;
    const dx = px - this.cx, dy = py - this.cy;   // the ring's centre (0,0 unless following)
    const d = Math.hypot(dx, dy);
    const radius = this.scale * 0.5;        // world units
    if (d < radius * (1 - RING_THICK)) return false;
    if (d > radius * (1 + RING_THICK)) return false;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    if (Math.abs(deltaAngle(ang, this.angleDeg)) > ARC_HALF) return false;
    this.damage(dmg);
    return true;
  }

  damage(n) {
    // Achievement "Hadoukened": the whole ring's HP in a single hit (a
    // Charge Cannon supercharge is the only hit that big).
    if (this.hp === MAX_HP && n >= MAX_HP) unlockAchievement(this.world, 'hadoukened');
    this.hp -= n;
    this.scale = START_SCALE;               // a hit springs the ring back open
    this.applyScale();
    this.world.addScore(200);               // hitting the weak sector scores
    this.world.audio.play('bossHurt', 0.7);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.alive = false;
    this.world.boss = null;
    this.world.audio.stopLoop('bossTheme');
    this.world.audio.play('bossDefeat', 0.9);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
    if (this.onDefeated) this.onDefeated();
  }

  // used when the field is cleared (e.g. game over) without a defeat
  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return { shapes: [{ circle: [this.cx, this.cy, this.scale * 0.5] }], label: 'THE RING CLOSED IN' }; }
  destroy() {
    this.alive = false;
    this.dead = true;
    this.world.boss = null;
    this.world.audio.stopLoop('bossTheme');
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
