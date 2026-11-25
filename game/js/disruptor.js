// disruptor.js — OUTER SPACE's phase 2 hazard (alongside splash.js), ported
// from the author's own Scratch project (`Disruptor.sb3`, a full 3-target
// project -- Stage/Ship/Wave -- rather than a single `.sprite3` bundle, same
// shape `Plasmadrache_Bossfight.sb3` already was). Per direct request: "In
// order to destroy him, break both solar pannels before you can hit him."
//
// **Ship** has 3 costumes and zero scripts of its own -- another "thin
// skeleton" source, the same situation `corn.js`/`clown.js`/`knight.js`/
// `ghost.js` were already in with theirs: the art tells the whole story
// (costume1 = both solar panels intact, costume2 = top panel gone, costume3
// = both panels gone, bare hull) but nothing ever switches between them or
// reacts to being shot -- the actual hit-staging (2 panel hits, then the
// core takes real damage) is built fresh from the brief, the same
// "die(dmg=1), decrement, clang until 0" shape `saw.js`/`crock.js` already
// use for their own multi-hit CYBER ZOO hazards. A `CYAN` `Hittable`
// throughout (the panel art's own stroke, `#00ffff`, is this game's `ring`
// cyan almost exactly) -- any shot registers, same as any other plain-cyan
// target; `die(dmg)` only pops one panel per call while any remain
// (`bossHurt`, no score yet -- matching Corn's own "early hits are a stage
// transition, not points" convention) and only starts actually decrementing
// `coreHP` once both are gone, scoring +200 and playing the standard
// `destroyCyan` on the real kill -- the same "generic plain-cyan break cue"
// convention this session's own Asteroid fix just reaffirmed, not a
// dedicated boss fanfare, since this is a mid-phase hazard like Corn/Beam,
// not a level's own final boss.
//
// `Disruptor1/2/3.json` are flat-vector redraws of the 3 Ship costumes'
// own SVGs, traced directly from their point coordinates (no bezier curves
// anywhere in this source -- the only curve, the small hull "core" dot, is
// a standard 4-arc circle, ported as a plain `ellipse` primitive) -- all
// three share one coordinate space (costume1's own 154.41x255.63 viewBox)
// so toggling between them as sibling sprites needs no per-costume offset,
// the same "same local origin, swap which sprite is visible" convention
// `kangaroo.js`'s/`plasmadrache.js`'s own raster costume-swaps already use,
// just vector shapes instead of PNGs here since this source had no bezier
// curves to force a raster fallback. The two solar panels' own cyan braces
// are thin stroked lines (`capsule`, radius 1) over a tilted quad body
// (`polygon`) -- the hull box + antenna + core dot stay purple throughout
// (`grape`, close to the source's own `#b100ff`/`#cb00ff`).
//
// **Wave** is the source's own attack: `forever { create clone of myself;
// wait 0.1 }`, and each clone `show`s, then `repeat_until <touching edge>
// { move 4 steps; change size by 10; change GHOST effect by 1 }` before
// deleting itself -- a shape that grows and fades as it travels until it's
// off-screen. The source's own costume is one tiny stroked arc (3.85x9.02
// design units) with its own rotation centre offset well to one side,
// which reads as a classic Scratch "stretch one offset arc via scaling" fake
// for a radiating ring -- but with no direction-randomisation block
// anywhere in the source, every clone shares the exact same fixed
// direction, so literally replaying the script would draw a single
// repeating sliver trailing off one way, not an actual ring a player could
// read as "a shockwave coming from the Ship." Ported instead as the
// evident intent, the same liberty `gemwarning.js`'s/`atom.js`'s own
// telegraph rings already take: a plain expanding `PIXI.Graphics` ring
// (stroked, growing radius, fading alpha) centred on the Ship, exactly the
// inverse of `gemwarning.js`'s own *shrinking* telegraph. `0.1s` between
// clones is also far too fast for anything a player could react to -- the
// same "toned down from an unplayable source cadence" call this project's
// `FLAME_INTERVAL`/`GemWarning` numbers already made -- `WAVE_INTERVAL`
// here is a slower, still first-pass, cadence instead. PURPLE, unkillable,
// touch-hurts only along the ring's own current band (not the filled
// disc), the same "a ring is a line to dodge, not an area" rule
// `wheel.js`'s own hub/spoke hit-test already established.
//
// **The two uploaded sounds**: `Disruptor_wave_loop.wav` is a genuine
// ~16s ambient hum (RMS-checked: a real periodic ~2s internal cycle, not
// this session's usual silence-padding bug) -- looped the whole time the
// Ship is alive. `Disruptor_wave_single.wav` is a clean ~2.4s one-shot
// stinger, described directly by the author as a "technical backup sound
// that mostly won't be used" meant for "synth wave spam" -- played exactly
// once, on the very first wave, rather than once per wave (which the loop
// already covers as ambience). The source's own "поп" sound (byte-identical
// to `Asteroid.sprite3`'s own copy -- a shared Scratch default, not a real
// asset) stays unused here too, matching this session's own most recent
// call on that exact file (`asteroid.js`: "use destroyed_cyan.wav
// instead") rather than manufacturing it a new job.
import { buildSprite, getShape } from './retro.js';
import { Hittable, PURPLE, CYAN, toScreen, HALF_W, HALF_H, PPU, rand, dist } from './core.js';
import { pointPolyDist, farthest, HULL_STROKE } from './shiphull.js';

