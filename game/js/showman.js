// showman.js — CRAZY CARNIVAL's boss, "Cruel Clownhouse". Ported from the
// author's own Scratch prototype (Boss — Cruel Clownhouse.sb3): a maze
// intro (pop 5 "Clown Target" sprites with the Bouncy Ball before a ~30s
// timer runs out, dodging solid maze walls the whole time) followed by the
// actual duel against "Showman", a 15-HP stationary target guarded by a
// shrinking "Force field" border.
//
// The source project is a very thin skeleton (most of its scripts are just
// "show, wait until touching X, hide" one-liners) — same situation as
// corn.js/firework.js/clown.js's own Scratch sources elsewhere in this
// level, so the actual fight is built from the brief on top of that
// skeleton, the same way those were.
//
// Showman never moves (no such script in the source). Touching him costs
// TOUCH_DAMAGE, per direct report ("you don't take damage from cyan
// showman"); the real pressure is still the shrinking Force field
// (forcefield.js). He's a plain CYAN Hittable (any shot registers, matching the
// source's lack of a colour-gated hit check) — you just have to land 15 of
// them before the field closes in. Touching it costs 1 HP and sends the
// whole encounter back to the maze intro (level3.js's phase5 owns that
// reset loop) rather than just refilling his HP.
import { buildSprite, paletteColor } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H } from './core.js';
import { useSilhouette } from './silhouette.js';

export const MAX_HP = 15;
const TOUCH_DAMAGE = 1;   // contact, like any other touch-hurt hazard (first-pass)

// The Cruel Clownhouse maze. It used to be the source backdrop's own 11
// freestanding purple bars with no outer border -- reported directly as
// "way too easy cuz of the lack of borders, you can just bypass the maze
// entirely", since the player could walk around every bar. Replaced with a
// real maze: an 8x6 grid of ~1.5-unit cells inside a solid border, carved
// once by a seeded depth-first search (a fixed layout, not re-rolled per
// play), with walls merged into straight runs. Its seed was picked for the
// longest shortest-route through all 5 targets (70 cells, ~15s of pure
// walking from the start), and each target sits at a dead end.
// Corridors are ~1.28 units clear -- well over twice the player's (old) 0.35
// hitRadius and roomy for a 0.4-radius ClownTarget.
export const MAZE_START = { x: -0.75, y: 3.66 };

// The 5 Clown Targets, one per dead end (cell centres).
export const TARGET_POSITIONS = [
  { x: 5.25, y: 3.66 },
  { x: -5.25, y: -2.24 },
  { x: 0.75, y: 0.71 },
  { x: 2.25, y: -2.24 },
  { x: 5.25, y: -3.71 },
];

// Border (first 4) + internal walls, world units, y down.
export const MAZE_WALLS = [
  { x0: -6.1, x1: 6.1, y0: -4.55, y1: -4.35 },
  { x0: -6.1, x1: 6.1, y0: 4.3, y1: 4.5 },
  { x0: -6.1, x1: -5.9, y0: -4.55, y1: 4.5 },
  { x0: 5.9, x1: 6.1, y0: -4.55, y1: 4.5 },
  { x0: -4.6, x1: -4.4, y0: -3.075, y1: -1.4 },
  { x0: -4.6, x1: -4.4, y0: -0.125, y1: 3.025 },
  { x0: -3.1, x1: -2.9, y0: -4.55, y1: 0.075 },
  { x0: -3.1, x1: -2.9, y0: 1.35, y1: 4.5 },
  { x0: -1.6, x1: -1.4, y0: -3.075, y1: 1.55 },
  { x0: -0.1, x1: 0.1, y0: -3.075, y1: 4.5 },
  { x0: 1.4, x1: 1.6, y0: -4.55, y1: -1.4 },
  { x0: 1.4, x1: 1.6, y0: -0.125, y1: 1.55 },
  { x0: 2.9, x1: 3.1, y0: -3.075, y1: 0.075 },
  { x0: 4.4, x1: 4.6, y0: -0.125, y1: 1.55 },
  { x0: 4.4, x1: 6.1, y0: -3.075, y1: -2.875 },
  { x0: -6.1, x1: -4.4, y0: -1.6, y1: -1.4 },
  { x0: 1.4, x1: 4.6, y0: -1.6, y1: -1.4 },
  { x0: -4.6, x1: -2.9, y0: -0.125, y1: 0.075 },
  { x0: -0.1, x1: 1.6, y0: -0.125, y1: 0.075 },
  { x0: -3.1, x1: -1.4, y0: 1.35, y1: 1.55 },
  { x0: 1.4, x1: 4.6, y0: 1.35, y1: 1.55 },
  { x0: -1.6, x1: 0.1, y0: 2.825, y1: 3.025 },
  { x0: 1.4, x1: 6.1, y0: 2.825, y1: 3.025 },
];

