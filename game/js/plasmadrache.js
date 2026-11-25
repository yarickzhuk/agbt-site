// plasmadrache.js — OCCÜLTACRESBURG's boss (phase 5). Ported from the
// author's own Scratch prototype (`Plasmadrache_Bossfight.sb3`): a big
// dragon head that alternates two attack cycles forever — summon a pair of
// full-height solid walls (wall.js) at random X, twice, 4s apart; then spit
// fireballs (plasmaflame.js), mouth popping open for each one. DARK BLUE —
// his own body art is drawn in the exact `cobalt` blue (`#2b00ff`) this
// game already uses for that colour rule, so only a charged shot (torpedo,
// any Cyber Shotgun pellet, a fully-charged Bouncy Ball, or LINE SLASHER's
// own SLASH) lands at all.
//
// **Buffed since, per direct request** ("right now you don't get damaged
// if you touch him directly... make his projectiles slower but make him
// spam them more often and make him move around (not fast, but so player
// required to put efford to hit him)"): he was originally stationary and
// never touch-damaged the player at all (the same "the real threat is the
// hazards around him, not his body" call showman.js's own boss made) —
// reversed on both counts. See TOUCH_DAMAGE/updateTouch() for direct
// contact now costing a real hit, updateMovement()/MOVE_SPEED for the slow
// continuous wander (bounded well inside the arena, retargeted every few
// seconds), and SPIT_REST/plasmaflame.js's own SPEED for the slower but
// more frequent fireball spam. Dodging the walls/flames/his own body while
// chipping away at his HP is the fight now, not just the walls/flames.
//
// **Two real fixes made during the port, both named directly by the
// author:**
// - **The fire-spit animation**: the source's own sequence is
//   `switch costume to open-mouth; create clone of Flame; wait 0.2 secs;
//   switch costume to closed-mouth; wait 1.8 secs` — the mouth reverts to
//   closed only 0.2s after the fireball launches, so the dragon's jaw is
//   already shut again while the flame is still visibly leaving the frame,
//   a real visual mismatch. `SPIT_HOLD` (0.4s, up from the source's 0.2s)
//   keeps the mouth open long enough for the launch to actually read as a
//   spit, and the flame itself now launches at the *midpoint* of that hold
//   rather than the instant the jaw opens, so the animation has a beat to
//   telegraph before the fireball appears.
// - **Walls spawning on top of him**: the source's own Wall clone script is
//   a literal `go to random position`, which can (and did) drop a
//   full-height wall bar directly through his own body. `spawnPlasmaWall`
//   keeps every new wall's X at least `WALL_CLEARANCE` from his own centre
//   (re-rolling until clear), the same "keep the telegraph off the thing it
//   shouldn't overlap" idea `gemwarning.js`'s own `spawnGemWarning` already
//   uses for the player.
//
// **The chomp easter egg** (`Plasmadrache_chomp_instakill.wav`, uploaded but
// never referenced by any script in the source — a dead asset, same
// situation `knight.js`'s own "поп" was already in, given a real job here):
// landing *any* qualifying hit (charged shot or a SLASH) while standing
// within `CHOMP_RANGE` of his mouth **and** his mouth is currently open
// (mid-spit) instead damages nothing — he chomps the player instead, an
// unconditional instakill (bypassing invulnerability entirely, unlike a
// normal hit) that heals him by `world.healOrbsCollected` (this stage's
// own running count of heal orbs actually picked up, `heal.js`) capped at
// his own max HP. LINE SLASHER — the very weapon this level forces on an
// uncleared run — is naturally the riskiest tool against him here: its own
// SLASH_RANGE (1.5) already requires standing close enough to land a hit at
// all, well within CHOMP_RANGE, so meleeing him without care is a real trap
// — the same "melee is a tradeoff, not a strict upgrade" lesson the rest of
// this level already teaches, just with a harsher punishment.
//
// This is currently the only cutscene in the game: `chomp()`/`updateChomp()`
// freeze the player (`frozen = true`) and show a taunt line near him
// (`hud.setCenter`) — which one depends on `world.chompCount`, a per-run
// tally (progress.js's `getChompCount`/`setChompCount`, carried across
// stages and TRY AGAIN like lives, only forgotten on GIVE UP) — held for
// `CUTSCENE_TIME` before the player is actually killed (mirroring
// `Player.die()` without its own 'death' cue, since 'plasmaChomp' already
// played) and the normal Game Over flow takes over. main.js's main loop
// checks `world.player.dead` every frame regardless of the level's own
// async phase code, so nothing here sets it true until the cutscene has
// fully played out — level4.js's own phase5 just awaits the fight ending
// (`boss.dead || player.dead`) the same way every other boss phase does.
import { Hittable, DARKBLUE, toScreen, HALF_W, HALF_H, rand, dist, PPU } from './core.js';
import { paletteColor } from './retro.js';
import { Wall } from './wall.js';
import { spawnPlasmaFlame } from './plasmaflame.js';
import { getChompCount, setChompCount, recordHit } from './progress.js';
import { getToxicMode } from './settings.js';

