// asteroid.js — OUTER SPACE's phase 1, ported from the author's own Scratch
// prototype (`Asteroid.sprite3`), per direct request ("This is phase 1. So
// you know how asteroids in 'Asteroid' works? Well this is basically exact
// same thing") pointing straight at `meteor.js`'s own already-shipped
// drift/bounce/spin "asteroid" pattern as the mechanic to reuse.
//
// The source script: `forever { turn right 1 }` (a slow continuous spin, a
// second clone-only script turns the fragments too) plus a main script that
// shows, then `repeat until <touching #ffe900 (this game's own player-ship
// yellow)> { glide 10 secs to a random position; if-on-edge-bounce }`, and
// the instant that touch happens, creates 3 clones of itself at 100/3 ≈
// 33.3% size (`looks_setsizeto [100/3]`) and hides — each clone repeats the
// identical wander-until-touch loop at its own smaller size, then just
// `delete_this_clone`s on its own touch, with no further cloning. Ported
// here as a `Hittable` that spins, drifts in a straight line, bounces off
// the four screen edges (the same mechanic `meteor.js`'s own `MeteorShard`
// already uses for this exact "drifting rock" feel, matching the direct
// comparison above), and touch-hurts the player (added fresh — the source
// has no touch-damage script of its own, the same "thin skeleton" gap
// `CornSeed`/`Pirania`'s own touch-damage already filled). The full-size
// rock fragments into 3 smaller copies on that touch and removes itself;
// each fragment is the same hazard one size down, except it simply
// vanishes on its own touch instead of fragmenting again — `isFragment` is
// the only thing that tells the two apart.
//
// **Retinted CYAN, shootable, per direct follow-up request** ("Also make
// asteroids cyan (shootable, while keeping their split mechanic)") — the
// source itself never reacts to being shot at all (nothing in
// `Asteroid.sprite3` checks for it), so the original port left it PURPLE,
// unkillable, a pure dodge-only "chip bullet" like every other hazard this
// session built from a thin, shot-blind skeleton. Made shootable here on
// top of that, not instead of the touch mechanic: `die()` and `touchPlayer`
// now both route through the exact same split logic (`onDie`, the same
// "custom death" hook `bomb.js`'s own explosion already uses) rather than
// duplicating it, so a shot breaks a full asteroid into its 3 fragments
// exactly the way touching the player always did, and either one still
// destroys a fragment outright. A full asteroid's own break scores nothing
// (`countsAsProgress: false` — it's a stage transition into 3 more
// hazards, not a real kill, the same "early hit, no score yet" convention
// `corn.js`'s provoke hit/`disruptor.js`'s panel pops already use); a
// fragment's own death is the real kill and scores the usual +100
// (`countsAsProgress: true`, the default for a plain CYAN `Hittable`).
// Both play the standard `destroyCyan` cue on breaking, matching every
// other plain-cyan `Hittable`'s own death sound rather than a dedicated
// one.
//
// `Asteroid.json` is a flat-vector redraw of the source SVG's own path --
// one straight-line jagged-rock outline (`M`/`l`/`z` only) plus a single
// cubic-bezier segment (`c0,0 -13.38774,-6.69387 -20.30239,-10.15119`,
// whose first control point coincides with its own start point) partway
// around it; approximated here as a straight corner to the curve's own end
// point rather than hand-sampled -- the deviation is small and barely
// registers against an already-irregular rock silhouette, unlike
// `Hadouken.json`'s own smooth scalloped-blob source, where every segment
// needed real sampling to read correctly at speed. Tinted `ring` (this
// game's own CYAN-language colour) now that the hazard actually follows
// that rule -- `grape` (true purple), its original tint when it was still
// PURPLE, would have misled the player about it the same way `showman.js`'s
// own grape→blood retint and `trapcircledelta.js`'s own grape→cobalt retint
// both exist to avoid (see each of their own notes elsewhere in this doc).
//
// The uploaded "поп" sound was never referenced by a single block in the
// source (confirmed -- no `sound_play*` opcode anywhere in the sprite), the
// same dead-asset situation `knightPop`/`plasmaWallPop` were already in --
// unlike those two, it's left unused here per direct request ("use
// destroyed_cyan.wav instead"): the break cue is just `destroyCyan`, the
// same generic "something broke" sound `wall.js`/`lollypop.js`/`dart.js`
// already reuse regardless of their own actual colour rule, played the
// instant a rock actually breaks apart -- on the full asteroid's own
// fragmentation, and again on a fragment's own final vanish.
import { buildSprite, getShape, paletteColor } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

