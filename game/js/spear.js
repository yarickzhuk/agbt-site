// spear.js — OCCÜLTACRESBURG phase-4 hazard, alongside flame.js. Ported from
// the author's own Scratch prototype (`Spear.sprite3`): a broadcast script
// spawns 10 spears a second apart, each aimed at wherever the player is
// standing at that moment; the clone itself flies straight (`repeat_until
// touching edge or touching Bullet { move 5 steps }`) until it either leaves
// the arena or is shot down. Unlike `flame.js`'s PURPLE, unkillable "chip
// bullet," the source draws Spear in cyan (`#00fcff`) and gives it that
// explicit "touching Bullet" death check — so it's a real CYAN Hittable here,
// killed by any shot (matching Hittable's own CYAN rule, no override needed)
// and worth the usual +100 a plain-cyan target scores, same `destroyCyan`
// death cue every other one uses. It's a shoot-it-or-get-hit hazard, the
// deliberate counterpart to Flame's dodge-only one.
//
// The source's own two "goto random position" calls (one on the parent
// before aiming, a second, unrelated one on the clone's own hat block right
// after) don't generalize to this arena and would leave the aim direction
// decoupled from the clone's actual spawn point — a genuine authoring
// mix-up, not something worth reproducing. Ported instead as: spawn at a
// random screen edge (`edgeSpawn()`, the same convention every other edge
// hazard in this port uses) aimed once at the player's position at that
// instant, then fly straight — matching the source's real intent ("point
// towards Player" before the clone is born) without the coordinate mismatch.
// Its own movement loop (`repeat_until { move 5 steps }`, no explicit wait)
// isn't the "no wait between iterations" bug class this session has fixed
// elsewhere — `repeat_until` yields a frame per iteration by itself in
// Scratch, so the source's flight already animated correctly; no fix needed
// here, just a straight-line port. No touch-check exists in the source at
// all (same thin-skeleton situation `corn.js`/`flame.js`/`knight.js` were
// already in), so touch-damage is added fresh here.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H, edgeSpawn, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const RADIUS = 0.28;
const SPEED = 4.5;   // world units/s

export class Spear extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: CYAN, radius: RADIUS, damage: 1,
                   countsAsProgress: true, destroySound: 'destroyCyan' });
    this.world = world;
    this.alive = true;
    const m = Math.hypot(vx, vy) || 1;
    this.vx = vx / m * SPEED; this.vy = vy / m * SPEED;

    this.container = buildSprite('Spear', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
    world.audio.play('spearSpawn', 0.6);
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = Math.atan2(this.vy, this.vx);   // tip leads the direction of travel
  }

  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
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

// Spawns one Spear at a random screen edge, aimed at the player's current
// position — a fixed direction locked in at launch, matching the source's
// own "point towards Player" happening once before the clone is created.
export function spawnSpear(world) {
  const { x, y } = edgeSpawn();
  const p = world.player;
  const aimX = p ? p.x : 0, aimY = p ? p.y : 0;
  world.add(new Spear(world, x, y, aimX - x, aimY - y));
}
