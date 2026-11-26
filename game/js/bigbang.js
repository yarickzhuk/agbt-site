// bigbang.js — the final cutscene, part 2: the Big Bang. A remake, in this
// game's flat line-art look, of the author's upload "The Sound Of THE BIG
// BANG in 5K" (a rendered video), on the video's own timeline and with its
// own sound. outro.js runs it straight on from part 1's white point.
//
// The video, beat by beat, and what stands in for each here (flat strokes on
// black, no glow — see CLAUDE.md):
// - a point of light swells into a ball inside wisps of purple nebula
//   → the point grows into a white ball ringed by purple wireframe filaments;
// - the ball balloons until the frame is white (the rumble starts here)
//   → white rings race outward, then a full white screen;
// - the white clears to a horizontal lens flare across a purple nebula, with
//   galaxies flying out of it → a flat flare line and a centre star, the
//   filaments drifting outward and fading, galaxies (dots, two-armed spirals,
//   tilted ellipses, in the eight aspects' colours) streaming outward,
//   accelerating as they go (each one's speed grows with its distance, the
//   way the video's zoom reads);
// - the flare dims to a red glint while the galaxies slow to a drift
//   → the flare/star fade white → purple → red, the outward flow slows;
// - the field fades to black as the sound ends (the video's end card after
//   that isn't part of it).
import { input } from './input.js';
import { SCREEN_W, SCREEN_H } from './core.js';
import { paletteColor } from './retro.js';

const CX = SCREEN_W / 2, CY = SCREEN_H / 2;
const SOUND_AT = 3.3;          // s: the video's rumble starts as the screen whites out
const WHITE_IN = 2.9, WHITE_FULL = 3.0, WHITE_CLEAR = 3.5, WHITE_GONE = 4.6;
const FADE_OUT = 20, END = 24; // s: everything fades to black as the sound ends
const ASPECTS = ['blood', 'amber', 'hull', 'heal', 'ring', 'cobalt', 'grape', 'core'];
const FILAMENTS = 34;
const BURST = 70;              // galaxies flung out the moment the white clears
// First-pass: the flow's pace and the spawn rate (galaxies per second over time).
const flowRate = t => 1.6 * Math.exp(-(t - WHITE_CLEAR) / 4) + 0.08;   // outward speed per px of distance
const spawnRate = t => 40 * Math.exp(-(t - WHITE_CLEAR) / 6) + 6;

class Skip extends Error {}
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = k => Math.max(0, Math.min(1, k));
// a → b colour blend, both 0xRRGGBB
function mix(a, b, k) {
  const ch = s => (c => [(c >> 16) & 255, (c >> 8) & 255, c & 255])(s);
  const [x, y] = [ch(a), ch(b)];
  return (Math.round(lerp(x[0], y[0], k)) << 16) | (Math.round(lerp(x[1], y[1], k)) << 8) | Math.round(lerp(x[2], y[2], k));
}

