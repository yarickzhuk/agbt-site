// plasmadrachedelta.js — Boss Rush's final fight: Plasmadrache Delta. Two
// forms, one per upload, in the order the author sent them ("2 phases (from
// left to right)"):
//
// PHASE 1 — the full-body dragon (`Plasmadrache_Delta_Bossfight.sb3`'s
// "volumetric" / "volumetric_front" costumes). 150 HP, the whole torso is
// shootable, and "only flames deal damage": his body never touch-hurts, only
// the fireballs he spits (plasmaflame.js, every FLAME_INTERVAL — the source's
// own `forever { create clone of Flame; wait 2 }`). He glides at the player
// the way the source does (`forever { glide 10 secs to Player }`).
// "Animate wings and mouth, not smooth, but enough to be noticeable": each
// costume is pre-split into body / left wing / right wing / jaw layers
// (straight from the source SVG's own line colours — the 30 `#4f6bff` lines
// are the two wings, the 25 cyan lines near the head are the jaw; the 9 cyan
// lines of the tail tip stay part of the body and are decoration, not a hit
// spot). The wings flap through stepped poses around their own shoulder
// pivot (the point every wing line converges on), the jaw drops open for
// each spit, and the whole body still alternates front/side costumes and
// flips facing on the source's own 0.5s cadence.
//
// PHASE 2 — the head (`Plasmadrache_Delta_Head.sprite3`, a 90-frame
// animation, all 90 frames played at Scratch's own 30fps). 50 HP, damage
// cut per an exact table (PHASE2_DMG), only the cyan chin is hittable, and
// touching the head anywhere "noms you" — an instant, invulnerability-
// bypassing kill like OCCÜLTACRESBURG's chomp. It glides at the player on
// the head sprite's own faster cadence (`glide 4 secs to Player`).
//
// Hit regions move by relocating this Hittable's own x/y/radius every frame
// (torso circle in phase 1, chin circle in phase 2) rather than a custom
// hitTest(), so every weapon — including LINE SLASHER's SLASH, which reads
// h.x/h.y/h.radius directly — respects them with no per-weapon code.
import { Hittable, CYAN, toScreen, HALF_W, HALF_H, dist, PPU } from './core.js';
import { spawnPlasmaFlame } from './plasmaflame.js';
import { recordHit } from './progress.js';

const MAX_HP_1 = 150;
const MAX_HP_2 = 50;

// --- Phase 1: the full body ---
// Layer crops measured from the split source art (texture px on the
// costume's own 900x1000 canvas; every costume's rotation centre is
// (450, 500)). `pivotL`/`pivotR` are the shoulder points the wings rotate
// around; `jaw` is the jaw piece's crop; `hit` is the torso centre.
const BODY_URL = 'assets/sprites/plasmadrachedelta/body/';
const BODY_ORIGIN = [450, 500];
const BODY_COSTUMES = {
  front: {
    body: [73, 87, 698, 868], wingL: [57, 45, 306, 447], wingR: [537, 45, 306, 447], jaw: [407, 288, 86, 55],
    pivotL: [346.2, 337.5], pivotR: [553.8, 337.5], mouth: [450, 315], hit: [450, 470],
  },
  side: {
    body: [136, 111, 648, 844], wingL: [116, 45, 322, 456], wingR: [575, 75, 193, 407], jaw: [501, 316, 86, 48],
    pivotL: [425.5, 352.4], pivotR: [592.6, 345.9], mouth: [544, 340], hit: [530, 480],
  },
};
const BODY_SCALE = 0.43;          // screen px per texture px -- ~55% of screen height
const BODY_RADIUS = 1.5;          // world units, around the torso/neck
const COSTUME_STEP = 0.5;         // the source's own `next costume; wait 0.5`
const WING_POSES = [0, 0.1, 0.2, 0.1, 0, -0.1];   // radians, stepped -- "not smooth"
const WING_STEP = 0.12;
const JAW_DROP = 16;              // texture px the jaw drops while spitting
const SPIT_HOLD = 0.4;            // jaw-open time; the flame launches at its midpoint
const FLAME_INTERVAL = 2;         // the source's own `wait 2`
const BODY_GLIDE = 10;            // the source's own `glide 10 secs to Player`
const BODY_BOUND_X = HALF_W - 2.8;
const BODY_BOUND_Y = HALF_H - 3.0;