export class Showman extends Hittable {
  // `allPopped`: true if all 5 Clown Targets were popped before the maze
  // timer ran out. Then he's cyan (`ring`) and any shot lands. Otherwise
  // he's **shielded**: tinted orange (`amber`) and immune to everything --
  // shots break on him, the SLASH, dash, Bomb Shield and Bouncy Ball do
  // nothing, aim assist ignores him. The only way to get a hittable
  // Showman is to let the Force field send you back to the maze and pop
  // all 5 this time (per direct request: "is showman unshootable when red?
  // If no, fix it (and also change it from red to orange)"). The warning
  // tint used to be `grape`, then `blood` (red), with no gameplay effect.
  // `opts.x`/`opts.y`/`opts.maxHp`/`opts.scale` let a caller reuse this same
  // class for a differently-placed, differently-tough, differently-sized
  // encounter without a subclass — added for OUTER SPACE's own "Showman's
  // Delta Maze" (Stage 2), which plants a second, weaker (10 HP, vs. this
  // fight's own 15) and much smaller Showman at a maze's exit rather than
  // screen centre. `scale` drives both the visual size and the collision
  // `radius` together (the same "visual and hitbox stay locked together"
  // rule this game's other scaled shapes already follow, e.g. TrapWheel's
  // own weak sector) — a caller that wants him small enough to actually
  // stand inside a maze cell just passes a smaller `scale`, nothing else
  // needs separate tuning. All four default to this fight's own original
  // values, so CRAZY CARNIVAL's call site (`new Showman(w, allPopped)`) is
  // bit-for-bit unaffected.
  constructor(world, allPopped, opts = {}) {
    const x = opts.x || 0, y = opts.y || 0;
    const scale = opts.scale || 1.3;
    super(world, { x, y, color: CYAN, radius: scale, damage: TOUCH_DAMAGE, countsAsProgress: false });
    this.isBoss = true;   // a supercharged shot stops on it instead of piercing (bullet.js)
    this.world = world;
    this.hp = opts.maxHp || MAX_HP;
    this.flashT = 0;
    this.alive = true;
    this.shielded = !allPopped;

    this.container = buildSprite('Showman', {
      scale, lineWidth: scale < 1 ? 2 : 3,
      tint: paletteColor(allPopped ? 'ring' : 'amber'),
      // opts.mustache: a palette role for the two moustache capsules
      // (Showman.json layers 8-9) -- OUTER SPACE's Showman Delta has a pink one.
      layerTints: opts.mustache ? { 8: paletteColor(opts.mustache), 9: paletteColor(opts.mustache) } : undefined,
    });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.zIndex = 6;
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;
    const p = this.world.player;
    if (p && !p.dead && !p.invulnerable &&
        this.touches(p)) {
      p.takeDamage(TOUCH_DAMAGE);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.container.alpha = this.flashT > 0 ? 0.4 : 1;
    }
  }

  // Shielded (orange): nothing can damage him. Every weapon checks this
  // before calling die(); bullets still break on him (stopsBullet).
  canBeDestroyedBy(charged) { return !this.shielded && super.canBeDestroyedBy(charged); }

  // Any shot lands here (CYAN) unless shielded. 15 hits to actually defeat him. `dmg`
  // (default 1, same as before the Charge Cannon's own supercharge buff
  // existed) lets a bigger hit knock off more than one hit at once, same
  // as knight.js/plasmadrache.js/saw.js/crock.js already do.
  die(dmg = 1) {
    if (this.dead || this.shielded) return;
    this.hp -= dmg;
    this.flashT = 0.1;
    if (this.hp > 0) {
      this.world.audio.play('bossHurt', 0.6);
      return;
    }
    this.dead = true;
    this.world.addScore(200);
    this.world.audio.play('bossDefeat', 0.9);
    this.destroy();
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
