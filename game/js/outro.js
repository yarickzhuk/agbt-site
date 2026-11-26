// outro.js — the final cutscene, part 1: "Big Bang Build-up", ported from the
// author's own Big_Bang_Build-up.sb3. Plays after Delta falls, before the
// victory screen (main.js). The crystals the player brought back reunite into
// the White Universal Crystal, which spins faster and faster, burns white and
// fades while dust of every colour pours into it, until it collapses to a
// single white point. (Part 2 follows that point.)
//
// A straight port of the project's two sprite scripts on one shared clock at
// Scratch's 30 frames/s, like intro.js:
// - Спрайт1 (the crystal): six costume steps 0.1s apart, each with
//   Drone_bomber_loop, then Build_up plays and, forever: Speed +1 every 0.1s,
//   Brights +1 every 0.2s; every frame ghost += Speed/1000, turn right Speed
//   degrees, brightness = Brights; one dust clone per frame.
// - Спрайт2 (dust): each clone gets a random colour effect (0-100), starts at
//   a random spot, glides 20/Speed secs into the crystal, its brightness
//   climbing by Brights every frame.
// - [Z]: the crystal shrinks to 1/Speed % and all its scripts stop (no more
//   dust, no more spin); the dust already flying keeps going; the original
//   dot appears at the centre, full brightness — a white point.
//
// Changed from the source: the reunion. The source flicks through six
// costumes 0.1s apart (Drone_bomber_loop on each), which drew the eight
// aspects closer together step by step — the warm four, then the cool four,
// then the whole outline (образ1) and filled (образ2, the spin costume).
// Per direct request ("made crystals merge by movement, not a crappy sprite
// animation") the eight are real pieces instead — the intro's own shard art
// (intro.js) — that fly in from off-screen along their own direction from
// the centre, spinning and slowing, and lock into place: the warm four first,
// then the cool four, Drone_bomber_loop on each landing. Then the outline
// shows for a beat and fills.
//
// Additions on top of the source: an [X] skip, a black backdrop over the
// finished level, and a short hold on the white point before handing off.
//
// **The collapse is automatic** — per direct request ("make all
// interactable moments in both cutscenes automatic"). The source waited on
// [Z] (shown with a PRESS [Z] hint from HINT_AT on); now the crystal
// collapses by itself at COLLAPSE_AT, the moment it burns fully white.
import { input } from './input.js';
import { toScreen, PPU, SCREEN_W, SCREEN_H } from './core.js';
import { playBigBang } from './bigbang.js';

const FPS = 30;
const SU = 1 / 36;                  // world units per Scratch unit, as in intro.js
const SPRITE_SCALE = SU * PPU / 4;  // costumes rasterized at 4 texture px per Scratch unit
const STAGE_X = 240, STAGE_Y = 180;
const START_DIR = -40;              // the sprite's saved direction (the script never sets one)
// Each aspect's centre in the assembled crystal, relative to its centre, in
// Scratch units (y down, before the crystal's own rotation): the warm four
// sit where intro.js's WARM_SHARDS do; the cool four, measured off образ1,
// sit closer in than in the intro's cracked costume.
const WARM = { spirit: [-1.39, -20.7], speed: [0.36, 20.55],
               creativity: [-21.26, 1.8], life: [19.86, -1.82] };
const COOL = { power: [-27.01, -23.8], matter: [23.49, -26.54],
               control: [-25.63, 25.08], resistance: [29.12, 26.83] };
const FLY_FROM = 9;                 // world units from the centre a piece starts at (off-screen)
const FLY_TIME = 1.8;               // s each piece takes to fly in
const FLY_STAGGER = 0.25;           // s between pieces of a group
const FLY_TURNS = 2;                // whole spins a piece unwinds on the way in
const GROUP_GAP = 0.4;              // s after the warm four land before the cool four set off
const OUTLINE_HOLD = 0.4;           // s on the assembled outline before it fills
const CLONE_CAP = 300;              // Scratch's own clone limit
const COLLAPSE_AT = 20;             // s after the build-up starts: Brights is 100, the crystal burns white
const LEAD_IN = 1;                  // s of black before the crystal appears
const POINT_HOLD = 1;               // s on the white point before part 2 (bigbang.js) takes over

// Anchor fractions from each costume's Scratch rotationCenter.
const COSTUMES = { 1: [0.4915, 0.5005], 2: [0.4915, 0.5005] };
export const OUTRO_PNGS = [
  ...Object.keys(COSTUMES).map(k => `assets/sprites/outro/crystal_${k}.png`),
  'assets/sprites/outro/crystal_2_white.png',   // costume 2's silhouette, for the brightness effect
];

class Skip extends Error {}

