// kangunroodelta.js — OUTER SPACE's own Boss Rush, now phase 6 (after the
// checkpoint title card and the new C.R.O.C.K. breather — see
// outerspace.js's own header). Per direct request, alongside an upload of
// `Kangunroo_Delta.sb3`: "After first checkpoint there will be Boss Rush of
// buffed bosses. First one is buffed Cyber Zoo's Boss (Kangunroo). Total HP
// is 50. But there's a catch : when you defeat him (drop to 0 hp) you are
// forced to do the standart duel thing (aka like you fight him normally)
// with highter stakes - win duel, win the battle; lose duel, you take 2hp
// of damage and boss will be reset."
//
// **Reworked after a direct follow-up question** ("why you didn't just
// followed scrip of the scratch project (and didn't used any sprites)?").
// The first pass reused `kangaroo.js`'s own `wait.png` tinted orange and a
// generic straight-flying bolt (`Comet.json`) for both attacks — a
// deliberate placeholder at the time, but a real miss given this source
// actually has its own usable head art and attack sprites, unlike most of
// this session's "thin skeleton" sources. Fixed properly: the head uses the
// real uploaded art (`assets/sprites/kangunroo/` -- the old `hit.png` headshot
// has since been replaced by the full-body idle/side/jump costumes), checked
// by hand this time (an earlier, mistaken assumption that they'd be as
// bezier-garbled as `plasmadrache.js`'s own source turned out wrong) — both
// are clean, almost entirely straight/simple-curve paths that rasterize
// perfectly via `cairosvg` at the same "4 texture px per design unit"
// convention `kangaroo.js`/`corn.js`/`plasmadrache.js` already use.
// `COSTUMES` mirrors `kangaroo.js`'s own table (sibling `PIXI.Sprite`s,
// `.visible` toggle, anchors from each costume's own Scratch
// `rotationCenter`) — `hit` is the shoot-phase idle look, and `ded` gets a
// brief (`KO_FLASH_TIME`) on-screen beat the instant HP hits 0, before the
// body hides and the final-stand duel takes over, selling "this hit just
// knocked him silly" instead of the body just vanishing outright.
//
// **Wall-jumping rework** — per direct request ("Kangunroo delta currently
// is THE easiest boss in the game. Make him smaller (like in duel) and make
// him jump like crazy, also he should change gravity at all 4 directions
// (so he can land on floor, ceeling, and both walls)"). The old hop-dash
// (a 2-3 hop burst along the floor every 4-7s, touch-hurting only
// mid-air) left him standing still most of the fight. Now:
// - **Smaller**: `BODY_SCALE` 0.38 -> 0.13, so the full body stands about
//   as tall as the duel's own head reads on screen (~200px, not ~600px),
//   and `RADIUS` shrinks to match.
// - **He never stops jumping**: a `windup` (Side) -> `air` (Jump) -> `land`
//   (Idle) loop with only a short beat between leaps, plus a longer
//   `BREATHER` rest after every `BURST_MIN`-`BURST_MAX` leaps — the window
//   to line up a torpedo.
// - **Four-way gravity**: every leap picks a landing surface out of
//   `SURFACES` (floor, ceiling, left wall, right wall), usually a different
//   one from where he's standing. The flight is a quadratic Bézier from
//   take-off to landing whose control point sits *off the landing surface*
//   (`mid + n_new * h`) — that's exactly a ballistic arc under a constant
//   gravity pointing into the new surface, so mid-leap you can see gravity
//   flip and pull him onto it. The control point is clamped inside the
//   arena, so the whole arc (inside its own control hull) stays on screen.
//   The body rotates so his feet meet the surface he lands on (sometimes
//   (see `planLeap` for how he always lands facing the way he's going).
// - **Touching him always hurts** while he's in the shootable phase — on a
//   surface or mid-leap — not just mid-hop.
// Landing points are aimed at the player's spot on the target surface
// about half the time (`AIM_CHANCE`), random otherwise.
//
// **A shootable 50-HP pool, not a reflex-only fight like the original
// K.A.N.G.** Occupies `world.boss` the same way `boss.js`'s TrapWheel and
// `trapcircledelta.js`'s TrapCircleDelta already do (bullet.js's/
// bouncyball.js's own `world.boss.tryHit(x, y, charged, dmg)` hook) —
// CYAN colour language, any shot registers, no new damage-tiering code
// needed since `checkHits()` already computes the right tier per weapon.
//
// **The "final stand"**: hitting 0 HP doesn't destroy it outright — it
// freezes the player, clears any leap currently in flight, and hands off to
// the *exact* reflex duel `kangaroo.js`'s own `Kangaroo` class already runs
// for the original K.A.N.G fight ("like you fight him normally"), via two
// optional constructor hooks (`onWin`/`onLose`) that leave the original
// CYBER ZOO fight bit-for-bit unaffected when omitted — see that file's own
// header for the exact diff. Landing all 5 hits (the same `HITS_TO_WIN` the
// original uses) wins the whole encounter outright.
// **The actual "higher stakes"**: in the original fight a missed window (a
// Bang) just costs 1 HP and the same duel continues from wherever it was;
// here a single Bang immediately ends the *duel* as a loss — no
// continuing, no partial credit for hits already landed — costing the
// player 2 HP and resetting Kangunroo Delta's own HP pool straight back to
// the full 50, dropping back into the shootable phase rather than
// re-trying the duel on the spot. Grinding the 50 HP back down is the real
// cost of a miss, not just a HP tick.
//
// **Its own theme** (`kangunrooTheme`, `Kangunroo_theme.mp3` — the same
// file byte-confirmed, by hash, identical to the sb3 bundle's own
// `537ce437fe2dc361bf758e906ccb26e6.mp3`, and to this same new sprite3
// upload's own copy of it): checked via `mutagen` rather than a full RMS
// envelope (no mp3 decoder was available in this sandbox, `mutagen` reads
// the header/duration without one) — a genuine ~12.0s clip at a real
// 320kbps bitrate, not this session's usual 64s-padded-export artifact, so
// it's used unmodified. Loops only during the shootable phase (started on
// spawn, restarted on a loss back into it); stopped the instant the
// final-stand duel begins, matching the original K.A.N.G fight's own
// convention of no music loop during the reflex duel itself — only its own
// sound cues (`kangWait`/`kangHit`/`kangBang`/…).
import { Hittable, toScreen, HALF_W, HALF_H, rand, dist } from './core.js';
import { Kangaroo } from './kangaroo.js';