const MAX_HP = 30;

// **Redrawn as a full-body dragon**, per direct request ("change current
// look of plasmadrache to this one (and animate wings and jaw when firing
// or chomping)", uploading `Plasmadrache_Delta.svg`). The old art was just
// a floating head (two raster costumes, closed/open mouth). The new SVG is
// split by part into four raster layers, each its own PIXI.Sprite in one
// container, so the wings and jaw can move on their own:
//   body  - torso, legs, head, horns, eyes, upper fangs
//   wingL / wingR - the dark-blue wing frames plus the scale spikes along them
//   jaw   - the cyan lower jaw
// Rasterized at TEXTURE_PX_PER_UNIT from the SVG with the stroke thickened
// (0.5 -> 2.4 design units; at the source's own width the lines would be
// under half a pixel on screen), then cropped. `pos` is each layer's pivot
// (wings: the shoulder the wing rotates around; body/jaw: top-left corner)
// relative to the container origin, which is the torso centre -- the point
// `this.x/this.y` tracks. All in texture px.
const TEXTURE_PX_PER_UNIT = 2;
const DISPLAY_SCALE = 0.9 / TEXTURE_PX_PER_UNIT;   // 0.9 screen px per design unit (~320px tall)
const UNIT = 0.9 / 70;                  // world units per design unit
const LAYERS = {
  // The tail (the long line with the arrowhead behind the left wing) is its
  // own still layer, so it doesn't flap with the wing it used to be cut into.
  tail:  { url: 'assets/sprites/plasmadrache/tail.png',  anchor: [0, 0],           pos: [-307.5, -323.9] },
  // The lines and cyan diamond scales hanging under each wing (his "arms")
  // are their own still layers, split off the wing PNGs pixel-for-pixel
  // (same size, anchor and pos), so only the wing frames flap -- per direct
  // request ("plasmadrache shouldn't move it's arms when flying").
  armL:  { url: 'assets/sprites/plasmadrache/armL.png',  anchor: [0.9119, 0.6977], pos: [-88.0, -62.0] },
  armR:  { url: 'assets/sprites/plasmadrache/armR.png',  anchor: [0.0875, 0.7247], pos: [88.0, -52.0] },
  wingL: { url: 'assets/sprites/plasmadrache/wingL.png', anchor: [0.9119, 0.6977], pos: [-88.0, -62.0] },
  wingR: { url: 'assets/sprites/plasmadrache/wingR.png', anchor: [0.0875, 0.7247], pos: [88.0, -52.0] },
  body:  { url: 'assets/sprites/plasmadrache/body.png',  anchor: [0, 0],           pos: [-168.5, -357.9] },
  jaw:   { url: 'assets/sprites/plasmadrache/jaw.png',   anchor: [0, 0],           pos: [-38.5, -174.9] },
};

