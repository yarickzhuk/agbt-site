// finale.js — THE FINALE's boss: the mothership itself (phase 1/3).
// The same Mothership.json hull every escape finale's crushing ceiling uses,
// but here it only sinks far enough to be seen (PARK_BOTTOM), parks, and
// spams the three attacks the author uploaded for it, one after another:
//
//  - MACHINE GUN (`Mashine_Gun2.sprite3`): on its `boom` broadcast, wait 1s,
//    then 10 times { point towards Player; 5 x { turn right 45; 3 x { turn
//    left 15; clone } }; wait 0.5 }. The turns net to the same three
//    headings (aim+30/+15/0) every pass, and every clone of a volley is born
//    on the same frame, so in Scratch the 15 bullets sit exactly on top of
//    each other. Ported as the evident intent: a 3-way fan aimed at the
//    player (centred, ±15°), fired as 5 quick rounds so it reads as a
//    machine-gun burst, 10 volleys 0.5s apart. Clones fly straight to the
//    edge (`move 5` until touching edge).
//  - BULLET GENERATOR (`Bullet_genereator_1.sprite3`): on `Splash`, 10 x
//    { 6 clones 60° apart; goto random; wait 2 }, each clone moving 100
//    steps with if-on-edge-bounce. Ported as a 6-shard ring from a random
//    spot (kept clear of the player), shards bouncing off the screen edges
//    and the ship's own underside until their short life runs out.
//  - SPEARS (`Spear.sprite3`, the same art spear.js already uses): on
//    `Spears`, 10 x { goto random; point towards Player; clone; wait 1 }.
//    Launched here from a random point along the hull's underside rather
//    than anywhere on screen, so they read as the ship firing them.
//
// None of the three sources carries any HP or damage logic — the 200 HP,
// the CYAN hit rule (the hull's cyan cockpit and windows; any shot lands,
// for whatever damage tier bullet.js passes), and contact damage are built
// fresh from the brief.
//
// Music, per direct request ("first play normal mothership_invasion.wav,
// and then use this one, loop middle part and play end part once you
// cleared it"): Mothership_invasion.wav (the escape finales' own theme)
// plays once from the moment the ship starts sinking in, then
// Mothership_Attacks.mp3 is scheduled to start the instant it ends. That
// track's 2.1-14.0s stretch repeats sample-for-sample at 37.6-49.5s (a 35.5s
// period), so it plays 0-3s once as a lead-in and then loops 3.0-38.5s
// seamlessly; clearing the boss cuts the loop and plays its own ending from
// 49.5s (the fill + final hit, ~3.5s) once. All three `поп` sounds are the same dead Scratch
// filler seen in every earlier upload, so they stay unused.
import { buildSprite, getShape } from './retro.js';
import { Hittable, CYAN, PURPLE, toScreen, HALF_W, HALF_H, rand, dist, clamp } from './core.js';
import { useSilhouette } from './silhouette.js';
import { polyPolyDist, HULL_STROKE } from './shiphull.js';
import { Spear } from './spear.js';
import { SplashWarning } from './splash.js';

export const MAX_HP = 200;
const DESCENT_SPEED = 1.2;           // world units/s while sinking into view
const PARK_BOTTOM = -HALF_H + 2.6;   // the hull's lowest point once parked
const TOUCH_DAMAGE = 1;
const HP_SCORE = 100, DEFEAT_SCORE = 1000;
const HIT_FLASH = 0.12;
const HURT_SOUND_GAP = 0.08;

// attack pacing (first-pass)
const ATTACK_GAP = 1.0;              // between one attack pattern ending and the next starting
const GUN_LEAD = 1.0;                // the source's own `wait 1` before the first volley
const GUN_VOLLEYS = 10, GUN_ROUNDS = 5, GUN_ROUND_GAP = 0.07, GUN_VOLLEY_GAP = 0.5;
const GUN_SPREAD = 15 * Math.PI / 180;
const GUN_SPEED = 5.5;
const SPLASH_BURSTS = 7, SPLASH_GAP = 2.4, SPLASH_RAYS = 6;
const SHARD_SPEED = 4.5, SHARD_LIFE = 2.2, SHARD_SCALE = 1;
const SPLASH_PLAYER_CLEAR = 2.5;
const SPEAR_COUNT = 24, SPEAR_GAP = 0.45;   // was 10 x 1s; "more spam of spears"
const ORDER = ['gun', 'splash', 'spears'];

