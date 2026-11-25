// lollypop.js — CRAZY CARNIVAL's phase-3 hazard: a stationary lollipop that
// telegraphs briefly then just sits as an environmental obstacle until shot
// down. Ported from the author's own Lollypop.sprite3 — the sprite carried
// no scripts at all, only the art, so the behaviour here is built fresh to
// spec: wait ~1s, then appear (armed) and sit still — touch-hurting,
// shootable — until destroyed. Not shootable or touch-hurting before it's
// armed, since it isn't really "there" yet.
//
// Planted stick-first into the nearest wall (level3.js's spawnLollypop
// picks the edge and the matching rotation) rather than just dropped
// stick-down in open field — it reads as growing out of the wall, candy
// end pointing into the arena, the same "which end embeds" fix dart.js's
// own tip got.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const SPAWN_DELAY = 1;   // seconds before it actually appears
const RADIUS = 0.45;

export class Lollypop extends Hittable {
  // `angle`: container rotation (radians) — Lollypop.json's stick points
  // local +Y (down) by default, so pass the angle that turns "down" into
  // whichever edge it's meant to be planted against (see level3.js's
  // spawnLollypop, which always plants it stick-first into the nearest
  // wall rather than dropping it stick-down in open field).
  constructor(world, x, y, angle = 0) {
    super(world, { x, y, color: CYAN, radius: RADIUS, damage: 1, countsAsProgress: false });
    this.world = world;
    this.armed = false;
    this.spawnT = 0;
    this.angle = angle;

    this.container = buildSprite('Lollypop', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.rotation = this.angle;
    this.container.visible = false;
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  // Not really "there" until armed — passes through shots harmlessly.
  canBeDestroyedBy(charged) { return this.armed && super.canBeDestroyedBy(charged); }

  update(dt) {
    if (this.dead) return;
    if (!this.armed) {
      this.spawnT += dt;
      if (this.spawnT >= SPAWN_DELAY) {
        this.armed = true;
        this.container.visible = true;
        this.world.audio.play('lollypopPop', 0.5);
      }
      return;
    }
    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
    }
  }

  die() {
    if (this.dead || !this.armed) return;
    this.dead = true;
    this.world.addScore(100);
    this.world.audio.play('destroyCyan', 0.7);
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
