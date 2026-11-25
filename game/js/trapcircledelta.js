// trapcircledelta.js — OUTER SPACE's own boss, "TRAP CIRCLE DELTA". Per
// direct request, alongside an upload of `Trap_Circle_Delta.sprite3` and
// `Trap_Circle_Beats.wav`: "Boss is a buffed version of a boss from Shape
// Limbo - Trap Circle (Here it's a Trap Circle Delta). Each his cyan spot
// has 10 hp (10 normal shots to KO) and each dark blue spot has 30 hp (10
// charged shot). Pink instakills player [now 2 HP, see below] and make THIS boss slower than
// Trap Circle from Shape Limbo. Trap_Circle_Beats.wav here should be
// combined with normal theme of Trap Circle to make a new soundtrack."
//
// `Trap_Circle_Delta.sprite3` is pure reference art, not a gameplay
// script — the same "thin skeleton" situation this session has hit
// repeatedly (`Level_select.sprite3` most recently): its own `sprite.json`
// has `blocks: {}`, nothing to replay. Its 5 costumes are an evolving
// design pass, not 5 simultaneous runtime states — costume 3 cleanly
// alternates cyan (`#00feff`)/purple (`#b100ff`) arcs 8 ways, costume 4
// drops cyan entirely in favor of `#1300ff`, and costume 5 is a separate,
// smaller accent piece (a face/eye detail) using bright pink (`#ff00b9`)
// — none of them hands this port a literal "3 cyan + 3 dark-blue + 3 pink"
// layout to trace. The actual ring built here is this boss's own fresh
// design from the brief: 9 evenly-spaced segments (40° apart, repeating
// cyan/dark-blue/pink every 120°) around `boss.js`'s own TrapWheel
// mechanic, generalized from its single weak sector to several
// independently-HP'd ones.
//
// **The source's own `#b100ff`/purple arcs are retinted to `cobalt`, not
// `grape`** — a deliberate departure from the literal source stroke
// colour, the same call `showman.js`'s own grape→blood retint made for
// an identical reason: `grape` is this game's established PURPLE-language
// colour (bullets break on it, torpedoes pass through, it never dies) —
// painting a segment the user explicitly wants killable by a charged shot
// in that exact hue would train the player to read it as unkillable, the
// one thing it isn't. `cobalt` (`#2B00FF`) is this game's own existing
// DARKBLUE-language colour (Knight, Plasmadrache, Showman's maze walls, …)
// and is what a dark-blue spot actually needs to say. Pink reuses `core`
// (`#FF00D4`, magenta) — not a literal `#ff00b9` match, but the exact
// colour `TrapWheel.json`'s own backing rings already use, so Trap Circle
// Delta's pink danger band reads as "the same family of boss," not an
// unrelated hue.
//
// **Hit rules, generalized from `bullet.js`'s own existing damage tiers**
// (`checkHits()` already computes 1 for a plain bullet, 3 for a charged
// shot/torpedo, 2 for a Cyber Shotgun pellet, 10 for a Charge Cannon
// supercharge, and hands it to `boss.tryHit(x, y, charged, dmg)` — no new
// damage-tiering code needed here at all): a cyan segment has 10 HP and
// any shot registers against it (plain bullets included), so 10 ordinary
// bullets drop one exactly as specified. A dark-blue segment has 30 HP
// but only counts a *charged* hit (torpedo/pellet/supercharged) —
// `tryHit` still returns `true` on an uncharged hit against one (so the
// shot visibly breaks against it, matching every other DARKBLUE
// `Hittable`'s own `stopsBullet` rule), it simply skips `damage()` so no
// HP is lost; 10 charged hits (3 dmg each) drops one exactly as specified.
// A pink segment is never shootable at all (`tryHit` just returns `false`
// for one, same as an already-destroyed gap) — its only interaction is the
// pink touch damage below. Any segment hit springs the whole ring back open
// (`scale = START_SCALE`), the same "a hit resets the crush timer" rule
// `boss.js`'s own `damage()` already has.
//
// **Pink deals `PINK_DAMAGE` (2 HP) per touch** (core.js) — originally an
// instakill ("Pink instakills player"), changed game-wide per a later
// direct request ("from now on (apply to everything) pink deals 2 HP").
// Ordinary `player.takeDamage` through the invulnerability-respecting path.
//
// **"Make THIS boss slower than Trap Circle from Shape Limbo"**: `SPIN`
// drops from the original's 60°/s to 35°/s (a full rotation now takes
// ~10.3s instead of ~6s), and `SHRINK`/`SPEEDUP` both drop too (0.6→0.4,
// 2.5→2.0) — the ring closes in more slowly overall, compensating for the
// extra segments/danger a player now has to read and react to compared to
// the original's single weak sector.
//
// **"Trap_Circle_Beats.wav... combined with normal theme... to make a new
// soundtrack"**: both `TrapCircle_theme.wav` (`bossTheme`, the exact loop
// SHAPE LIMBO's own TrapWheel already uses) and the newly uploaded
// `TrapCircle_beats.wav` (`trapCircleBeats`) are a matched pair — both
// run exactly 16.0s, stereo, 48kHz, confirmed by direct inspection — read
// as two synced stems of one composition rather than two unrelated clips.
// Rather than attempting any offline audio-mixing/export step this engine
// has no tooling for, "combine" is done the simplest faithful way
// available: both loop simultaneously as their own named `Audio.loop()`
// calls — the engine already mixes concurrent loop sources through the
// shared `masterGain` node for free, and multiple simultaneous loops
// already coexist elsewhere in this game (e.g. `flameIdle` alongside a
// level's other ambience). Both stop together on death/teardown.
//
// The source's own uploaded sound is the exact same byte-identical dead
// "поп" filler already seen in `Asteroid.sprite3`/`Disruptor.sb3` earlier
// this session (confirmed by hash) — per that same session's own most
// recent call on this exact file (`asteroid.js`: "use destroyed_cyan.wav
// instead"), it's not given a manufactured job here either; `destroyCyan`/
// `destroyIndigo` cover a segment's own break the same way they already
// do for every other CYAN/DARKBLUE Hittable in the game.
import { paletteColor } from './retro.js';
import { toScreen, PPU, dist, PINK_DAMAGE } from './core.js';