// music (see header)
const MUSIC_VOL = 0.6;
const ATTACKS_LOOP_START = 3.0, ATTACKS_LOOP_END = 38.5, ATTACKS_END_AT = 49.5;
// Defeat, per direct request ("It's instead of normal destruction boss
// sound exclusively for this phase", with two uploads): no bossDefeat.
// Destroyed_mothership_build_up plays while the hull shakes and flickers
// for BUILD_TIME, then it blows up to Destroyed_mothership_end alongside
// the track's own ending. Both uploads were 16s, the end one a 4s
// blast-and-rumble cycle repeated 4x (the usual looped export) -- each is
// cut to 4s; the build-up is a steady roar, so it simply loops until the
// blast and is faded out under it.
const BUILD_TIME = 3.0;
const BLAST_TIME = 4.0;              // the trimmed end sound / ending stinger
const SHAKE = 0.12;                  // world units
export const DEFEAT_SEQUENCE_TIME = BUILD_TIME + BLAST_TIME;

// Mothership.json's own outline, design units (400 x 120): the hull and the
// cockpit nub under it.
const HULL = [[0, 4], [400, 4], [366, 64], [300, 104], [100, 104], [34, 64]];
const COCKPIT = [[150, 104], [250, 104], [224, 118], [176, 118]];

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The underside's design-space y at design x (lower envelope of hull + cockpit).
function undersideY(dx) {
  const c = Math.abs(dx - 200);
  if (c <= 24) return 118;
  if (c <= 50) return 118 - (c - 24) / 26 * 14;
  if (c <= 100) return 104;
  if (c <= 166) return 104 - (c - 100) / 66 * 40;
  return 64 - (c - 166) / 34 * 60;
}

