// dart.js — CRAZY CARNIVAL's phase-4 hazard (the last phase before the
// boss): darts thrown from either edge that fly across, then stick and
// become a stationary target. Ported from the author's own
// Dart_L.sprite3/Dart_R.sprite3.
//
// The source script's flight ("repeat 10 { move 47 steps }") has no wait
// between iterations, so in Scratch it all resolves within a single
// script step — an instant teleport from edge to rest position, not
// something a player could actually dodge mid-flight, despite that being
// the confirmed intended design ("you dodge them [while flying]"). Ported
// here as a real timed flight across the field at DART_SPEED, so the
// crossing itself is the dodge, before it embeds at the far edge and
// becomes a stuck, shootable hazard — matching the source's own "wait
// until touching Bullet, then delete" for the stuck phase exactly. It
// can't be shot down mid-flight, only once stuck, matching that in the
// source the touch-check never even starts until the movement is done.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const DART_SPEED = 6;   // world units/s while flying
const RADIUS = 0.2;

export class Dart extends Hittable {
  // `fromRight`: true = Dart_R's mirror (spawns at the right edge, flies
  // left); false = Dart_L (spawns left, flies right). Matches the source's
  // setx(±222) + its own default facing.
  constructor(world, fromRight, y) {
    const x = fromRight ? HALF_W + 0.5 : -HALF_W - 0.5;
    super(world, { x, y, color: CYAN, radius: RADIUS, damage: 1, destroySound: 'destroyCyan', countsAsProgress: true });
    this.world = world;
    this.vx = fromRight ? -DART_SPEED : DART_SPEED;
    this.stuck = false;

    this.container = buildSprite('Dart', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    // Dart.json's purple (grape) point is the actual sharp tip, at local +X;
    // the cyan (ring) end is the rounded back. The tip has to lead — it's
    // what sticks into the wall — so no extra flip is needed: atan2(0, vx)
    // alone already points local +X (the purple tip) along the direction
    // of travel.
    this.container.rotation = Math.atan2(0, this.vx);
    world.stage.addChild(this.container);
    this.place();
    this.world.audio.play('dartShot', 0.35);
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  // Not shootable until it's actually stuck — matches the source, whose
  // touch-check never starts running until the flight is done.
  canBeDestroyedBy(charged) { return this.stuck && super.canBeDestroyedBy(charged); }

  update(dt) {
    if (this.dead) return;
    if (!this.stuck) {
      this.x += this.vx * dt;
      const restX = this.vx < 0 ? -HALF_W + 0.4 : HALF_W - 0.4;
      if ((this.vx < 0 && this.x <= restX) || (this.vx > 0 && this.x >= restX)) {
        this.x = restX;
        this.stuck = true;
        this.world.audio.play('dartStuck', 0.5);
      }
      this.place();
    }

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

// One wave: `perSide` Dart_L + `perSide` Dart_R, sharing the same random
// Y "lanes" so left- and right-thrown darts actually cross paths.
export function spawnDartWave(world, outArray, perSide) {
  for (let i = 0; i < perSide; i++) {
    const y = rand(-HALF_H * 0.8, HALF_H * 0.8);
    outArray.push(world.add(new Dart(world, false, y)));   // Dart_L: spawns left, flies right
    outArray.push(world.add(new Dart(world, true, y + rand(-0.3, 0.3))));   // Dart_R: spawns right, flies left
  }
}
