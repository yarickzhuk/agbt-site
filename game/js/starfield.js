// starfield.js — OUTER SPACE's own backdrop. Ported from the author's own
// Scratch upload (`Outer_Space_BG.sb3`): a Stage backdrop that's literally
// just a plain black rectangle -- nothing to draw, since this game's own
// canvas is already pure black -- plus 3 sprites, one per "depth" layer,
// each a plain filled white square (11.51 / 7.89 / 3.76 design units, big
// to small). Every layer's own script is identical in shape: set a GHOST
// (transparency) effect, spawn at a random X near the bottom edge, clone
// itself on a timer, and each clone drifts straight up (`change y by`)
// until it crosses the top edge, then deletes itself -- a classic 3-layer
// parallax star scroll (bigger/more-opaque/faster = nearer, smaller/more-
// transparent/slower = further; `LAYERS` below carries that ordering
// straight over).
//
// **Deliberately toned down well past the source's own numbers, per direct
// request** ("Make this background as LEAST distractive as possible"): the
// source's own spawn intervals (0.1s/0.2s/0.3s) would put a new star on
// screen up to 10 times a second for the nearest layer alone, and its own
// GHOST values (10/20/40, i.e. 90%/80%/60% opaque) read as a fairly bold
// foreground element, not a quiet backdrop texture. `LAYERS` below widens
// every interval well past that (1.2s/1.8s/2.4s), drops every alpha
// further (0.4/0.28/0.18), and slows the drift considerably (1.2/0.8/0.5
// world units/s, vs. the source's much faster per-frame deltas) -- plus a
// hard `MAX_STARS` cap across all three layers combined, so even a long
// idle stretch (the title-card hold, an empty sandbox phase) never lets
// the field get busy. The goal is a faint, barely-there sense of motion
// behind the gameplay, not a second thing competing for attention.
//
// Drawn as plain filled `PIXI.Graphics` squares, not run through
// `retro.buildSprite` (which only ever strokes a shape, never fills it) --
// a star has to actually be a filled dot to read as one, the same
// "backdrop is an exception to the no-fill hazard rule" call
// `kangaroo.js`'s/`showman.js`'s own arena backdrops already made. No
// glow, flat white, matching this game's own no-glow convention regardless.
import { HALF_W, HALF_H, PPU, toScreen, rand } from './core.js';

const LAYERS = [
  // size: world units (design-unit size / 100, this game's own 1 world
  // unit = 100 design units rule). alpha/speed/interval: see the header
  // comment above for why these are well below the source's own numbers.
  { size: 0.115, alpha: 0.40, speed: 1.2, interval: 1.2 },
  { size: 0.079, alpha: 0.28, speed: 0.8, interval: 1.8 },
  { size: 0.038, alpha: 0.18, speed: 0.5, interval: 2.4 },
];
const MAX_STARS = 40;   // hard cap across all three layers combined
const EDGE_MARGIN = 0.3;   // world units of slack before a star is actually removed

export class StarField {
  constructor(world) {
    this.world = world;
    this.alive = true;
    this.container = new PIXI.Container();
    this.container.zIndex = -5;   // behind everything -- walls, hazards, the player
    world.stage.addChild(this.container);
    this.stars = [];
    // Stagger each layer's first spawn so all three don't pop in at once
    // the instant the level starts.
    this.timers = LAYERS.map(() => rand(0, 1));
  }

  update(dt) {
    if (!this.alive) return;
    LAYERS.forEach((layer, i) => {
      this.timers[i] -= dt;
      if (this.timers[i] > 0) return;
      this.timers[i] = layer.interval;
      if (this.stars.length < MAX_STARS) this.spawn(layer);
    });

    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.y -= s.speed * dt;   // y+ is down in this game, so "drifting up" is decreasing y
      const [sx, sy] = toScreen(s.x, s.y);
      s.sprite.position.set(sx, sy);
      if (s.y < -HALF_H - EDGE_MARGIN) {
        s.sprite.destroy();
        this.stars.splice(i, 1);
      }
    }
  }

  spawn(layer) {
    const px = layer.size * PPU;
    const g = new PIXI.Graphics();
    g.beginFill(0xffffff, layer.alpha);
    g.drawRect(-px / 2, -px / 2, px, px);
    g.endFill();
    this.container.addChild(g);
    const x = rand(-HALF_W, HALF_W);
    const y = HALF_H + EDGE_MARGIN;   // spawn just below the bottom edge
    const [sx, sy] = toScreen(x, y);
    g.position.set(sx, sy);
    this.stars.push({ sprite: g, x, y, speed: layer.speed });
  }

  destroy() {
    this.alive = false;
    for (const s of this.stars) s.sprite.destroy();
    this.stars.length = 0;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
