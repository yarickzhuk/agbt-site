// core.js — world constants, coordinate mapping, and the Hittable registry.
//
// Positions are kept in Unity-style *world units* (origin at screen centre).
// Screen y points down, which only flips the sense of "up" — distances, the
// hand-written hit checks and the Unity-tuned radii all carry over unchanged.
// 1 world unit = 100 design units; the renderer draws at PPU/100 px per design
// unit, so a shape's design size stays its world size.

import { getScreenBorder } from './settings.js';

// The screen is 900x700 -- unless OPTIONS → SCREEN BORDER is OFF, per direct
// request: then, instead of art in the bars around a 9:7 game, the game
// itself widens to the screen's own shape (same 700 tall), read once at
// boot: a phone's landscape shape whichever way it's held, else the window.
// Everything sized off SCREEN_W/HALF_W (edges, spawns, bounces, menus, the
// HUD) follows; fixed layouts (mazes, the duel backdrop) stay centred.
// Changing the setting reloads the game (menu.js), since this is baked in.
export const BOOT_BORDER = getScreenBorder();
export const SCREEN_W = BOOT_BORDER ? 900 : wideScreenWidth();
export const SCREEN_H = 700;
function wideScreenWidth() {
  let w = window.innerWidth, h = window.innerHeight;
  try {
    if (matchMedia('(hover: none) and (pointer: coarse)').matches && screen.width && screen.height) {
      w = Math.max(screen.width, screen.height); h = Math.min(screen.width, screen.height);
    }
  } catch (e) {}
  const aspect = h > 0 ? w / h : 9 / 7;
  return Math.max(900, Math.min(1600, Math.round(700 * aspect / 2) * 2));
}
export const PPU = 70;                       // pixels per world unit (Unity orthoSize 5)
export const HALF_H = (SCREEN_H / 2) / PPU;  // 5
export const HALF_W = (SCREEN_W / 2) / PPU;  // ~6.43

export function toScreen(x, y) {
  return [SCREEN_W / 2 + x * PPU, SCREEN_H / 2 + y * PPU];
}

// --- tiny helpers ---
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = n => Math.floor(Math.random() * n);
export const pick = arr => arr[randInt(arr.length)];
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Point on a random screen edge — hazards fly in rather than pop into view.
export function edgeSpawn() {
  switch (randInt(4)) {
    case 0:  return { x: rand(-HALF_W, HALF_W), y: -HALF_H };
    case 1:  return { x: rand(-HALF_W, HALF_W), y:  HALF_H };
    case 2:  return { x: -HALF_W, y: rand(-HALF_H, HALF_H) };
    default: return { x:  HALF_W, y: rand(-HALF_H, HALF_H) };
  }
}

// Solid-obstacle collision check (wall.js's Wall). `world.walls` is empty
// everywhere except while a maze phase (e.g. CRAZY CARNIVAL's Showman intro)
// has populated it, so this is a no-op cost elsewhere. AABB test with the
// caller's own radius as margin. Returns the specific Wall hit (or null) so
// callers that need more than a yes/no (e.g. a projectile bouncing off it)
// can work out a surface direction from it; `blockedByWalls` is the plain
// boolean player.js's movement check actually needs. `skip(w)`, optional,
// leaves some walls out (a dash ignoring pierceable walls, the player
// walking out of a wall they're already standing in).
// A player weapon's hit on a Hittable: h.die(dmg), crediting the HP it really
// lost (a hazard with an `hp` counter, after its own resistances/armour) or
// 1 for a one-hit kill. Feeds World.dealDamage.
// A hit also marks the shot it came from (DEVIL FISH's streak, player.js):
// a slash sets world._shot, a projectile carries its own `shot`.
function markShot(world) {
  const s = world._shot || (world._updating && world._updating.shot);
  if (s) s.hit = true;
}
export function playerHit(world, h, dmg) {
  markShot(world);
  const before = h.hp, wasDead = h.dead;
  h.die(dmg);
  const n = (typeof before === 'number' && typeof h.hp === 'number')
    ? Math.max(0, before - Math.max(0, h.hp))
    : (!wasDead && h.dead ? 1 : 0);
  world.dealDamage(n);
}