// **Recoloured dark blue / cyan, hittable everywhere** -- per direct request
// ("Color Plasmadrache ... in Dark Blue/Cyan, aka so you can hit him from
// everywhere (eyes still purple)"): the SVG's pink lines are drawn cobalt,
// its purple details cyan, the eyes purple (the same cobalt body / cyan
// trim / purple accent as the Knight, also DARK BLUE). Still DARK BLUE:
// charged hits only. Hit/touch areas now cover the whole silhouette --
// torso, head, both wings and the legs/feet -- as circles in design units
// from the torso centre (x, y, r), checked in hitTest() for shots and
// updateTouch() for contact.
//
// **The torso is armour** — per direct request, once LINE SLASHER's dash
// started dealing damage ("make so you can't damage it's body (aka what
// isn't a head, tail, hands, legs or wings) and vice versa so damage could
// be possible"): a hit on the striped belly still lands (shots break on it,
// contact still hurts) but deals no damage, with a ricochet clang. Only the
// limbs below take damage — the head, the arms, the legs/feet and the
// wings (the art has no tail). Where a limb circle overlaps the torso, the
// limb wins. Parking a dash inside his body therefore does nothing.
const TORSO = [0, 0, 74].map(v => v * UNIT);
const LIMB_CIRCLES = [
  [-3, -130, 45],      // head
  [-40, -76, 22],      // left arm
  [36, -75, 20],       // right arm
  [-112, -115, 58],    // left wing, upper
  [-97, -15, 48],      // left wing, scale spikes
  [112, -115, 58],     // right wing, upper
  [101, -15, 48],      // right wing, scale spikes
  [-53, 55, 28],       // left leg
  [62, 55, 28],        // right leg
  [-47, 125, 42],      // left foot
  [53, 125, 42],       // right foot
].map(([x, y, r]) => [x * UNIT, y * UNIT, r * UNIT]);
// this.radius only feeds weapons that use a plain distance check (LINE
// SLASHER's SLASH, mobile aim assist): wide enough that slashing a wing
// counts, as the request asks.
const RADIUS = 1.7;

// Mouth: the gap between the upper fangs and the cyan jaw, 80 design units
// above the torso centre. Fireballs launch from here; the chomp checks the
// player's distance to it. CHOMP_RANGE stays 1.6 (bigger than SLASH_RANGE)
// so slashing the head while the mouth is open reliably counts.
const MOUTH_OFFSET_Y = -80 * UNIT;
const CHOMP_RANGE = 1.6;

// Animation, deliberately stepped (not tweened), same as Plasmadrache
// Delta's wings: each pose holds for WING_STEP. The wings flap the whole
// fight (per direct request: "constantly move his wings BUT NOT TAIL"),
// but not the arms under them (`armL`/`armR` above).
const WING_POSES = [0, 0.14, 0.28, 0.14];   // radians; mirrored for the right wing
const WING_STEP = 0.1;
const JAW_DROP = 24;            // texture px (12 design units) the jaw drops when open
const BITE_STEP = 0.14;         // chomp: jaw snaps open/shut every BITE_STEP...
const BITE_COUNT = 3;           // ...this many times, at the start of the cutscene

const WALL_BATCHES = 2, WALLS_PER_BATCH = 2;   // matches the source's own repeat 2
// Each batch now runs warning -> appear -> hold -> disappear, per direct
// request ("those walls are supposed to 'warning sprite -> appear -> wait
// for 2 sec -> dissapear -> repeat'"). They used to just appear (4s apart)
// and stand until the next wall cycle.
const WALL_WARN = 1.0;          // blinking outline where each wall is about to appear
const WALL_HOLD = 2;            // seconds a wall stands before vanishing
const WALL_CLEARANCE = 2.3;     // world units either side of his own centre X (clears the wingspan)
const WALL_COLOR_ROLES = ['grape', 'cobalt', 'ring'];   // grape/cobalt/ring -- the wall batch's colour, see spawnPlasmaWall

const FLAME_COUNT = 20;         // matches the source's own repeat 20
const SPIT_HOLD = 0.4;          // mouth-open duration (up from the source's 0.2s -- see file header)
// SPIT_REST: mouth-closed duration between spits. Down from 1.6s (a ~2s
// cycle, matching the source's own timing almost exactly) to 0.7s (a ~1.1s
// cycle) per direct request ("make his projectiles slower but make him spam
// them more often") -- paired with plasmaflame.js's own slower SPEED, so
// each individual fireball is easier to read and dodge, but they come at
// the player close to twice as often overall.
const SPIT_REST = 0.7;

