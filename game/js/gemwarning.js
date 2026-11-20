// gemwarning.js — OCCÜLTACRESBURG phase-3 (THE MAZE) hazard. A shrinking gem
// telegraph: appears oversized at a random spot, shrinks away to nothing over
// WARN_TIME, then the instant it's gone a solid Wall (wall.js) snaps into
// place at that exact spot with a Maze_spawn.wav stinger — the maze fills in
// around the player, one block at a time, as the phase plays out.
//
// Ported from the author's own Scratch prototype (`Mase.sprite3`): its own
// clone script (`set size 1000% -> show -> repeat 1000 { change size by -1 }
// -> hide -> delete this clone`) is a pure shrink-to-nothing telegraph with
// no follow-up hazard coded at all — the wall it leaves behind is this
// port's own addition on top of that skeleton, the same situation
// `corn.js`/`clown.js`/`firework.js`/`knight.js` were already in with their
// own thin sources. `Gem.json`'s six-facet outline is the union of all five
// of the source's own costumes (each one is the same gem missing a
// different one of six facets — a decorative "randomly incomplete" detail
// that isn't essential to the mechanic, so it's simplified here to one
// complete gem rather than porting the per-clone random-facet drop).
import { buildSprite } from './retro.js';
import { toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { Wall } from './wall.js';

const WARN_TIME = 1.1;      // seconds from huge to gone
// The source's own "set size to 1000%" is a dramatic 10x blowup meant to
// read as filling the whole stage, not just "a bit bigger" -- 3.2 (the
// original guess here) only ever covered ~30% of the screen's own height,
// nowhere near that (reported back as it not "filling the screen"). Gem.json
// is 118x116 design units (~1.18x1.16 world units at scale 1); 8 brings it
// to ~9.4x9.3 world units, close to the full HALF_H*2=10 screen height.
const START_SCALE = 8;
const WALL_HALF = 0.5;      // half-width/height of the wall block it leaves behind
const EDGE_MARGIN = 1.2;    // keep telegraphs (and the walls they leave) off the very edge
const PLAYER_CLEAR = 1.6;   // don't drop one right on top of the player

export class GemWarning {
  constructor(world, x, y) {
    this.world = world;
    this.x = x; this.y = y;
    this.alive = true;
    this.t = 0;

    this.container = buildSprite('Gem', { lineWidth: 2 });
    this.container.zIndex = 4;
    world.stage.addChild(this.container);
    const [sx, sy] = toScreen(x, y);
    this.container.position.set(sx, sy);
    this.container.scale.set(START_SCALE);
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const k = Math.max(0, 1 - this.t / WARN_TIME);
    this.container.scale.set(START_SCALE * k);
    this.container.alpha = 0.5 + 0.5 * k;
    if (this.t >= WARN_TIME) this.resolve();
  }

  // Shrunk away — drop the real wall block right where it was telegraphing.
  resolve() {
    this.alive = false;
    this.container.destroy({ children: true });
    this.world.audio.play('mazeSpawn', 0.6);
    this.world.add(new Wall(this.world, this.x - WALL_HALF, this.x + WALL_HALF,
                                          this.y - WALL_HALF, this.y + WALL_HALF));
  }

  // Cleared mid-telegraph (e.g. the phase ending early) — no wall left behind.
  destroy() {
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// Spawns a telegraph at a random spot inside the play area, clear of the
// screen edges and the player's current position, so the wall it leaves
// always has room to actually matter.
export function spawnGemWarning(world) {
  const p = world.player;
  let x, y;
  do {
    x = rand(-HALF_W + EDGE_MARGIN, HALF_W - EDGE_MARGIN);
    y = rand(-HALF_H + EDGE_MARGIN, HALF_H - EDGE_MARGIN);
  } while (p && dist(x, y, p.x, p.y) < PLAYER_CLEAR);
  world.add(new GemWarning(world, x, y));
}
