// bombshield.js — the CYBER SHOTGUN's charged action, the BOMB SHIELD, from
// the author's own Bomb_Shield.sprite3 (per direct request: "Charge action
// for cyber shotgun that creates shield on release. Shield can block any
// attack but blocking purple/pink will consume one of spheres. Move to throw
// shield forward. Each sphere deals 2 damage and it may penetrate purple or
// pink, it gets consumed by cyan or dark blue, so max effective damage is
// 12... if you don't lose them all").
//
// The source: hold Z, and on release after round(timer) > 1 (≥1.5s) six
// clones of a small yellow dot spawn on the player, each spinning 10°/frame
// around it (the dot's costume is drawn off its rotation centre, so turning
// orbits it); the moment an arrow key is pressed the clones vanish and the
// main sprite flies off that way (8-way) as the same six dots in a ring
// (Spin1–4), 10 steps a frame, until it reaches the edge. Its charge-up
// costume (a ring) isn't used, per direct follow-up ("Don't use ring"): the
// six dots fade in around the ship as the charge builds instead
// (`drawChargePreview`).
//
// Rules on top of that:
// - ORBITING, the shield blocks any hit the player takes (player.js's
//   takeDamage asks `blockHit`): the hit is cancelled and one sphere is
//   used up, with a short grace window so one contact doesn't eat them all.
// - Any sphere, orbiting or thrown, that touches something a charged shot
//   could kill (cyan or dark blue, the world.boss slot too) deals it
//   SPHERE_DAMAGE (2) and is used up. Purple/pink things it just passes.
// - Moving throws it, in the way the player moves; thrown, it no longer
//   protects the player and is gone at the screen edge.
// - Gone once its last sphere is used up. Only one out at a time.
import { toScreen, HALF_W, HALF_H, PPU, playerHit, playerBossHit } from './core.js';
import { paletteColor } from './retro.js';

export const SHIELD_CHARGE = 1.5;   // s of hold (the source's round(timer) > 1)
const SPHERES = 6;
export const SPHERE_DAMAGE = 2;
// First-pass sizes: the source's orbit (~13 Scratch units ≈ 0.37 wu) sits
// right on the ship's own hitbox, so it's widened to read as a shield.
export const ORBIT_R = 0.65;
const SPHERE_R = 0.11;               // the dot (3.9 Scratch units across), a touch bigger
const OUTLINE_W = 2;                 // stroke width in px, like the shape art
const SPIN = 300 * Math.PI / 180;    // 10° a frame at Scratch's 30fps
const THROW_SPEED = 8.3;             // 10 steps a frame at 30fps, in world units/s
const BLOCK_GRACE = 0.4;             // s of invulnerability after a block

export class BombShield {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.x = player.x; this.y = player.y;
    this.state = 'orbit';
    this.angle = 0;
    this.alive = SPHERES;
    this.slots = Array.from({ length: SPHERES }, () => true);   // which spheres are still there
    this.vx = 0; this.vy = 0;
    this.g = new PIXI.Graphics();
    this.g.zIndex = 4;
    world.stage.addChild(this.g);
    world.playerShield = this;
    world.audio.loop('shieldSpin', 0.9);   // spins the whole time it's out, orbiting or thrown
    this.draw();
  }

  // The spheres' world positions (only the ones still there).
  spheres() {
    const out = [];
    for (let i = 0; i < SPHERES; i++) {
      if (!this.slots[i]) continue;
      const a = this.angle + i * 2 * Math.PI / SPHERES;
      out.push({ i, x: this.x + Math.cos(a) * ORBIT_R, y: this.y + Math.sin(a) * ORBIT_R });
    }
    return out;
  }

  consume(i) {
    if (!this.slots[i]) return;
    this.slots[i] = false;
    this.alive--;
    this.world.audio.play('shieldConsumed', 0.8);
    if (this.alive <= 0) this.destroy();
  }

  // player.js's takeDamage: an orbiting shield takes the hit for the player.
  blockHit() {
    if (this.dead || this.state !== 'orbit') return false;
    const s = this.spheres()[0];
    if (!s) return false;
    this.player.invulnUntil = this.player.time + BLOCK_GRACE;
    this.consume(s.i);
    return true;
  }

  update(dt) {
    if (this.dead) return;
    const p = this.player;
    if (this.state === 'orbit') {
      if (p.dead) { this.destroy(); return; }
      this.x = p.x; this.y = p.y;
      if (p.isMoving) {   // move to throw it, the way you're moving
        const len = Math.hypot(p.facing.x, p.facing.y) || 1;
        this.vx = p.facing.x / len * THROW_SPEED;
        this.vy = p.facing.y / len * THROW_SPEED;
        this.state = 'thrown';
        this.world.audio.play('slasherDash', 0.5);
      }
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (Math.abs(this.x) > HALF_W + ORBIT_R || Math.abs(this.y) > HALF_H + ORBIT_R) { this.destroy(); return; }
    }
    this.angle += SPIN * dt;
    this.hitThings();
    if (!this.dead) this.draw();
  }

  // A sphere touching something a charged shot could kill deals it 2 and is
  // used up; anything else (purple, pink) it just passes.
  hitThings() {
    const w = this.world;
    for (const s of this.spheres()) {
      if (w.boss && w.boss.tryHit && playerBossHit(w, w.boss, s.x, s.y, true, SPHERE_DAMAGE)) {
        this.consume(s.i);
        if (this.dead) return;
        continue;
      }
      for (let k = w.hittables.length - 1; k >= 0; k--) {
        const h = w.hittables[k];
        if (!h || h.dead || !h.canBeDestroyedBy(true)) continue;
        const within = h.hitTest ? h.hitTest(s.x, s.y, SPHERE_R)
          : Math.hypot(h.x - s.x, h.y - s.y) <= (h.radius || 0) + SPHERE_R;
        if (!within) continue;
        playerHit(w, h, SPHERE_DAMAGE);
        this.consume(s.i);
        break;
      }
      if (this.dead) return;
    }
  }

  draw() {
    const g = this.g;
    g.clear();
    // Outlined, not filled, like every other shape in the game.
    g.lineStyle(OUTLINE_W, paletteColor('hull'), 1);
    for (const s of this.spheres()) {
      const [sx, sy] = toScreen(s.x, s.y);
      g.drawCircle(sx, sy, SPHERE_R * PPU);
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    if (this.world.playerShield === this) this.world.playerShield = null;
    this.world.audio.stopLoop('shieldSpin');
    this.g.destroy();
    const i = this.world.updatables.indexOf(this);
    if (i >= 0) this.world.updatables.splice(i, 1);
  }
}

// The charge preview: the six spheres fading in around the ship as the
// charge builds (no ring), turning the way the shield will. `g` is a child
// of the ship's own container, so it's drawn in the ship's local pixels with
// the container's rotation and scale-pop taken back out.
export function drawChargePreview(g, player, ratio, rotation, scale) {
  g.clear();
  if (ratio <= 0) return;
  const ready = ratio >= 1;
  const alpha = ready ? 0.75 + Math.sin(player.time * 10) * 0.25 : ratio * 0.6;
  const r = ORBIT_R * PPU / scale, dot = SPHERE_R * PPU / scale;
  g.lineStyle(OUTLINE_W / scale, paletteColor('hull'), alpha);
  const count = ready ? SPHERES : Math.max(1, Math.floor(ratio * SPHERES));
  for (let i = 0; i < count; i++) {
    const a = player.time * SPIN + i * 2 * Math.PI / SPHERES - rotation;
    g.drawCircle(Math.cos(a) * r, Math.sin(a) * r, dot);
  }
}
