// corn.js — CRAZY CARNIVAL's phase-1 hazard. Destroying it clears the phase.
// Ported from the author's own Scratch prototype (Corn.sprite3).
//
// Two hits to destroy, with a mandatory spew in between:
//  - 1st hit (any shot) provokes it into SPEWING: for ~16s it fires a
//    CornSeed toward the player every ~0.4s (40 total) and is briefly
//    invulnerable to further hits while doing it. This matches the source
//    script exactly — its "wait until touching Bullet again" check simply
//    isn't running during the spew loop, so a second touch during that
//    window was never detectable — kept here as a real wind-up beat rather
//    than "fixed" away, since it reads fine as one.
//  - Once all 40 seeds are out, it's EXPOSED (the cob is gone — just the
//    husk remains) and vulnerable again.
//  - 2nd hit destroys it (200 points, mirroring saw.js/crock.js's other
//    "several hits to kill" CYBER ZOO hazards).
//
// The body is the author's own hand-drawn Scratch art (not a shape-JSON
// vector build), the same kind of exception kangaroo.js's head already is:
// rasterized straight from the source SVGs rather than reduced to the
// usual stroke-only outline look, because the request here specifically
// asked for the original look back, plus a real visual tell of the cob
// emptying out kernel by kernel as each of the 40 seeds fires — 40 hand
// costumes was the author's own first idea, abandoned as too slow to draw
// by hand. Generated instead: the "spewing" costume's own 40 individual
// kernel paths were algorithmically peeled off top-to-bottom, one per
// frame, straight from the source SVG, into a 40-frame sprite sheet
// (assets/sprites/corn/spew_sheet.png) — the real art, just automated
// rather than hand-drawn 40 times. `idle.png`/`exposed.png` are the two
// static costumes rasterized the same way (matching kangaroo.js's own "4x"
// convention, so `DISPLAY_SCALE` maps back to design-unit scale the same
// way).
//
// Two real fixes vs. the source:
//  - Visible feedback: the source's main body sprite never animated during
//    the whole 16s spew (a static image while 40 clones popped out of it)
//    — "the corn itself looks like it hasn't moved". Each seed launch now
//    both advances the emptying-cob frame AND gives the body a quick
//    recoil kick (a brief scale pop), so the spew reads as one continuous,
//    physically active thing doing 40 things.
//  - Seed hit-detection: the source's clone script (its costume4, the tiny
//    seed graphic — already drawn stroke-only in purple in the source art)
//    never implements ANY touch check against the player at all — a seed
//    just flies in a straight line to the screen edge and vanishes. Given
//    real, hand-written touch-damage here (CornSeed below), matching the
//    project's other "chip bullet" projectiles (pirania.js, jellyfish.js):
//    purple, unkillable, touch-hurts, scores nothing.
import { buildSprite, WORLD_SCALE } from './retro.js';
import { Hittable, PURPLE, CYAN, toScreen, HALF_W, HALF_H, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const SPEW_SEEDS = 40;
const SEED_INTERVAL = 0.4;   // seconds between seeds
const KICK_TIME = 0.18;      // seconds the recoil-kick pop lasts
const RADIUS = 0.55;         // first-pass — tall/thin shape, a single circle is a rough fit

// The sprite sheet's frames were rasterized at 4 texture px per design unit
// (matching kangaroo.js's own "4x" convention), so dividing back out and
// applying WORLD_SCALE recovers accurate design-unit sizing.
const TEXTURE_PX_PER_UNIT = 4;
const DISPLAY_SCALE = WORLD_SCALE / TEXTURE_PX_PER_UNIT;

const SHEET_COLS = 8;
const FRAME_W = 145, FRAME_H = 516;

// Anchor fractions come from each Scratch costume's own rotationCenter
// (sprite.json) as a fraction of that costume's own art bounds — same
// convention kangaroo.js uses, so switching costumes doesn't visually jump.
const ANCHOR_IDLE = [0.5, 0.4793];
const ANCHOR_SPEW = [0.5, 0.4779];
const ANCHOR_EXPOSED = [0.5, 0.376];

let spewFrames = null;
// Built lazily (main.js's boot-time PIXI.Assets.load has already fetched
// the sheet by the time any Corn is constructed, so this resolves from
// cache synchronously — same assumption kangaroo.js's PIXI.Sprite.from
// calls make for its own preloaded PNGs).
function getSpewFrames() {
  if (spewFrames) return spewFrames;
  const base = PIXI.Texture.from('assets/sprites/corn/spew_sheet.png').baseTexture;
  spewFrames = [];
  for (let i = 0; i < SPEW_SEEDS; i++) {
    const col = i % SHEET_COLS, row = Math.floor(i / SHEET_COLS);
    spewFrames.push(new PIXI.Texture(base, new PIXI.Rectangle(col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H)));
  }
  return spewFrames;
}

export class Corn extends Hittable {
  constructor(world, x = 0, y = HALF_H - 1) {
    super(world, { x, y, color: CYAN, radius: RADIUS, damage: 1, countsAsProgress: true });
    this.world = world;
    this.stage = 'idle';       // 'idle' | 'spewing' | 'exposed'
    this.spewT = 0;
    this.seedsFired = 0;
    this.kick = 0;

    this.sprite = PIXI.Sprite.from('assets/sprites/corn/idle.png');
    this.sprite.anchor.set(ANCHOR_IDLE[0], ANCHOR_IDLE[1]);
    world.stage.addChild(this.sprite);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.sprite.position.set(sx, sy);
    const bump = this.kick > 0 ? 1 + 0.22 * (this.kick / KICK_TIME) : 1;
    this.sprite.scale.set(DISPLAY_SCALE * bump);
  }

  // Any shot lands here. Provokes the spew on the first hit; the second
  // (only reachable once EXPOSED) actually destroys it. A hit mid-spew is
  // a deliberate no-op — see the header comment.
  die() {
    if (this.dead) return;
    if (this.stage === 'idle') {
      this.stage = 'spewing';
      this.spewT = 0;
      this.seedsFired = 0;
      this.sprite.texture = getSpewFrames()[0];
      this.sprite.anchor.set(ANCHOR_SPEW[0], ANCHOR_SPEW[1]);
      this.world.audio.play('cornPop', 0.6);
      return;
    }
    if (this.stage === 'exposed') {
      this.dead = true;
      this.world.addScore(200);
      this.world.audio.play('destroyCyan', 0.7);
      this.destroy();
    }
  }

  toExposed() {
    this.stage = 'exposed';
    this.sprite.texture = PIXI.Texture.from('assets/sprites/corn/exposed.png');
    this.sprite.anchor.set(ANCHOR_EXPOSED[0], ANCHOR_EXPOSED[1]);
  }

  update(dt) {
    if (this.dead) return;
    if (this.kick > 0) this.kick -= dt;

    if (this.stage === 'spewing') {
      this.spewT += dt;
      if (this.seedsFired < SPEW_SEEDS && this.spewT >= this.seedsFired * SEED_INTERVAL) {
        this.fireSeed();
        if (this.seedsFired >= SPEW_SEEDS) this.toExposed();
        else this.sprite.texture = getSpewFrames()[this.seedsFired];
      }
    }
    this.place();

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && p.touchesCircle(this.x, this.y, this.radius)) {
      p.takeDamage(this.damage);
    }
  }

  fireSeed() {
    this.seedsFired++;
    this.kick = KICK_TIME;
    const p = this.world.player;
    const dx = (p ? p.x : 0) - this.x, dy = (p ? p.y : 0) - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.world.add(new CornSeed(this.world, this.x, this.y, { x: dx / d, y: dy / d }));
    this.world.audio.play('cornPop', 0.3);
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.sprite && !this.sprite.destroyed) this.sprite.destroy();
  }
}

// A single kernel spat toward wherever the player was standing when it
// fired; flies straight (it doesn't home — the source only ever aims once,
// at launch) until it leaves the field. Purple: unkillable, touch-hurts,
// scores nothing — the "chip bullet" this game's other minion projectiles
// already are (pirania.js's Pirania is the closest match). Kept as a flat
// stroke-only vector shape (not raster) — its source art already is one.
const SEED_SPEED = 4;   // world units / s

class CornSeed extends Hittable {
  constructor(world, x, y, dir) {
    super(world, { x, y, color: PURPLE, radius: 0.12, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    this.vx = dir.x * SEED_SPEED;
    this.vy = dir.y * SEED_SPEED;

    this.container = buildSprite('CornSeed', { lineWidth: 2 });
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
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.place();

    if (this.x < -HALF_W - 1 || this.x > HALF_W + 1 ||
        this.y < -HALF_H - 1 || this.y > HALF_H + 1) { this.destroy(); return; }

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
