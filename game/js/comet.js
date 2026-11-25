// comet.js — OUTER SPACE's own phase-3 companion hazard, ported from the
// author's own Scratch prototype (`Comet.sprite3`), alongside laser.js's new
// `opts.vertical` sweeper (see that file's own header for the full "flip it
// by 90 degrees" translation). A real script this time, not quite a "thin
// skeleton": `forever { goto a random spot; show; point towards Player; play
// "Comet"; repeat_until <touching edge OR touching #00ffff-on-#ffe900 (this
// game's own player-ship yellow)> { move 4 steps; create clone of myself };
// stop all sounds; hide; wait 1 }` — it picks a random spot, aims once at
// the player, then flies straight until it either leaves the screen or
// touches them, leaving a trailing clone every single tick along the way.
//
// Each trailing clone switches to the smaller costume2 art, then
// `repeat 100 { change GHOST effect by 1; change size by -1 }` before
// deleting itself — a fading, shrinking dust-tail particle. Ported as a
// pure visual (`CometTrail`, no `Hittable` at all — the source's own clone
// script never checks anything, only the main body's own touch-check
// matters) rather than the literal every-tick spawn rate, which would be
// 60 particles/s at this engine's frame rate; `TRAIL_INTERVAL` here is a
// toned-down cadence instead, the same "source cadence is unplayable, slow
// it down" call this session's own `DisruptorWave`/`FLAME_INTERVAL` already
// made. Both costumes are plain stroked circles (`#b100ff`, this game's own
// `grape`) — one shared `Comet.json` shape, the head and the trail just
// drawn at different scales, the same "one shape, two scales" trick
// `asteroid.js`'s own full rock/fragment pair already uses.
//
// The source has no actual touch-damage check (Scratch's own
// `coloristouchingcolor` only decides when the *flight* stops, same as
// `_edge_` does — neither one is inherently a hit), so touch-damage is
// added fresh, the same "thin skeleton" gap `CornSeed`/`Pirania`/`Spear`'s
// own already filled. `PURPLE` — unkillable, a "chip bullet" to dodge, like
// every other purple hazard in this game.
import { buildSprite, getShape } from './retro.js';
import { Hittable, PURPLE, toScreen, HALF_W, HALF_H, edgeSpawn, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const HEAD_SCALE = 3.5;
const TRAIL_SCALE = 1.5;
const SPEED = 3.2;              // world units/s
const TRAIL_INTERVAL = 0.05;    // s between trail particles while flying
const TRAIL_LIFE = 0.5;         // s a trail particle takes to fade/shrink away

function shapeRadius(name, scale) {
  const s = getShape(name);
  if (!s) return 0.1 * scale;
  return (Math.max(s.width, s.height) / 100 / 2) * scale;
}

class CometTrail {
  constructor(world, x, y) {
    this.world = world;
    this.alive = true;
    this.t = 0;
    this.container = buildSprite('Comet', { scale: TRAIL_SCALE, lineWidth: 1.4 });
    world.stage.addChild(this.container);
    const [sx, sy] = toScreen(x, y);
    this.container.position.set(sx, sy);
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const k = Math.max(0, 1 - this.t / TRAIL_LIFE);
    this.container.alpha = k;
    this.container.scale.set(0.4 + 0.6 * k);   // shrinks on top of its own baked-in TRAIL_SCALE
    if (this.t >= TRAIL_LIFE) this.destroy();
  }
  destroy() {
    this.alive = false;
    this.dead = true;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

export class Comet extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: shapeRadius('Comet', HEAD_SCALE),
                   damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    const m = Math.hypot(vx, vy) || 1;
    this.vx = vx / m * SPEED; this.vy = vy / m * SPEED;
    this.trailT = 0;

    this.container = buildSprite('Comet', { scale: HEAD_SCALE, lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
    world.audio.play('cometFly', 0.6);
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
  }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.place();

    this.trailT += dt;
    if (this.trailT >= TRAIL_INTERVAL) {
      this.trailT = 0;
      this.world.add(new CometTrail(this.world, this.x, this.y));
    }

    // Leaving the screen ends the flight the same way the source's own
    // "touching edge" check does.
    if (this.x < -HALF_W - 0.5 || this.x > HALF_W + 0.5 ||
        this.y < -HALF_H - 0.5 || this.y > HALF_H + 0.5) { this.destroy(); return; }

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
      this.destroy();
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

// Spawn one comet at a random screen edge, aimed once at wherever the
// player is standing right now -- the same "aim at launch, then fly
// straight" convention spear.js's own fixed-aim already established.
export function spawnComet(world) {
  const { x, y } = edgeSpawn();
  const p = world.player;
  const aimX = p ? p.x : 0, aimY = p ? p.y : 0;
  world.add(new Comet(world, x, y, aimX - x, aimY - y));
}
