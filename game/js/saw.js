// saw.js — CYBER ZOO phase-1 hazard. A big blade that spins in place at screen
// centre and touch-hurts anything that gets close. It's dark blue in the colour
// language, so only a *charged* shot damages it (a charged torpedo, or any
// Cyber Shotgun pellet — normal bullets just break on it); 3 hits destroy it
// (clang, clang, shatter). Separately, every few seconds while it's alive it
// performs a **splash attack**: a brief wind-up pause, then it bursts a spray
// of tiny purple clone shards (unkillable — bullets break on them, torpedoes
// pass through) outward to dodge, then resumes spinning. This repeats for as
// long as the saw survives — it's not a one-time death effect.
import { buildSprite } from './retro.js';
import { Hittable, PURPLE, DARKBLUE, toScreen, HALF_W, HALF_H, rand, pick, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const HP = 3;
const RADIUS = 1.2;
const SCALE = 2.6;
const SPIN = 260;              // deg/s
const ATTACK_INTERVAL = 3.5;   // s between splash attacks
const ATTACK_TELEGRAPH = 0.4;  // s wind-up pause before each burst

export class Saw extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: DARKBLUE, radius: RADIUS, damage: 1, countsAsProgress: true });
    this.world = world;
    this.hp = HP;
    this.alive = true;
    this.angle = 0;
    this.flashT = 0;
    this.attackT = rand(ATTACK_INTERVAL * 0.4, ATTACK_INTERVAL);   // first attack a bit sooner
    this.winding = false;

    this.container = buildSprite('SawBlade', { scale: SCALE, lineWidth: 3, tint: 0x3355FF });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.zIndex = 8;
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;

    if (this.winding) {
      // wind-up: hold still and pulse to telegraph the burst
      this.attackT += dt;
      this.container.alpha = 0.55 + 0.45 * Math.abs(Math.sin(this.attackT * 25));
      if (this.attackT >= ATTACK_TELEGRAPH) {
        this.winding = false;
        this.attackT = 0;
        this.container.alpha = 1;
        this.world.audio.play('bossHurt', 0.5);
        spawnShardSplash(this.world, this.x, this.y);
      }
    } else {
      this.angle += SPIN * dt * Math.PI / 180;
      this.container.rotation = this.angle;
      this.attackT += dt;
      if (this.attackT >= ATTACK_INTERVAL) { this.winding = true; this.attackT = 0; }
    }
    this.place();

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (!this.winding) this.container.alpha = this.flashT > 0 ? 0.35 : 1;
    }
  }

  // A charged hit lands here (Hittable.canBeDestroyedBy returns charged for
  // DARKBLUE). Three hits destroy it; the earlier ones just clang and flash.
  // `dmg` (default 1, matching every hit before the Charge Cannon's own
  // supercharge buff existed) lets a bigger hit -- e.g. a supercharged
  // Hadouken's 10 -- knock off more than one hit at once, same as
  // knight.js/plasmadrache.js already do.
  die(dmg = 1) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp > 0) {
      this.world.audio.play('bossHurt', 0.7);
      this.flashT = 0.1;
      return;                              // survives — the shot pierces onward
    }
    this.dead = true;
    this.world.addScore(200);
    this.world.audio.play('sawBreak', 0.9);
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

// --- the splash: a burst of tiny purple saw-blade clones, evenly spread
// around a full circle (with a little jitter), that spin, fly outward, bounce
// off the screen edges a few times, and expire. Mirrors meteor.js's
// MeteorShard — unkillable "chip bullets" to dodge, score nothing.
const SHARD_COUNT = 8;   // per burst — it repeats every ATTACK_INTERVAL, not just once
const SHARD_SCALE = 0.35;
const SHARD_SPEED = 3.4;
const SHARD_MAX_BOUNCES = 3;

class SawShard extends Hittable {
  constructor(world, x, y, angle) {
    super(world, { x, y, color: PURPLE, radius: 0.22, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    this.spin = rand(300, 500) * Math.PI / 180 * (Math.random() < 0.5 ? -1 : 1);
    this.bounces = 0;
    this.vx = Math.cos(angle) * SHARD_SPEED;
    this.vy = Math.sin(angle) * SHARD_SPEED;

    this.container = buildSprite('SawBlade', { scale: SHARD_SCALE, lineWidth: 1.6, tint: 0xFF00D4 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.zIndex = 8;
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
    this.world.audio.play(pick(['meteor1', 'meteor2', 'meteor3']), 0.5);
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

function spawnShardSplash(world, x, y) {
  const base = rand(0, Math.PI * 2);
  for (let i = 0; i < SHARD_COUNT; i++) {
    const a = base + (i / SHARD_COUNT) * Math.PI * 2 + rand(-0.15, 0.15);
    world.add(new SawShard(world, x, y, a));
  }
}
