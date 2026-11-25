// splash.js — a ring of small dots fired outward from a random point. Purple:
// not shootable, only a touch threat. Used in phases 2 and 3 to keep pressure.
import { buildSprite, getShape } from './retro.js';
import { Hittable, PURPLE, toScreen, PPU, HALF_W, HALF_H, rand, randInt, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const DOT_SCALE = 0.3;
const DOT_SPEED = 5;
const RAYS = 8;

function shapeRadius(name, scale) {
  const s = getShape(name);
  if (!s) return 0.05 * scale;
  return (Math.max(s.width, s.height) / 100 / 2) * scale;
}

class SplashDot extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: shapeRadius('SplashDot', DOT_SCALE),
                   damage: 1, countsAsProgress: false });
    this.world = world;
    this.vx = vx; this.vy = vy;
    this.alive = true;
    this.container = buildSprite('SplashDot', { scale: DOT_SCALE, lineWidth: 1.6 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
  }
  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }
  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.place();
    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage); this.destroy(); return;
    }
    if (this.x < -HALF_W - 0.5 || this.x > HALF_W + 0.5 || this.y < -HALF_H - 0.5 || this.y > HALF_H + 0.5) this.destroy();
  }
  destroy() {
    if (this.alive === false) return;
    super.destroy(); this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// A warning sprite ("make warning sprites for ... both type of splash
// attacks"): a purple ring that shrinks onto the burst's origin over
// SPLASH_WARN seconds, with a short tick along every ray the burst will
// fire, blinking -- then `fire()` runs and it's gone. Harmless and not a
// Hittable; an ordinary updatable, so a phase's clearEntities() cancels a
// pending burst with it. Shared by splashBurst() below and THE FINALE's
// mothership splash (finale.js).
export const SPLASH_WARN = 0.7;
export class SplashWarning {
  constructor(world, x, y, angles, fire) {
    this.world = world; this.x = x; this.y = y;
    this.angles = angles; this.fire = fire;
    this.t = 0; this.alive = true;
    this.g = new PIXI.Graphics();
    this.g.zIndex = 4;
    world.stage.addChild(this.g);
    this.draw();
  }
  draw() {
    const [sx, sy] = toScreen(this.x, this.y);
    const k = this.t / SPLASH_WARN;
    const r = (1.1 - 0.85 * k) * PPU;
    const g = this.g;
    g.clear();
    g.lineStyle(2, 0xB300FF, 1);
    g.drawCircle(sx, sy, r);
    for (const a of this.angles) {
      const c = Math.cos(a), s = Math.sin(a);
      g.moveTo(sx + c * r, sy + s * r);
      g.lineTo(sx + c * (r + 0.35 * PPU), sy + s * (r + 0.35 * PPU));
    }
    g.alpha = Math.floor(this.t / 0.1) % 2 ? 0.35 : 0.9;
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    if (this.t >= SPLASH_WARN) { const f = this.fire; this.destroy(); f(); return; }
    this.draw();
  }
  destroy() {
    this.alive = false; this.dead = true;
    if (this.g && !this.g.destroyed) this.g.destroy();
  }
}

export function splashBurst(world) {
  const ox = rand(-HALF_W * 0.8, HALF_W * 0.8);
  const oy = rand(-HALF_H * 0.8, HALF_H * 0.8);
  const offset = randInt(2) * (Math.PI / RAYS);
  const angles = [];
  for (let i = 0; i < RAYS; i++) angles.push(offset + (Math.PI * 2 / RAYS) * i);
  world.add(new SplashWarning(world, ox, oy, angles, () => {
    for (const a of angles) world.add(new SplashDot(world, ox, oy, Math.cos(a) * DOT_SPEED, Math.sin(a) * DOT_SPEED));
    world.audio.play('splash', 0.7);
  }));
}