function shapeRadius(name, scale) {
  const s = getShape(name);
  if (!s) return 0.08 * scale;
  return (Math.max(s.width, s.height) / 100 / 2) * scale;
}

const FULL_SCALE = 0.9;
const FRAGMENT_SCALE = FULL_SCALE / 3;   // matches the source's own `100/3` clone size
const SPEED = 1.3;          // world units/s -- a slow screen-crossing drift
const SPIN = 40 * Math.PI / 180;   // rad/s, matching the source's own slow continuous turn
// Fragments spawn exactly on top of whatever they just broke out of (and
// whatever touched it, i.e. the player) -- without a brief grace window
// each one would re-trigger its own touch check before ever moving clear,
// vanishing all three on the same frame they appear. Same "not really
// there yet" idea `lollypop.js`/`dart.js` already use before arming.
const SPAWN_GRACE = 0.15;

export class Asteroid extends Hittable {
  constructor(world, x, y, isFragment = false) {
    const scale = isFragment ? FRAGMENT_SCALE : FULL_SCALE;
    super(world, { x, y, color: CYAN, radius: shapeRadius('Asteroid', scale),
                   damage: 1, countsAsProgress: isFragment, destroySound: 'destroyCyan' });
    this.world = world;
    this.alive = true;
    this.isFragment = isFragment;
    this.grace = SPAWN_GRACE;
    // A full asteroid's own "death" is really a split into 3 fragments, not
    // a real kill -- die()'s own onDie hook (the same "custom death" escape
    // hatch bomb.js's own explosion uses) handles that instead of letting
    // the base class's plain destroySound-then-destroy run. A fragment has
    // no override here, so its own die() just plays destroyCyan and
    // destroys normally, same as any other single-hit CYAN Hittable.
    if (!isFragment) this.onDie = () => this.fragment();

    const a = rand(0, Math.PI * 2);
    this.vx = Math.cos(a) * SPEED;
    this.vy = Math.sin(a) * SPEED;
    this.spin = SPIN * (rand(0, 1) < 0.5 ? -1 : 1);

    this.container = buildSprite('Asteroid', { scale, lineWidth: 1.8, tint: paletteColor('ring') });
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
    if (this.grace > 0) this.grace -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.container.rotation += this.spin * dt;
    this.place();
    this.bounce();
    this.touchPlayer();
  }

  bounce() {
    if (this.x < -HALF_W) { this.x = -HALF_W; this.vx = Math.abs(this.vx); }
    if (this.x >  HALF_W) { this.x =  HALF_W; this.vx = -Math.abs(this.vx); }
    if (this.y < -HALF_H) { this.y = -HALF_H; this.vy = Math.abs(this.vy); }
    if (this.y >  HALF_H) { this.y =  HALF_H; this.vy = -Math.abs(this.vy); }
  }

  touchPlayer() {
    if (this.grace > 0) return;
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    if (!this.touches(p)) return;
    p.takeDamage(this.damage);
    // "Coincidence? I THINK NOT!" needs every rock shot (late ones don't count)
    if (!this.late) this.world.asteroidTouched = true;
    // Same die() path a shot takes -- a full asteroid splits, a fragment
    // just breaks -- so touch and gunfire can't drift out of sync.
    this.die();
  }

  // Full-size only (see the constructor's own onDie wiring). Spawns the 3
  // smaller copies at the current position and plays the break cue itself,
  // since onDie pre-empts the base class's own destroySound-then-destroy.
  fragment() {
    this.world.audio.play('destroyCyan', 0.7);
    for (let i = 0; i < 3; i++) {
      const f = new Asteroid(this.world, this.x, this.y, true);
      f.late = this.late;   // fragments of a late rock are late too
      this.world.add(f);
    }
    this.destroy();
  }

  destroy() {
    if (this.dead && this.alive === false) return;
    super.destroy();
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// Spawn one full-size asteroid at a random edge, drifting inward.
export function spawnAsteroid(world) {
  let x, y;
  switch (Math.floor(rand(0, 4))) {
    case 0: x = rand(-HALF_W, HALF_W); y = -HALF_H; break;
    case 1: x = rand(-HALF_W, HALF_W); y =  HALF_H; break;
    case 2: x = -HALF_W; y = rand(-HALF_H, HALF_H); break;
    default: x = HALF_W; y = rand(-HALF_H, HALF_H); break;
  }
  const a = new Asteroid(world, x, y, false);
  world.add(a);
  return a;
}
