// polytope.js — THE FINALE's phases 2-5: four rotating 4D polytopes (the
// author's Phase_2A..2D.sb3 uploads), each a 60/120-frame wireframe
// animation wrapped around a small "Cyan Crystal". Colour language decides
// what each one is, straight from the source art's own stroke colours:
//
//   2A tesseract   (#00feff, cyan)      200 HP, any shot. Every 1s a tiny
//                                       copy of itself flies at the player
//                                       (clone: point towards Player, size
//                                       10, move 2 until edge).
//   2B 5-cell      (#2900ff, dark blue) 200 HP, charged shots only. Every 4s
//                                       a ring of 6 copies 60° apart, base
//                                       angle a random multiple of 90°
//                                       (clone: size 20, 100 x move 5 with
//                                       if-on-edge-bounce).
//   2C 24-cell     (#a600ff, purple)    unkillable; the crystal glides to a
//                                       random spot every 2s and the 24-cell
//                                       rides it. Survive 60s.
//   2D 120-cell    (#ff009f, pink)      unkillable; the crystal glides to
//                                       the player every 2s. Survive 60s.
//                                       Pink: 2 HP per touch (PINK_DAMAGE).
//
// "200 hp (defensive field + crystal)" -- the field and the crystal share
// one pool: a shot that hits the polytope's lines or the crystal counts.
// The source decides hits with Scratch's pixel "touching" tests, so this
// does too: every frame gets a coarse alpha mask (built once from the sprite
// sheet when it loads), and contact/shots test the real lines -- the gaps
// between them are safe, a shot can slip through one to reach the crystal.
//
// Frames are packed 64 to a 2560px sheet (320px cells, white + alpha, tinted
// here) and loaded per phase, then unloaded, so at most two sheets sit in
// GPU memory at once.
import { buildSprite } from './retro.js';
import { pointPolyDist, HULL_STROKE } from './shiphull.js';
import { Hittable, CYAN, DARKBLUE, PURPLE, toScreen, PPU, HALF_W, HALF_H, rand, randInt, dist, PINK_DAMAGE } from './core.js';

const CELL = 320, COLS = 8, PER_SHEET = 64;
const MASK = 96;                 // mask resolution per frame
const FPS = 30;                  // Scratch's forever { next costume }
// Scratch size -> screen px: a 640px costume at bitmapResolution 2 is 320
// stage units at size 100, and the 480-wide stage maps onto our 900px.
const sizeToScale = size => (320 * size / 100 * (900 / 480)) / CELL;

export const POLY = {
  tesseract:          { frames: 60,  tint: 0x00feff, size: 70 },
  pentachoron:        { frames: 120, tint: 0x2900ff, size: 70 },
  icositetrachoron:   { frames: 120, tint: 0xa600ff, size: 90 },
  hecatonicosachoron: { frames: 120, tint: 0xff009f, size: 70 },
};

const cache = {};   // key -> Promise<{ frames, masks }>

function sheetPaths(key) {
  const n = Math.ceil(POLY[key].frames / PER_SHEET);
  return Array.from({ length: n }, (_, i) => `assets/sprites/finale/${key}_${i}.png`);
}

export function loadPoly(key) {
  if (!cache[key]) cache[key] = (async () => {
    const paths = sheetPaths(key);
    const texs = await PIXI.Assets.load(paths);
    const frames = [], masks = [];
    for (let s = 0; s < paths.length; s++) {
      const base = texs[paths[s]].baseTexture;
      const count = Math.min(PER_SHEET, POLY[key].frames - s * PER_SHEET);
      const rows = Math.ceil(count / COLS);
      // one downscaled draw of the whole sheet, then slice per frame
      const cv = document.createElement('canvas');
      cv.width = COLS * MASK; cv.height = rows * MASK;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(base.resource.source, 0, 0, COLS * CELL, rows * CELL, 0, 0, cv.width, cv.height);
      const data = cx.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < count; i++) {
        const c = i % COLS, r = Math.floor(i / COLS);
        frames.push(new PIXI.Texture(base, new PIXI.Rectangle(c * CELL, r * CELL, CELL, CELL)));
        const m = new Uint8Array(MASK * MASK);
        for (let y = 0; y < MASK; y++) for (let x = 0; x < MASK; x++) {
          const a = data[((r * MASK + y) * cv.width + c * MASK + x) * 4 + 3];
          if (a > 24) m[y * MASK + x] = 1;
        }
        masks.push(m);
      }
    }
    return { frames, masks };
  })();
  return cache[key];
}

export function unloadPoly(key) {
  if (!cache[key]) return;
  delete cache[key];
  PIXI.Assets.unload(sheetPaths(key)).catch(() => {});
}

