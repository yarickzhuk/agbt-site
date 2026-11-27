// firework.js — CRAZY CARNIVAL's phase-2 hazard. Shoot a rocket's fuse to
// launch it; light up LIGHT_TARGET (10) of them to clear the phase. Ported
// from the author's own Scratch prototype (Fireworks.sprite3).
//
// The source script only ever gets a rocket to the top edge and hides it —
// three burst-confetti costumes ("1"/"2"/"3", a purple/cyan/blue kite
// shape) sit in the sprite completely unused by any script, dead art.
// Given a real payoff here instead: reaching the top bursts a ring of
// RocketShard confetti (mirrors saw.js's own SawShard splash, using those
// exact three colours), *then* it counts as lit and is removed — the
// moment "fireworks" stops meaning "one rocket that silently vanishes".
// The burst itself plays only the standard destroyCyan cue (matching every
// other plain-cyan Hittable's own death sound) — an earlier pass also
// played the sprite bundle's own small "pop" (fireworkBurst) on top, but
// that read as an odd extra sound layered onto an ordinary cyan kill.
//
// It's a CYAN Hittable (any shot registers) but, like beam.js's cannon or
// corn.js's cob, getting shot doesn't destroy it on the spot — die() just
// launches it (idle -> launching, matching the source's own "wait until
// shot, then rise" script); the real payoff (counting as lit, bursting)
// only happens once it reaches the top on its own.
import { buildSprite } from './retro.js';
import { Hittable, PURPLE, CYAN, toScreen, HALF_W, HALF_H, rand, pick, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const RISE_SPEED = 3.6;       // world units/s once launched
const SPAWN_Y_MARGIN = 0.6;   // how far above the very bottom edge it sits
const RADIUS = 0.5;

export class FireworkRocket extends Hittable {
  constructor(world, x) {
    super(world, {
      x, y: HALF_H - SPAWN_Y_MARGIN, color: CYAN, radius: RADIUS,
      damage: 0, hurtsPlayer: false, countsAsProgress: false,
    });
    this.world = world;
    this.launched = false;
    this.onLit = null;   // set by the phase to bump its lit counter

    this.container = buildSprite('Rocket', { lineWidth: 2 });
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
  }

  // Any shot lands here. Only does anything the first time — matches the
  // source, which only ever runs its "wait until shot" check once.
  die() {
    if (this.dead || this.launched) return;
    this.launched = true;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
    this.container = buildSprite('RocketLaunch', { lineWidth: 2 });
    this.world.stage.addChild(this.container);
    this.place();
    this.world.audio.play('fireworkFly', 0.5);
  }

  update(dt) {
    if (this.dead) return;
    if (this.launched) {
      this.y -= RISE_SPEED * dt;
      this.place();
      if (this.y <= -HALF_H + 0.4) this.burst();
    }
  }

  burst() {
    if (this.dead) return;
    this.dead = true;
    spawnRocketBurst(this.world, this.x, this.y);
    this.world.audio.play('destroyCyan', 0.6);
    this.world.addScore(100);
    if (this.onLit) this.onLit();
    this.destroy();
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// --- the burst: a ring of small purple/cyan/blue confetti shards (the
// source's own unused burst costumes), evenly spread with a little jitter,
// that spin, fly outward, bounce off the screen edges a few times, and
// expire. Mirrors saw.js's SawShard — unkillable "chip bullets" to dodge,
// score nothing.
const SHARD_COUNT = 5;
const SHARD_SPEED = 3.2;
const SHARD_MAX_BOUNCES = 3;
const SHARD_TINTS = [0xB300FF, 0x00E6FF, 0x2B00FF];   // grape / ring / cobalt

class RocketShard extends Hittable {
  constructor(world, x, y, angle) {
    super(world, { x, y, color: PURPLE, radius: 0.2, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    this.spin = rand(200, 400) * Math.PI / 180 * (Math.random() < 0.5 ? -1 : 1);
    this.bounces = 0;
    this.vx = Math.cos(angle) * SHARD_SPEED;
    this.vy = Math.sin(angle) * SHARD_SPEED;

    this.container = buildSprite('RocketShard', { scale: 0.5, lineWidth: 1.8, tint: pick(SHARD_TINTS) });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.container.rotation += this.spin * dt;
    this.place();
    this.bounce();

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
    }
  }

  bounce() {
    let hit = false;
    if (this.x < -HALF_W + this.radius) { this.x = -HALF_W + this.radius; this.vx = Math.abs(this.vx); hit = true; }
    if (this.x >  HALF_W - this.radius) { this.x =  HALF_W - this.radius; this.vx = -Math.abs(this.vx); hit = true; }
    if (this.y < -HALF_H + this.radius) { this.y = -HALF_H + this.radius; this.vy = Math.abs(this.vy); hit = true; }
    if (this.y >  HALF_H - this.radius) { this.y =  HALF_H - this.radius; this.vy = -Math.abs(this.vy); hit = true; }
    if (!hit) return;
    if (++this.bounces >= SHARD_MAX_BOUNCES) this.destroy();
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

function spawnRocketBurst(world, x, y) {
  const base = rand(0, Math.PI * 2);
  for (let i = 0; i < SHARD_COUNT; i++) {
    const a = base + (i / SHARD_COUNT) * Math.PI * 2 + rand(-0.15, 0.15);
    world.add(new RocketShard(world, x, y, a));
  }
}