const MAX_HP = 50;
const RADIUS = 0.8;                 // shootable/touch body, world units (shrank with BODY_SCALE)
const HIT_FLASH = 0.15;
const KO_FLASH_TIME = 0.5;   // brief DED costume beat before the final-stand duel takes over

// Rasterized at 4x (design-unit -> texture-px), the same convention
// kangaroo.js's/corn.js's/plasmadrache.js's own raster costumes use.
// `ded` is the same full-body KO art as kangaroo.js's `defeat.png`.
// Both scales shrank together (0.38 -> 0.13 for the body, DED in
// proportion) for the wall-jumping rework, so he's roughly the duel head's
// on-screen size instead of filling the screen. Every costume's anchor
// sits close to its own centre, so the container's position is the body's
// centre and rotating it (for walls/ceiling) pivots around the hitbox.
const BODY_SCALE = 0.13;
// The final-stand duel draws kangaroo.js's own costumes, recoloured like his
// body: the purple outlines are pink (`core`) on every Delta costume.
const DUEL_URLS = {
  wait:   'assets/sprites/kangunroo/duel_wait.png',
  tell:   'assets/sprites/kangunroo/duel_tell.png',
  defeat: 'assets/sprites/kangunroo/ded.png',
};
const DED_SCALE = 0.246 * (BODY_SCALE / 0.38);
const COSTUMES = {
  ded:  { url: 'assets/sprites/kangunroo/ded.png',  anchor: [0.537, 0.334], scale: DED_SCALE },
  idle: { url: 'assets/sprites/kangunroo/idle.png', anchor: [0.4724, 0.4689], scale: BODY_SCALE },
  side: { url: 'assets/sprites/kangunroo/side.png', anchor: [0.5812, 0.4868], scale: BODY_SCALE },
  jump: { url: 'assets/sprites/kangunroo/jump.png', anchor: [0.6198, 0.4499], scale: BODY_SCALE },
};