// Scratch's colour effect on the red dot: 200 = once round the hue wheel.
function hueColor(effect) {
  const h = ((effect / 200) % 1) * 6;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x]
                  : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return [r, g, b];
}
// Scratch's brightness effect (0-100) pushes every channel toward white.
function brighten([r, g, b], k) {
  const f = c => Math.round(255 * (c + (1 - c) * k));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

export function playOutro(world) {
  return new Promise(resolve => {
    const app = world.app, audio = world.audio;
    world.clearEntities();
    world.baseFilters = null;   // DELTA's monochrome playfield ends with the level
    world.stage.filters = null;
    audio.stopAllLoops();

    const root = new PIXI.Container();
    root.sortableChildren = true;
    root.zIndex = 150;          // over the finished level and HUD, under the end screen
    app.stage.addChild(root);
    const backdrop = new PIXI.Graphics();
    backdrop.beginFill(0x000000).drawRect(0, 0, SCREEN_W, SCREEN_H).endFill();
    root.addChild(backdrop);

    const place = (s, x, y, dir) => {
      [s.x, s.y] = toScreen(x * SU, -y * SU);
      if (dir != null) s.rotation = (dir - 90) * Math.PI / 180;
    };
    const tex = k => PIXI.Texture.from(`assets/sprites/outro/crystal_${k}.png`);

    const dustLayer = new PIXI.Container(); dustLayer.zIndex = 1; dustLayer.name = 'dust'; root.addChild(dustLayer);
    const crystal = new PIXI.Sprite(tex(1));
    crystal.name = 'crystal'; crystal.zIndex = 2; crystal.visible = false;
    // the brightness effect: a white silhouette over it (tint can only darken),
    // its alpha = brightness/100, so the crystal fades toward white like Scratch's
    const glow = new PIXI.Sprite(PIXI.Texture.from('assets/sprites/outro/crystal_2_white.png'));
    glow.name = 'glow'; glow.zIndex = 3; glow.visible = false; glow.anchor.set(...COSTUMES[2]);
    root.addChild(crystal, glow);
    let dir = START_DIR, ghost = 0, size = 100, costume = 1;
    const setCostume = k => {
      costume = k;
      crystal.texture = tex(k); crystal.anchor.set(...COSTUMES[k]);
    };
    const point = new PIXI.Graphics();
    point.beginFill(0xffffff).drawCircle(0, 0, 1).endFill();
    point.name = 'point'; point.zIndex = 4; point.visible = false;
    root.addChild(point); place(point, 0, 0);

    const textStyle = { fontFamily: 'Tektur, monospace', fill: 0xffffff, align: 'center' };
    const skipText = new PIXI.Text('X  SKIP', { ...textStyle, fontSize: 16, letterSpacing: 3 });
    skipText.anchor.set(1, 1); skipText.x = SCREEN_W - 16; skipText.y = SCREEN_H - 12;
    skipText.alpha = 0.45; skipText.zIndex = 10; root.addChild(skipText);

    // --- the shared clock (as intro.js) ------------------------------------
    let clock = 0, done = false, finished = false;
    let timers = [];
    const tickers = new Set();
    const at = target => {
      if (done) return Promise.reject(new Skip());
      if (target <= clock) return Promise.resolve();
      return new Promise((res, rej) => timers.push({ target, res, rej }));
    };
    const wait = s => at(clock + s);
    const playing = new Set();
    const sfx = (name, vol) => {
      const src = audio.play(name, vol);
      if (src) { playing.add(src); src.onended = () => playing.delete(src); }
    };
    const every = (period, fn) => {
      let next = clock;
      const job = () => { while (clock >= next) { fn(); next += period; } };
      tickers.add(job);
      return job;
    };

    const vars = { speed: 0, brights: 0 };
    const crystalJobs = [];
    const drawCrystal = () => {
      const s = SPRITE_SCALE * size / 100;
      for (const sp of [crystal, glow]) { place(sp, 0, 0, dir); sp.scale.set(s); }
      crystal.alpha = 1 - Math.min(100, ghost) / 100;
      glow.alpha = crystal.alpha * Math.min(100, vars.brights) / 100;
      glow.visible = crystal.visible && costume === 2 && glow.alpha > 0;
    };

    let handedOff = false;
    async function crystalScript() {
      await wait(LEAD_IN);
      await flyIn(WARM);
      await wait(GROUP_GAP);
      await flyIn(COOL);
      pieceLayer.removeChildren().forEach(c => c.destroy());
      setCostume(1); drawCrystal();
      crystal.visible = true;
      await wait(OUTLINE_HOLD);
      setCostume(2); drawCrystal();
      // broadcast
      crystalJobs.push(every(0.1, () => { vars.speed += 1; }));
      crystalJobs.push(every(0.2, () => { vars.brights += 1; }));
      crystalJobs.push(every(1 / FPS, () => {
        ghost += vars.speed / 1000;
        if (costume !== 2) setCostume(2);
        dir += vars.speed;
        drawCrystal();
      }));
      crystalJobs.push(every(1 / FPS, spawnDust));
      sfx('outroBuildUp');
      await wait(COLLAPSE_AT);
      await collapse();
    }

    // The aspects fly home: each starts off-screen along its own direction
    // from the centre and decelerates into its seat, unwinding a couple of
    // spins so it arrives turned the way the crystal is.
    const pieceLayer = new PIXI.Container(); pieceLayer.zIndex = 2; pieceLayer.name = 'pieces'; root.addChild(pieceLayer);
    async function flyIn(table) {
      const rot = (dir - 90) * Math.PI / 180;
      const landings = Object.entries(table).map(([key, [ox, oy]], i) => {
        const tx = (ox * Math.cos(rot) - oy * Math.sin(rot)) * SU;   // seat, world units, y down
        const ty = (ox * Math.sin(rot) + oy * Math.cos(rot)) * SU;
        const len = Math.hypot(tx, ty) || 1;
        const fx = tx / len * FLY_FROM, fy = ty / len * FLY_FROM;
        const s = new PIXI.Sprite(PIXI.Texture.from(`assets/sprites/intro/shard_${key}.png`));
        s.anchor.set(0.5); s.scale.set(SPRITE_SCALE); s.name = 'piece_' + key; s.visible = false;
        pieceLayer.addChild(s);
        const t0 = clock + i * FLY_STAGGER;
        return new Promise(res => {
          const job = () => {
            if (clock < t0) return;
            s.visible = true;
            const k = Math.min(1, (clock - t0) / FLY_TIME);
            const e = 1 - Math.pow(1 - k, 3);   // ease out: fast in, settling into place
            [s.x, s.y] = toScreen(fx + (tx - fx) * e, fy + (ty - fy) * e);
            s.rotation = rot + FLY_TURNS * 2 * Math.PI * (1 - e);
            if (k >= 1) { tickers.delete(job); sfx('outroDrone'); res(); }
          };
          tickers.add(job);
        });
      });
      await Promise.all(landings);
      if (done) throw new Skip();
    }

    function spawnDust() {
      if (dustLayer.children.length >= CLONE_CAP) return;
      const base = hueColor(Math.random() * 100);
      const d = new PIXI.Graphics();
      d.beginFill(0xffffff).drawCircle(0, 0, 1).endFill();
      dustLayer.addChild(d);
      const fx = (Math.random() * 2 - 1) * STAGE_X, fy = (Math.random() * 2 - 1) * STAGE_Y;
      const secs = 20 / Math.max(1, vars.speed);
      const t0 = clock;
      let bright = 0, nextFrame = clock;
      const job = () => {
        while (clock >= nextFrame) { bright += vars.brights; nextFrame += 1 / FPS; }
        d.tint = brighten(base, Math.min(100, bright) / 100);
        const k = Math.min(1, (clock - t0) / secs);
        place(d, fx * (1 - k), fy * (1 - k));
        if (k >= 1) { tickers.delete(job); d.destroy(); }
      };
      tickers.add(job);
      job();
    }

    async function collapse() {
      crystalJobs.forEach(j => tickers.delete(j));
      size = 1 / Math.max(1, vars.speed);   // "set size to 1/Speed" — next to nothing
      drawCrystal();
      point.visible = true;
      while (dustLayer.children.length) await wait(0.1);
      await wait(POINT_HOLD);
      // part 2: the Big Bang, straight on from the point (it owns the ticker
      // and [X] from here; this step stops reading input)
      handedOff = true;
      app.ticker.remove(step);
      point.visible = false; crystal.visible = false; glow.visible = false;
      skipText.visible = false;
      playing.forEach(src => { try { src.stop(); } catch (e) {} });   // the build-up ends with the point
      await playBigBang(world, root);
      finish();
    }

    const step = () => {
      const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
      if (input.backPressed()) { input.endFrame(); finish(); return; }
      clock += dt;
      const due = timers.filter(t => t.target <= clock);
      timers = timers.filter(t => t.target > clock);
      due.forEach(t => t.res());
      tickers.forEach(job => job());
      input.endFrame();
    };

    function finish() {
      if (finished) return;
      finished = true; done = true;
      timers.forEach(t => t.rej(new Skip())); timers = [];
      tickers.clear();
      app.ticker.remove(step);
      playing.forEach(src => { try { src.stop(); } catch (e) {} });
      root.destroy({ children: true });
      resolve();
    }

    input.endFrame();   // the shot that killed Delta isn't an [X] skip
    app.ticker.add(step);
    crystalScript().catch(e => { if (!(e instanceof Skip)) console.error(e); });
  });
}