// Plays inside `root` (outro.js's container, black backdrop already there).
// Resolves when it ends or is skipped with [X].
export function playBigBang(world, root) {
  return new Promise(resolve => {
    const app = world.app, audio = world.audio;
    const layer = new PIXI.Container();
    layer.name = 'bigbang'; layer.zIndex = 5; layer.sortableChildren = true;
    root.addChild(layer);
    const C = r => paletteColor(r);
    const WHITE = 0xffffff, GRAPE = C('grape'), CORE = C('core'), BLOOD = C('blood');

    // --- the actors ---------------------------------------------------------
    const field = new PIXI.Container(); field.zIndex = 1; field.name = 'galaxies'; layer.addChild(field);
    const nebula = new PIXI.Container(); nebula.zIndex = 2; nebula.name = 'nebula'; layer.addChild(nebula);
    const ball = new PIXI.Graphics(); ball.zIndex = 3; ball.name = 'ball'; layer.addChild(ball);
    const flare = new PIXI.Graphics(); flare.zIndex = 4; flare.name = 'flare'; layer.addChild(flare);
    const whiteout = new PIXI.Graphics();
    whiteout.beginFill(WHITE).drawRect(0, 0, SCREEN_W, SCREEN_H).endFill();
    whiteout.zIndex = 6; whiteout.alpha = 0; whiteout.name = 'whiteout'; layer.addChild(whiteout);
    const skipText = new PIXI.Text('X  SKIP', { fontFamily: 'Tektur, monospace', fill: 0xffffff, fontSize: 16, letterSpacing: 3 });
    skipText.anchor.set(1, 1); skipText.x = SCREEN_W - 16; skipText.y = SCREEN_H - 12;
    skipText.alpha = 0.45; skipText.zIndex = 10; layer.addChild(skipText);

    // Nebula filaments: jagged wireframe wisps in a ring around the centre.
    const filaments = [];
    for (let i = 0; i < FILAMENTS; i++) {
      const g = new PIXI.Graphics();
      const col = Math.random() < 0.6 ? GRAPE : CORE;
      g.lineStyle({ width: 1.5, color: col, alpha: 1 });
      let x = 0, y = 0, a = rand(0, Math.PI * 2);
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { a += rand(-1.1, 1.1); x += Math.cos(a) * rand(10, 26); y += Math.sin(a) * rand(10, 26); g.lineTo(x, y); }
      const ang = rand(0, Math.PI * 2), r = rand(40, 170);
      filaments.push({ g, ang, r, spin: rand(-0.3, 0.3) });
      g.alpha = 0;
      nebula.addChild(g);
    }

    // Galaxies: drawn once in local space, then flown outward.
    const galaxies = new Set();
    function spawnGalaxy(t, r0) {
      const g = new PIXI.Graphics();
      const col = Math.random() < 0.25 ? WHITE : C(ASPECTS[Math.floor(Math.random() * ASPECTS.length)]);
      const kind = Math.random();
      if (kind < 0.55) {                      // a star / far galaxy: a dot
        g.beginFill(col).drawCircle(0, 0, 1).endFill();
      } else if (kind < 0.8) {                // a two-armed spiral
        g.lineStyle({ width: 1, color: col });
        for (const off of [0, Math.PI]) {
          for (let s = 0; s <= 24; s++) {
            const th = off + s * 0.34, rr = 0.5 + s * 0.24;
            const px = Math.cos(th) * rr, py = Math.sin(th) * rr * 0.45;
            s ? g.lineTo(px, py) : g.moveTo(px, py);
          }
        }
        g.beginFill(col).drawCircle(0, 0, 0.8).endFill();
      } else {                                // a tilted elliptical galaxy
        g.lineStyle({ width: 1, color: col }).drawEllipse(0, 0, 4, 1.6);
      }
      g.rotation = rand(0, Math.PI * 2);
      const ang = rand(0, Math.PI * 2);
      const gal = { g, ang, r: r0, size: rand(0.6, 1.2), born: t };
      g.alpha = 0;
      field.addChild(g);
      galaxies.add(gal);
    }

    // --- the clock ----------------------------------------------------------
    let t = 0, finished = false, burst = false, spawnAcc = 0, soundSrc = null;
    const step = () => {
      const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
      if (input.backPressed()) { input.endFrame(); finish(); return; }
      input.endFrame();
      t += dt;
      if (!soundSrc && t >= SOUND_AT) soundSrc = audio.play('bigBang', 0.9);

      // the ball: a point that swells, then balloons past the screen edges
      ball.clear();
      if (t < WHITE_FULL) {
        const r = t < 1.5 ? lerp(1, 14, t / 1.5) : 14 * Math.pow(60, (t - 1.5) / (WHITE_FULL - 1.5));
        // a small solid core; past that the ball is drawn as packed rings
        // (strokes, like everything else here), with three racing out ahead
        ball.beginFill(WHITE).drawCircle(CX, CY, Math.min(r, 14)).endFill();
        if (r > 14) {
          const n = 8;
          for (let k = 1; k <= n; k++) {
            ball.lineStyle({ width: 3, color: k % 3 ? WHITE : CORE }).drawCircle(CX, CY, 14 + (r - 14) * k / n);
          }
          for (let k = 1; k <= 3; k++) {
            ball.lineStyle({ width: 2, color: k === 2 ? CORE : WHITE, alpha: 0.8 }).drawCircle(CX, CY, r * (1 + 0.35 * k));
          }
          ball.lineStyle(0);
        }
      }
      // the whiteout
      whiteout.alpha = t < WHITE_IN ? 0 : t < WHITE_FULL ? (t - WHITE_IN) / (WHITE_FULL - WHITE_IN)
                     : t < WHITE_CLEAR ? 1 : clamp01(1 - (t - WHITE_CLEAR) / (WHITE_GONE - WHITE_CLEAR));

      // the nebula: wisps around the ball, swept outward once it bursts
      const fade = t < FADE_OUT ? 1 : clamp01(1 - (t - FADE_OUT) / (END - FADE_OUT - 0.5));
      for (const f of filaments) {
        let r = f.r, a;
        if (t < WHITE_FULL) { a = clamp01((t - 0.3) / 1.2) * 0.8; r = f.r * (1 + 0.15 * t); }
        else { const k = t - WHITE_FULL; r = f.r * 1.45 * Math.exp(k * 0.55); a = clamp01(1 - k / 5) * 0.9; }
        f.g.alpha = a * fade;
        f.g.position.set(CX + Math.cos(f.ang + f.spin * t) * r, CY + Math.sin(f.ang + f.spin * t) * r * 0.7);
        f.g.scale.set(1 + Math.max(0, t - WHITE_FULL) * 0.3);
        f.g.rotation = f.ang + f.spin * t;
      }

      // the flare and the centre star, once the white clears
      flare.clear();
      if (t >= WHITE_CLEAR) {
        const k = t - WHITE_CLEAR;
        const col = k < 4 ? mix(WHITE, GRAPE, k / 4) : mix(GRAPE, BLOOD, clamp01((k - 4) / 6));
        const half = Math.max(70, (SCREEN_W / 2 + 40) * Math.exp(-k / 9));
        const w = Math.max(1, 5 * Math.exp(-k / 3));
        const a = clamp01(1 - (k - 10) / 8) * fade;
        flare.lineStyle({ width: w, color: col, alpha: a }).moveTo(CX - half, CY).lineTo(CX + half, CY);
        const sr = Math.max(2, 26 * Math.exp(-k / 2.5));
        flare.lineStyle({ width: 2, color: col, alpha: a }).drawCircle(CX, CY, sr);
        flare.lineStyle(0).beginFill(col, a).drawCircle(CX, CY, Math.max(1.5, sr * 0.4)).endFill();
      }

      // the galaxies: flung out in a burst, then a thinning stream
      if (t >= WHITE_CLEAR) {
        if (!burst) { burst = true; for (let i = 0; i < BURST; i++) spawnGalaxy(t, rand(5, 260)); }
        if (t < FADE_OUT) {
          spawnAcc += spawnRate(t) * dt;
          while (spawnAcc >= 1) { spawnAcc -= 1; spawnGalaxy(t, rand(4, 30)); }
        }
        const H = flowRate(t);
        for (const gal of galaxies) {
          gal.r += gal.r * H * dt;
          const d = gal.r / 400;   // nearer the edge = nearer the viewer
          gal.g.position.set(CX + Math.cos(gal.ang) * gal.r, CY + Math.sin(gal.ang) * gal.r * 0.75);
          gal.g.scale.set(gal.size * (1 + d * 2.5));
          gal.g.alpha = clamp01((t - gal.born) / 0.4) * clamp01(0.3 + d) * fade;
          if (gal.r > SCREEN_W * 0.75) { galaxies.delete(gal); gal.g.destroy(); }
        }
      }
      if (t >= END) finish();
    };

    function finish() {
      if (finished) return;
      finished = true;
      app.ticker.remove(step);
      if (soundSrc) { try { soundSrc.stop(); } catch (e) {} }
      layer.destroy({ children: true });
      resolve();
    }
    app.ticker.add(step);
  });
}
