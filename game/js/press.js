// press.js — Phase 3 hazard. A full-screen bar telegraphs where it will hit,
// then slams in from one edge, holds, and retracts. It isn't shootable (there's
// nothing to shoot) — it's a timing dodge. Magenta, like the other Purple hazards.
import { toScreen, PPU, HALF_W, HALF_H, SCREEN_W, SCREEN_H, rand, randInt } from './core.js';

const THICKNESS = 1;      // world units across the bar
const TELEGRAPH = 0.95, SLAM = 0.08, HOLD = 0.25, RETRACT = 0.5;
const COLOR = 0xFF00D4;

export class PressHazard {
  // opts.slow (>1) stretches the telegraph and the retract -- OUTER SPACE's
  // slower presses phase; SHAPE LIMBO passes nothing and is unchanged.
  constructor(world, dir, opts = {}) {
    this.world = world;
    const slow = opts.slow || 1;
    this.tele = TELEGRAPH * slow; this.retract = RETRACT * slow;
    this.alive = true;
    this.dir = dir;                    // 'top' | 'bottom' | 'left' | 'right'
    this.vertical = (dir === 'top' || dir === 'bottom');
    this.length = this.vertical ? 2 * HALF_H : 2 * HALF_W;

    if (this.vertical) {
      const ax = rand(-HALF_W * 0.85, HALF_W * 0.85);
      this.inX = ax; this.inY = 0;
      const off = HALF_H + this.length;
      this.outX = ax; this.outY = (dir === 'top') ? -off : off;
    } else {
      const ay = rand(-HALF_H * 0.85, HALF_H * 0.85);
      this.inX = 0; this.inY = ay;
      const off = HALF_W + this.length;
      this.outX = (dir === 'left') ? -off : off; this.outY = ay;
    }

    this.t = 0;
    this.dangerous = false;
    this.slammed = false;

    // one graphic reused for telegraph (faint) and the live bar (bright)
    const w = (this.vertical ? THICKNESS : this.length) * PPU;
    const h = (this.vertical ? this.length : THICKNESS) * PPU;
    this.bar = new PIXI.Graphics();
    this.bar.lineStyle({ width: 2, color: COLOR, alpha: 1 });
    this.bar.beginFill(COLOR, 0.25).drawRect(-w / 2, -h / 2, w, h).endFill();
    world.stage.addChild(this.bar);

    this.setPos(this.inX, this.inY);
    this.bar.alpha = 0.35;             // telegraph
  }

  setPos(x, y) { const [sx, sy] = toScreen(x, y); this.bar.position.set(sx, sy); }

  update(dt) {
    this.t += dt;
    const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));

    if (this.t < this.tele) {
      this.setPos(this.inX, this.inY); this.bar.alpha = 0.35;
      return;
    }
    let s = this.t - this.tele;
    if (!this.slammed) { this.slammed = true; this.dangerous = true; this.world.audio.play('press', 0.8); }
    this.bar.alpha = 1;

    if (s < SLAM) {                    // slam out -> in
      this.setPos(lerp(this.outX, this.inX, s / SLAM), lerp(this.outY, this.inY, s / SLAM));
    } else if (s < SLAM + HOLD) {      // hold
      this.setPos(this.inX, this.inY);
    } else if (s < SLAM + HOLD + this.retract) {  // retract in -> out
      const k = (s - SLAM - HOLD) / this.retract;
      this.setPos(lerp(this.inX, this.outX, k), lerp(this.inY, this.outY, k));
    } else {
      this.destroy(); return;
    }

    this.hurt();
  }

  hurt() {
    if (!this.dangerous) return;
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    // current bar centre in world units
    const cx = this.bar.position.x, cy = this.bar.position.y;
    const wx = (cx - SCREEN_W / 2) / PPU, wy = (cy - SCREEN_H / 2) / PPU;
    const hw = (this.vertical ? THICKNESS : this.length) / 2, hh = (this.vertical ? this.length : THICKNESS) / 2;
    if (p.touchesRect(wx - hw, wy - hh, wx + hw, wy + hh)) p.takeDamage(1);
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {
    const cx = (this.bar.position.x - SCREEN_W / 2) / PPU, cy = (this.bar.position.y - SCREEN_H / 2) / PPU;
    const hw = (this.vertical ? THICKNESS : this.length) / 2, hh = (this.vertical ? this.length : THICKNESS) / 2;
    return { shapes: [{ rect: [cx - hw, cy - hh, cx + hw, cy + hh] }] };
  }
  destroy() {
    this.alive = false;
    if (this.bar && !this.bar.destroyed) this.bar.destroy({ children: true });
  }
}

export function spawnPress(world, opts) {
  world.add(new PressHazard(world, ['top', 'bottom', 'left', 'right'][randInt(4)], opts));
}
