// intro.js — the intro cutscene, "Monochrome Era", ported from the author's
// own Monochrome_Era.sb3. It tells the start of the lore (CLAUDE.md's Lore
// section): the White Universal Crystal forms out of dust, Delta forms
// below it, Delta strikes the crystal (on his own — see below), it cracks
// apart into its eight coloured aspects, Delta takes the pink Crystal of
// Power, and the rest shatter.
//
// A straight port of the project's three sprite scripts, run on one shared
// clock at Scratch's 30 frames/s (one loop iteration = one frame, like the
// source):
// - Спрайт1 (the crystal): waits 4s, flickers in as dust (costume 1, random
//   ghost for 100 frames), then 10 times fades costume 2 out over 20 frames
//   and flashes the dust for one frame with Crystal_merge, then holds
//   costume 2 through Crystal_merged and starts spinning (2°/frame) with
//   Crystal_spin looping and one dust clone per frame drawn into it.
// - Спрайт2 (dust): each clone appears at a random spot and glides into the
//   crystal over 4s.
// - Delta v2: waits 24s at (0,-120), forms the same way, then moves with the
//   arrows (5 steps/frame) leaving growing, fading afterimages every 0.1s.
//   [Z] glides him into the crystal in 0.1s and 160 steps on through it.
// - "fatal error": the crystal stops spinning, plays Destroyed_crystal, then
//   cracks (costume 4) and shows its four cool aspects (costume 3), one per
//   second with hurt_single.
//
// Changed from the source, per direct request ("White Crystal would separate
// crystals by ejecting them (so they'd act like a meteor.js) rather than
// sprites" / "You need to touch pink crystal to capture it"): the source's
// costumes 5/6 and 8/9 only drew the pieces further apart. Instead the four
// cool aspects are ejected as real pieces that fly like meteor.js's shards
// (3 units/s, spinning, bouncing off the screen edges with the meteor tones,
// gone after 5 bounces); the core turns warm (costume 7). The pink Crystal of
// Power never runs out of bounces, and the capture (Delta's costume 3 under
// Stage_Clear for 17s) only happens once Delta touches it. Then the warm four
// are ejected the same way, and the cutscene ends once they're gone.
//
// Additions on top of the source: an [X] skip and a "PRESS ANY KEY" gate
// when the browser hasn't allowed sound yet.
//
// **Hands-free, and shorter** — per direct request ("shorten waiting time in
// intro cutscene and make all interactable moments in both cutscenes
// automatic"). Nothing waits on the player any more: Delta strikes the
// crystal on his own a beat after he forms (`STRIKE_DELAY`), and after the
// crack he flies to the pink Crystal of Power by himself (`CHASE_SPEED`)
// instead of the player steering him onto it; the [Z] / TOUCH THE PINK
// CRYSTAL hints are gone with the controls. The waits are trimmed: the
// crystal starts forming after `CRYSTAL_AT` (was 4s), Delta forms right
// after the crystal is whole (`DELTA_GAP`; was a fixed 24s mark, ~9s
// later), the capture holds `CAPTURE_HOLD` (was 17s, the whole
// Stage_Clear.wav) and the warm four get `SHATTER_MAX` (was 8s). Sounds
// still playing when it ends fade out (`END_FADE`) rather than cut.
import { input } from './input.js';
import { HALF_W, HALF_H, toScreen, PPU } from './core.js';

const FPS = 30;                     // Scratch's frame rate: one loop pass per frame
const SU = 1 / 36;                  // world units per Scratch unit (its 360-unit-tall stage = our 10)
const TEX_PX_PER_SU = 4;            // costumes rasterized at 4 texture px per Scratch unit
const SPRITE_SCALE = SU * PPU / TEX_PX_PER_SU;

// Anchor fractions from each costume's Scratch rotationCenter.
const CRYSTAL_COSTUMES = {
  1: [0.5, 0.5001], 2: [0.4915, 0.5005], 4: [0.5048, 0.4888], 3: [0.5048, 0.4888],
  7: [0.5086, 0.5005],
  core: [0.5048, 0.4888],   // costume 3 with only its four white (warm, not yet coloured) aspects
};
// The eight aspects as separate pieces, cut from costume 3 (cool) and costume
// 7 (warm) by stroke colour: each piece's centre relative to the crystal's
// centre, in Scratch units (y down, before the crystal's own rotation).
const COOL_SHARDS = { power: [-47.86, -37.06], matter: [46.64, -38.81],
                      control: [-43.24, 41.31], resistance: [41.39, 34.94] };
