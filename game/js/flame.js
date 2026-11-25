// flame.js — OCCÜLTACRESBURG phase-4 hazard. Ported from the author's own
// Scratch prototype (`Flame.sprite3`), which actually contains two distinct,
// separately-triggered clone scripts: one clone sits at a fixed spot pulsing
// its size (grow, then shrink, forever) until it happens to be touching the
// stage edge; a second, unrelated clone just drifts sideways from its own
// fixed start point until it reaches the edge. Both hardcode Scratch-stage
// coordinates that don't generalize to this arena. Per the author's own
// direction, this port merges the two into one hazard instead of two: it
// drifts in from a random screen edge (`edgeSpawn()`) while continuously
// pulsing its size the whole time it's alive — so both source behaviours
// ("shrink-grow" and "move") happen on the same instance at once.
//
// PURPLE — unkillable, a "chip bullet" to dodge (matches pirania.js/
// jellyfish.js/devilfish.js's own family of thin-skeleton touch-hurt
// minions; neither of Flame's own source scripts implements a player
// touch-check at all, so it's added fresh here the same way
// CornSeed/Pirania's own touch-damage was). `Flame.json`'s shape is a
// straight redraw of the source SVG's own art — a plain stroked circle, not
// a flame-shaped icon; the pulsing size is what has to sell the "flicker."
import { buildSprite } from './retro.js';
import { Hittable, PURPLE, toScreen, HALF_W, HALF_H, edgeSpawn, rand, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const RADIUS = 0.42;
const SPEED = 1.8;                        // world units/s while drifting across
const PULSE_SPEED = 5;                    // rad/s
const PULSE_MIN = 0.75, PULSE_MAX = 1.35; // scale range while flickering

export class Flame extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: RADIUS, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    this.pulseT = rand(0, Math.PI * 2);   // desync multiple flames' flicker
    const m = Math.hypot(vx, vy) || 1;
    this.vx = vx / m * SPEED; this.vy = vy / m * SPEED;

    this.container = buildSprite('Flame', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.pulseT += dt * PULSE_SPEED;
    const k = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 + 0.5 * Math.sin(this.pulseT));
    this.container.scale.set(k);
    this.radius = RADIUS * k;   // the hitbox pulses with the visual, same as it reads
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

// Spawns one Flame at a random screen edge, aimed toward a point near the
// centre so it actually crosses the play area (same aiming approach
// pirania.js's own spawnPirania uses).
export function spawnFlame(world) {
  const { x, y } = edgeSpawn();
  const aimX = rand(-HALF_W * 0.5, HALF_W * 0.5);
  const aimY = rand(-HALF_H * 0.5, HALF_H * 0.5);
  world.add(new Flame(world, x, y, aimX - x, aimY - y));
}
