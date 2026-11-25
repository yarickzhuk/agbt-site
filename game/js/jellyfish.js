// jellyfish.js — CYBER ZOO phase-2 hazard. A purple jelly that drifts and
// bounces off the screen edges (a triangle-wave beep on every bounce), bobs its
// tentacles, and touch-hurts the player. It's PURPLE — unkillable: bullets break
// on it, torpedoes pass through — so it's a "chip bullet" you have to dodge, not
// shoot. Scores nothing.
import { buildSprite } from './retro.js';
import { Hittable, PURPLE, toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const RADIUS = 0.4;
const SPEED = 2.3;          // world units / s

export class Jellyfish extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: RADIUS, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    if (vx == null || vy == null) { const a = rand(0, Math.PI * 2); vx = Math.cos(a); vy = Math.sin(a); }
    const m = Math.hypot(vx, vy) || 1;
    this.vx = vx / m * SPEED; this.vy = vy / m * SPEED;
    this.bob = rand(0, Math.PI * 2);

    this.container = buildSprite('Jellyfish', { scale: 0.85, lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.zIndex = 7;
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;

    let bounced = false;
    if (this.x < -HALF_W + RADIUS) { this.x = -HALF_W + RADIUS; this.vx = Math.abs(this.vx); bounced = true; }
    if (this.x >  HALF_W - RADIUS) { this.x =  HALF_W - RADIUS; this.vx = -Math.abs(this.vx); bounced = true; }
    if (this.y < -HALF_H + RADIUS) { this.y = -HALF_H + RADIUS; this.vy = Math.abs(this.vy); bounced = true; }
    if (this.y >  HALF_H - RADIUS) { this.y =  HALF_H - RADIUS; this.vy = -Math.abs(this.vy); bounced = true; }
    if (bounced) this.world.audio.beep(700, 0.06, 0.22);   // triangle beep on the edge

    this.bob += dt * 6;
    this.container.scale.y = 0.85 * (1 + 0.08 * Math.sin(this.bob));   // tentacle wiggle
    this.place();

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
    }
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