const TOUCH_DAMAGE = 1;         // per direct request -- see the constructor's own comment
// Slow wander so simply camping at range isn't free -- per direct request
// ("make him move around (not fast, but so player required to put efford
// to hit him)"). Bounded well inside the arena so he never wanders past
// where WALL_CLEARANCE/spawnPlasmaWall already expect him to roughly be,
// and never so close to an edge that a wall or fireball spawn point (his
// own mouth) would clip off-screen.
const MOVE_SPEED = 0.9;         // world units/s
const MOVE_BOUND_X = HALF_W - 2.3;   // wingtips reach ~2.15 either side
const MOVE_BOUND_Y = HALF_H - 2.6;   // horns reach ~2.5 up, feet ~2.1 down
const MOVE_RETARGET_MIN = 2.5, MOVE_RETARGET_MAX = 5;   // seconds between picking a new wander point
const MOVE_ARRIVE_DIST = 0.15;

// A real bug fixed here: the level's own phase5 (level4.js) only ever calls
// clearEntities() once the whole fight is over, and enterWalls()/
// spawnWallBatch() had no cleanup of their own, so every "walls" cycle (he
// alternates walls <-> flames forever until defeated) just kept adding
// WALLS_PER_BATCH more grape/cobalt/ring bars on top of whatever was
// already standing -- a long fight could eventually clutter most of the
// arena with permanently-solid (grape) walls, well past anything
// spawnPlasmaWall's own WALL_CLEARANCE check accounts for (it only keeps a
// *new* wall off his current position, not off the pile of old ones).
// clearMyWalls() (called at the top of every enterWalls(), see below) tears
// down the previous cycle's own walls before the next batch spawns, so the
// arena never holds more than one "walls" cycle's worth of his own bars at
// a time.

// The chomp cutscene is two beats, not one flat hold: a "hit voided" white
// flash (mouth closes, taunt shown) then, after a pause, a final pink
// flash right before the instakill actually lands -- see chomp()'s own
// comment for why. CUTSCENE_TIME (still the *total* hold before the kill,
// same 2.6s as before) is now just their sum.
const WHITE_TIME = 1.6;         // hit-voided flash / taunt / mouth closes
const PINK_TIME = 1.0;          // final warning flash before the instakill
const CUTSCENE_TIME = WHITE_TIME + PINK_TIME;

