// wheel.js — OCCÜLTACRESBURG phase-5 hazard ("THE WHEEL"). Ported from the
// author's own Scratch prototype (`Wheel.sprite3`): a big spinning obstacle
// — a central cyan hub with four long spokes crossing through it — that
// touch-hurts along its whole spinning silhouette but can always be shot
// dead-centre at the hub, however it's currently rotated (a circle looks
// the same at any angle, so the hub's own hitbox never actually needs to
// track rotation the way a rotating weak *sector* would — this is Beam's
// own "small round hub, always shootable" idiom, not TrapWheel's rotating
// weak-arc one, despite both sharing the same "cyan = the part you shoot"
// colour language). Present for a fixed WHEEL_TIME (30s, matching the
// source's own literal `wait 30 secs; hide`) regardless of how it's hit,
// then it's gone and the phase ends.
//
// The source's own costume 1 and costume 2 share the exact same art
// (identical assetId) — a common Scratch trick to encode a direction flag
// (spin right / spin left) as a "costume number" with no actual visual
// difference; costume 3 is the only visually distinct pose (shown briefly
// on spawn) and doubles here as the "idle, stopped" state. Its hit check
// (`sensing_coloristouchingcolor #00ffff #fff700`, then `next costume`,
// rate-limited by its own `wait 1`) is ported as a plain `CYAN` `Hittable`
// at the hub's own small radius — any weapon's existing generic hit-test
// (bullet.js/bouncyball.js/lineslasher.js all already do a plain
// point+radius check against `canBeDestroyedBy`/`h.radius`) lands on it with
// no extra plumbing, including the melee LINE SLASHER this level forces on
// an uncleared run. Each hit reverses the spin (right <-> left; the source's
// own 3-costume cycle also had a stopped state, dropped by request),
// rate-limited by
// HIT_COOLDOWN so one multi-pellet shotgun blast or a piercing torpedo
// can't skip states in a single volley the way the source's own `wait 1`
// stopped a continuous colour-touch from doing the same.
//
// The source's own sound script (`forever { play "X_door_spin" until done }`)
// is a manual re-trigger loop, not Scratch's own true seamless sound loop —
// replaying a whole buffer back-to-back like that tends to leave an audible
// gap/click between repeats. Ported instead onto `Audio.loop`'s real
// `AudioBufferSourceNode` loop (zero-gap by construction), with `loop`/
// `stopLoop` themselves given a short fade in/out (see audio.js) so
// starting and stopping the spin sound — including every time the wheel
// itself flips into and out of its "idle" (silent) state — reads as a
// smooth transition rather than a hard cut.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H } from './core.js';

// The source's own Wheel spans the full Scratch stage -- spoke tips reach
// the screen's own edges, not just a modest circle in the middle. A first
// pass (SCALE=2.8) only reached the screen's own half-*height*, still
// leaving the corners and the wider half-width completely uncovered on a
// 900x700 screen -- reported back as still not covering "the whole screen."
// Spoke tips are diagonal, so "whole screen" means reaching the *corners*,
// not just the top/bottom edges: SCALE is picked so the spoke reach hits
// the screen's own half-diagonal (Math.hypot(HALF_W, HALF_H), the actual
// centre-to-corner distance) with a small margin, rather than HALF_H alone.
// HUB_RADIUS and the SPOKE_* constants just below are still derived from
// the *same* Wheel.json proportions this scale multiplies, so the
// shootable hub and the touch-hurt silhouette both stay exactly matched to
// what's actually drawn.
const HALF_DIAGONAL = Math.hypot(HALF_W, HALF_H);   // ~8.14 world units, centre to corner
const SCALE = (HALF_DIAGONAL * 1.05) / 1.8;         // solve SPOKE_HALF_LEN = 1.8*SCALE for that reach
const HUB_RADIUS = 0.43 * SCALE;     // the shootable hub, matches Wheel.json's own proportions

// Fixed hitbox bug: touch-damage used to be a single blanket circle out to
// the spoke tips' own reach (the old TOUCH_RADIUS) -- fine back when that
// circle was small, but once the wheel was scaled up to actually cover the
// screen (see the file header), that same blanket circle covered nearly the
// *entire arena* regardless of the wheel's current rotation, so standing
// anywhere near the middle of the screen took damage even well clear of any
// actual spoke (reported directly as broken hitboxes). Wheel.json's own
// four spoke bars are thin rectangles crossing the centre at 0/45/90/135
// degrees (`Wheel.json`'s own polygon points: ~13.86 design units thick,
// ~179.6 design units from centre to tip) -- SPOKE_HALF_LEN/SPOKE_HALF_THICK
// below are those same proportions at this sprite's own SCALE, and
// touchingPlayer() now does a real point-to-segment test against each of the
// 4 rotating bars (plus the round hub, which needs no rotation test since a
// circle looks the same at any angle) instead of one big circle -- so the
// gaps *between* spokes are finally actually safe to stand in, matching
// what's drawn.
// Measured off Wheel.json's own spoke polygons, not the round numbers they
// were first assumed to be (0/45/90/135): the diagonals sit at 43.5 and
// 133.9 degrees, which put the old hitbox ~0.2 units off the drawn spokes
// near their tips -- caught by the death hitbox reveal (deathreveal.js).
const SPOKE_ANGLES = [0.41, 43.52, 90, 133.93].map(d => d * Math.PI / 180);
const SPOKE_HALF_LEN = 1.796 * SCALE;     // centre to spoke tip
const SPOKE_HALF_THICK = 0.0693 * SCALE;  // half the bar's own thickness
// SPIN dropped hard (0.9 -> 0.15, a full turn now takes ~42s instead of
// ~7s) at the author's explicit request ("WAAY slower") -- with the wheel
// now spanning the whole screen, the old speed swept a spoke through any
// given spot multiple times a second, giving almost no time to react to
// which gaps were actually safe.
const SPIN = 0.15;           // rad/s
const HIT_COOLDOWN = 0.5;    // seconds between registered state changes
const TOUCH_DAMAGE = 1;

