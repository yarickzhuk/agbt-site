// bomb.js — Phase 1 hazard that starts on the field. Drifts, bounces off the
// edges (ricochet tone), and when shot (Cyan: any shot kills it) blooms into an
// explosion that can catch the player standing too close.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { useSilhouette, silhouetteShapes } from './silhouette.js';
import { unlockAchievement } from './achievements.js';

export class Bomb extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: CYAN, radius: 0.3, damage: 1, countsAsProgress: true });
    this.world = world;
    this.speed = 2.5;
    this.alive = true;
    this.exploded = false;
    this.explosionRadius = 1.2;
    this.explosionDamage = 1;
    this.onDie = () => this.explode();

    const a = rand(0, Math.PI * 2);
    this.vx = Math.cos(a) * this.speed;
    this.vy = Math.sin(a) * this.speed;

    this.container = buildSprite('Bomb', { lineWidth: 2 });
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
    if (hit) this.world.audio.play('ricochet', 0.6);
  }

  touchPlayer() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    if (this.touches(p)) p.takeDamage(this.damage);
  }

  explode() {
    if (this.exploded) return;
    this.exploded = true;
    this.world.audio.play('destroyCyan', 0.7);
    // Achievement "Kaboom": blow up SHAPE LIMBO's phase-1 bomb.
    if (this.world.currentLevelId === 'shapelimbo' && this.world.currentPhase === 1) unlockAchievement(this.world, 'kaboom');

    const boom = buildSprite('BombExplosion', { scale: 3, lineWidth: 2.5, glow: 3, glowDistance: 18 });
    const [sx, sy] = toScreen(this.x, this.y);
    boom.position.set(sx, sy);
    this.world.stage.addChild(boom);
    // Brief flash, then gone — no fade-out.
    let t = 0;
    const hold = () => {
      t += this.world.app.ticker.deltaMS / 1000;
      if (t >= 0.15) {
        this.world.app.ticker.remove(hold);
        if (!boom.destroyed) boom.destroy({ children: true });
      }
    };
    this.world.app.ticker.add(hold);

    // blast can hurt the player
    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead &&
        p.touchesCircle(this.x, this.y, this.explosionRadius)) {
      p.takeDamage(this.explosionDamage, this);   // explode() runs inside a bullet's update
    }
    this.destroy();
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {   // the blast is a circle; the bomb itself is its drawn outline
    if (this.exploded) return { shapes: [{ circle: [this.x, this.y, this.explosionRadius] }] };
    return { shapes: silhouetteShapes(this.world.stage, this.container) };
  }
  destroy() {
    if (this.alive === false) return;
    super.destroy();
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