const WARM_SHARDS = { spirit: [-1.39, -20.7], speed: [0.36, 20.55],
                      creativity: [-21.26, 1.8], life: [19.86, -1.82] };
const SHARD_SPEED = 3;                      // meteor.js's MeteorShard
const SHARD_SPIN = 450 * Math.PI / 180;
const SHARD_BOUNCES = 5;
const SHARD_R = 0.35;                       // touch radius (world units)
const DELTA_R = 0.25;
const SHATTER_MAX = 5;                      // end the cutscene at the latest this long after the warm four fly
const CRYSTAL_AT = 1;                       // s before the crystal starts forming
const DELTA_GAP = 1;                        // s between the crystal being whole and Delta forming
const STRIKE_DELAY = 1;                     // s Delta holds after forming before he strikes
const CHASE_SPEED = 6;                      // world units/s Delta flies at the pink crystal (it drifts at 3)
const CAPTURE_HOLD = 5;                     // s on Delta holding the pink crystal
const END_FADE = 0.6;                       // s to fade any sound still playing at the end
const DELTA_COSTUMES = { 1: [0.5, 0.5], 2: [0.4625, 0.4988], 3: [0.5555, 0.5275] };

export const INTRO_PNGS = [
  ...Object.keys(CRYSTAL_COSTUMES).map(k => `assets/sprites/intro/crystal_${k}.png`),
  ...Object.keys(DELTA_COSTUMES).map(k => `assets/sprites/intro/delta_${k}.png`),
  ...[...Object.keys(COOL_SHARDS), ...Object.keys(WARM_SHARDS)].map(k => `assets/sprites/intro/shard_${k}.png`),
];

const DELTA_START = { x: 0, y: -120 };   // Scratch coords
const STAGE_X = 240, STAGE_Y = 180;      // Scratch stage half-size, for random spots
const SEEN_KEY = 'agbt_intro_seen';      // sessionStorage: once per tab, like the progress wipe

// Plays once per fresh tab (main.js calls this before the title screen).
export function shouldPlayIntro() {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch (e) {}
  return true;
}

class Skip extends Error {}