// Spawn warning ("make warning sprites for these attacks"): for WARN_TIME
// after it appears it only blinks faintly in place -- no damage, no
// movement, shots ignored -- so it can never pop in on top of the player.
const WARN_TIME = 1.5;

export class Wheel extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: CYAN, radius: HUB_RADIUS, damage: TOUCH_DAMAGE, countsAsProgress: false });
    this.world = world;
    this.alive = true;
    this.angle = 0;
    this.purpleTouch = true;   // its hurt is the purple spokes (FIREWORK's +1, player.js)
    this.state = 'right';      // 'right' | 'left' (each hit flips it)
    this.hitCooldown = 0;
    this.spinning = false;     // tracks whether the loop is currently playing
    this.warnT = WARN_TIME;

    this.container = buildSprite('Wheel', { lineWidth: 3, scale: SCALE });
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = this.angle;
  }

  update(dt) {
    if (this.dead) return;
    if (this.warnT > 0) {
      this.warnT -= dt;
      this.container.alpha = this.warnT > 0 ? (Math.floor(this.warnT / 0.15) % 2 ? 0.15 : 0.45) : 1;
      return;
    }
    if (this.hitCooldown > 0) this.hitCooldown -= dt;

    const dir = this.state === 'right' ? 1 : this.state === 'left' ? -1 : 0;
    if (dir !== 0) {
      this.angle += SPIN * dir * dt;
      if (!this.spinning) { this.spinning = true; this.world.audio.loop('wheelSpin', 0.4); }
    } else if (this.spinning) {
      this.spinning = false;
      this.world.audio.stopLoop('wheelSpin');
    }
    this.place();

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touchingPlayer(p)) {
      p.takeDamage(this.damage);
    }
  }

  // The hub (a circle, safe to test with no rotation) plus a real
  // point-to-segment test against each of the 4 rotating spoke bars — see
  // the file header for why a single blanket touch-radius circle was wrong.
  touchingPlayer(p) {
    if (p.touchesCircle(this.x, this.y, HUB_RADIUS)) return true;
    // Each spoke is a bar at its base angle (SPOKE_ANGLES) turned by the
    // wheel's live spin, tested against the ship's own triangle.
    for (const a of SPOKE_ANGLES) {
      const t = a + this.angle, ux = Math.cos(t), uy = Math.sin(t);
      const L = SPOKE_HALF_LEN, T = SPOKE_HALF_THICK;
      const bar = [[-L, -T], [L, -T], [L, T], [-L, T]]
        .map(([u, v]) => [this.x + ux * u - uy * v, this.y + uy * u + ux * v]);
      if (p.touchesPoly(bar)) return true;
    }
    return false;
  }

  // A hit on the hub flips the spin instead of destroying it.
  canBeDestroyedBy(charged) { return this.warnT <= 0 && super.canBeDestroyedBy(charged); }

  // Every hit reverses the spin. It used to cycle right -> left -> idle, so a
  // second hit stopped the wheel instead of turning it back (reported:
  // "if you shoot him twice it just stops instead of changing direction
  // twice").
  die() {
    if (this.warnT > 0 || this.hitCooldown > 0) return;
    this.hitCooldown = HIT_COOLDOWN;
    this.state = this.state === 'right' ? 'left' : 'right';
    this.world.audio.play('bossHurt', 0.5);
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {
    const shapes = [{ circle: [this.x, this.y, HUB_RADIUS] }];
    for (const a of SPOKE_ANGLES) {
      const c = Math.cos(this.angle + a) * SPOKE_HALF_LEN, s = Math.sin(this.angle + a) * SPOKE_HALF_LEN;
      shapes.push({ seg: [this.x - c, this.y - s, this.x + c, this.y + s, SPOKE_HALF_THICK] });
    }
    return { shapes };
  }
  destroy() {
    this.alive = false;
    this.dead = true;
    if (this.spinning) this.world.audio.stopLoop('wheelSpin');
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