export class Plasmadrache extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: DARKBLUE, radius: RADIUS, damage: TOUCH_DAMAGE, countsAsProgress: false });
    this.isBoss = true;   // a supercharged shot stops on it instead of piercing (bullet.js)
    this.world = world;
    this.alive = true;
    this.hp = MAX_HP;
    this.mode = null;           // 'walls' | 'flames' | 'chomping' | 'done'
    this.t = 0;                 // time within the current mode/beat
    this.wallBatch = 0;
    this.flamesSpawned = 0;
    this.spitPhase = 'closed';  // 'closed' | 'open', while mode === 'flames'
    this.spitLaunched = false;
    this.mouthOpen = false;
    this.chompedPlayer = false; // set true the moment a chomp lands (informational only)
    this.chompLine = '';
    this.pinked = false;        // flips once the cutscene's 2nd (pink) beat starts

    this.myWalls = [];          // his own currently-standing walls -- see clearMyWalls()
    this.myWarnings = [];       // WallWarnings for the batch about to appear
    this.wallPhase = 'warn';    // 'warn' | 'hold', while mode === 'walls'
    this.wallRole = 'grape';
    this.moveTarget = { x, y };
    this.moveRetargetT = rand(MOVE_RETARGET_MIN, MOVE_RETARGET_MAX);

    this.flapT = 0;
    this.biteT = -1;            // >= 0 while the chomp's bite animation runs
    this.container = new PIXI.Container();
    this.container.scale.set(DISPLAY_SCALE);
    this.sprites = {};
    for (const [name, c] of Object.entries(LAYERS)) {
      const spr = PIXI.Sprite.from(c.url);
      spr.anchor.set(c.anchor[0], c.anchor[1]);
      spr.position.set(c.pos[0], c.pos[1]);
      this.container.addChild(spr);
      this.sprites[name] = spr;
    }
    world.stage.addChild(this.container);
    this.place();
    this.enterWalls();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }
  mouthPos() { return { x: this.x, y: this.y + MOUTH_OFFSET_Y }; }

  // Which part a circle at (x, y, r) touches: 'limb' (takes damage),
  // 'armor' (the torso, no damage) or null. Limbs win over the torso.
  partAt(x, y, r) {
    for (const [cx, cy, cr] of LIMB_CIRCLES) {
      if (dist(this.x + cx, this.y + cy, x, y) <= cr + r) return 'limb';
    }
    const [tx, ty, tr] = TORSO;
    return dist(this.x + tx, this.y + ty, x, y) <= tr + r ? 'armor' : null;
  }

  // Shots and the dash: anything touching him registers; the part it
  // touched is remembered for the die() call that follows.
  hitTest(x, y, r) {
    const part = this.partAt(x, y, r);
    if (part) this.hitPart = part;
    return !!part;
  }

  // A SLASH never calls hitTest() (it reads x/y/radius), so its part is the
  // one nearest the player.
  nearestPart(px, py) {
    let best = 'armor', bestD = dist(this.x + TORSO[0], this.y + TORSO[1], px, py) - TORSO[2];
    for (const [cx, cy, cr] of LIMB_CIRCLES) {
      const d = dist(this.x + cx, this.y + cy, px, py) - cr;
      if (d < bestD) { bestD = d; best = 'limb'; }
    }
    return best;
  }

  setJaw(open) { this.sprites.jaw.y = LAYERS.jaw.pos[1] + (open ? JAW_DROP : 0); }

  // Stepped wing flap while `on`; snaps back to rest otherwise.
  animateWings(dt, on) {
    if (!on) { this.flapT = 0; this.sprites.wingL.rotation = 0; this.sprites.wingR.rotation = 0; return; }
    this.flapT += dt;
    const a = WING_POSES[Math.floor(this.flapT / WING_STEP) % WING_POSES.length];
    this.sprites.wingL.rotation = a;
    this.sprites.wingR.rotation = -a;
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    this.hitPart = null;   // a hitTest() record never outlives its frame
    if (this.mode === 'chomping') { this.updateChomp(dt); return; }
    this.animateWings(dt, true);
    // Movement and touch-damage run regardless of walls/flames mode -- he's
    // always a threat to stand next to now, not just while spitting.
    this.updateMovement(dt);
    this.updateTouch();
    if (this.mode === 'walls') this.updateWalls(dt);
    else if (this.mode === 'flames') this.updateFlames();
  }

  // A slow, continuous wander toward a randomly-retargeted point within
  // MOVE_BOUND_X/Y -- per direct request, so simply camping at range and
  // plinking him isn't free; landing a hit now takes a little tracking. He
  // re-aims on arrival or after a random MOVE_RETARGET_MIN..MAX beat,
  // whichever comes first, so he doesn't just sit still once he happens to
  // reach a target early.
  updateMovement(dt) {
    const dx = this.moveTarget.x - this.x, dy = this.moveTarget.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > MOVE_ARRIVE_DIST) {
      this.x += (dx / d) * MOVE_SPEED * dt;
      this.y += (dy / d) * MOVE_SPEED * dt;
    }
    this.moveRetargetT -= dt;
    if (d <= MOVE_ARRIVE_DIST || this.moveRetargetT <= 0) {
      this.moveRetargetT = rand(MOVE_RETARGET_MIN, MOVE_RETARGET_MAX);
      this.moveTarget = { x: rand(-MOVE_BOUND_X, MOVE_BOUND_X), y: rand(-MOVE_BOUND_Y, MOVE_BOUND_Y) };
    }
    this.place();
  }

  // Direct contact now actually hurts -- reported directly ("right now you
  // don't get damaged if you touch him directly"). He was built to never
  // touch-damage the player at all (showman.js's own boss made the same
  // call, "the real threat is the hazards around him, not his body") --
  // reversed here per this request: combined with him now moving toward the
  // player instead of standing still, his body itself is a real hazard too,
  // not just the walls/fireballs around it.
  updateTouch() {
    const p = this.world.player;
    // Only the limbs hurt to touch: the torso (armour) is safe to stand on,
    // so the open mouth can be reached (per direct request).
    if (p && !p.invulnerable && !p.dead && LIMB_CIRCLES.some(([cx, cy, cr]) => p.touchesCircle(this.x + cx, this.y + cy, cr))) {
      p.takeDamage(this.damage);
    }
  }

  // --- WALLS: WALL_BATCHES batches, each warn (WALL_WARN) -> walls stand
  // (WALL_HOLD) -> walls vanish, then the next batch; then the flames ---
  enterWalls() {
    this.mode = 'walls';
    this.wallBatch = 0;
    this.clearMyWalls();   // see the file header's own comment on this bug
    this.startWallWarn();
  }

  // Picks this batch's colour and spots and shows the warnings.
  startWallWarn() {
    this.wallPhase = 'warn';
    this.t = 0;
    this.wallRole = WALL_COLOR_ROLES[Math.floor(rand(0, WALL_COLOR_ROLES.length))];
    for (let i = 0; i < WALLS_PER_BATCH; i++) {
      const x = pickWallX(this.x);
      this.myWarnings.push(new WallWarning(this.world, x, this.wallRole));
    }
  }

  // Tears down his own walls and pending warnings (see the file header for
  // why the walls need this at all).
  clearMyWalls() {
    for (const w of this.myWalls) w.destroy();
    this.myWalls.length = 0;
    for (const w of this.myWarnings) w.destroy();
    this.myWarnings.length = 0;
  }

  updateWalls(dt) {
    for (const w of this.myWarnings) w.update(dt);
    if (this.wallPhase === 'warn') {
      if (this.t < WALL_WARN) return;
      this.t = 0;
      this.wallPhase = 'hold';
      for (const w of this.myWarnings) this.myWalls.push(spawnPlasmaWall(this.world, w.x, this.wallRole));
      for (const w of this.myWarnings) w.destroy();
      this.myWarnings.length = 0;
      return;
    }
    // 'hold'
    if (this.t < WALL_HOLD) return;
    this.clearMyWalls();
    this.wallBatch++;
    if (this.wallBatch >= WALL_BATCHES) { this.enterFlames(); return; }
    this.startWallWarn();
  }

  // --- FLAMES: FLAME_COUNT spits, each a SPIT_HOLD mouth-open beat (the
  // fireball actually launches at its midpoint, see the file header) then a
  // SPIT_REST closed-mouth beat before the next one ---
  enterFlames() {
    this.mode = 'flames';
    this.t = 0;
    this.flamesSpawned = 0;
    this.closeMouth();
  }

  updateFlames() {
    if (this.spitPhase === 'closed') {
      if (this.t >= SPIT_REST) { this.t = 0; this.openMouth(); }
      return;
    }
    // 'open'
    if (!this.spitLaunched && this.t >= SPIT_HOLD / 2) {
      this.spitLaunched = true;
      this.flamesSpawned++;
      const m = this.mouthPos();
      spawnPlasmaFlame(this.world, m.x, m.y);
    }
    if (this.t >= SPIT_HOLD) {
      this.t = 0;
      this.closeMouth();
      if (this.flamesSpawned >= FLAME_COUNT) this.enterWalls();
    }
  }

  openMouth() {
    this.spitPhase = 'open'; this.mouthOpen = true; this.spitLaunched = false;
    this.setJaw(true);
  }
  closeMouth() {
    this.spitPhase = 'closed'; this.mouthOpen = false;
    this.setJaw(false);
  }

  // Any qualifying hit (charged shot, or LINE SLASHER's own SLASH, which
  // treats itself as charged) lands here. Chomps instead of damaging when
  // the player is close to the (currently open) mouth -- see the file
  // header for the full mechanic.
  die(dmg = 1) {
    if (this.dead || this.mode === 'chomping') return;
    const p = this.world.player;
    if (this.mouthOpen && p && !p.dead) {
      const m = this.mouthPos();
      if (dist(m.x, m.y, p.x, p.y) <= CHOMP_RANGE) { this.chomp(); return; }
    }
    const part = this.hitPart || (p ? this.nearestPart(p.x, p.y) : 'limb');
    this.hitPart = null;
    if (part === 'armor') { this.world.audio.play('ricochet', 0.5); return; }
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.defeat(); return; }
    this.world.audio.play('bossHurt', 0.7);
  }

  chomp() {
    this.mode = 'chomping';
    this.t = 0;
    this.pinked = false;
    this.chompedPlayer = true;
    const p = this.world.player;
    if (p) {
      p.frozen = true;
      // A frozen player can't dodge anything, and update()'s own early
      // return for mode === 'chomping' only stops *new* walls/flames from
      // spawning -- whatever's already in flight (or the maze walls
      // already standing) could still land a hit during the freeze. Without
      // this, that ordinary damage could zero the player's HP and trigger
      // a normal Game Over before the scripted kill below ever fires --
      // reported back as the easter egg "still doesn't trigger," when it
      // actually was firing, just losing the race to an unrelated death
      // every time. player.js's own invulnerable getter reads straight off
      // invulnUntil vs. its own running time clock, which keeps advancing
      // while frozen (update()'s `this.time += dt` runs before the frozen
      // check), so this covers the whole cutscene correctly.
      p.invulnUntil = p.time + CUTSCENE_TIME + 0.1;
    }
    this.hp = Math.min(MAX_HP, this.hp + (this.world.healOrbsCollected || 0));
    // world.chompCount was loaded from progress.js's getChompCount() at boot
    // (main.js) -- bump it here and persist it right away so it survives
    // even if the tab closes mid-cutscene, same "write through immediately"
    // rule world.lives/setLives already follows for a death.
    this.world.chompCount = (this.world.chompCount || getChompCount()) + 1;
    setChompCount(this.world.chompCount);
    this.chompLine = chompTaunt(this.world.chompCount);
    this.world.audio.play('plasmaChomp', 1.0);
    if (this.world.hud) {
      this.world.hud.setCenter(this.chompLine);
      this.world.hud.setNearHp(getToxicMode() ? 'YOU SCREWED UP' : 'CHOMPED!');
    }
    // The mouth closes as part of this same "hit voided" beat -- the
    // attack that triggered the chomp is over, he's not still mid-bite for
    // the whole cutscene.
    this.closeMouth();
    this.biteT = 0;             // the jaw snaps a few times (updateChomp)
    this.flashWhite();
  }

  // Both flashes use additive blending, not a plain multiply tint: his own
  // body art (see the file header) is drawn as stroke-only blue linework on
  // a transparent background, and a multiply tint can only ever darken or
  // re-scale channels the texture already has -- it can never brighten
  // fully-saturated blue pixels toward white or pink. Additive blending
  // adds the tint colour on top instead, which does push those same pixels
  // toward whatever solid colour is asked for, regardless of the source hue.
  flashWhite() { this.flash(0xffffff); }
  flash(color) {
    for (const s of Object.values(this.sprites)) { s.tint = color; s.blendMode = PIXI.BLEND_MODES.ADD; }
  }

  // The final beat right before the instakill actually lands (updateChomp).
  flashPink() { this.flash(0xFF3399); }

  // Two beats, then -- and only then -- actually kills the player: main.js's
  // main loop checks `world.player.dead` every frame regardless of what the
  // level's own async phase code is doing, so the instakill has to wait for
  // the cutscene to finish playing out here rather than firing the instant
  // the chomp lands, or Game Over would cut the taunt off before it's ever
  // read.
  updateChomp(dt) {
    // The bite: BITE_COUNT open/shut snaps, wings flapping along, then still.
    if (this.biteT >= 0) {
      this.biteT += dt;
      const step = Math.floor(this.biteT / BITE_STEP);
      if (step >= BITE_COUNT * 2) { this.biteT = -1; this.setJaw(false); this.animateWings(dt, false); }
      else { this.setJaw(step % 2 === 0); this.animateWings(dt, true); }
    }
    if (!this.pinked && this.t >= WHITE_TIME) { this.pinked = true; this.flashPink(); }
    if (this.t < CUTSCENE_TIME) return;
    this.mode = 'done';
    const p = this.world.player;
    // Not p.die() -- that plays the standard 'hurt'-adjacent 'death' cue,
    // which would double up on the 'plasmaChomp' sting already played when
    // the chomp itself landed. Do exactly what die() does otherwise (flag
    // dead, hide the sprite) so main.js's own per-frame check still catches
    // it and runs the normal Game Over flow right after.
    if (p) {
      this.world.killedBy = 'chomp';
      p.dead = true; p.frozen = false; if (p.container) p.container.visible = false;
      // Bypasses takeDamage() -- the instakill is a direct p.dead flag flip,
      // not damage -- so record the hit here for the hub's stats to stay accurate.
      recordHit(this.world.currentLevelId, true);
    }
    if (this.world.hud) this.world.hud.setNearHp('');
  }

  defeat() {
    this.dead = true;
    this.world.addScore(200);
    this.world.audio.play('bossDefeat', 0.9);
    this.destroy();
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {   // only the limbs hurt; the torso is safe to stand on
    return { shapes: LIMB_CIRCLES.map(([cx, cy, cr]) => ({ circle: [this.x + cx, this.y + cy, cr] })) };
  }
  destroy() {
    this.alive = false;
    this.dead = true;
    this.clearMyWalls();   // defensive -- clearEntities() also tears these down via world.updatables
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// Random X at least WALL_CLEARANCE from Plasmadrache's own centre (so a wall
// never drops through his body) -- see the file header.
function pickWallX(bossX) {
  let x;
  do { x = rand(-HALF_W + 0.5, HALF_W - 0.5); } while (Math.abs(x - bossX) < WALL_CLEARANCE);
  return x;
}

// A full-height wall bar (matches the source's own Wall), pierceable: a
// charged shot, SLASH or dash goes straight through it (wall.js), per direct
// request ("remove penetration immunity from walls of HIS bossfight").
// Ring/cobalt walls can still be destroyed by the usual colour rule.
function spawnPlasmaWall(world, x, role) {
  const wall = world.add(new Wall(world, x - 0.06, x + 0.06, -HALF_H, HALF_H, role, { pierceable: true }));
  world.audio.play('plasmaWallPop', 0.5);
  return wall;   // so the caller can track it in this.myWalls
}

// The warning shown where a wall is about to appear: a blinking outline of
// the wall's full-height bar, in the wall's own colour, slightly wider than
// the wall so it reads at a glance. Harmless, not a Wall (doesn't block).
class WallWarning {
  constructor(world, x, role) {
    this.world = world;
    this.x = x;
    this.t = 0;
    const [sx, sy0] = toScreen(x, -HALF_H);
    const [, sy1] = toScreen(x, HALF_H);
    const w = 0.4 * PPU;
    this.g = new PIXI.Graphics();
    this.g.lineStyle({ width: 2, color: paletteColor(role), alpha: 1 });
    this.g.drawRect(sx - w / 2, sy0, w, sy1 - sy0);
    this.g.zIndex = -1;
    world.stage.addChild(this.g);
  }
  update(dt) {
    this.t += dt;
    if (this.g && !this.g.destroyed) this.g.alpha = Math.floor(this.t / 0.125) % 2 ? 0.25 : 0.9;
  }
  destroy() {
    if (this.g && !this.g.destroyed) this.g.destroy();
  }
}

// The rude lines only with TOXIC MODE on (12+, OPTIONS); otherwise a clean
// version — per direct request ("Make so these text won't appear if toxic
// mode is off").
function chompTaunt(count) {
  if (!getToxicMode()) {
    if (count <= 1) return 'CHOMP!';
    if (count === 2) return 'Ha! You fell for it again!';
    if (count === 3) return 'Ha! That\'s three times now!';
    return `That's ${count} times this run!`;
  }
  if (count <= 1) return 'GG EZ';
  if (count === 2) return 'Pfft, he fell for that a second time?!';
  if (count === 3) return 'Pfft, he fell for that a third time?!';
  return `What a dumbass, that's ${count} times this run already!`;
}