// Distance from his centre to the surface he stands on (feet on it):
// idle's bottom sits 0.53 * 1542px * BODY_SCALE ~= 106px ~= 1.5 units below
// its anchor.
const FOOT = 1.5;
// Keep his centre this far from a surface's ends, so standing near a
// corner doesn't clip his body through the adjacent wall.
const EDGE = 1.2;

// The four surfaces. `n` is the inward normal (away from the surface, into
// the arena — "up" for whoever stands on it); `rot` turns the art (drawn
// feet-down) so its feet point at the surface. Screen y is down, so the
// floor is +HALF_H and the ceiling -HALF_H.
const SURFACES = {
  floor:   { n: [0, -1], rot: 0 },
  ceiling: { n: [0, 1],  rot: Math.PI },
  left:    { n: [1, 0],  rot: Math.PI / 2 },
  right:   { n: [-1, 0], rot: -Math.PI / 2 },
};
const SURFACE_NAMES = Object.keys(SURFACES);

// A point on surface `s` at tangent coordinate `t` (x along floor/ceiling,
// y along the walls), clamped clear of the corners.
function surfacePoint(s, t) {
  const tx = Math.max(-HALF_W + EDGE, Math.min(HALF_W - EDGE, t));
  const ty = Math.max(-HALF_H + EDGE, Math.min(HALF_H - EDGE, t));
  switch (s) {
    case 'floor':   return [tx, HALF_H - FOOT];
    case 'ceiling': return [tx, -HALF_H + FOOT];
    case 'left':    return [-HALF_W + FOOT, ty];
    default:        return [HALF_W - FOOT, ty];
  }
}
const isWall = s => s === 'left' || s === 'right';

// Leap timing. "Jump like crazy": a short wind-up, a fast flight, a short
// landing beat, then straight into the next leap — with a longer breather
// after each burst so there's still a window to shoot.
const WINDUP = 0.14;                       // Side costume before take-off
const LAND_MIN = 0.08, LAND_MAX = 0.3;     // Idle beat after touching down
const BREATHER_MIN = 0.7, BREATHER_MAX = 1.1;
const BURST_MIN = 4, BURST_MAX = 7;        // leaps between breathers
const FLY_SPEED = 12;                      // world units / s along the chord
const FLY_MIN = 0.4, FLY_MAX = 0.8;        // flight time clamp, s
const ARC_MIN = 1.2, ARC_MAX = 3.0;        // how far the arc bows off the landing surface
const PUSH_MIN = 0.8, PUSH_MAX = 1.6;      // ...and off the take-off surface
const MIN_LEAP = 2.5;                      // re-roll landing points closer than this
const SAME_SURFACE_CHANCE = 0.2;           // otherwise gravity flips to another surface
const AIM_CHANCE = 0.5;                    // land at the player's spot on that surface
const FIRST_LEAP = 1.0;                    // delay before the first leap

const lerp = (a, b, k) => a + (b - a) * k;
// Shortest signed angle from a to b.
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ENDLESS MODE (levels/endless.js) passes `opts.easy`: slower, shorter
// leap bursts with long breathers (spam attacks run alongside him there),
// and no final-stand duel -- 0 HP is the win.
const EASY = { burst: [2, 3], breather: [2.2, 3.0], flySpeed: 7, aim: 0.25 };

