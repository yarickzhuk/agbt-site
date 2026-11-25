// crystal.js — the reward at the end. Shoot it nine times; each hit cracks it
// one frame further (CrystalV0..9). The ninth extracts it: it swaps to the
// fully-extracted gem (CrystalExtracted), then rises, fades, and plays its
// jingle while the mothership flees. It's Cyan but handled specially — hits are
// counted, never destroyed, and it never hurts the player.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_H } from './core.js';

const TOTAL_HITS = 9;

export class Crystal {
  constructor(world, opts = {}) {
    this.world = world;
    this.alive = true;
    this.x = opts.x != null ? opts.x : 0;
    this.y = opts.y != null ? opts.y : HALF_H - 1.2;   // default: near the bottom edge
    this.tint = opts.tint != null ? opts.tint : null;  // recolour the gem (e.g. yellow)
    this.hits = 0;
    this.done = false;
    this.rising = false;
    this.alpha = 1;
    this.collected = false;

    this.build(0);

    this.hit = new Hittable(world, {
      x: this.x, y: this.y, color: CYAN, radius: 0.5,
      hurtsPlayer: false, countsAsProgress: false,
      onDie: () => this.registerHit(),
    });
  }

  build(frame) { this.buildShape('CrystalV' + Math.max(0, Math.min(9, frame))); }

  buildShape(name) {
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
    const o = { scale: 1, lineWidth: 2 };
    if (this.tint != null) o.tint = this.tint;
    this.container = buildSprite(name, o);
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.alpha = this.alpha;
    this.world.stage.addChild(this.container);
  }

  registerHit() {
    if (this.done) return;
    this.hits++;
    this.build(this.hits);
    this.world.audio.play('crystalCrack', 0.85);
    if (this.hits >= TOTAL_HITS) this.extract();
    else this.hit.dead = false;    // re-arm for the next shot
  }

  extract() {
    this.done = true;
    this.rising = true;
    this.collected = true;
    this.buildShape('CrystalExtracted');   // fully-extracted gem for the fly-away
    this.world.audio.play('crystalExtract', 0.85);
    this.world.audio.play('crystalCollect', 0.85);
    // stop taking hits
    const i = this.world.hittables.indexOf(this.hit);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.onCollected) this.onCollected();
  }

  update(dt) {
    if (!this.rising) return;
    if (this.alpha > 0) {
      this.y -= 2 * dt;                       // rise upward
      this.alpha = Math.max(0, this.alpha - dt / 1.5);
      const [sx, sy] = toScreen(this.x, this.y);
      this.container.position.set(sx, sy);
      this.container.alpha = this.alpha;
      return;
    }
    this.destroy();
  }

  destroy() {
    this.alive = false;
    if (this.hit && !this.hit.dead) { const i = this.world.hittables.indexOf(this.hit); if (i >= 0) this.world.hittables.splice(i, 1); }
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