// --- Phase 2: the head ---
const HEAD_FRAMES = 90;
const HEAD_FPS = 30;              // Scratch's own `forever { next costume }` rate
const HEAD_SCALE = 1.0;           // the ~180px-wide art lands at ~2.6 world units
// Measured from the chin's own cyan pixels (bbox x:[160,239] y:[298,342] on
// the 400x400 frame, anchor (200,200)): centred under the anchor, 120px down.
const CHIN_OFFSET_Y = 120 * HEAD_SCALE / PPU;
const CHIN_RADIUS = 0.45;
const HEAD_TOUCH_RADIUS = 1.5;
const HEAD_GLIDE = 4;             // the head sprite's own `glide 4 secs to Player`
const HEAD_BOUND_X = HALF_W - 1.6;
const HEAD_BOUND_Y = HALF_H - 2.1;
// Where the body's own head sits relative to its origin, so the head form
// appears exactly where the body's head just was.
const HEAD_FROM_BODY_Y = (215 - BODY_ORIGIN[1]) * BODY_SCALE / PPU;

const TRANSITION_TIME = 1.2;
const HIT_FLASH = 0.06;

// "normal weapon - 0, shotgun pellet - 1, charged shot - 2, fully charged
// shot of charge cannon - 5": bullet.js only ever passes these four dmg
// values (1/2/3/10), so the request's numbers are a literal lookup (a plain
// halving would make a charged hit 1, not the 2 asked for).
const PHASE2_DMG = { 1: 0, 2: 1, 3: 2, 10: 5 };

const HP_SCORE = 100;
const DEFEAT_SCORE = 500;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const texToWorld = (px, scale) => px * scale / PPU;

// ENDLESS MODE (levels/endless.js) fights each form as its own boss:
// `opts.only` 1 = the body alone (0 HP is the win, no head), 2 = the head
// alone, from the start.
export class PlasmadracheDelta extends Hittable {
  constructor(world, x, y, opts = {}) {
    // CYAN in both forms: any shot registers and breaks here, even a phase-2
    // plain bullet that does 0 damage.
    super(world, { x, y, color: CYAN, radius: BODY_RADIUS, countsAsProgress: false });
    this.isBoss = true;   // a supercharged shot stops on it instead of piercing (bullet.js)
    this.world = world;
    this.alive = true;
    this.posX = x; this.posY = y;
    this.mode = 'phase1';        // 'phase1' | 'transition' | 'phase2'
    this.hp = MAX_HP_1;
    this.t = 0;
    this.flashT = 0;
    this.glide = null;

    // phase 1 state
    this.costumeStep = 0; this.costumeT = 0;
    this.wingPose = 0; this.wingT = 0;
    this.flameT = FLAME_INTERVAL;
    this.spitT = -1;             // >= 0 while the jaw is open
    this.spitLaunched = false;

    this.body = this.buildBody();
    this.head = this.buildHead();
    this.head.container.visible = false;
    world.stage.addChild(this.body.container, this.head.container);
    this.applyCostume();
    this.place();
    this.only = opts.only || 0;
    if (this.only === 2) this.enterPhase2();
  }

  buildBody() {
    const container = new PIXI.Container();
    const costumes = {};
    for (const [name, c] of Object.entries(BODY_COSTUMES)) {
      const root = new PIXI.Container();
      const layer = (file, crop) => {
        const spr = PIXI.Sprite.from(`${BODY_URL}${name}_${file}.png`);
        spr.position.set(crop[0] - BODY_ORIGIN[0], crop[1] - BODY_ORIGIN[1]);
        return spr;
      };
      // A wing is a sprite inside a pivot container sitting on its shoulder,
      // so rotating the container swings the wing around that shoulder.
      const wing = (file, crop, pivot) => {
        const holder = new PIXI.Container();
        holder.position.set(pivot[0] - BODY_ORIGIN[0], pivot[1] - BODY_ORIGIN[1]);
        const spr = PIXI.Sprite.from(`${BODY_URL}${name}_${file}.png`);
        spr.position.set(crop[0] - pivot[0], crop[1] - pivot[1]);
        holder.addChild(spr);
        return holder;
      };
      const wingL = wing('wingL', c.wingL, c.pivotL);
      const wingR = wing('wingR', c.wingR, c.pivotR);
      const body = layer('body', c.body);
      const jaw = layer('jaw', c.jaw);
      root.addChild(wingL, wingR, body, jaw);
      root.visible = false;
      container.addChild(root);
      costumes[name] = { root, wingL, wingR, jaw, jawY: jaw.position.y, def: c };
    }
    container.scale.set(BODY_SCALE);
    return { container, costumes };
  }