export class KangunrooDelta {
  constructor(world, hud, opts = {}) {
    this.world = world; this.hud = hud;
    this.easy = !!opts.easy;
    this.hp = MAX_HP;
    this.mode = 'shoot';            // 'shoot' | 'ko' | 'duel'
    this.dead = false; this.alive = true;
    this.onDefeated = null;
    this.hitFlash = 0; this.koT = 0;

    this.container = new PIXI.Container();
    this.sprites = {};
    for (const [name, c] of Object.entries(COSTUMES)) {
      const spr = PIXI.Sprite.from(c.url);
      spr.anchor.set(c.anchor[0], c.anchor[1]);
      spr.scale.set(c.scale);
      spr.visible = name === 'idle';
      this.container.addChild(spr);
      this.sprites[name] = spr;
    }
    world.stage.addChild(this.container);
    this.currentCostume = 'idle';
    this.facing = 1;   // 1 = the art's own right-facing pose, -1 = mirrored

    this.resetToFloor();

    world.boss = this;
    world.audio.loop('kangunrooTheme', 0.6);
  }

  // Standing on the floor, centre stage, about to start leaping — the
  // spawn pose, and where a lost duel drops him back to.
  resetToFloor() {
    this.surface = 'floor';
    [this.x, this.y] = surfacePoint('floor', 0);
    this.rot = SURFACES.floor.rot;
    this.leap = null;
    this.state = 'land';            // 'windup' | 'air' | 'land'
    this.stateT = 0;
    this.stateDur = FIRST_LEAP;
    this.leapsLeft = this.burstLen();
    this.setCostume('idle');
    this.syncView();
  }

  burstLen() {
    const [a, b] = this.easy ? EASY.burst : [BURST_MIN, BURST_MAX];
    return a + Math.floor(rand(0, b - a + 1));
  }

  // Mirrors the visible costume for `this.facing` (a plain negative
  // scale.x around the sprite's own anchor).
  setCostume(name) {
    this.currentCostume = name;
    for (const [n, spr] of Object.entries(this.sprites)) {
      spr.visible = (n === name);
      spr.tint = 0xffffff;   // clear any stale hit-flash tint left on a sprite that isn't shown right now
      if (n === name) spr.scale.x = Math.abs(spr.scale.x) * this.facing;
    }
  }
  hideBody() { this.container.visible = false; }
  showBody() { this.container.visible = true; this.setCostume('idle'); }

  syncView() {
    const [px, py] = toScreen(this.x, this.y);
    this.container.position.set(px, py);
    this.container.rotation = this.rot;
  }

  update(dt) {
    if (this.dead) return;
    if (this.mode === 'duel') return;   // the embedded Kangaroo owns the beat now

    if (this.mode === 'ko') {
      this.koT -= dt;
      if (this.koT <= 0) {
        if (this.easy) {   // ENDLESS: no duel, the KO is the win
          this.dead = true; this.alive = false; this.world.boss = null;
          this.world.audio.play('bossDefeat', 0.9);
          if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
          if (this.onDefeated) this.onDefeated();
        } else this.enterDuel();
      }
      return;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const spr = this.sprites[this.currentCostume];
      if (spr) spr.tint = this.hitFlash > 0 ? 0xffd9b3 : 0xffffff;
    }

    this.stateT += dt;
    if (this.state === 'land') {
      if (this.stateT >= this.stateDur) this.planLeap();
    } else if (this.state === 'windup') {
      if (this.stateT >= WINDUP) {
        this.state = 'air'; this.stateT = 0;
        this.setCostume('jump');
      }
    } else if (this.state === 'air') {
      this.updateFlight();
    }

    this.syncView();
    this.updateTouch();
  }