// An animated polytope sprite with per-frame line masks.
class PolyAnim {
  constructor(world, key, data, size) {
    this.data = data;
    this.scale = sizeToScale(size);
    this.sprite = new PIXI.Sprite(data.frames[0]);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(this.scale);
    this.sprite.tint = POLY[key].tint;
    this.frame = randInt(data.frames.length);
    this.ft = 0;
    this.halfW = CELL * this.scale / 2 / PPU;   // world half-extent
  }
  update(dt) {
    this.ft += dt * FPS;
    while (this.ft >= 1) { this.ft -= 1; this.frame = (this.frame + 1) % this.data.frames.length; }
    this.sprite.texture = this.data.frames[this.frame];
  }
  // Any line pixel within r (world units) of (px,py), with the sprite centred at (x,y)?
  hits(x, y, px, py, r) {
    const toCell = PPU / this.scale * MASK / CELL;
    const cx = (px - x) * toCell + MASK / 2, cy = (py - y) * toCell + MASK / 2;
    const rc = Math.max(0.5, r * toCell);
    if (cx < -rc || cy < -rc || cx > MASK + rc || cy > MASK + rc) return false;
    const m = this.data.masks[this.frame];
    const x0 = Math.max(0, Math.floor(cx - rc)), x1 = Math.min(MASK - 1, Math.ceil(cx + rc));
    const y0 = Math.max(0, Math.floor(cy - rc)), y1 = Math.min(MASK - 1, Math.ceil(cy + rc));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      if (!m[yy * MASK + xx]) continue;
      const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
      if (dx * dx + dy * dy <= rc * rc) return true;
    }
    return false;
  }

  // Does the ship's triangle (world-unit points, player.hull()) touch a
  // drawn line? The same mask, tested cell by cell against the triangle.
  hitsPoly(x, y, poly) {
    const toCell = PPU / this.scale * MASK / CELL;
    const q = poly.map(([px, py]) => [(px - x) * toCell + MASK / 2, (py - y) * toCell + MASK / 2]);
    const tol = 0.5 + HULL_STROKE * toCell;
    const xs = q.map(v => v[0]), ys = q.map(v => v[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - tol)), x1 = Math.min(MASK - 1, Math.ceil(Math.max(...xs) + tol));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - tol)), y1 = Math.min(MASK - 1, Math.ceil(Math.max(...ys) + tol));
    if (x0 > x1 || y0 > y1) return false;
    const m = this.data.masks[this.frame];
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      if (m[yy * MASK + xx] && pointPolyDist(xx + 0.5, yy + 0.5, q) <= tol) return true;
    }
    return false;
  }
}

const CRYSTAL_SCALE = 2.6;   // CoreCrystal.json is 20x34 design units
const CRYSTAL_R = 0.38;
const EXTRACT_FADE = 2.0;    // a beaten field's fade-out, seconds

function crystalSprite(tint) {
  return buildSprite('CoreCrystal', { scale: CRYSTAL_SCALE, lineWidth: 2, tint });
}

// "show hitbox on death" (deathreveal.js): the polytopes hit by their actual
// line pixels, so show the mask cells near the player (plus the crystal).
function polyHitbox(h, withCrystal) {
  const p = h.world.player, a = h.anim, shapes = [];
  if (withCrystal) shapes.push({ circle: [h.x, h.y, CRYSTAL_R] });
  if (p && a) {
    const toCell = PPU / a.scale * MASK / CELL, m = a.data.masks[a.frame], R = 1.2, dots = [];
    for (let yy = 0; yy < MASK; yy++) for (let xx = 0; xx < MASK; xx++) {
      if (!m[yy * MASK + xx]) continue;
      const wx = h.x + (xx + 0.5 - MASK / 2) / toCell, wy = h.y + (yy + 0.5 - MASK / 2) / toCell;
      if (Math.hypot(wx - p.x, wy - p.y) <= R) dots.push([wx, wy]);
    }
    shapes.push({ dots, r: 0.3 / toCell });
  }
  return { shapes };
}

function touchDamage(world, hit, dmg = 1) {
  const p = world.player;
  if (!p || p.dead || p.invulnerable) return;
  if (hit(p)) p.takeDamage(dmg);
}

