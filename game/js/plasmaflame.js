// plasmaflame.js — Plasmadrache's own fire-spit projectile (OCCÜLTACRESBURG's
// boss, phase 5), ported from the author's own Scratch prototype
// (`Plasmadrache_Bossfight.sb3`'s "Plasmadrache Flame" sprite): on clone,
// point towards wherever the player currently is and fly dead-straight until
// off-screen. PURPLE — unkillable, a "chip bullet" to dodge, same family as
// pirania.js/devilfish.js's own thin touch-hurt minions (the source has no
// player touch-check at all, so it's added fresh here the same way).
//
// Rasterized straight from the source's own `образ1` costume (a nested
// grape/cobalt/ring tri-tone flame-tongue), the same choice plasmadrache.js's
// own head made for the same reason: a first vector-redraw attempt here
// mishandled the source SVG's cubic-bezier curves and produced a garbled
// zigzag rather than the actual flame silhouette. The source's 3-costume
// "next costume; wait 0.07s" forever-loop cycles a fast colour-rotation
// flicker between образ1/2/3 — simplified here to one static costume
// (образ1) rather than reproducing that per-frame recolour cycle, a
// first-pass call, same spirit as this whole boss's other simplifications.
import { Hittable, PURPLE, toScreen, HALF_W, HALF_H, dist } from './core.js';

const RADIUS = 0.32;
// SPEED: down from 5.2 -- per direct request ("make his projectiles slower
// but make him spam them more often"), paired with plasmadrache.js's own
// shorter SPIT_REST (a fireball roughly every ~1.1s now instead of ~2s) --
// each individual flame is easier to read and dodge, but they come close
// to twice as often overall.
const SPEED = 3.4;   // world units/s

// Rasterized at 4x (design-unit -> texture px, TEXTURE_PX_PER_UNIT, matching
// plasmadrache.js's/kangaroo.js's own convention); DISPLAY_SCALE sets the
// on-screen size.
const TEXTURE_PX_PER_UNIT = 4;
const DISPLAY_SCALE = 1.363 / TEXTURE_PX_PER_UNIT;
const ANCHOR = [0.5094, 0.5];   // from the source costume's own rotationCenter

export class PlasmaFlame extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: RADIUS, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    const m = Math.hypot(vx, vy) || 1;
    this.vx = vx / m * SPEED; this.vy = vy / m * SPEED;

    this.sprite = PIXI.Sprite.from('assets/sprites/plasmadrache/flame.png');
    this.sprite.anchor.set(ANCHOR[0], ANCHOR[1]);
    this.container = new PIXI.Container();
    this.container.scale.set(DISPLAY_SCALE);
    this.container.addChild(this.sprite);
    this.container.rotation = Math.atan2(this.vy, this.vx);
    world.stage.addChild(this.container);
    this.place();
    world.audio.play('plasmaFlame', 0.7);
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.place();

    if (this.x < -HALF_W - 1.5 || this.x > HALF_W + 1.5 ||
        this.y < -HALF_H - 1.5 || this.y > HALF_H + 1.5) { this.destroy(); return; }

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && p.touchesCircle(this.x, this.y, this.radius)) {
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

// Spawns one flame at (x,y) (Plasmadrache's own mouth), aimed once at the
// player's actual position at that instant, then flies straight — matches
// the source's own "point towards Player" at spawn, no re-aim mid-flight.
export function spawnPlasmaFlame(world, x, y) {
  const p = world.player;
  const aimX = p ? p.x : x, aimY = p ? p.y : y - 1;
  world.add(new PlasmaFlame(world, x, y, aimX - x, aimY - y));
}
