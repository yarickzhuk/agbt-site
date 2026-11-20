// delta.js — THE FINALE's last phase (6/6): DELTA, the player's own
// black-and-white double. Per direct request, with `Delta.sprite3`,
// `vs_Delta.wav`, two alert files, `Destroyed_Delta.wav` and a GIF for the
// backdrop: "Delta uses same weapons as you but they are black/white. They
// deal same damage as yours do (normal - 1, pellet - 2, charged - 3, fully
// charged - 10) but will move slower. He has 30 hp, but has immunity to
// penetration, has 50% damage resistance to charged shot (rounded to
// bigger) or pellets ... and after each hit he charges up and dashes at you
// then swing his version of line slasher (and before that he randomly spams
// ranged weapons). His weapon sounds will be the reversed versions of yours."
//
// The sprite itself is a thin skeleton like most uploads: one costume (a
// white triangle -- the player's own ship shape, `Delta.json`) and one
// script, `forever { create clone; wait 0.1 }` with each clone growing 10%
// and fading 10% a frame for 10 frames -- a trail of expanding afterimages,
// ported as DeltaTrail. Everything else is built from the brief:
//
//  - RANGED (his default): drifts around the arena keeping his distance and
//    every 0.5-1.2s picks one of the player's own ranged attacks at random
//    -- a 3-shot bullet burst (1 dmg each), a torpedo (3), a Cyber Shotgun
//    volley (3 pellets, 2 each), a charged Bouncy Ball (3, bounces off the
//    edges), or a Charge Cannon supercharge (10). Charged ones charge up
//    first for exactly as long as the player's own would (0.85s, +0.9s for
//    the supercharge), his ship glowing the same way the player's does, so
//    the 10-damage shot is always telegraphed. His shots fly at half the
//    player's speeds. They're white and outside the colour language -- not
//    Hittables, so they can't be shot down, only dodged.
//  - COUNTER: every hit that doesn't kill him cancels whatever he was doing:
//    he charges up (COUNTER_CHARGE), dashes at the player (slower than the
//    player's own dash), and swings his own LINE SLASHER (same 1.5 range,
//    ±60° arc, 1 damage), then recovers and goes back to ranged.
//  - DEFENCE: 100 HP in THE FINALE (ENDLESS MODE passes maxHp 30). "Immunity to penetration" -- `noPierce`, read by
//    bullet.js, so a charged shot or pellet stops on him instead of flying
//    on through. Charged hits (torpedo, pellet, charged ball, supercharge)
//    take half damage rounded up: 3->2, 2->1, 10->5; a plain bullet or a
//    SLASH (1) still does 1.
//
// His weapon sounds are the player's own, reversed at load time
// (Audio.reverse). A charged shot's reversed cue is scheduled so its end --
// the original's attack, now at the back -- lands on the instant he fires.
import { buildSprite, paletteColor } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H, SCREEN_W, SCREEN_H, rand, dist, clamp } from './core.js';
import { useSilhouette } from './silhouette.js';

export const MAX_HP = 100;   // THE FINALE; ENDLESS passes its own 30
const RADIUS = 0.45;
const SCALE = 1.4;
const ENTER_TIME = 1.2;           // fades in, untouchable
const MOVE_SPEED = 2.6;           // the player's is 7
const KEEP_AWAY = 3.2;            // ranged mode: where he picks his next spot
const BOUND_X = HALF_W - 0.8, BOUND_Y = HALF_H - 0.8;
const GAP_MIN = 0.5, GAP_MAX = 1.2;
const CHARGE_TIME = 0.85;                 // the player's CHARGE_TO_FULL
const SUPER_TIME = CHARGE_TIME + 0.9;     // + the player's SUPER_HOLD_TIME
const SHOTGUN_WINDUP = 0.3;
const BURST_SHOTS = 3, BURST_GAP = 0.18;
// half the player's own projectile speeds (bullet.js SPEED 14, pellets 20,
// Bouncy Ball MAX_SPEED 18)
const SHOT_SPEED = 7, PELLET_SPEED = 10, BALL_SPEED = 9;
const SHOTGUN_ARC = 0.3;
const BALL_LIFE = 4;
const DMG = { bullet: 1, pellet: 2, torpedo: 3, ball: 3, super: 10 };
const WEAPONS = [['bullet', 3], ['torpedo', 2.5], ['shotgun', 2], ['bouncy', 1.5], ['super', 1]];

