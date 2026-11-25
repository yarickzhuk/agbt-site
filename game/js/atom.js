// atom.js — CYBER ZOO phase-4 hazard. An atom made of THREE separate circles
// clustered around a centre point, with a gap in the middle the player can
// stand in — it telegraphs with a harmless warning ring, then appears,
// spinning and slowly shrinking until it vanishes on its own. It's PURPLE —
// unkillable, like the other purple hazards: bullets break on it, torpedoes
// pass through. It touch-hurts (per circle, not the whole cluster) only once
// it has actually appeared. Score nothing; it's a "chip bullet" to dodge.
import { buildSprite } from './retro.js';
import { Hittable, PURPLE, toScreen, HALF_W, HALF_H, PPU, rand, dist } from './core.js';

const WARN = 0.9;         // telegraph length, s
const LIFE = 4.5;         // time from full size to gone, s
const CIRCLE_R = 0.55;    // each circle's own radius at full size
const CLUSTER_D = 1.3;    // centre-to-circle-centre distance at full size (the gap = CLUSTER_D - CIRCLE_R)
const MIN_K = 0.14;       // scale fraction just before it vanishes
const SPIN = 1.6;         // rad/s — circles orbit the centre as it spins
const TINT = 0xFF00D4;    // purple colour language (matches jellyfish/piranha)
const BASE_ANGLES = [-Math.PI / 2, Math.PI * 5 / 6, Math.PI / 6];   // top, bottom-left, bottom-right

export class Atom extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: PURPLE, radius: CLUSTER_D + CIRCLE_R, damage: 1,
                   countsAsProgress: false });
    this.world = world;
    this.alive = true;
    this.state = 'warn';
    this.t = 0; this.spin = 0; this.k = 1;

    this.warn = new PIXI.Graphics();
    this.warn.zIndex = 4;
    world.stage.addChild(this.warn);

    this.container = buildSprite('Atom', { scale: 3.9, lineWidth: 2.5, tint: TINT });
    this.container.zIndex = 6;
    this.container.visible = false;
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.warn.position.set(sx, sy);
  }

  // The three live circle centres + radius, in world space, kept in sync with
  // the visual spin and shrink so the hitboxes always match what's drawn.
  subCircles() {
    const d = CLUSTER_D * this.k, r = CIRCLE_R * this.k;
    return BASE_ANGLES.map(a => {
      const ang = a + this.spin;
      return { x: this.x + Math.cos(ang) * d, y: this.y + Math.sin(ang) * d, r };
    });
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt;

    if (this.state === 'warn') {
      const p = Math.min(1, this.t / WARN);
      const r = (CLUSTER_D + CIRCLE_R) * (1.9 - 0.9 * p) * PPU;   // ring contracts onto the cluster
      this.warn.clear();
      this.warn.lineStyle({ width: 2, color: TINT, alpha: 0.35 + 0.45 * Math.abs(Math.sin(this.t * 12)) });
      this.warn.drawCircle(0, 0, r);
      if (this.t >= WARN) { this.state = 'active'; this.t = 0; this.warn.clear(); this.container.visible = true; }
      return;   // harmless while telegraphing
    }

    // active: spin (the circles orbit the centre) and shrink away
    this.k = 1 - this.t / LIFE;
    if (this.k <= MIN_K) { this.destroy(); return; }        // shrank to nothing, no harm
    this.spin += dt * SPIN;
    this.container.rotation = this.spin;
    this.container.scale.set(this.k);
    this.radius = (CLUSTER_D + CIRCLE_R) * this.k;

    const pl = this.world.player;
    if (pl && !pl.invulnerable && !pl.dead) {
      for (const c of this.subCircles()) {
        if (pl.touchesCircle(c.x, c.y, c.r)) { pl.takeDamage(this.damage); break; }
      }
    }
  }

  // Bullets test each of the three circles individually (bullet.js calls
  // h.hitTest when a Hittable provides one) — so a shot only ever registers
  // when it's actually inside one of the circles, never the gap between them,
  // and never while it's still just a harmless warning ring. canBeDestroyedBy
  // / stopsBullet fall through to Hittable's base PURPLE behaviour (never
  // destroyed, uncharged shots break on it) since this hitTest gate already
  // keeps a warn-state atom untouchable.
  hitTest(bx, by, br) {
    if (this.state !== 'active') return false;
    return this.subCircles().some(c => dist(bx, by, c.x, c.y) <= br + c.r);
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return { shapes: this.subCircles().map(c => ({ circle: [c.x, c.y, c.r] })) }; }
  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.warn && !this.warn.destroyed) this.warn.destroy();
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// Spawn an atom somewhere in the field, not right on top of the player.
export function spawnAtom(world) {
  const p = world.player;
  let x, y, tries = 0;
  do {
    x = rand(-HALF_W * 0.8, HALF_W * 0.8);
    y = rand(-HALF_H * 0.8, HALF_H * 0.8);
    tries++;
  } while (p && dist(x, y, p.x, p.y) < 2.2 && tries < 12);
  world.add(new Atom(world, x, y));
}