// Same for the world.boss slot: boss.tryHit(...), crediting the drop in its hp.
export function playerBossHit(world, boss, x, y, charged, dmg) {
  const before = boss.hp;
  const hit = dmg === undefined ? boss.tryHit(x, y, charged) : boss.tryHit(x, y, charged, dmg);
  if (hit) {
    markShot(world);
    world.dealDamage(typeof before === 'number' && typeof boss.hp === 'number'
      ? Math.max(0, before - Math.max(0, boss.hp)) : (dmg || 1));
  }
  return hit;
}

export function wallHit(world, x, y, r, skip) {
  const walls = world.walls;
  if (!walls || !walls.length) return null;
  for (const w of walls) {
    if (skip && skip(w)) continue;
    if (x + r > w.x0 && x - r < w.x1 && y + r > w.y0 && y - r < w.y1) return w;
  }
  return null;
}
export function blockedByWalls(world, x, y, r, skip) {
  return !!wallHit(world, x, y, r, skip);
}

// Does a straight line from (x0,y0) to (x1,y1) cross a wall? Unlike wallHit
// (a single point), this is for an instant hit-test that spans a distance in
// one frame — lineslasher.js's own SLASH swing, which (unlike every
// projectile weapon) never advances frame by frame close enough to a wall
// for wallHit's own per-point check to catch it. Standard slab-method
// segment/AABB test, checked against each wall in turn (`world.walls` is
// tiny and usually empty, so this costs nothing outside a maze phase).
// Returns the specific Wall hit (or null), same "more than yes/no" reasoning
// wallHit's own doc comment gives — lineslasher.js needs it to know whether
// a colour-tinted wall (plasmadrache.js's own ring/cobalt walls) can be
// destroyed by the swing rather than just blocking it.
export function wallOnLine(world, x0, y0, x1, y1, skip) {
  const walls = world.walls;
  if (!walls || !walls.length) return null;
  const dx = x1 - x0, dy = y1 - y0;
  for (const w of walls) {
    if (skip && skip(w)) continue;
    let tmin = 0, tmax = 1;
    for (const [p, lo, hi, o] of [[dx, w.x0, w.x1, x0], [dy, w.y0, w.y1, y0]]) {
      if (Math.abs(p) < 1e-9) {
        if (o < lo || o > hi) { tmin = 1; tmax = 0; break; }
        continue;
      }
      let t1 = (lo - o) / p, t2 = (hi - o) / p;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }
    if (tmin <= tmax) return w;
  }
  return null;
}

// Colour rule: what a shot does to a block.
export const CYAN = 'cyan';        // destroyed by any shot
export const PURPLE = 'purple';    // never destroyed; bullets break, torpedoes pass through
export const DARKBLUE = 'darkblue'; // only by a charged torpedo
// Pink hazards (Trap Circle Delta's pink segments, THE FINALE's 120-cell)
// are never shootable and cost this much HP per touch -- one rule for all.
export const PINK_DAMAGE = 2;

// A shootable / collidable thing. Kept in a flat list; no physics.
export class Hittable {
  constructor(reg, opts) {
    this.reg = reg;
    this.x = opts.x; this.y = opts.y;
    this.color = opts.color || PURPLE;
    this.radius = opts.radius || 0.15;
    this.damage = opts.damage != null ? opts.damage : 1;
    this.hurtsPlayer = opts.hurtsPlayer !== false;
    this.countsAsProgress = opts.countsAsProgress !== false;
    this.destroySound = opts.destroySound || null;
    this.onDie = opts.onDie || null;      // custom death (e.g. bomb explosion)
    this.dead = false;
    reg.hittables.push(this);
  }

  canBeDestroyedBy(charged) {
    if (this.color === CYAN) return true;
    if (this.color === DARKBLUE) return charged;
    return false;
  }
  stopsBullet(charged) {
    if (this.color === PURPLE) return !charged;
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    if (this.countsAsProgress) { this.reg.destroyedCount++; this.reg.addScore(100); }
    if (this.onDie) { this.onDie(); return; }
    if (this.destroySound) this.reg.audio.play(this.destroySound, 0.7);
    this.destroy();
  }