const COUNTER_CHARGE = 0.6;
const DASH_SPEED = 11;            // the player's dash is 16
const DASH_MAX = 0.5, DASH_STOP = 1.0;
const SLASH_RANGE = 1.5, SLASH_ARC = 60 * Math.PI / 180, SLASH_DAMAGE = 1;
const RECOVER = 0.5;
const GHOST_GAP = 0.03;
const TRAIL_GAP = 0.1, TRAIL_LIFE = 0.33;   // the source's 10 frames at Scratch's 30fps
const HIT_FLASH = 0.12;
const HIT_SCORE = 100, DEFEAT_SCORE = 2000;

const REVERSED = ['shoot', 'torpedo', 'chargeFull', 'chargeStart', 'shotgunFire',
                  'bouncyShoot', 'bouncyBounce', 'slasherSlash', 'slasherDash'];

// Charged hits take half, rounded up; a 1-damage hit stays 1.
export function deltaDamage(dmg) { return dmg <= 1 ? dmg : Math.ceil(dmg / 2); }

function pickWeapon() {
  const total = WEAPONS.reduce((s, w) => s + w[1], 0);
  let r = Math.random() * total;
  for (const [k, w] of WEAPONS) { if ((r -= w) <= 0) return k; }
  return 'bullet';
}

function whiteSprite(shape, scale, lineWidth = 2) {
  return buildSprite(shape, { lineWidth, scale, tint: 0xffffff });
}