  // Pick where the next leap lands and wind up for it.
  planLeap() {
    const p = this.world.player;
    let to = null, toS = this.surface;
    for (let tries = 0; tries < 8; tries++) {
      toS = Math.random() < SAME_SURFACE_CHANCE
        ? this.surface
        : SURFACE_NAMES.filter(s => s !== this.surface)[Math.floor(rand(0, 3))];
      let t;
      if (p && Math.random() < (this.easy ? EASY.aim : AIM_CHANCE)) t = isWall(toS) ? p.y : p.x;
      else t = isWall(toS) ? rand(-HALF_H, HALF_H) : rand(-HALF_W, HALF_W);
      to = surfacePoint(toS, t);
      if (dist(this.x, this.y, to[0], to[1]) >= MIN_LEAP) break;
    }
    const from = [this.x, this.y];
    const d = dist(from[0], from[1], to[0], to[1]);

    // Control point bowed off the landing surface: a quadratic Bézier with
    // it is a ballistic arc under constant gravity pointing into that
    // surface. Clamped inside the arena so the arc never leaves the screen.
    // It also gets a push off the take-off surface (`n0`), so a short leap
    // into a nearby corner still springs off rather than skimming along it.
    const n = SURFACES[toS].n, n0 = SURFACES[this.surface].n;
    const h = rand(ARC_MIN, ARC_MAX), h0 = rand(PUSH_MIN, PUSH_MAX);
    const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
    const cx = Math.max(-HALF_W + FOOT, Math.min(HALF_W - FOOT, mx + n[0] * h + n0[0] * h0));
    const cy = Math.max(-HALF_H + FOOT, Math.min(HALF_H - FOOT, my + n[1] * h + n0[1] * h0));

    // The shortest turn onto the new surface, nothing more. The random
    // extra full spins are gone (per direct request: "Make so Kanguroo delta
    // won't 'backflip' (aka sometimes he lands while facing wrong
    // direction)") -- half of them spun backwards.
    const rotLand = SURFACES[toS].rot;
    const rotTo = this.rot + angleDelta(this.rot, rotLand);

    // Face along the leap in his own (pre-leap) frame: his local "right"
    // is the art's x axis rotated by the current rotation.
    const side = (to[0] - from[0]) * Math.cos(this.rot) + (to[1] - from[1]) * Math.sin(this.rot);
    if (Math.abs(side) > 0.05) this.facing = side > 0 ? 1 : -1;
    // ...and land facing the way he's still moving, in the landing
    // surface's frame (the arc's arrival direction is to - c). Turning onto
    // the ceiling or a wall swaps which way "forward" is on screen, so
    // without this he'd often touch down facing back where he came from.
    // updateFlight mirrors him to it halfway through the leap.
    const arrive = (to[0] - cx) * Math.cos(rotLand) + (to[1] - cy) * Math.sin(rotLand);
    const landFacing = Math.abs(arrive) > 0.05 ? (arrive > 0 ? 1 : -1) : this.facing;

    this.leap = {
      from, to, c: [cx, cy], toS,
      rotFrom: this.rot, rotTo, landFacing,
      dur: this.easy ? Math.max(0.7, d / EASY.flySpeed) : Math.max(FLY_MIN, Math.min(FLY_MAX, d / FLY_SPEED)),
    };

    this.state = 'windup'; this.stateT = 0;
    this.setCostume('side');
  }

  updateFlight() {
    const L = this.leap;
    const k = Math.min(1, this.stateT / L.dur);
    const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
    this.x = a * L.from[0] + b * L.c[0] + c * L.to[0];
    this.y = a * L.from[1] + b * L.c[1] + c * L.to[1];
    const e = k * k * (3 - 2 * k);   // smoothstep: turn mostly mid-air
    this.rot = lerp(L.rotFrom, L.rotTo, e);
    if (k >= 0.5 && this.facing !== L.landFacing) {
      this.facing = L.landFacing;
      this.setCostume('jump');
    }
    if (k >= 1) {
      this.surface = L.toS;
      this.rot = SURFACES[L.toS].rot;
      this.leap = null;
      this.state = 'land'; this.stateT = 0;
      if (--this.leapsLeft <= 0) {
        this.leapsLeft = this.burstLen();
        this.stateDur = this.easy ? rand(...EASY.breather) : rand(BREATHER_MIN, BREATHER_MAX);
      } else {
        this.stateDur = rand(LAND_MIN, LAND_MAX);
      }
      this.setCostume('idle');
    }
  }

