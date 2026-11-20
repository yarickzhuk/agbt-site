// laser.js — Phase 2 hazard. A vertical beam sweeps across the screen with a
// Cyan block riding on it (top / middle / bottom). Shoot the block and the
// beam dies — the band goes harmless. The beam itself is Purple: it can't be
// shot away, only its block can.
//
// **`opts.vertical`** (OUTER SPACE's own phase 3) is the same hazard rotated
// 90°, per direct request ("Phase 3 is vertical variation of lazer.js (flip
// them by 90 degrees and strech them over the screen)"): instead of a tall
// band sweeping left/right with its block riding up/middle/down, it's a
// *wide* band sweeping top/bottom with its block riding left/middle/right —
// a flag on this one class rather than a parallel near-duplicate file, the
// same "transpose via an opts flag" call `mothership.js`'s own
// `opts.mirror`/`opts.fromBottom` already made for its own chase variants.
// Every method below keeps the original horizontal path untouched and adds
// a parallel vertical branch next to it, rather than generalizing the two
// into one axis-agnostic code path — safer than risking the already-working
// horizontal sweeper while adding the new one.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, PPU, HALF_W, HALF_H, randInt } from './core.js';

const BEAM_W = 0.35;       // world units
const BLOCK_SIZE = 0.7;
const BLOCK_RADIUS = 0.35;
// Only the sliding-in sweeper (spawnLaser, SHAPE LIMBO's phase 2) uses this —
// the static gates spawnStaticLaser builds (CYBER ZOO's THE ESCAPE) set
// speed to 0 explicitly regardless. Slowed from 2.5: at that speed the full
// screen crossing (~5.1s) against SHAPE LIMBO's old 2.5s spawn interval kept
// ~2 beams sweeping in from opposite sides at once almost the whole phase —
// brutal for what's meant to be an early, still-learning-the-game level.
const SPEED = 1.8;
const BEAM_COLOR = 0xFF00D4;

// Maps a block's named slot to a -0.6..0/0/+0.6 cross-axis offset, shared by
// both orientations: 'up'/'left' are the same "negative" slot, 'down'/
// 'right' the same "positive" one, so either axis' three call sites can use
// whichever word actually reads right for their own sweep direction.
function slotOffset(pos) {
  return pos === 'up' || pos === 'left' ? -0.6 : pos === 'down' || pos === 'right' ? 0.6 : 0;
}

export class LaserWall {
  constructor(world, side, pos, opts = {}) {
    this.world = world;
    this.alive = true;
    this.beamOn = true;
    this.vertical = !!opts.vertical;
    this.pos = pos;

    if (!this.vertical) {
      // --- horizontal sweep (SHAPE LIMBO/CYBER ZOO): moves along x ---
      // Static gate (opts.x): stands still at a fixed x. Otherwise it slides
      // in from a side and crosses the screen (the phase-2 sweeper behaviour).
      if (opts.x != null) {
        this.dir = 0; this.speed = 0; this.x = opts.x; this.static = true;
      } else {
        this.dir = side === 'right' ? -1 : 1;   // right = enters from right, moves left
        this.x = -this.dir * (HALF_W + 1);
        this.speed = SPEED;
      }
      this.blockY = slotOffset(pos) * HALF_H;   // block rides up/middle/down
    } else {
      // --- vertical sweep (OUTER SPACE phase 3): moves along y ---
      if (opts.y != null) {
        this.dir = 0; this.speed = 0; this.y = opts.y; this.static = true;
      } else {
        this.dir = side === 'bottom' ? -1 : 1;   // bottom = enters from bottom, moves up
        this.y = -this.dir * (HALF_H + 1);
        this.speed = SPEED;
      }
      this.blockX = slotOffset(pos) * HALF_W;   // block rides left/middle/right
    }

    // --- beam visual: a thin band across the whole opposite axis, edges +
    // faint fill, no glow. Horizontal: tall and thin, edge-strokes on its
    // left/right. Vertical: wide and thin, edge-strokes on its top/bottom.
    this.beam = new PIXI.Graphics();
    if (!this.vertical) {
      const w = BEAM_W * PPU, h = (2 * HALF_H + 2) * PPU;
      this.beam.beginFill(BEAM_COLOR, 0.12).drawRect(-w / 2, -h / 2, w, h).endFill();
      this.beam.lineStyle({ width: 2, color: BEAM_COLOR, alpha: 1 });
      this.beam.moveTo(-w / 2, -h / 2).lineTo(-w / 2, h / 2);
      this.beam.moveTo(w / 2, -h / 2).lineTo(w / 2, h / 2);
    } else {
      const w = (2 * HALF_W + 2) * PPU, h = BEAM_W * PPU;
      this.beam.beginFill(BEAM_COLOR, 0.12).drawRect(-w / 2, -h / 2, w, h).endFill();
      this.beam.lineStyle({ width: 2, color: BEAM_COLOR, alpha: 1 });
      this.beam.moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2);
      this.beam.moveTo(-w / 2, h / 2).lineTo(w / 2, h / 2);
    }
    world.stage.addChild(this.beam);