export function playIntro(world) {
  return new Promise(resolve => {
    const app = world.app, audio = world.audio;
    const root = new PIXI.Container();
    root.sortableChildren = true;
    root.zIndex = 50;
    app.stage.addChild(root);

    const tex = path => PIXI.Texture.from(path);
    // Scratch (x up, direction 90 = unrotated) → screen
    const place = (s, x, y, dir) => {
      [s.x, s.y] = toScreen(x * SU, -y * SU);
      if (dir != null) s.rotation = (dir - 90) * Math.PI / 180;
    };
    const makeSprite = (prefix, anchors, key) => {
      const s = new PIXI.Sprite(tex(`assets/sprites/intro/${prefix}_${key}.png`));
      s.anchor.set(...anchors[key]);
      s.scale.set(SPRITE_SCALE);
      s.visible = false;
      return s;
    };
    const setCostume = (s, prefix, anchors, key) => {
      s.texture = tex(`assets/sprites/intro/${prefix}_${key}.png`);
      s.anchor.set(...anchors[key]);
      s.costume = key;
    };

    // --- the actors -------------------------------------------------------
    const dustLayer = new PIXI.Container(); dustLayer.zIndex = 0; dustLayer.name = 'dust'; root.addChild(dustLayer);
    const trailLayer = new PIXI.Container(); trailLayer.zIndex = 2; trailLayer.name = 'trail'; root.addChild(trailLayer);
    const crystal = makeSprite('crystal', CRYSTAL_COSTUMES, 1);
    crystal.zIndex = 1; crystal.dir = 0; crystal.name = 'crystal';
    root.addChild(crystal); place(crystal, 0, 0, 0);
    const delta = makeSprite('delta', DELTA_COSTUMES, 1);
    delta.name = 'delta'; delta.zIndex = 3; delta.sx = DELTA_START.x; delta.sy = DELTA_START.y; delta.dir = 0;
    root.addChild(delta); place(delta, delta.sx, delta.sy, 0);

    const textStyle = { fontFamily: 'Tektur, monospace', fill: 0xffffff, align: 'center' };
    const skipText = new PIXI.Text('X  SKIP', { ...textStyle, fontSize: 16, letterSpacing: 3 });
    skipText.anchor.set(1, 1); skipText.x = app.screen.width - 16; skipText.y = app.screen.height - 12;
    skipText.alpha = 0.45; skipText.zIndex = 10; root.addChild(skipText);
    const gate = new PIXI.Text(world.isMobile ? 'TAP TO START' : 'PRESS ANY KEY', { ...textStyle, fontSize: 30, letterSpacing: 4 });
    gate.anchor.set(0.5); gate.x = app.screen.width / 2; gate.y = app.screen.height / 2;
    gate.name = 'gate'; gate.zIndex = 10; gate.visible = false; root.addChild(gate);

    // --- the shared clock -------------------------------------------------
    let clock = 0, running = false, done = false, finished = false;
    let timers = [];
    const tickers = new Set();    // per-frame jobs (spin, trail, movement, ...)
    const at = target => {
      if (done) return Promise.reject(new Skip());
      if (target <= clock) return Promise.resolve();
      return new Promise((res, rej) => timers.push({ target, res, rej }));
    };
    const wait = s => at(clock + s);
    // `n` frames of a Scratch loop, catching up if the real frame rate is low
    const frames = async (n, fn) => {
      const start = clock;
      for (let i = 0; i < n; i++) {
        fn(i);
        await at(start + (i + 1) / FPS);
      }
    };
    const playing = new Set();   // one-shots still sounding, cut off on a skip
    const sfx = name => {
      const src = audio.play(name);
      if (src) { playing.add(src); src.onended = () => playing.delete(src); }
    };
    const fadeOutAll = secs => playing.forEach(src => {
      const g = src.gainNode && src.gainNode.gain;
      if (!g) return;
      const t = audio.now();
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + secs);
    });
    const playFor = async (name) => { sfx(name); await wait(audio.duration(name)); };   // "play until done"
    const every = (period, fn) => {   // a forever loop with a wait inside
      let next = clock;
      const job = () => { while (clock >= next) { fn(); next += period; } };
      tickers.add(job);
      return job;
    };

    // --- scripts ----------------------------------------------------------
    // Both the crystal and Delta form the same way: dust flicker, then ten
    // tries at holding together, then the merged costume.
    async function form(s, prefix, anchors, sounds) {
      s.visible = true;
      setCostume(s, prefix, anchors, 1);
      sfx(sounds.create);
      await frames(100, () => { s.alpha = 1 - Math.random() * 0.9; });
      s.alpha = 1;
      for (let k = 0; k < 10; k++) {
        setCostume(s, prefix, anchors, 2);
        await frames(20, i => { s.alpha = 1 - 0.05 * (i + 1); });
        setCostume(s, prefix, anchors, 1);
        s.alpha = 1;
        sfx(sounds.merge);
        await wait(1 / FPS);   // the dust shows for the one frame before the next try
      }
      setCostume(s, prefix, anchors, 2);
      await playFor(sounds.merged);
    }

    let spinJob = null, dustJob = null;
    let crystalWhole;
    const crystalFormed = new Promise(res => { crystalWhole = res; });
    async function crystalScript() {
      await at(CRYSTAL_AT);
      await form(crystal, 'crystal', CRYSTAL_COSTUMES,
        { create: 'introCrystalCreate', merge: 'introCrystalMerge', merged: 'introCrystalMerged' });
      crystalWhole();
      audio.loop('introCrystalSpin', 0.5);
      spinJob = every(1 / FPS, () => { crystal.dir += 2; place(crystal, 0, 0, crystal.dir); });
      dustJob = every(1 / FPS, spawnDust);
    }

    function spawnDust() {
      const d = new PIXI.Graphics();
      d.beginFill(0xffffff).drawCircle(0, 0, 1).endFill();
      const fx = (Math.random() * 2 - 1) * STAGE_X, fy = (Math.random() * 2 - 1) * STAGE_Y;
      const t0 = clock;
      dustLayer.addChild(d);
      const job = () => {
        const k = Math.min(1, (clock - t0) / 4);   // glide 4 secs to the crystal
        place(d, fx * (1 - k), fy * (1 - k));
        if (k >= 1) { tickers.delete(job); d.destroy(); }
      };
      tickers.add(job);
      job();
    }

    let chasing = null;   // the shard Delta is flying at on his own, if any
    async function deltaScript() {
      await crystalFormed;
      await wait(DELTA_GAP);
      place(delta, delta.sx, delta.sy, 0);
      await form(delta, 'delta', DELTA_COSTUMES,
        { create: 'introDeltaCreate', merge: 'introDeltaMerge', merged: 'introDeltaMerged' });
      every(0.1, spawnTrail);
      tickers.add(moveDelta);
      await wait(STRIKE_DELAY);
      await strike();
    }

    // No player control: Delta only moves on his own, flying straight at
    // `chasing` (the pink crystal) once it's set.
    function moveDelta() {
      if (!delta.visible) return;
      if (chasing) {
        const d = deltaWorld();
        const dx = chasing.x - d.x, dy = chasing.y - d.y;   // world units, y down
        const len = Math.hypot(dx, dy);
        if (len > 1e-3) {
          const step = Math.min(len, CHASE_SPEED * frameDt) / SU;
          delta.sx += dx / len * step;
          delta.sy -= dy / len * step;
          delta.dir = Math.atan2(dx, -dy) * 180 / Math.PI;
        }
      }
      delta.sx = Math.max(-HALF_W / SU, Math.min(HALF_W / SU, delta.sx));
      delta.sy = Math.max(-HALF_H / SU, Math.min(HALF_H / SU, delta.sy));
      place(delta, delta.sx, delta.sy, delta.dir);
    }

    function spawnTrail() {
      if (!delta.visible) return;
      const c = new PIXI.Sprite(delta.texture);
      c.anchor.copyFrom(delta.anchor);
      c.position.copyFrom(delta.position);
      c.rotation = delta.rotation;
      trailLayer.addChild(c);
      frames(10, i => {   // grow 10% and fade 10% per frame
        c.scale.set(SPRITE_SCALE * (1 + 0.1 * (i + 1)));
        c.alpha = 1 - 0.1 * (i + 1);
      }).catch(() => {}).finally(() => c.destroy());
    }

    async function strike() {
      delta.dir = Math.atan2(-delta.sx, -delta.sy) * 180 / Math.PI;   // point towards the crystal
      const fx = delta.sx, fy = delta.sy;
      const t0 = clock;
      await frames(3, () => {   // glide 0.1 secs to the crystal
        const k = Math.min(1, (clock - t0 + 1 / FPS) / 0.1);
        delta.sx = fx * (1 - k); delta.sy = fy * (1 - k);
      });
      delta.sx = 0; delta.sy = 0;
      const rad = (90 - delta.dir) * Math.PI / 180;
      await frames(4, () => { delta.sx += 40 * Math.cos(rad); delta.sy += 40 * Math.sin(rad); });
      await fatalError();
    }

    // An ejected aspect: flies straight out from where it sat in the crystal,
    // spinning, and bounces off the screen edges like meteor.js's shards.
    const shardLayer = new PIXI.Container(); shardLayer.zIndex = 2; shardLayer.name = 'shards'; root.addChild(shardLayer);
    const shards = new Set();
    function eject(table, opts = {}) {
      const rot = crystal.rotation;
      for (const [key, [ox, oy]] of Object.entries(table)) {
        // the piece's offset turned with the crystal (screen space, y down)
        const dx = ox * Math.cos(rot) - oy * Math.sin(rot);
        const dy = ox * Math.sin(rot) + oy * Math.cos(rot);
        const len = Math.hypot(dx, dy) || 1;
        const s = new PIXI.Sprite(tex(`assets/sprites/intro/shard_${key}.png`));
        s.anchor.set(0.5); s.scale.set(SPRITE_SCALE); s.rotation = rot; s.name = 'shard_' + key;
        shardLayer.addChild(s);
        const sh = { key, sprite: s, x: dx * SU, y: dy * SU,   // world units, y down
                     vx: dx / len * SHARD_SPEED, vy: dy / len * SHARD_SPEED,
                     bounces: 0, endless: key === opts.keep };
        shards.add(sh);
        const job = () => {
          const dt = frameDt;
          sh.x += sh.vx * dt; sh.y += sh.vy * dt;
          s.rotation += SHARD_SPIN * dt;
          let hit = false;
          if (sh.x < -HALF_W) { sh.x = -HALF_W; sh.vx = Math.abs(sh.vx); hit = true; }
          if (sh.x >  HALF_W) { sh.x =  HALF_W; sh.vx = -Math.abs(sh.vx); hit = true; }
          if (sh.y < -HALF_H) { sh.y = -HALF_H; sh.vy = Math.abs(sh.vy); hit = true; }
          if (sh.y >  HALF_H) { sh.y =  HALF_H; sh.vy = -Math.abs(sh.vy); hit = true; }
          [s.x, s.y] = toScreen(sh.x, sh.y);
          if (hit) {
            audio.play(['meteor1', 'meteor2', 'meteor3'][Math.floor(Math.random() * 3)], 0.7);
            if (!sh.endless && ++sh.bounces >= SHARD_BOUNCES) removeShard(sh);
          }
        };
        sh.job = job;
        tickers.add(job);
        job();
      }
    }
    function removeShard(sh) {
      tickers.delete(sh.job); shards.delete(sh);
      if (!sh.sprite.destroyed) sh.sprite.destroy();
    }
    const deltaWorld = () => ({ x: delta.sx * SU, y: -delta.sy * SU });

    async function fatalError() {
      tickers.delete(spinJob); tickers.delete(dustJob);
      audio.stopLoop('introCrystalSpin');
      await playFor('introCrystalDestroyed');
      setCostume(crystal, 'crystal', CRYSTAL_COSTUMES, 4);   // cracks
      sfx('introHurt'); await wait(1);
      setCostume(crystal, 'crystal', CRYSTAL_COSTUMES, 3);   // the four cool aspects show their colours
      sfx('introHurt'); await wait(1);
      // ...and break away
      setCostume(crystal, 'crystal', CRYSTAL_COSTUMES, 'core');
      eject(COOL_SHARDS, { keep: 'power' });
      sfx('introHurt'); await wait(1);
      setCostume(crystal, 'crystal', CRYSTAL_COSTUMES, 7);   // the four that held fast turn warm
      sfx('introHurt'); await wait(1);
      // capture: Delta flies to the pink Crystal of Power on his own
      const power = [...shards].find(sh => sh.key === 'power');
      chasing = power;
      await new Promise((res, rej) => {
        const job = () => {
          const d = deltaWorld();
          if (Math.hypot(power.x - d.x, power.y - d.y) <= SHARD_R + DELTA_R) { tickers.delete(job); res(); }
        };
        tickers.add(job);
        timers.push({ target: Infinity, res: () => {}, rej });   // so a skip still unwinds this script
      });
      chasing = null;
      removeShard(power);
      setCostume(delta, 'delta', DELTA_COSTUMES, 3);
      sfx('introCapture');
      await wait(CAPTURE_HOLD);
      delta.visible = false;
      // the warm four shatter apart
      crystal.visible = false;
      eject(WARM_SHARDS);
      sfx('introHurt');
      const t0 = clock;
      while (shards.size && clock - t0 < SHATTER_MAX) await wait(0.1);
      await playFor('introHurt');
      fadeOutAll(END_FADE);   // the capture jingle outlasts the shortened hold
      await wait(Math.max(0.5, END_FADE));
      finish();
    }

    // --- running it -------------------------------------------------------
    let frameDt = 0;      // this frame's seconds
    const step = () => {
      const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
      if (input.backPressed()) { input.endFrame(); finish(); return; }
      if (!running) {
        gate.alpha = (Math.floor(performance.now() / 500) % 2) ? 0.35 : 1;
        if (input.pressedOrder().length || input.tapped()) { running = true; gate.visible = false; audio.unlock(); }
        input.endFrame();
        return;
      }
      clock += dt;
      frameDt = dt;
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
      audio.stopLoop('introCrystalSpin');
      playing.forEach(src => { try { src.stop(); } catch (e) {} });
      root.destroy({ children: true });
      resolve();
    }

    // The browser only lets sound start after a key/tap on the page; until
    // then, wait for one so the cutscene's sounds aren't lost.
    audio.unlock();
    setTimeout(() => {
      if (finished) return;
      if (audio.state() === 'running') running = true;
      else gate.visible = true;
    }, 150);
    app.ticker.add(step);
    crystalScript().catch(e => { if (!(e instanceof Skip)) console.error(e); });
    deltaScript().catch(e => { if (!(e instanceof Skip)) console.error(e); });
  });
}