  buildHead() {
    const frames = [];
    for (let i = 0; i < HEAD_FRAMES; i++) {
      frames.push(PIXI.Texture.from(`assets/sprites/plasmadrachedelta/head/frame${String(i).padStart(2, '0')}.png`));
    }
    const sprite = new PIXI.Sprite(frames[0]);
    sprite.anchor.set(0.5, 0.5);   // every one of the 90 costumes is centred at (200, 200) of 400x400
    const container = new PIXI.Container();
    container.scale.set(HEAD_SCALE);
    container.addChild(sprite);
    return { container, sprite, frames, frame: 0, frameT: 0 };
  }

  // The source's body loop: repeat 2 { next costume; wait 0.5 }; point -90;
  // repeat 2 { next costume; wait 0.5 }; point 90 -- front/side alternate
  // every step, facing flips every two.
  get costumeName() { return this.costumeStep % 2 === 0 ? 'front' : 'side'; }
  get facing() { return Math.floor(this.costumeStep / 2) % 2 === 0 ? 1 : -1; }
  get costume() { return this.body.costumes[this.costumeName]; }

  applyCostume() {
    for (const c of Object.values(this.body.costumes)) c.root.visible = false;
    this.costume.root.visible = true;
    this.body.container.scale.x = BODY_SCALE * this.facing;
    this.applyWings();
    this.applyJaw();
  }

  applyWings() {
    const a = WING_POSES[this.wingPose];
    const c = this.costume;
    c.wingL.rotation = -a;
    c.wingR.rotation = a;
  }

  applyJaw() {
    const c = this.costume;
    c.jaw.position.y = c.jawY + (this.spitT >= 0 ? JAW_DROP : 0);
  }

  // World-space point at a texture-px spot on the current body costume.
  bodyPoint(tx, ty) {
    return {
      x: this.posX + texToWorld((tx - BODY_ORIGIN[0]) * this.facing, BODY_SCALE),
      y: this.posY + texToWorld(ty - BODY_ORIGIN[1], BODY_SCALE),
    };
  }

  chinPos() { return { x: this.posX, y: this.posY + CHIN_OFFSET_Y }; }

  place() {
    const [sx, sy] = toScreen(this.posX, this.posY);
    this.body.container.position.set(sx, sy);
    this.head.container.position.set(sx, sy);
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      const a = this.flashT > 0 ? 0.45 : 1;
      this.body.container.alpha = a; this.head.container.alpha = a;
    }

    if (this.mode === 'transition') {
      this.body.container.visible = Math.floor(this.t / 0.1) % 2 === 0;
      if (this.t >= TRANSITION_TIME) this.enterPhase2();
      return;
    }