class GunBullet extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: 0.1, damage: 1, countsAsProgress: false });
    this.world = world; this.vx = vx; this.vy = vy;
    this.container = buildSprite('GunBullet', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
  }
  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }
  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.place();
    if (Math.abs(this.x) > HALF_W + 0.5 || Math.abs(this.y) > HALF_H + 0.5) { this.destroy(); return; }
    const p = this.world.player;
    if (p && !p.dead && !p.invulnerable && this.touches(p)) {
      p.takeDamage(this.damage);
      this.destroy();
    }
  }
  destroy() {
    this.alive = false; this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

class SplashShard extends Hittable {
  constructor(world, x, y, a, ceiling) {
    super(world, { x, y, color: PURPLE, radius: 0.13, damage: 1, countsAsProgress: false });
    this.world = world;
    this.vx = Math.cos(a) * SHARD_SPEED; this.vy = Math.sin(a) * SHARD_SPEED;
    this.ceiling = ceiling;
    this.t = 0;
    this.container = buildSprite('SplashShard', { scale: SHARD_SCALE, lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
  }
  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = Math.atan2(this.vy, this.vx);
    this.container.alpha = this.t > SHARD_LIFE - 0.3 ? Math.max(0, (SHARD_LIFE - this.t) / 0.3) : 1;
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.t >= SHARD_LIFE) { this.destroy(); return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    // if-on-edge-bounce, with the parked ship's underside as the ceiling
    const lx = HALF_W - this.radius, top = this.ceiling + this.radius, bot = HALF_H - this.radius;
    if (this.x < -lx) { this.x = -lx; this.vx = Math.abs(this.vx); }
    if (this.x > lx) { this.x = lx; this.vx = -Math.abs(this.vx); }
    if (this.y < top) { this.y = top; this.vy = Math.abs(this.vy); }
    if (this.y > bot) { this.y = bot; this.vy = -Math.abs(this.vy); }
    this.place();
    const p = this.world.player;
    if (p && !p.dead && !p.invulnerable && this.touches(p)) {
      p.takeDamage(this.damage);
      this.destroy();
    }
  }
  destroy() {
    this.alive = false; this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// The boss. A Hittable (not the world.boss slot) so LINE SLASHER's SLASH can
// reach it too: every frame its x/y/radius are moved to the point of the
// underside nearest the player (what a swing would actually connect with),
// while projectiles test the real hull outline through hitTest().
export class MothershipBoss extends Hittable {
  constructor(world) {
    super(world, { x: 0, y: -HALF_H, color: CYAN, radius: 0.35, damage: TOUCH_DAMAGE,
                   countsAsProgress: false, destroySound: null });
    this.isBoss = true;   // a supercharged shot stops on it instead of piercing (bullet.js)
    this.world = world;
    this.hp = MAX_HP;
    this.defeated = false;

    const s = getShape('Mothership');            // 400 x 120 design
    this.k = (2 * HALF_W) / (s.width / 100);      // fills the screen width, like every other mothership
    this.halfHeight = (s.height / 100) * this.k / 2;
    this.parkY = PARK_BOTTOM - (118 - 60) / 100 * this.k;   // cockpit tip (y=118) at PARK_BOTTOM
    this.cy = -HALF_H - this.halfHeight;           // starts fully above the screen
    this.parked = false;

    this.container = buildSprite('Mothership', { scale: this.k, lineWidth: 2 });
    this.container.zIndex = 15;
    world.stage.addChild(this.container);
    this.place();

    this.flashT = 0;
    this.hurtT = 0;
    this.attack = null;      // { kind, t, n, ... } -- the live pattern
    this.attackIdx = 0;
    this.gapT = ATTACK_GAP;
    this.pewT = 0;
    this.startMusic();
  }

  startMusic() {
    const A = this.world.audio;
    const t0 = A.now() + 0.05;
    this.invasionSrc = A.play('mothership', MUSIC_VOL, t0);
    A.loop('mothershipAttacks', MUSIC_VOL, 0.01,
      { at: t0 + A.duration('mothership'), loopStart: ATTACKS_LOOP_START, loopEnd: ATTACKS_LOOP_END });
  }

  // Cuts the invasion intro (if it's somehow still going) and the attack loop.
  stopMusic(fade = 0.15) {
    try { if (this.invasionSrc) this.invasionSrc.stop(); } catch (e) {}
    this.invasionSrc = null;
    this.world.audio.stopLoop('mothershipAttacks', fade);
  }

  // Hull shakes and flickers to the build-up, then blows apart.
  updateDying(dt) {
    if (this.exploded) return;
    this.dyingT += dt;
    const [sx, sy] = toScreen(rand(-SHAKE, SHAKE), this.cy + rand(-SHAKE, SHAKE) * 0.5);
    this.container.position.set(sx, sy);
    this.container.alpha = Math.floor(this.dyingT * 14) % 2 ? 0.45 : 1;
    if (this.dyingT >= BUILD_TIME) {
      this.exploded = true;
      this.world.audio.stopLoop('mothershipBuildUp', 0.08);
      this.world.audio.play('mothershipEnd', 0.9);
      this.playEndMusic();
      this.container.visible = false;
    }
  }

  playEndMusic() {
    this.stopMusic(0.12);
    this.endSrc = this.world.audio.play('mothershipAttacks', MUSIC_VOL, 0, ATTACKS_END_AT);
  }

  // world <-> design
  toDesign(x, y) { return [x / this.k * 100 + 200, (y - this.cy) / this.k * 100 + 60]; }
  toWorld(dx, dy) { return [(dx - 200) / 100 * this.k, this.cy + (dy - 60) / 100 * this.k]; }
  get underside() { return this.cy + (118 - 60) / 100 * this.k; }

  insideHull(x, y) {
    const [dx, dy] = this.toDesign(x, y);
    return inPoly(dx, dy, HULL) || inPoly(dx, dy, COCKPIT);
  }

  // The ship's triangle against the hull + cockpit outline (in design units).
  touchesShip(p) {
    const ship = p.hull().map(([x, y]) => this.toDesign(x, y));
    const tol = HULL_STROKE * 100 / this.k;
    return polyPolyDist(ship, HULL) <= tol || polyPolyDist(ship, COCKPIT) <= tol;
  }

  hitTest(x, y, r) {
    if (!this.parked || this.defeated) return false;
    // nudge the test point up into the hull by the shot's radius
    return this.insideHull(x, y - r);
  }

  canBeDestroyedBy() { return this.parked && !this.defeated; }

  place() {
    const [sx, sy] = toScreen(0, this.cy);
    this.container.position.set(sx, sy);
  }

  update(dt) {
    if (this.dead) return;
    if (this.flashT > 0) { this.flashT -= dt; this.container.alpha = this.flashT > 0 ? 0.55 : 1; }
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.pewT > 0) this.pewT -= dt;

    if (!this.parked) {
      this.cy = Math.min(this.parkY, this.cy + DESCENT_SPEED * dt);
      if (this.cy >= this.parkY) this.parked = true;
      this.place();
    }
    this.trackSlashPoint();
    if (this.defeated) { this.updateDying(dt); return; }
    this.touchPlayer();
    if (this.parked) this.updateAttacks(dt);
  }

  // Where a melee swing would land: the underside point straight above/below
  // the player (clamped to the hull's width).
  trackSlashPoint() {
    const p = this.world.player;
    const px = p ? p.x : 0;
    const [dx] = this.toDesign(clamp(px, -HALF_W + 0.2, HALF_W - 0.2), 0);
    const [, wy] = this.toWorld(dx, undersideY(dx));
    this.x = clamp(px, -HALF_W + 0.2, HALF_W - 0.2);
    this.y = wy - 0.2;
  }

  touchPlayer() {
    const p = this.world.player;
    if (!p || p.dead || p.invulnerable) return;
    if (this.touchesShip(p)) p.takeDamage(TOUCH_DAMAGE);
  }

  die(dmg = 1) {
    if (this.defeated || !this.parked) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flashT = HIT_FLASH;
    this.world.addScore(HP_SCORE);
    if (this.hurtT <= 0) { this.world.audio.play('bossHurt', 0.6); this.hurtT = HURT_SOUND_GAP; }
    if (this.hp > 0) return;
    this.defeated = true;
    this.dyingT = 0;
    this.exploded = false;
    this.world.addScore(DEFEAT_SCORE);
    this.stopMusic(0.1);
    this.world.audio.loop('mothershipBuildUp', 0.8, 0.02);
    // its own bullets/shards/spears die with it, so nothing lands a cheap
    // hit during the destruction sequence
    for (const h of [...this.world.hittables]) if (h !== this && h.destroy) h.destroy();
    for (const e of this.world.updatables) if (e instanceof SplashWarning) e.destroy();   // pending splash telegraphs too
  }

  // --- attacks ---------------------------------------------------------
  updateAttacks(dt) {
    if (!this.attack) {
      this.gapT -= dt;
      if (this.gapT > 0) return;
      const kind = ORDER[this.attackIdx % ORDER.length];
      this.attackIdx++;
      this.attack = { kind, t: kind === 'gun' ? -GUN_LEAD : 0, n: 0, round: 0 };
    }
    const a = this.attack;
    a.t += dt;
    if (a.kind === 'gun') this.runGun(a);
    else if (a.kind === 'splash') this.runSplash(a);
    else this.runSpears(a);
  }

  endAttack() { this.attack = null; this.gapT = ATTACK_GAP; }

  get gunPos() { return [0, this.underside - 0.05]; }

  runGun(a) {
    if (a.t < 0) return;
    if (a.round === 0) {               // a fresh volley locks its aim (point towards Player)
      const p = this.world.player;
      const [gx, gy] = this.gunPos;
      a.aim = p ? Math.atan2(p.y - gy, p.x - gx) : Math.PI / 2;
    }
    while (a.round < GUN_ROUNDS && a.t >= a.round * GUN_ROUND_GAP) {
      this.fireFan(a.aim);
      a.round++;
    }
    if (a.round >= GUN_ROUNDS && a.t >= (GUN_ROUNDS - 1) * GUN_ROUND_GAP + GUN_VOLLEY_GAP) {
      a.n++; a.round = 0; a.t = 0;
      if (a.n >= GUN_VOLLEYS) this.endAttack();
    }
  }

  fireFan(aim) {
    const [gx, gy] = this.gunPos;
    for (const off of [-GUN_SPREAD, 0, GUN_SPREAD]) {
      const ang = aim + off;
      this.world.add(new GunBullet(this.world, gx, gy, Math.cos(ang) * GUN_SPEED, Math.sin(ang) * GUN_SPEED));
    }
    if (this.pewT <= 0) { this.world.audio.play('shooterPew', 0.5); this.pewT = 0.06; }
  }

  runSplash(a) {
    if (a.n >= SPLASH_BURSTS) { this.endAttack(); return; }
    if (a.t < a.n * SPLASH_GAP) return;
    a.n++;
    const p = this.world.player;
    const ceil = this.underside;
    let x = 0, y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = rand(-HALF_W * 0.85, HALF_W * 0.85);
      y = rand(ceil + 0.6, HALF_H - 0.6);
      if (!p || dist(x, y, p.x, p.y) >= SPLASH_PLAYER_CLEAR) break;
    }
    const off = rand(0, Math.PI * 2);
    const angles = [];
    for (let i = 0; i < SPLASH_RAYS; i++) angles.push(off + i * Math.PI * 2 / SPLASH_RAYS);
    // telegraphed first (splash.js's SplashWarning), then the ring fires
    const w = this.world;
    w.add(new SplashWarning(w, x, y, angles, () => {
      if (this.dead || this.defeated) return;
      for (const a of angles) w.add(new SplashShard(w, x, y, a, ceil));
      w.audio.play('splash', 0.6);
    }));
  }

  runSpears(a) {
    if (a.n >= SPEAR_COUNT) { if (a.t >= a.n * SPEAR_GAP) this.endAttack(); return; }
    if (a.t < a.n * SPEAR_GAP) return;
    a.n++;
    const [dx] = this.toDesign(rand(-HALF_W * 0.8, HALF_W * 0.8), 0);
    const [sx, sy] = this.toWorld(dx, undersideY(dx));
    const p = this.world.player;
    const tx = p ? p.x : 0, ty = p ? p.y : HALF_H;
    this.world.add(new Spear(this.world, sx, sy + 0.1, tx - sx, ty - sy));
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {
    return { shapes: [HULL, COCKPIT].map(poly => ({ poly: poly.map(([dx, dy]) => this.toWorld(dx, dy)) })) };
  }
  destroy() {
    this.alive = false;
    this.dead = true;
    this.stopMusic();
    this.world.audio.stopLoop('mothershipBuildUp', 0.08);
    // a teardown on death cuts the ending too; after a win it's left to finish
    if (!this.defeated && this.endSrc) { try { this.endSrc.stop(); } catch (e) {} }
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