  // remove from world; subclasses override to tear down their sprite
  destroy() {
    this.dead = true;
    const i = this.reg.hittables.indexOf(this);
    if (i >= 0) this.reg.hittables.splice(i, 1);
  }
}

// The shared world: entity lists, the player, score, and timing helpers.
// Scores are 6 digits; reaching 1,000,000 shows "M" and stops rising (per
// direct request, with the "Beyond human understanding" achievement).
export const SCORE_CAP = 1000000;
export function formatScore(n) {
  n = Math.max(0, Math.floor(n || 0));
  return n >= SCORE_CAP ? 'M' : String(n).padStart(6, '0');
}

export class World {
  constructor(app, audio) {
    this.app = app;
    this.stage = app.stage;
    this.audio = audio;
    this.hittables = [];
    this.updatables = [];   // things with update(dt): bullets, hazards, effects
    this.walls = [];        // solid obstacles (wall.js) that block player movement only
    this.destroyedCount = 0;
    this.score = 0;           // points earned in THIS stage
    this.bankedScore = 0;     // carried over from earlier stages (set at boot)
    this.lives = 3;           // run lives (incl. the one being played); set at boot
    this.difficulty = null;   // active difficulty rules; set at boot
    this.player = null;
    this.boss = null;       // TrapWheel-style boss checks bullets itself
    this.time = 0;
  }

  add(entity) { this.updatables.push(entity); return entity; }

  addScore(n) {
    this.score += n;
    if (n > 0 && this.onScore) this.onScore(n);   // main.js: score achievements + lifetime total
  }

  // Damage the player's own weapons land, fed through playerHit/playerBossHit
  // below. main.js hooks onDamageDealt for EASY's heal-orb drop.
  dealDamage(n) { if (n > 0 && this.onDamageDealt) this.onDamageDealt(n); }

  // Running career total: this stage's points plus everything banked before it,
  // capped at SCORE_CAP (1,000,000, shown as "M" -- see formatScore).
  get totalScore() { return Math.min(SCORE_CAP, this.bankedScore + this.score); }

  // Wipe every hazard/bullet from the field (used before the boss warning).
  clearEntities() {
    for (const e of [...this.updatables]) if (e.destroy) e.destroy();
    this.updatables.length = 0;
    for (const h of [...this.hittables]) if (h.destroy) h.destroy();
    this.hittables.length = 0;
  }

  update(dt) {
    this.time += dt;
    for (let i = this.updatables.length - 1; i >= 0; i--) {
      const e = this.updatables[i];
      // `_updating` lets player.takeDamage() name whatever hurt it without
      // every hazard passing itself in (roast.js's TOXIC MODE reads it).
      this._updating = e;
      if (e.update) e.update(dt);
      this._updating = null;
      if (e.alive === false) this.updatables.splice(i, 1);
    }
  }

  // await this.wait(seconds) inside async phase code. Gated on `this.paused`
  // like everything else during a hard pause (pause.js) — these register
  // their own ticker step directly (not routed through world.update), so
  // without this check a phase's timing kept advancing in real time while
  // paused, letting the whole phase (and any hazards runFor's onTick spawns)
  // finish for free with the player never having to actually play it.
  wait(seconds) {
    return new Promise(resolve => {
      let t = 0;
      const step = () => {
        if (this.paused) return;
        t += this.app.ticker.deltaMS / 1000;
        if (t >= seconds) { this.app.ticker.remove(step); resolve(); }
      };
      this.app.ticker.add(step);
    });
  }
  waitUntil(pred) {
    return new Promise(resolve => {
      const step = () => {
        if (this.paused) return;
        if (pred()) { this.app.ticker.remove(step); resolve(); }
      };
      this.app.ticker.add(step);
    });
  }

  // Run onTick(elapsed, remaining) every frame for `duration` seconds, or until
  // the player dies. Timed phases use this; event phases use waitUntil().
  runFor(duration, onTick) {
    return new Promise(resolve => {
      let t = 0;
      const step = () => {
        if (this.paused) return;
        const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
        t += dt;
        if (onTick) onTick(t, Math.max(0, duration - t));
        if (t >= duration || (this.player && this.player.dead)) {
          this.app.ticker.remove(step); resolve();
        }
      };
      this.app.ticker.add(step);
    });
  }
}