    if (this.mode === 'phase1') {
      this.updateGlide(dt, BODY_GLIDE, BODY_BOUND_X, BODY_BOUND_Y);
      this.updateBodyAnim(dt);
      this.updateFlames(dt);
      const h = this.costume.def.hit;
      const p = this.bodyPoint(h[0], h[1]);
      this.x = p.x; this.y = p.y; this.radius = BODY_RADIUS;
    } else {
      this.updateGlide(dt, HEAD_GLIDE, HEAD_BOUND_X, HEAD_BOUND_Y);
      this.updateHeadAnim(dt);
      this.updateTouchInstakill();
      const c = this.chinPos();
      this.x = c.x; this.y = c.y; this.radius = CHIN_RADIUS;
    }
  }

  // A literal Scratch glide: aim at where the player is now, travel there
  // linearly over `secs`, then pick the next target. Targets are clamped so
  // the art never leaves the screen.
  updateGlide(dt, secs, bx, by) {
    const p = this.world.player;
    if (!this.glide || this.glide.t >= secs) {
      const tx = p ? clamp(p.x, -bx, bx) : this.posX;
      const ty = p ? clamp(p.y, -by, by) : this.posY;
      this.glide = { fromX: this.posX, fromY: this.posY, toX: tx, toY: ty, t: 0 };
    }
    const g = this.glide;
    g.t = Math.min(secs, g.t + dt);
    const k = g.t / secs;
    this.posX = clamp(g.fromX + (g.toX - g.fromX) * k, -bx, bx);
    this.posY = clamp(g.fromY + (g.toY - g.fromY) * k, -by, by);
    this.place();
  }

  updateBodyAnim(dt) {
    this.costumeT += dt;
    if (this.costumeT >= COSTUME_STEP) {
      this.costumeT -= COSTUME_STEP;
      this.costumeStep = (this.costumeStep + 1) % 4;
      this.applyCostume();
    }
    this.wingT += dt;
    if (this.wingT >= WING_STEP) {
      this.wingT -= WING_STEP;
      this.wingPose = (this.wingPose + 1) % WING_POSES.length;
      this.applyWings();
    }
  }

  updateFlames(dt) {
    if (this.spitT >= 0) {
      this.spitT += dt;
      if (!this.spitLaunched && this.spitT >= SPIT_HOLD / 2) {
        this.spitLaunched = true;
        const m = this.costume.def.mouth;
        const mp = this.bodyPoint(m[0], m[1]);
        spawnPlasmaFlame(this.world, mp.x, mp.y);
      }
      if (this.spitT >= SPIT_HOLD) { this.spitT = -1; this.applyJaw(); }
      return;
    }
    this.flameT -= dt;
    if (this.flameT <= 0) {
      this.flameT = FLAME_INTERVAL;
      this.spitT = 0; this.spitLaunched = false;
      this.applyJaw();
    }
  }

  updateHeadAnim(dt) {
    const h = this.head;
    h.frameT += dt;
    const step = 1 / HEAD_FPS;
    if (h.frameT < step) return;
    const n = Math.floor(h.frameT / step);
    h.frameT -= n * step;
    h.frame = (h.frame + n) % HEAD_FRAMES;
    h.sprite.texture = h.frames[h.frame];
  }

  // Phase 2 only. Bypasses invulnerability like plasmadrache.js's chomp:
  // a direct dead flag, not damage.
  updateTouchInstakill() {
    const p = this.world.player;
    if (!p || p.dead) return;
    if (p.touchesCircle(this.posX, this.posY, HEAD_TOUCH_RADIUS)) {
      this.world.audio.play('plasmaChomp', 1.0);
      this.world.killedBy = 'nom';
      this.world.deathCueEnd = this.world.audio.now() + this.world.audio.duration('plasmaChomp');
      p.dead = true;
      p.frozen = false;
      if (p.container) p.container.visible = false;
      recordHit(this.world.currentLevelId, true);
    }
  }

  die(dmg = 1) {
    if (this.dead || this.mode === 'transition') return;
    const applied = this.mode === 'phase1'
      ? dmg
      : (PHASE2_DMG[dmg] != null ? PHASE2_DMG[dmg] : Math.floor(dmg / 2));
    if (applied <= 0) return;    // the shot still breaks against him (CYAN), it just does nothing
    this.hp -= applied;
    this.flashT = HIT_FLASH;
    this.world.addScore(HP_SCORE);
    this.world.audio.play('bossHurt', 0.7);
    if (this.hp > 0) return;
    this.hp = 0;
    if (this.mode === 'phase1' && this.only !== 1) this.enterTransition();
    else this.defeat();
  }

  enterTransition() {
    this.mode = 'transition';
    this.t = 0;
    this.spitT = -1; this.applyJaw();
    const hud = this.world.hud;
    if (hud) {
      hud.setCenter('ENRAGED');
      this.world.wait(TRANSITION_TIME).then(() => { if (hud.center.text === 'ENRAGED') hud.setCenter(''); });
    }
    this.world.audio.play('bossDefeat', 0.8);
  }

  // The body drops away and the head takes its place, right where the
  // body's own head was.
  enterPhase2() {
    this.mode = 'phase2';
    this.hp = MAX_HP_2;
    this.t = 0;
    this.posY = clamp(this.posY + HEAD_FROM_BODY_Y, -HEAD_BOUND_Y, HEAD_BOUND_Y);
    this.posX = clamp(this.posX, -HEAD_BOUND_X, HEAD_BOUND_X);
    this.glide = null;
    this.body.container.visible = false;
    this.head.container.visible = true;
    this.place();
    this.world.audio.stopLoop('plasmaDeltaTheme');
    this.world.audio.loop('plasmaDeltaHeadTheme', 0.5);
  }

  defeat() {
    this.dead = true;
    this.world.addScore(DEFEAT_SCORE);
    this.world.audio.play('bossDefeat', 0.9);
    this.destroy();
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {   // phase 2: touching the head anywhere is the nom
    if (this.mode === 'phase1') return { shapes: [{ circle: [this.x, this.y, this.radius] }] };
    return { shapes: [{ circle: [this.posX, this.posY, HEAD_TOUCH_RADIUS] }] };
  }
  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    this.world.audio.stopLoop('plasmaDeltaTheme');
    this.world.audio.stopLoop('plasmaDeltaHeadTheme');
    for (const c of [this.body.container, this.head.container]) {
      if (c && !c.destroyed) c.destroy({ children: true });
    }
  }
}