// One of Delta's projectiles -- white, unshootable, touch-hurts for `dmg`.
class DeltaShot {
  constructor(world, x, y, dir, { speed, dmg, shape, scale, radius, bounce = false, life = 4 }) {
    this.world = world;
    this.x = x; this.y = y;
    this.vx = dir.x * speed; this.vy = dir.y * speed;
    this.dmg = dmg; this.radius = radius; this.bounce = bounce; this.life = life;
    this.alive = true;
    this.container = whiteSprite(shape, scale);
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.rotation = Math.atan2(dir.y, dir.x);
    this.container.zIndex = 9;
    world.stage.addChild(this.container);
    this.place();
  }
  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.bounce) {
      let hit = false;
      if (this.x < -HALF_W) { this.x = -HALF_W; this.vx = Math.abs(this.vx); hit = true; }
      else if (this.x > HALF_W) { this.x = HALF_W; this.vx = -Math.abs(this.vx); hit = true; }
      if (this.y < -HALF_H) { this.y = -HALF_H; this.vy = Math.abs(this.vy); hit = true; }
      else if (this.y > HALF_H) { this.y = HALF_H; this.vy = -Math.abs(this.vy); hit = true; }
      if (hit) this.world.audio.play('bouncyBounceRev', 0.5);
    }
    this.place();
    const p = this.world.player;
    if (p && !p.dead && !p.invulnerable && this.touches(p)) {
      p.takeDamage(this.dmg);
      this.destroy();
      return;
    }
    if (this.life <= 0 ||
        (!this.bounce && (this.x < -HALF_W - 1 || this.x > HALF_W + 1 || this.y < -HALF_H - 1 || this.y > HALF_H + 1))) {
      this.destroy();
    }
  }
  destroy() {
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// A fading copy of his ship: the source's growing/fading clone trail
// (scale up 10%/frame, ghost +10%/frame), and his dash's afterimages.
class DeltaGhost {
  constructor(world, x, y, rot, scale, { life, grow, alpha }) {
    this.alive = true; this.t = 0; this.life = life; this.grow = grow; this.alpha0 = alpha; this.s0 = scale;
    this.container = whiteSprite('Delta', 1);
    this.container.rotation = rot;
    this.container.zIndex = 8;
    const [sx, sy] = toScreen(x, y);
    this.container.position.set(sx, sy);
    this.container.scale.set(scale);
    this.container.alpha = alpha;
    world.stage.addChild(this.container);
  }
  update(dt) {
    this.t += dt;
    const k = Math.min(1, this.t / this.life);
    this.container.scale.set(this.s0 * (1 + this.grow * k));
    this.container.alpha = this.alpha0 * (1 - k);
    if (k >= 1) this.destroy();
  }
  destroy() {
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// One fading segment of his slash arc (pure visual, like lineslasher.js's).
class DeltaSlashSegment {
  constructor(world, x, y, angle) {
    this.alive = true; this.t = 0;
    this.container = whiteSprite('LineSlash', 1, 3);
    this.container.rotation = angle;
    this.container.zIndex = 9;
    const [sx, sy] = toScreen(x, y);
    this.container.position.set(sx, sy);
    world.stage.addChild(this.container);
  }
  update(dt) {
    this.t += dt;
    this.container.alpha = Math.max(0, 1 - this.t / 0.16);
    if (this.t >= 0.16) this.destroy();
  }
  destroy() {
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

export class DeltaBoss extends Hittable {
  constructor(world, { onDefeated, maxHp = MAX_HP } = {}) {
    super(world, { x: 0, y: -2.6, color: CYAN, radius: RADIUS, countsAsProgress: false, hurtsPlayer: false });
    this.isBoss = true;   // a supercharged shot stops on it instead of piercing (bullet.js)
    this.world = world;
    this.onDefeated = onDefeated || null;
    this.noPierce = true;      // bullet.js: charged shots/pellets stop on him
    this.hp = maxHp;
    this.alive = true;
    this.defeated = false;
    this.mode = 'enter';
    this.t = 0;
    this.time = 0;
    this.facing = { x: 0, y: 1 };
    this.target = null;
    this.gapT = 1.0;
    this.attack = null;
    this.trailT = 0;
    this.flash = 0;
    this.pending = [];   // scheduled reversed sounds, cut if an attack is cancelled

    REVERSED.forEach(n => world.audio.reverse && world.audio.reverse(n));

    this.container = new PIXI.Container();
    this.container.zIndex = 10;
    this.art = whiteSprite('Delta', 1);
    this.glow = whiteSprite('Delta', 1);
    this.glow.children.forEach(c => { c.blendMode = PIXI.BLEND_MODES.ADD; });
    this.glow.alpha = 0;
    this.container.addChild(this.art, this.glow);
    world.stage.addChild(this.container);
    this.place();
  }

  canBeDestroyedBy() { return this.mode !== 'enter' && !this.dead; }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = Math.atan2(this.facing.y, this.facing.x);
    let s = SCALE, glow = 0;
    const charge = this.chargeLevel();
    if (charge > 0) { glow = Math.min(1, charge) * 0.7; s *= charge >= 1 ? 1.15 : 1; }
    if (charge >= 2) { glow = 0.85 + Math.sin(this.time * 10) * 0.15; s = SCALE * 1.3; }
    this.container.scale.set(s);
    this.glow.alpha = glow;
    this.art.tint = this.flash > 0 ? 0x666666 : 0xffffff;
    this.container.alpha = this.mode === 'enter' ? Math.min(1, this.t / ENTER_TIME) : 1;
  }

  // 0 = idle, 0..1 = charging, 1 = full, 1..2 = supercharging, 2 = ready
  chargeLevel() {
    if (this.mode === 'counterCharge') return this.t / COUNTER_CHARGE;
    const a = this.attack;
    if (!a || !a.charge) return 0;
    if (a.t < CHARGE_TIME) return a.t / CHARGE_TIME;
    if (a.kind !== 'super') return 1;
    return 1 + Math.min(1, (a.t - CHARGE_TIME) / (SUPER_TIME - CHARGE_TIME));
  }

  aimAt(p) {
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  update(dt) {
    if (this.dead) return;
    const p = this.world.player;
    this.t += dt;
    this.time += dt;
    if (this.flash > 0) this.flash -= dt;

    // the source's own trail: a growing, fading clone every 0.1s
    this.trailT += dt;
    if (this.trailT >= TRAIL_GAP && this.mode !== 'enter') {
      this.trailT = 0;
      this.world.add(new DeltaGhost(this.world, this.x, this.y, Math.atan2(this.facing.y, this.facing.x),
                                    SCALE, { life: TRAIL_LIFE, grow: 1, alpha: 0.45 }));
    }

    if (p && !p.dead && this.mode !== 'dash') this.facing = this.aimAt(p);

    if (this.mode === 'enter') {
      if (this.t >= ENTER_TIME) { this.mode = 'ranged'; this.t = 0; }
    } else if (this.mode === 'ranged') {
      this.updateRanged(dt);
    } else if (this.mode === 'counterCharge') {
      if (this.t >= COUNTER_CHARGE && p) {
        this.mode = 'dash'; this.t = 0; this.ghostT = 0;
        this.dashDir = this.aimAt(p);
        this.facing = this.dashDir;
      }
    } else if (this.mode === 'dash') {
      this.x = clamp(this.x + this.dashDir.x * DASH_SPEED * dt, -BOUND_X, BOUND_X);
      this.y = clamp(this.y + this.dashDir.y * DASH_SPEED * dt, -BOUND_Y, BOUND_Y);
      this.ghostT += dt;
      if (this.ghostT >= GHOST_GAP) {
        this.ghostT = 0;
        this.world.add(new DeltaGhost(this.world, this.x, this.y, Math.atan2(this.dashDir.y, this.dashDir.x),
                                      SCALE, { life: 0.25, grow: 0, alpha: 0.5 }));
      }
      if (!p || this.t >= DASH_MAX || dist(this.x, this.y, p.x, p.y) <= DASH_STOP) this.slash();
    } else if (this.mode === 'recover') {
      if (this.t >= RECOVER) { this.mode = 'ranged'; this.t = 0; this.gapT = rand(GAP_MIN, GAP_MAX); }
    }
    this.place();
  }

  updateRanged(dt) {
    const p = this.world.player;
    // drift to a spot away from the player (slower while charging a shot)
    if (!this.target || dist(this.x, this.y, this.target.x, this.target.y) < 0.2 || (this.retarget -= dt) <= 0) {
      this.pickTarget();
    }
    const speed = MOVE_SPEED * (this.attack && this.attack.charge ? 0.5 : 1);
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) {
      const step = Math.min(d, speed * dt);
      this.x += dx / d * step; this.y += dy / d * step;
    }

    if (!this.attack) {
      this.gapT -= dt;
      if (this.gapT <= 0) this.startAttack(pickWeapon());
      return;
    }
    const a = this.attack;
    a.t += dt;
    if (a.kind === 'bullet') {
      while (a.fired < BURST_SHOTS && a.t >= a.fired * BURST_GAP) { this.fire('bullet', p); a.fired++; }
      if (a.fired >= BURST_SHOTS) this.endAttack();
    } else if (a.t >= a.charge) {
      this.fire(a.kind, p);
      this.endAttack();
    }
  }

  pickTarget() {
    const p = this.world.player;
    let tx = 0, ty = 0;
    for (let i = 0; i < 12; i++) {
      tx = rand(-BOUND_X, BOUND_X); ty = rand(-BOUND_Y, BOUND_Y);
      if (!p || dist(tx, ty, p.x, p.y) >= KEEP_AWAY) break;
    }
    this.target = { x: tx, y: ty };
    this.retarget = rand(1.5, 3);
  }

  // Plays a reversed cue so it ends exactly `lead` seconds from now (when
  // the shot it belongs to fires) -- a reversed sound's own peak is at its end.
  cueEndingIn(name, lead, vol = 0.6) {
    const audio = this.world.audio;
    const dur = audio.duration ? audio.duration(name) : 0;
    if (!dur) return;
    const now = audio.now();
    const src = audio.play(name, vol, now + Math.max(0, lead - dur), Math.max(0, dur - lead));
    if (src) this.pending.push(src);
  }

  startAttack(kind) {
    const charge = { bullet: 0, shotgun: SHOTGUN_WINDUP, torpedo: CHARGE_TIME, bouncy: CHARGE_TIME, super: SUPER_TIME }[kind];
    this.attack = { kind, t: 0, charge, fired: 0 };
    this.pending = [];
    if (kind === 'torpedo' || kind === 'bouncy' || kind === 'super') {
      this.world.audio.play('chargeStartRev', 0.5);
      if (kind === 'super') this.cueEndingIn('chargeFullRev', charge);
    }
  }

  endAttack() {
    this.attack = null;
    this.pending = [];
    this.gapT = rand(GAP_MIN, GAP_MAX);
  }

  cancelAttack() {
    for (const src of this.pending) { try { src.stop(); } catch (e) {} }
    this.pending = [];
    this.attack = null;
  }

  fire(kind, p) {
    if (!p || p.dead) return;
    const w = this.world;
    const dir = this.aimAt(p);
    const mx = this.x + dir.x * 0.55, my = this.y + dir.y * 0.55;
    if (kind === 'bullet') {
      w.add(new DeltaShot(w, mx, my, dir, { speed: SHOT_SPEED, dmg: DMG.bullet, shape: 'Bullet', scale: 0.9, radius: 0.1 }));
      w.audio.play('shootRev', 0.6);
    } else if (kind === 'torpedo') {
      w.add(new DeltaShot(w, mx, my, dir, { speed: SHOT_SPEED, dmg: DMG.torpedo, shape: 'Torpedo', scale: 1, radius: 0.12 }));
      w.audio.play('torpedoRev', 0.6);
    } else if (kind === 'super') {
      w.add(new DeltaShot(w, mx, my, dir, { speed: SHOT_SPEED, dmg: DMG.super, shape: 'Hadouken', scale: 1.2, radius: 0.18 }));
    } else if (kind === 'shotgun') {
      const base = Math.atan2(dir.y, dir.x);
      for (let i = 0; i < 3; i++) {
        const a = base + (i - 1) * (SHOTGUN_ARC / 2);
        const d = { x: Math.cos(a), y: Math.sin(a) };
        w.add(new DeltaShot(w, mx, my, d, { speed: PELLET_SPEED, dmg: DMG.pellet, shape: 'Torpedo', scale: 0.55, radius: 0.08 }));
      }
      w.audio.play('shotgunFireRev', 0.6);
    } else if (kind === 'bouncy') {
      w.add(new DeltaShot(w, mx, my, dir, { speed: BALL_SPEED, dmg: DMG.ball, shape: 'BouncyBall', scale: 1, radius: 0.18, bounce: true, life: BALL_LIFE }));
      w.audio.play('bouncyShootRev', 0.6);
    }
  }

  // A hit (bullet.js/bouncyball.js/lineslasher.js all land here).
  die(dmg = 1) {
    if (this.dead || this.mode === 'enter') return;
    const d = deltaDamage(dmg);
    this.hp = Math.max(0, this.hp - d);
    this.flash = HIT_FLASH;
    this.world.addScore(HIT_SCORE);
    if (this.hp <= 0) { this.defeat(); return; }
    this.world.audio.play('bossHurt', 0.6);
    if (this.mode === 'ranged') this.startCounter();
  }

  startCounter() {
    this.cancelAttack();
    this.mode = 'counterCharge'; this.t = 0;
    this.world.audio.play('chargeStartRev', 0.5);
    this.cueEndingIn('slasherDashRev', COUNTER_CHARGE, 0.7);
  }

  slash() {
    const w = this.world, p = w.player;
    if (p && !p.dead) this.facing = this.aimAt(p);
    const base = Math.atan2(this.facing.y, this.facing.x);
    this.lastSlashBase = base;   // deathreveal.js draws this swing's arc
    if (p && !p.dead) {
      // the ship's triangle against the swing's fan (a pie slice)
      const fan = [[this.x, this.y]];
      for (let i = 0; i <= 12; i++) {
        const a = base - SLASH_ARC + (i / 12) * 2 * SLASH_ARC;
        fan.push([this.x + Math.cos(a) * SLASH_RANGE, this.y + Math.sin(a) * SLASH_RANGE]);
      }
      if (p.touchesPoly(fan)) p.takeDamage(SLASH_DAMAGE, this);
    }
    w.audio.play('slasherSlashRev', 0.6);
    const x = this.x, y = this.y;
    for (let i = 0; i < 6; i++) {
      const angle = base - SLASH_ARC + (i / 5) * 2 * SLASH_ARC;
      w.wait(i * 0.036).then(() => { if (!this.dead) w.add(new DeltaSlashSegment(w, x, y, angle)); });
    }
    this.mode = 'recover'; this.t = 0;
  }

  defeat() {
    this.defeated = true;
    this.world.addScore(DEFEAT_SCORE);
    this.destroy();
    if (this.onDefeated) this.onDefeated();
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {   // his SLASH: SLASH_RANGE, +-SLASH_ARC around where he swung
    const b = this.lastSlashBase || 0;
    return { shapes: [{ wedge: [this.x, this.y, SLASH_RANGE, b - SLASH_ARC, b + SLASH_ARC] }] };
  }
  destroy() {
    if (this.alive === false && this.dead) return;
    this.cancelAttack();
    this.alive = false;
    this.dead = true;
    this.world.audio.stopLoop('deltaTheme', 0.3);
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// The phase's backdrop: the uploaded GIF, a grey wireframe HYPERSPHERE (a
// 3-sphere -- the 4D sphere, kin to phases 2-5's rotating 4D polytopes)
// turning in 4D, seen as its shadow in 3D and then on screen. It arrived as
// a single still frame, so it's rebuilt here as a real 4D rotation matched
// to that frame: three families of circles on the 3-sphere --
//   - latitude rings across the whole width (fixed y, in the x-z plane),
//   - upright rings at fixed x (in the y-w plane) -- the slices whose width
//     breathes as the 4D rotation swings w into view,
//   - great circles through the left/right poles (in the x-y-w space),
// rotated in the z-w plane, w dropped, then viewed turned slightly toward
// the viewer; plus the outline and the centre cross from the frame. Every
// line is drawn front and back like the source. Runs on its own ticker
// step (not world.add), the same way the starfield does, so clearing the
// field never wipes it.
const SPHERE_R = 330;          // px -- the GIF's sphere fills its frame
const SPHERE_YAW = 0.2;        // radians the view is turned toward the viewer
const SPHERE_PITCH = 0.18;     // and tipped down, so the latitude rings bow like the GIF's
const SPHERE_SPIN = 0.35;      // radians/s, the z-w rotation
const LATITUDES = [-0.85, -0.6, -0.33, 0, 0.33, 0.6, 0.85];   // as y
const RINGS = [-0.88, -0.5, 0.5, 0.88];                       // as x
const POLE_CIRCLES = 6;
const SEG = 64;

export class SphereBackdrop {
  constructor(world) {
    this.world = world;
    this.angle = 0.6;
    this.g = new PIXI.Graphics();
    this.g.zIndex = -6;
    this.g.position.set(SCREEN_W / 2, SCREEN_H / 2);
    world.stage.addChild(this.g);
    this.draw();
  }
  // a point on the 3-sphere -> rotate in z-w -> drop w -> view -> screen px
  project(x, y, z, w) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const z3 = z * c - w * s;
    const cy = Math.cos(SPHERE_YAW), sy = Math.sin(SPHERE_YAW);
    const depth = -x * sy + z3 * cy;
    const cp = Math.cos(SPHERE_PITCH), sp = Math.sin(SPHERE_PITCH);
    return [(x * cy + z3 * sy) * SPHERE_R, -(y * cp - depth * sp) * SPHERE_R];
  }
  curve(fn) {
    const g = this.g;
    for (let i = 0; i <= SEG; i++) {
      const [px, py] = fn(i / SEG * Math.PI * 2);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
  }
  draw() {
    const g = this.g;
    g.clear();
    g.lineStyle(1.5, 0x9a9a9a, 0.3);
    g.drawCircle(0, 0, SPHERE_R);
    for (const y0 of LATITUDES) {
      const r = Math.sqrt(1 - y0 * y0);
      this.curve(t => this.project(r * Math.cos(t), y0, r * Math.sin(t), 0));
    }
    for (const x0 of RINGS) {
      const r = Math.sqrt(1 - x0 * x0);
      this.curve(t => this.project(x0, r * Math.cos(t), 0, r * Math.sin(t)));
    }
    for (let k = 0; k < POLE_CIRCLES; k++) {
      const a = (k + 0.5) * Math.PI / POLE_CIRCLES;
      this.curve(t => this.project(Math.cos(t), Math.sin(t) * Math.cos(a), 0, Math.sin(t) * Math.sin(a)));
    }
    g.moveTo(0, -SPHERE_R); g.lineTo(0, SPHERE_R);
    g.moveTo(-SPHERE_R, 0); g.lineTo(SPHERE_R, 0);
  }
  update(dt) { this.angle += SPHERE_SPIN * dt; this.draw(); }
  destroy() { if (!this.g.destroyed) this.g.destroy(); }
}

export function startSphereBackdrop(world) {
  const sphere = new SphereBackdrop(world);
  const step = () => {
    if (world.paused) return;
    sphere.update(Math.min(world.app.ticker.deltaMS / 1000, 0.05));
  };
  world.app.ticker.add(step);
  return () => { world.app.ticker.remove(step); sphere.destroy(); };
}
