// meteor.js — Phase 1 hazard. Shards fly in from the edges, spin, bounce off
// the screen borders (each bounce plays one of three tones), and die after a
// few bounces. Purple: never destroyed by shots, only ever a threat to touch.
import { buildSprite, getShape } from './retro.js';
import { Hittable, PURPLE, toScreen, HALF_W, HALF_H, rand, pick, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

// radius from the shape's own design size, matching RadiusFromSprite()
function shapeRadius(name, scale) {
  const s = getShape(name);
  if (!s) return 0.08 * scale;
  return (Math.max(s.width, s.height) / 100 / 2) * scale;
}

const SHARD_SCALE = 0.25;

class MeteorShard extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: PURPLE, radius: shapeRadius('MeteorShard', SHARD_SCALE),
                   damage: 1, countsAsProgress: false });
    this.world = world;
    this.speed = 3;
    this.spin = 450 * Math.PI / 180;   // rad/s
    this.bounces = 0;
    this.maxBounces = 5;
    this.alive = true;

    const a = rand(0, Math.PI * 2);
    this.vx = Math.cos(a) * this.speed;
    this.vy = Math.sin(a) * this.speed;

    this.container = buildSprite('MeteorShard', { scale: SHARD_SCALE, lineWidth: 1.6 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
  }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.container.rotation += this.spin * dt;
    this.place();
    this.bounce();
    this.touchPlayer();
  }

  bounce() {
    let hit = false;
    if (this.x < -HALF_W) { this.x = -HALF_W; this.vx = Math.abs(this.vx); hit = true; }
    if (this.x >  HALF_W) { this.x =  HALF_W; this.vx = -Math.abs(this.vx); hit = true; }
    if (this.y < -HALF_H) { this.y = -HALF_H; this.vy = Math.abs(this.vy); hit = true; }
    if (this.y >  HALF_H) { this.y =  HALF_H; this.vy = -Math.abs(this.vy); hit = true; }
    if (!hit) return;
    this.world.audio.play(pick(['meteor1', 'meteor2', 'meteor3']), 0.7);
    if (++this.bounces >= this.maxBounces) this.destroy();
  }

  touchPlayer() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead || !this.hurtsPlayer) return;
    if (this.touches(p)) p.takeDamage(this.damage);
  }

  destroy() {
    if (this.dead && this.alive === false) return;
    super.destroy();
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

export function spawnMeteorBatch(world, howMany) {
  for (let i = 0; i < howMany; i++) {
    // pick a random edge point
    let x, y;
    switch (Math.floor(rand(0, 4))) {
      case 0: x = rand(-HALF_W, HALF_W); y = -HALF_H; break;
      case 1: x = rand(-HALF_W, HALF_W); y =  HALF_H; break;
      case 2: x = -HALF_W; y = rand(-HALF_H, HALF_H); break;
      default: x = HALF_W; y = rand(-HALF_H, HALF_H); break;
    }
    world.add(new MeteorShard(world, x, y));
  }
}