const SCALE = 0.6;
const CORE_HP = 3;              // hits needed once both panels are gone
const WAVE_INTERVAL = 1.6;      // s between waves -- toned down from the source's own 0.1s
const WAVE_SPEED = 2.4;         // world units/s outward growth
const WAVE_BAND = 0.25;         // how thick the ring's own touch-hurt band is
const WAVE_MAX = Math.hypot(HALF_W, HALF_H) * 1.1;   // past every corner, same margin wheel.js uses

function shapeRadius(name, scale) {
  const s = getShape(name);
  if (!s) return 0.4 * scale;
  return (Math.max(s.width, s.height) / 100 / 2) * scale;
}

export class Disruptor extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: CYAN, radius: shapeRadius('Disruptor1', SCALE),
                   damage: 0, hurtsPlayer: false, countsAsProgress: true });
    this.world = world;
    this.alive = true;
    this.panelsLeft = 2;
    this.coreHP = CORE_HP;
    this.active = 0;   // index into this.costumes of the currently-shown one
    this.flashT = 0;
    this.waveT = rand(0.3, WAVE_INTERVAL);
    this.firstWave = true;

    this.costumes = [1, 2, 3].map(n => {
      const c = buildSprite('Disruptor' + n, { scale: SCALE, lineWidth: 1.6 });
      c.visible = n === 1;
      world.stage.addChild(c);
      return c;
    });
    this.container = this.costumes[0];
    this.place();

    world.audio.loop('disruptorWaveLoop', 0.4);
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    for (const c of this.costumes) c.position.set(sx, sy);
  }

  update(dt) {
    if (this.dead) return;
    this.waveT += dt;
    if (this.waveT >= WAVE_INTERVAL) {
      this.waveT = 0;
      this.world.add(new DisruptorWave(this.world, this.x, this.y));
      if (this.firstWave) { this.firstWave = false; this.world.audio.play('disruptorWaveSingle', 0.5); }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.costumes[this.active].alpha = this.flashT > 0 ? 0.35 : 1;
    }
  }

  // Panels take 1 hit each (clang, no score -- a stage transition, matching
  // corn.js's own 1st-hit convention); only once both are gone does a hit
  // actually damage the core. `dmg` (default 1) lets a bigger hit -- a
  // supercharged Hadouken, a torpedo's own 3 -- knock off more than one
  // stage at once, same as every other multi-hit hazard's own die(dmg).
  die(dmg = 1) {
    if (this.dead) return;
    if (this.panelsLeft > 0) {
      this.panelsLeft -= dmg;
      this.world.audio.play('bossHurt', 0.7);
      this.flashT = 0.1;
      this.costumes[this.active].visible = false;
      this.active = this.panelsLeft <= 0 ? 2 : 1;
      if (this.panelsLeft < 0) this.panelsLeft = 0;
      this.costumes[this.active].visible = true;
      return;
    }
    this.coreHP -= dmg;
    if (this.coreHP > 0) {
      this.world.audio.play('bossHurt', 0.7);
      this.flashT = 0.1;
      return;
    }
    this.dead = true;
    this.world.addScore(200);
    this.world.audio.play('destroyCyan', 0.8);
    this.world.audio.stopLoop('disruptorWaveLoop');
    this.destroy();
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    this.world.audio.stopLoop('disruptorWaveLoop');
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    for (const c of this.costumes) if (c && !c.destroyed) c.destroy({ children: true });
  }
}

// The expanding shockwave ring. PURPLE -- unkillable, a "chip bullet" to
// dodge, like every other PURPLE hazard -- a real `Hittable` (not just a
// visual), so a normal bullet still breaks against its current band and a
// charged shot still pierces through, matching `Pirania`/`Flame`'s own
// PURPLE rule rather than letting every shot pass through it unchecked.
// Its own `hitTest` (the point-to-segment pattern `beam.js`'s sweeping
// beam already uses for a shape that isn't a plain filled circle) only
// counts the ring's own current band, not the whole growing disc.
class DisruptorWave extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: PURPLE, radius: 0.1, damage: 1, countsAsProgress: false });
    this.world = world;
    this.alive = true;

    this.gfx = new PIXI.Graphics();
    this.gfx.zIndex = 5;
    world.stage.addChild(this.gfx);
    this.draw();
  }

  hitTest(x, y, r) {
    return Math.abs(dist(this.x, this.y, x, y) - this.radius) <= WAVE_BAND + r;
  }

  draw() {
    const [sx, sy] = toScreen(this.x, this.y);
    const k = this.radius / WAVE_MAX;
    this.gfx.clear();
    this.gfx.lineStyle({ width: 2, color: 0xB300FF, alpha: 0.7 * (1 - k) });
    this.gfx.drawCircle(sx, sy, this.radius * PPU);
  }

  update(dt) {
    if (this.dead) return;
    this.radius += WAVE_SPEED * dt;
    this.draw();
    if (this.radius >= WAVE_MAX) { this.destroy(); return; }

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead) {
      // the ship's triangle against the ring's band: its nearest point is
      // inside the outer edge and its farthest outside the inner edge
      const hull = p.hull();
      const near = pointPolyDist(this.x, this.y, hull) - HULL_STROKE, far = farthest(this.x, this.y, hull) + HULL_STROKE;
      if (near <= this.radius + WAVE_BAND && far >= this.radius - WAVE_BAND) p.takeDamage(this.damage);
    }
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return { shapes: [{ ring: [this.x, this.y, this.radius, WAVE_BAND] }] }; }
  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.gfx && !this.gfx.destroyed) this.gfx.destroy();
  }
}
