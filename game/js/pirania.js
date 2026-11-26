// pirania.js — CYBER ZOO phase-3 minion. A purple piranha that spawns from a
// random edge every ~2s, swims straight across the field (nose pointed the way
// it's going), and touch-hurts the player. It's PURPLE — unkillable: bullets
// break on it, torpedoes pass through — so it's a "chip bullet" to dodge, not
// shoot. Scores nothing.
import { buildSprite } from './retro.js';
import { Hittable, PURPLE, toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const RADIUS = 0.32;
const SPEED = 2.6;          // world units / s

export class Pirania extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: RADIUS, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    const m = Math.hypot(vx, vy) || 1;
    this.vx = vx / m * SPEED; this.vy = vy / m * SPEED;

    this.container = buildSprite('Pirania', { scale: 0.85, lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.zIndex = 7;
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = Math.atan2(this.vy, this.vx);   // nose points along travel
  }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.place();

    // Retire once it has swum off the far side.
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

// Spawn one piranha at a random edge, aimed across the field toward a point
// near the centre so it actually threatens the play area.
export function spawnPirania(world) {
  const edge = Math.floor(rand(0, 4));
  let x, y;
  if (edge === 0) { x = rand(-HALF_W, HALF_W); y = -HALF_H - 1; }
  else if (edge === 1) { x = rand(-HALF_W, HALF_W); y = HALF_H + 1; }
  else if (edge === 2) { x = -HALF_W - 1; y = rand(-HALF_H, HALF_H); }
  else { x = HALF_W + 1; y = rand(-HALF_H, HALF_H); }
  const aimX = rand(-HALF_W * 0.5, HALF_W * 0.5);
  const aimY = rand(-HALF_H * 0.5, HALF_H * 0.5);
  world.add(new Pirania(world, x, y, aimX - x, aimY - y));
}