    // opts.noBlock: a beam with no block, so nothing can drop it — the
    // tutorial's LINE SLASHER dash lesson, where slashing the block made the
    // dash pointless ("lazer in slasher tutorial can be destroyed which
    // making dashing useless").
    if (opts.noBlock) {
      this.blockArt = null; this.block = null;
      this.world.audio.play('laserM', 0.5);
      this.place();
      return;
    }

    // --- block: Cyan, killable, harmless to touch (the beam does the hurting) ---
    this.blockArt = buildSprite('LaserBlock', { scale: BLOCK_SIZE, lineWidth: 2 });
    world.stage.addChild(this.blockArt);

    this.block = new Hittable(world, {
      x: this.vertical ? this.blockX : this.x,
      y: this.vertical ? this.y : this.blockY,
      color: CYAN, radius: BLOCK_RADIUS,
      hurtsPlayer: false, countsAsProgress: true, destroySound: null,
      onDie: () => this.killBeam(),
    });

    this.world.audio.play(pos === 'up' || pos === 'left' ? 'laserU' : pos === 'down' || pos === 'right' ? 'laserD' : 'laserM', 0.5);
    this.place();
  }

  place() {
    if (this.beam && !this.beam.destroyed) {
      const [bx, by] = this.vertical ? toScreen(0, this.y) : toScreen(this.x, 0);
      this.beam.position.set(bx, by);
    }
    if (this.blockArt && !this.blockArt.destroyed) {
      const [kx, ky] = this.vertical ? toScreen(this.blockX, this.y) : toScreen(this.x, this.blockY);
      this.blockArt.position.set(kx, ky);
    }
  }

  killBeam() {
    this.beamOn = false;
    if (this.beam && !this.beam.destroyed) this.beam.visible = false;
    if (this.blockArt && !this.blockArt.destroyed) { this.blockArt.destroy({ children: true }); this.blockArt = null; }
    // block's Hittable stays flagged dead but in the list on the onDie path — drop it
    if (this.block) {
      const i = this.world.hittables.indexOf(this.block);
      if (i >= 0) this.world.hittables.splice(i, 1);
      this.block = null;
    }
    this.world.audio.play('destroyCyan', 0.6);
  }

  update(dt) {
    if (!this.vertical) {
      this.x += this.dir * this.speed * dt;
      if (this.block) this.block.x = this.x;
    } else {
      this.y += this.dir * this.speed * dt;
      if (this.block) this.block.y = this.y;
    }
    this.place();

    if (this.beamOn) this.touchPlayer();

    if (!this.static) {
      if (!this.vertical && (this.x < -HALF_W - 2 || this.x > HALF_W + 2)) this.destroy();
      if (this.vertical && (this.y < -HALF_H - 2 || this.y > HALF_H + 2)) this.destroy();
    }
  }

  touchPlayer() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    const b = p.hullBounds(), h = BEAM_W * 0.5;   // the ship's triangle against the beam band
    const hit = this.vertical ? b.y0 <= this.y + h && b.y1 >= this.y - h : b.x0 <= this.x + h && b.x1 >= this.x - h;
    if (hit) p.takeDamage(1);
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {
    const h = BEAM_W * 0.5;
    return { shapes: [this.vertical
      ? { rect: [-HALF_W - 1, this.y - h, HALF_W + 1, this.y + h] }
      : { rect: [this.x - h, -HALF_H - 1, this.x + h, HALF_H + 1] }] };
  }
  destroy() {
    this.alive = false;
    if (this.block && !this.block.dead) this.block.destroy();
    if (this.beam && !this.beam.destroyed) this.beam.destroy({ children: true });
    if (this.blockArt && !this.blockArt.destroyed) this.blockArt.destroy({ children: true });
  }
}

export function spawnLaser(world, side) {
  const pos = ['up', 'middle', 'down'][randInt(3)];
  world.add(new LaserWall(world, side, pos));
}

// A stationary laser wall at world-x `x`; shoot its cyan block to drop the beam.
export function spawnStaticLaser(world, x, pos, opts = {}) {
  world.add(new LaserWall(world, 'left', pos, { ...opts, x }));
}

// The vertical sweeper (OUTER SPACE phase 3): slides in from the top or
// bottom edge instead of a side, its block riding left/middle/right.
export function spawnVerticalLaser(world, side) {
  const pos = ['left', 'middle', 'right'][randInt(3)];
  world.add(new LaserWall(world, side, pos, { vertical: true }));
}