const MAX_SEGMENT_HP = { cyan: 10, darkblue: 30 };
const START_SCALE = 6, MIN_SCALE = 1.2;
const SHRINK = 0.4, SPEEDUP = 2.0;      // slower than TrapWheel's own 0.6/2.5
const SPIN = 35;                        // deg/s -- slower than TrapWheel's own 60
const RING_THICK = 0.18;
const SEGMENT_COUNT = 9;
const SEGMENT_SPACING = 360 / SEGMENT_COUNT;   // 40°
const SEGMENT_HALF_WIDTH = 16;                 // deg -- leaves a small visible gap between segments
const TYPE_ORDER = ['cyan', 'darkblue', 'pink'];   // repeats every 3 segments (every 120°)

// A segment's band as a polygon in world units (the ring sits at 0, 0).
function wedge(centreDeg, rIn, rOut, steps = 8) {
  const a0 = (centreDeg - SEGMENT_HALF_WIDTH) * Math.PI / 180, a1 = (centreDeg + SEGMENT_HALF_WIDTH) * Math.PI / 180;
  const out = [];
  for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; out.push([Math.cos(a) * rOut, Math.sin(a) * rOut]); }
  for (let i = steps; i >= 0; i--) { const a = a0 + (a1 - a0) * i / steps; out.push([Math.cos(a) * rIn, Math.sin(a) * rIn]); }
  return out;
}

function deltaAngle(a, b) {
  return ((a - b) % 360 + 540) % 360 - 180;
}

export class TrapCircleDelta {
  constructor(world) {
    this.world = world;
    this.scale = START_SCALE;
    this.angleDeg = 0;
    this.dead = false;
    this.alive = true;
    this.onDefeated = null;

    this.segments = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const type = TYPE_ORDER[i % 3];
      this.segments.push({
        angle: i * SEGMENT_SPACING,
        type,
        hp: MAX_SEGMENT_HP[type] || 0,   // pink has no HP -- it's never destroyed
        dead: false,
      });
    }

    // Local-space geometry baked once at START_SCALE's own world-unit
    // radius -- the container's own scale transform (applyScale) shrinks
    // the whole drawing as the ring closes in, so the drawn band always
    // matches tryHit's own `radius = this.scale * 0.5` hit-test exactly.
    this.baseRadius = START_SCALE * 0.5;
    this.innerPx = this.baseRadius * (1 - RING_THICK) * PPU;
    this.outerPx = this.baseRadius * (1 + RING_THICK) * PPU;

