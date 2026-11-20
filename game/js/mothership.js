// mothership.js — Phase 5 pressure, not a boss. Fills the screen width and
// sinks slowly like a ceiling; its descending bottom edge is instant death
// (3 damage). Once the crystal is pulled it rockets back up and escapes.
// `opts.fromBottom` mirrors the whole thing vertically: starts below the
// screen and rises like a floor instead, its *rising top edge* the death
// one, fleeing back down off the bottom once the crystal is pulled —
// OCCÜLTACRESBURG's own escape finale ("mothership will come FROM THE
// BOTTOM", per direct request) uses this instead of a second near-duplicate
// class, the same reasoning MothershipChase's own opts.mirror already uses.
import { buildSprite, getShape, WORLD_SCALE } from './retro.js';
import { toScreen, PPU, HALF_W, HALF_H } from './core.js';

const DESCENT = 0.3, ESCAPE = 8;
const CRUSH_DAMAGE = 3;
const CHASE = 0.55;      // left-chaser advance speed (world units / s)

export class Mothership {
  constructor(world, opts = {}) {
    this.world = world;
    this.alive = true;
    this.escaping = false;
    this.onEscape = null;
    // +1: sinks downward from the top (the original, unmirrored direction).
    // -1 (opts.fromBottom): rises upward from the bottom instead.
    this.dir = opts.fromBottom ? -1 : 1;

    const s = getShape('Mothership');           // 400 x 120 design
    this.k = (2 * HALF_W) / (s.width / 100);     // scale to fill full width
    this.halfWidth = HALF_W;
    const bodyH = (s.height / 100) * this.k;     // proportional height, world units
    this.halfHeight = bodyH / 2;

    this.container = buildSprite('Mothership', { scale: this.k, lineWidth: 2, glow: 2.4, glowDistance: 16 });
    this.container.zIndex = 15;
    world.stage.addChild(this.container);

    // fromBottom: start fully below the bottom edge; otherwise fully above the top.
    this.y = -this.dir * (HALF_H + this.halfHeight);
    this.place();
    world.audio.loop('mothership', 0.6);
  }

  place() { const [sx, sy] = toScreen(0, this.y); this.container.position.set(sx, sy); }

  crystalCollected() { this.escaping = true; }

  update(dt) {
    if (this.escaping) {
      this.y -= this.dir * ESCAPE * dt;   // flee back the way it came from
      this.place();
      const clearedScreen = this.dir > 0
        ? this.y - this.halfHeight < -HALF_H - 2
        : this.y + this.halfHeight > HALF_H + 2;
      if (clearedScreen) {
        this.world.audio.stopLoop('mothership');
        if (this.onEscape) this.onEscape();
        this.destroy();
      }
      return;
    }
    this.y += this.dir * DESCENT * dt;
    this.place();
    this.touchPlayer();
  }

  touchPlayer() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    // The body covers everything behind its leading edge (in the direction
    // of travel) -- the crushing edge is the bottom when sinking from the
    // top, or the top when rising from the bottom.
    const leading = this.y + this.dir * this.halfHeight;
    const b = p.hullBounds();   // the ship's triangle
    const unsafe = this.dir > 0 ? leading >= b.y0 : leading <= b.y1;
    if (unsafe && b.x1 >= -this.halfWidth && b.x0 <= this.halfWidth) {
      p.takeDamage(CRUSH_DAMAGE);
    }
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {
    const leading = this.y + this.dir * this.halfHeight;
    return { shapes: [{ rect: [-this.halfWidth, leading - this.dir * 20, this.halfWidth, leading] }] };
  }
  destroy() {
    this.alive = false;
    this.world.audio.stopLoop('mothership');
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// A vertical wall of the mothership that chases in from the LEFT and advances
// right; its right edge is instant death. Once the crystal is pulled it flees
// back off the left edge. Used in the escape finale (crystal on the right).
// `opts.mirror` flips all of that: chases in from the RIGHT and advances
// left (its left edge is instant death), fleeing back off the right edge
// once the crystal is pulled — for a finale with the crystal on the left
// instead (CRAZY CARNIVAL's own escape sequence).
export class MothershipChase {
  constructor(world, opts = {}) {
    this.world = world;
    this.alive = true;
    this.escaping = false;
    this.onEscape = null;
    // +1: chases rightward (the original, unmirrored direction).
    // -1 (opts.mirror): chases leftward instead.
    this.dir = opts.mirror ? -1 : 1;

    const s = getShape('Mothership');            // 400 x 120 design, drawn wide
    const fillH = 2 * HALF_H + 2;                // world height to cover
    this.k = fillH / (s.width / 100);            // rotated 90°: sprite width -> vertical
    this.halfW = (s.height / 100) * this.k / 2;  // sprite height -> horizontal half-width

    this.container = buildSprite('Mothership', { scale: this.k, lineWidth: 3 });
    this.container.rotation = Math.PI / 2;
    this.container.zIndex = 15;
    world.stage.addChild(this.container);

    // Start already poking into view from the edge it's chasing in from, so
    // it reads as an immediate looming threat rather than sitting invisible
    // off-screen for several seconds before the chase becomes visible.
    this.x = -this.dir * (HALF_W + this.halfW / 2);
    this.place();
    world.audio.loop('mothership', 0.6);
  }

  place() { const [sx, sy] = toScreen(this.x, 0); this.container.position.set(sx, sy); }

  crystalCollected() { this.escaping = true; }

  update(dt) {
    if (this.escaping) {
      this.x -= this.dir * ESCAPE * dt;   // flee back the way it came from
      this.place();
      const clearedScreen = this.dir > 0
        ? this.x + this.halfW < -HALF_W - 2
        : this.x - this.halfW > HALF_W + 2;
      if (clearedScreen) {
        this.world.audio.stopLoop('mothership');
        if (this.onEscape) this.onEscape();
        this.destroy();
      }
      return;
    }
    this.x += this.dir * CHASE * dt;
    this.place();
    this.touchPlayer();
  }

  touchPlayer() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    // The wall's body covers everything behind its leading edge (in the
    // direction of travel); anyone still on that side is inside it.
    const leading = this.x + this.dir * this.halfW;
    const b = p.hullBounds();   // the ship's triangle
    const unsafe = this.dir > 0 ? b.x0 <= leading : b.x1 >= leading;
    if (unsafe) p.takeDamage(CRUSH_DAMAGE);
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {
    const leading = this.x + this.dir * this.halfW;
    return { shapes: [{ rect: [leading - this.dir * 20, -HALF_H - 1, leading, HALF_H + 1] }] };
  }
  destroy() {
    this.alive = false;
    this.world.audio.stopLoop('mothership');
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