// --- a small copy of the polytope, fired by the 200-HP fields --------------
class MiniPoly extends Hittable {
  constructor(world, key, data, x, y, ang, o) {
    const anim = new PolyAnim(world, key, data, o.size);
    super(world, { x, y, color: o.color, radius: anim.halfW * 0.6, damage: 1,
                   countsAsProgress: false, destroySound: o.color === CYAN ? 'destroyCyan' : 'destroyIndigo' });
    this.world = world; this.anim = anim; this.key = key;
    this.vx = Math.cos(ang) * o.speed; this.vy = Math.sin(ang) * o.speed;
    this.life = o.life; this.bounce = o.bounce;
    this.t = 0;
    this.container = new PIXI.Container();
    this.container.addChild(anim.sprite);
    this.container.zIndex = 12;
    world.stage.addChild(this.container);
    this.place();
  }
  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    this.anim.update(dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.bounce) {
      const lx = HALF_W - this.radius, ly = HALF_H - this.radius;
      if (this.x < -lx) { this.x = -lx; this.vx = Math.abs(this.vx); }
      if (this.x > lx) { this.x = lx; this.vx = -Math.abs(this.vx); }
      if (this.y < -ly) { this.y = -ly; this.vy = Math.abs(this.vy); }
      if (this.y > ly) { this.y = ly; this.vy = -Math.abs(this.vy); }
      if (this.t > this.life - 0.3) this.container.alpha = Math.max(0, (this.life - this.t) / 0.3);
      if (this.t >= this.life) { this.destroy(); return; }
    } else if (Math.abs(this.x) > HALF_W + this.radius + 0.3 || Math.abs(this.y) > HALF_H + this.radius + 0.3) {
      this.destroy(); return;
    }
    this.place();
    touchDamage(this.world, p => this.anim.hitsPoly(this.x, this.y, p.hull()));
  }
  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return polyHitbox(this, false); }
  destroy() {
    this.alive = false; this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// --- phases 2/3: the 200-HP field + crystal ----------------------------------
const FIELD_HP = 200;
const HP_SCORE = 100, DEFEAT_SCORE = 1000;
const FADE_IN = 1.2;          // grows in, harmless, before the fight starts

export const FIELD_CFG = {
  tesseract: { color: CYAN, music: 'finaleTesseract', vol: 0.55, attack: 'aimed',
               every: 1.0, mini: { size: 10, speed: 1.6, life: 0, bounce: false, color: CYAN } },
  pentachoron: { color: DARKBLUE, music: 'finalePentachoron', vol: 0.4, attack: 'ring',
                 every: 4.0, mini: { size: 20, speed: 4.0, life: 3.33, bounce: true, color: DARKBLUE } },
};

export class PolyField extends Hittable {
  constructor(world, key, data, x = 0, y = -0.6) {
    const cfg = FIELD_CFG[key];
    const anim = new PolyAnim(world, key, data, POLY[key].size);
    super(world, { x, y, color: cfg.color, radius: anim.halfW * 0.8, damage: 1,
                   countsAsProgress: false, destroySound: null });
    this.isBoss = true;   // a supercharged shot stops on it instead of piercing (bullet.js)
    this.world = world; this.key = key; this.cfg = cfg; this.data = data; this.anim = anim;
    this.hp = FIELD_HP;
    this.defeated = false;
    this.t = 0; this.attackT = cfg.every;
    this.flashT = 0; this.hurtT = 0;
    this.container = new PIXI.Container();
    this.container.addChild(anim.sprite);
    this.crystal = crystalSprite(POLY[key].tint);
    this.container.addChild(this.crystal);
    this.container.zIndex = 11;
    world.stage.addChild(this.container);
    this.place();
    world.audio.loop(cfg.music, cfg.vol);
  }
  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    const k = Math.min(1, this.t / FADE_IN);
    this.container.scale.set(0.3 + 0.7 * k);
    this.container.alpha = this.flashT > 0 ? 0.5 : k;
  }
  get ready() { return this.t >= FADE_IN && !this.defeated; }
  canBeDestroyedBy(charged) { return this.ready && super.canBeDestroyedBy(charged); }
  hitTest(x, y, r) {
    if (!this.ready) return false;
    return dist(x, y, this.x, this.y) <= CRYSTAL_R + r || this.anim.hits(this.x, this.y, x, y, r + 0.06);
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    this.anim.update(dt);
    this.place();
    if (this.defeated) {   // extracted: keep turning while it fades away
      this.fadeT += dt;
      this.container.alpha = Math.max(0, 1 - this.fadeT / EXTRACT_FADE);
      if (this.fadeT >= EXTRACT_FADE) this.destroy();
      return;
    }
    if (!this.ready) return;
    touchDamage(this.world, p => p.touchesCircle(this.x, this.y, CRYSTAL_R) ||
                                 this.anim.hitsPoly(this.x, this.y, p.hull()));
    this.attackT -= dt;
    if (this.attackT <= 0) { this.attackT += this.cfg.every; this.attack(); }
  }
  attack() {
    const w = this.world, m = this.cfg.mini;
    if (this.cfg.attack === 'aimed') {
      const p = w.player;
      const ang = p ? Math.atan2(p.y - this.y, p.x - this.x) : Math.PI / 2;
      w.add(new MiniPoly(w, this.key, this.data, this.x, this.y, ang, m));
    } else {
      const base = (randInt(4) + 1) * Math.PI / 2;
      for (let i = 1; i <= 6; i++) w.add(new MiniPoly(w, this.key, this.data, this.x, this.y, base + i * Math.PI / 3, m));
    }
  }
  die(dmg = 1) {
    if (!this.ready) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flashT = 0.08;
    this.world.addScore(HP_SCORE);
    if (this.hurtT <= 0) { this.world.audio.play('bossHurt', 0.6); this.hurtT = 0.08; }
    if (this.hp > 0) return;
    // Beaten: the crystal is extracted -- Crystal_extract.wav, the field
    // stops attacking and hurting, its leftover minis vanish, and the whole
    // thing fades out over EXTRACT_FADE before it's removed.
    this.defeated = true;
    this.fadeT = 0;
    this.world.addScore(DEFEAT_SCORE);
    this.world.audio.stopLoop(this.cfg.music, 0.4);
    this.world.audio.play('crystalExtract', 0.9);
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    for (const e of [...this.world.updatables]) if (e instanceof MiniPoly && e.destroy) e.destroy();
  }
  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return polyHitbox(this, true); }
  destroy() {
    this.alive = false; this.dead = true;
    this.world.audio.stopLoop(this.cfg.music, 0.4);
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// --- phases 4/5: survive the purple/pink polytope for a minute --------------
export const SURVIVE_CFG = {
  icositetrachoron:   { music: 'finale24cell', vol: 0.6, mode: 'wander', start: [3.2, -2.2], touch: 1 },
  hecatonicosachoron: { music: 'finale120cell', vol: 1.0, mode: 'chase', start: [0, -2.6], touch: PINK_DAMAGE },
};
const GLIDE = 2.0;   // the source's own glide 2 secs

// ENDLESS MODE (levels/endless.js) uses these two as attacks, nerfed:
// `opts.nerf` shrinks it, slows its glide and makes every touch 1 HP.
const NERF = { size: 0.6, glide: 3.4 };
export class PolyHazard extends Hittable {
  constructor(world, key, data, opts = {}) {
    const cfg = opts.nerf ? { ...SURVIVE_CFG[key], touch: 1 } : SURVIVE_CFG[key];
    const anim = new PolyAnim(world, key, data, POLY[key].size * (opts.nerf ? NERF.size : 1));
    super(world, { x: cfg.start[0], y: cfg.start[1], color: PURPLE, radius: anim.halfW * 0.8,
                   damage: 1, countsAsProgress: false });
    this.world = world; this.key = key; this.cfg = cfg; this.anim = anim;
    this.glideTime = opts.nerf ? NERF.glide : GLIDE;
    this.t = 0;
    this.glide = null;
    this.container = new PIXI.Container();
    this.container.addChild(anim.sprite);
    this.container.addChild(crystalSprite(POLY[key].tint));
    this.container.zIndex = 11;
    world.stage.addChild(this.container);
    this.place();
    world.audio.loop(cfg.music, cfg.vol);
  }
  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    const k = Math.min(1, this.t / FADE_IN);
    this.container.scale.set(0.3 + 0.7 * k);
    this.container.alpha = k;
  }
  canBeDestroyedBy() { return false; }
  hitTest(x, y, r) {   // shots break on the lines (PURPLE), pass through the gaps
    if (this.t < FADE_IN) return false;
    return dist(x, y, this.x, this.y) <= CRYSTAL_R + r || this.anim.hits(this.x, this.y, x, y, r + 0.06);
  }
  nextGlide() {
    let tx, ty;
    if (this.cfg.mode === 'chase' && this.world.player) { tx = this.world.player.x; ty = this.world.player.y; }
    else { tx = rand(-HALF_W, HALF_W); ty = rand(-HALF_H, HALF_H); }
    this.glide = { fx: this.x, fy: this.y, tx, ty, t: 0 };
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    this.anim.update(dt);
    if (this.t >= FADE_IN) {
      if (!this.glide || this.glide.t >= this.glideTime) this.nextGlide();
      const g = this.glide;
      g.t = Math.min(this.glideTime, g.t + dt);
      const k = g.t / this.glideTime;
      this.x = g.fx + (g.tx - g.fx) * k; this.y = g.fy + (g.ty - g.fy) * k;
      touchDamage(this.world, p => p.touchesCircle(this.x, this.y, CRYSTAL_R) ||
                                   this.anim.hitsPoly(this.x, this.y, p.hull()), this.cfg.touch);
    }
    this.place();
  }
  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return polyHitbox(this, true); }
  destroy() {
    this.alive = false; this.dead = true;
    this.world.audio.stopLoop(this.cfg.music, 0.4);
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