    this.container = new PIXI.Container();
    this.gfx = new PIXI.Graphics();
    this.container.addChild(this.gfx);
    const [sx, sy] = toScreen(0, 0);
    this.container.position.set(sx, sy);
    world.stage.addChild(this.container);
    this.redraw();
    this.applyScale();

    world.boss = this;
    world.audio.loop('bossTheme', 0.6);
    world.audio.loop('trapCircleBeats', 0.5);
  }

  // Each segment is a thin-stroked wedge OUTLINE -- outer arc, a radial
  // side, the inner arc back, the other radial side -- not a thick "filled"
  // arc stroke. `TrapWheel.json`'s own weak-sector layer is exactly this
  // shape (a closed polygon tracing the outer arc then the inner arc back,
  // stroked thin by buildSprite, which only ever strokes, never fills) --
  // an earlier draft of this ring used one thick `g.arc()` stroke per
  // segment (lineStyle width = the full band thickness), which read as a
  // solid filled pie slice instead of hollow line art, breaking this
  // game's own "flat palette-colour strokes, no glow, nothing filled"
  // rule. Sampling each arc into `ARC_STEPS` points and stroking the
  // resulting closed polygon thin is the same trick every curved vector
  // shape in this game already relies on (buildSprite's own 'ellipse'
  // primitive is just a many-sided stroked polygon under the hood).
  redraw() {
    const g = this.gfx;
    g.clear();
    // Backing rings, matching TrapWheel.json's own magenta concentric
    // circles -- a steady visual base that stays even once segments start
    // dying and leaving gaps.
    g.lineStyle({ width: 2, color: paletteColor('core'), alpha: 0.35 });
    g.drawCircle(0, 0, this.innerPx);
    g.drawCircle(0, 0, this.outerPx);

    const roleOf = { cyan: 'ring', darkblue: 'cobalt', pink: 'core' };
    const ARC_STEPS = 10;
    for (const seg of this.segments) {
      if (seg.dead) continue;   // a destroyed segment is a real gap -- nothing drawn
      const color = paletteColor(roleOf[seg.type]);
      const a0 = (seg.angle - SEGMENT_HALF_WIDTH) * Math.PI / 180;
      const a1 = (seg.angle + SEGMENT_HALF_WIDTH) * Math.PI / 180;
      g.lineStyle({ width: 2.5, color, alpha: 1 });
      for (let i = 0; i <= ARC_STEPS; i++) {
        const a = a0 + (a1 - a0) * i / ARC_STEPS;
        const x = Math.cos(a) * this.outerPx, y = Math.sin(a) * this.outerPx;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      for (let i = ARC_STEPS; i >= 0; i--) {
        const a = a0 + (a1 - a0) * i / ARC_STEPS;
        g.lineTo(Math.cos(a) * this.innerPx, Math.sin(a) * this.innerPx);
      }
      g.lineTo(Math.cos(a0) * this.outerPx, Math.sin(a0) * this.outerPx);
    }
  }

  update(dt) {
    if (this.dead) return;
    this.angleDeg = (this.angleDeg + SPIN * dt) % 360;
    this.container.rotation = this.angleDeg * Math.PI / 180;

    const livingHp = this.totalLivingHp(), maxHp = this.totalMaxHp();
    const t = maxHp > 0 ? 1 - livingHp / maxHp : 1;
    const rate = SHRINK * (1 + (SPEEDUP - 1) * t);
    this.scale -= rate * dt;
    if (this.scale <= MIN_SCALE) { this.scale = MIN_SCALE; this.crush(); }
    this.applyScale();

    this.checkPinkTouch();
  }

  applyScale() {
    const k = this.scale / START_SCALE;
    this.container.scale.set(k);
  }

  // hud.js's own boss readout ('BOSS ' + b.hp) expects a single number --
  // TrapWheel's own flat HP counter, generalized here to the pool of HP
  // still standing across every killable (cyan/dark-blue) segment. Pink
  // segments never contribute (they have no HP at all), matching the win
  // condition below, which only cares about cyan/dark-blue.
  get hp() { return this.totalLivingHp(); }

  totalMaxHp() {
    return this.segments.reduce((s, seg) => s + (MAX_SEGMENT_HP[seg.type] || 0), 0);
  }
  totalLivingHp() {
    return this.segments.reduce((s, seg) => s + (seg.dead ? 0 : (seg.hp > 0 ? seg.hp : 0)), 0);
  }

  crush() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    this.lastHurt = 'crush';   // deathreveal.js draws the closed ring, not the pink bands
    p.takeDamage(1);
    this.scale = Math.min(START_SCALE, this.scale + 1.5);
  }

  // A pink segment is a permanent, rotating touch-hurt band (PINK_DAMAGE) -- it's
  // never a Hittable, so it needs its own per-frame proximity check rather
  // than riding bullet.js's own hit-test path.
  checkPinkTouch() {
    const p = this.world.player;
    if (!p || p.invulnerable || p.dead) return;
    const radius = this.scale * 0.5;
    const rIn = radius * (1 - RING_THICK), rOut = radius * (1 + RING_THICK);
    const d = dist(0, 0, p.x, p.y);
    if (d < rIn - 0.4 || d > rOut + 0.4) return;   // nowhere near the band
    for (const seg of this.segments) {
      if (seg.type !== 'pink' || seg.dead) continue;
      // the ship's triangle against the segment's own wedge
      if (p.touchesPoly(wedge(this.angleDeg + seg.angle, rIn, rOut))) {
        this.lastHurt = 'pink';
        p.takeDamage(PINK_DAMAGE);
        return;
      }
    }
  }

  // Called by bullets (bullet.js/bouncyball.js's own `world.boss.tryHit`
  // call) -- same shape TrapWheel's own tryHit already has, generalized to
  // pick which (if any) of the 9 segments the shot actually landed on.
  tryHit(px, py, charged, dmg = 1) {
    if (this.dead) return false;
    const d = Math.hypot(px, py);
    const radius = this.scale * 0.5;
    if (d < radius * (1 - RING_THICK)) return false;
    if (d > radius * (1 + RING_THICK)) return false;
    const ang = Math.atan2(py, px) * 180 / Math.PI;
    const seg = this.segments.find(s => !s.dead &&
      Math.abs(deltaAngle(ang, this.angleDeg + s.angle)) <= SEGMENT_HALF_WIDTH);
    if (!seg) return false;                          // an empty gap -- shot passes clean through
    if (seg.type === 'pink') return false;            // never shootable
    if (seg.type === 'darkblue' && !charged) return true;   // breaks the shot, no damage -- the DARKBLUE rule
    this.damage(seg, dmg);
    return true;
  }

  damage(seg, n) {
    seg.hp -= n;
    this.scale = START_SCALE;               // a hit springs the ring back open
    this.applyScale();
    this.world.addScore(200);
    this.world.audio.play('bossHurt', 0.7);
    if (seg.hp <= 0) {
      seg.dead = true;
      this.world.audio.play(seg.type === 'darkblue' ? 'destroyIndigo' : 'destroyCyan', 0.6);
      this.redraw();
      if (this.segments.every(s => s.type === 'pink' || s.dead)) this.die();
    } else {
      this.redraw();
    }
  }

  die() {
    this.dead = true;
    this.alive = false;
    this.world.boss = null;
    this.world.audio.stopLoop('bossTheme');
    this.world.audio.stopLoop('trapCircleBeats');
    this.world.audio.play('bossDefeat', 0.9);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
    if (this.onDefeated) this.onDefeated();
  }

  // Used when the field is cleared (e.g. game over) without a defeat.
  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {
    const r = this.scale * 0.5;
    if (this.lastHurt === 'crush') return { shapes: [{ circle: [0, 0, r] }], label: 'THE RING CLOSED IN' };
    const r0 = r * (1 - RING_THICK), r1 = r * (1 + RING_THICK), k = Math.PI / 180;
    return { shapes: this.segments.filter(s => s.type === 'pink' && !s.dead).map(s => {
      const a = this.angleDeg + s.angle;
      return { annulus: [0, 0, r0, r1, (a - SEGMENT_HALF_WIDTH) * k, (a + SEGMENT_HALF_WIDTH) * k] };
    }) };
  }
  destroy() {
    this.alive = false;
    this.dead = true;
    this.world.boss = null;
    this.world.audio.stopLoop('bossTheme');
    this.world.audio.stopLoop('trapCircleBeats');
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
