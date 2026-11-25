// devilfish.js — CYBER ZOO phase-4 hazard. A dart that swims straight across the
// field, tail swishing, and touch-hurts the player. It's DARK BLUE, so only a
// charged shot (torpedo / shotgun pellet) kills it; normal bullets break on it.
import { buildSprite } from './retro.js';
import { Hittable, DARKBLUE, toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const RADIUS = 0.42;
const SPEED = 4.2;          // world units / s
const TINT = 0x3355ff;

export class DevilFish extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: DARKBLUE, radius: RADIUS, damage: 1,
                   countsAsProgress: true, destroySound: 'sawBreak' });
    this.world = world;
    this.alive = true;
    const m = Math.hypot(vx, vy) || 1;
    this.vx = vx / m * SPEED; this.vy = vy / m * SPEED;
    this.wig = rand(0, Math.PI * 2);

    this.container = buildSprite('DevilFish', { scale: 0.9, lineWidth: 2.5, tint: TINT });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.zIndex = 7;
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = Math.atan2(this.vy, this.vx) + Math.sin(this.wig) * 0.12;  // tail swish
  }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.wig += dt * 14;
    this.place();

    if (this.x < -HALF_W - 1.5 || this.x > HALF_W + 1.5 ||
        this.y < -HALF_H - 1.5 || this.y > HALF_H + 1.5) { this.destroy(); return; }

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

// Swim straight in from the left or right edge at a random height.
export function spawnDevilFish(world) {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -HALF_W - 1 : HALF_W + 1;
  const y = rand(-HALF_H * 0.8, HALF_H * 0.8);
  world.add(new DevilFish(world, x, y, fromLeft ? 1 : -1, 0));
}