  // His body hurts on contact the whole shootable phase — standing on any
  // surface or mid-leap.
  updateTouch() {
    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && p.touchesCircle(this.x, this.y, RADIUS)) {
      p.takeDamage(1);
    }
  }

  // Called by bullets/bouncyball's own world.boss.tryHit call -- same shape
  // every other duck-typed boss in this game already has. Any shot
  // registers (CYAN rule), dmg already tiered by the caller. Tests against
  // his live position, mid-leap included.
  tryHit(px, py, charged, dmg = 1) {
    if (this.dead || this.mode !== 'shoot') return false;
    if (dist(px, py, this.x, this.y) > RADIUS) return false;
    this.damage(dmg);
    return true;
  }

  damage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = HIT_FLASH;
    this.world.addScore(200);
    this.world.audio.play('bossHurt', 0.7);
    if (this.hp <= 0) this.startKo();
  }

  // Hitting 0 HP shows the real DED costume for a beat (selling "knocked
  // silly," not an instant vanish) before the final-stand duel takes over.
  startKo() {
    this.mode = 'ko';
    this.koT = KO_FLASH_TIME;
    // Drop out of any leap where he is; he stays on screen for the KO beat.
    this.leap = null; this.state = 'land';
    this.setCostume('ded');
    this.world.audio.stopLoop('kangunrooTheme');
  }

  // Hands off to kangaroo.js's own reflex duel -- see this file's own
  // header for the full "higher stakes" rule (win = done, a single miss =
  // lose the duel, not just 1 HP).
  enterDuel() {
    this.mode = 'duel';
    this.hideBody();
    const w = this.world;
    const p = w.player;
    p.frozen = true; p.charging = false; p.dashing = false;
    // The same checkpoint.js bug this session's own music audit caught,
    // here too: during the brief KO_FLASH_TIME beat before this fires, the
    // player isn't frozen yet and can start a fresh charge; forcing
    // `charging` false directly (rather than through player.js's own
    // release branch) skips the only place that calls stopLoop('chargeHold'),
    // which would otherwise be left looping through the entire duel.
    w.audio.stopLoop('chargeHold');

    // hud.js's own update() unconditionally stomps hud.phase with
    // 'BOSS ' + world.boss.hp every frame world.boss is set -- which would
    // otherwise overwrite the embedded Kangaroo's own 'PHASE 5 N' readout
    // every single frame of the duel. Clearing world.boss for the duration
    // (bullet.js's/bouncyball.js's own tryHit calls already no-op safely on
    // a null boss) sidesteps that; restored on a loss, left null on a win.
    w.boss = null;

    const duel = new Kangaroo(w, this.hud, {
      hitsToWin: 5,
      urls: DUEL_URLS,
      onWin: () => {
        this.dead = true; this.alive = false;
        p.frozen = false;
        if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
        if (this.onDefeated) this.onDefeated();
      },
      onLose: () => {
        p.frozen = false;
        p.takeDamage(2);
        this.hp = MAX_HP;
        this.mode = 'shoot';
        this.showBody();
        this.resetToFloor();
        w.boss = this;
        w.audio.loop('kangunrooTheme', 0.6);
      },
    });
    w.add(duel);
  }

  // Used when the field is cleared (e.g. a player death) without a win.
  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return { shapes: [{ circle: [this.x, this.y, RADIUS] }] }; }
  destroy() {
    this.alive = false; this.dead = true;
    this.world.boss = null;
    this.world.audio.stopLoop('kangunrooTheme');
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
