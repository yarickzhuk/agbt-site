// kangaroo.js — CYBER ZOO phase-5 boss: K.A.N.G, a Punch-Out-style reflex duel.
// The player stands still and watches. Each round the kangaroo stares you down
// (wait), then flashes a "tell". Press fire in the window after the tell
// to land a hit; miss it and the kangaroo attacks — a full-screen "Bang!" that
// costs 1 HP. Press *before* the tell and you foul (a free warning that just
// resets the round). Land HITS_TO_WIN good hits to knock it out (defeat).
//
// It's not a Hittable — you don't shoot it, you time it — so it reads the fire
// edge itself (the frozen player doesn't consume input, and the main loop clears
// edges only after world.update, so the press is fresh here).
//
// The head art is the author's own hand-drawn Scratch costumes (wait/tell/defeat
// PNGs under assets/sprites/kangaroo/, exported from the original .sprite3),
// not a shape-JSON vector build like the rest of the game's art — used as-authored,
// filled colour and all, rather than reduced to the usual stroke-only outline look.
//
// **Redrawn with the author's own "Kangunroo" design** — uploaded directly as
// `Kangunroo.sprite3` ("This is Kangunroo's design as a boss of Cyberzoo
// (same attack patterns, only visual changes)"), confirming this boss's own
// underlying character name has been "Kangunroo" all along (`kangWait`/
// `kangFoul`/`kangHit`'s own `audio.js` filenames — `Kangunroo_wait.wav`
// etc. — already said as much; `kangunroodelta.js`'s own "Kangunroo Delta"
// is this same character's buffed Boss Rush form); "K.A.N.G" stays the HUD's
// own display name, untouched, since nothing asked for that to change. The
// sound trio needed no changes at all — the uploaded `.wav`s hashed
// byte-identical to the `Kangunroo_wait`/`_foul`/`_hit` files already wired
// into `audio.js`.
//
// `wait`/`tell` come straight from the sprite bundle's own "Hit"/"Hit2"
// costumes — confirmed as the right pair by their own near-identical Scratch
// `rotationCenter` fractions, the same way the old wait/tell pair shared one.
// **`defeat`'s own "DED" costume was wrong at first, though** — the bundle's
// `DED` costume turned out to be the exact same old headshot-only KO pose
// already used everywhere (byte-identical to the pre-existing `defeat.png`
// *and* to `kangunroodelta.js`'s own `ded.png`), not a real redesign;
// reported directly ("You took wrong DED sprite, use one I gave you") and
// replaced with a separately-uploaded `DED.svg` — a full standing body (legs,
// feet, the same flying-ears/X-eyes/tongue tell), not just a floating head.
// Its anchor (`[0.537, 0.334]`) is the new art's own eye-centre fraction
// (measured directly by colour-matching the X-eye strokes' pixel bounding
// box, since this standalone upload carries no Scratch `rotationCenter` of
// its own) rather than copied from `wait`/`tell`'s anchors — keeping the
// *face* anchored at the same screen spot the idle head always sat at is
// what makes the now-fully-drawn body read as standing in place where the
// character always stood, instead of needing a separate "ground level"
// calculated by hand.
//
// **Also fixed in the same pass: the idle bob read as floating, not
// standing** — per direct request ("He should stand still on the ground and
// not hover"). `idle()`'s own vertical `Math.sin(this.bob * 3) * 4` offset
// (a continuous up/down drift during `wait`/`recover`) is gone; see that
// method's own comment below.
//
// Rasterized at the same 4x (design-unit → texture-px) convention this file
// already uses for `wait`/`tell` (`cairosvg`'s own `scale=4.0`), so only the
// art (`assets/sprites/kangaroo/wait.png`/`tell.png`/`defeat.png`,
// overwritten in place) and `COSTUMES`' own anchor fractions changed — the
// duel mechanic itself is bit-for-bit unaffected, matching the request's own
// "same attack patterns."
import { input } from './input.js';
import { toScreen, SCREEN_W, SCREEN_H, rand } from './core.js';

// PNGs were rasterized from the source SVGs at 4x (design-unit -> texture-px).
const TEXTURE_PX_PER_UNIT = 4;

// Anchor fractions come from each Scratch costume's own rotationCenter (sprite.json),
// i.e. where the art is "held" as it's positioned/scaled/rotated. wait/tell are
// centred on the face; defeat's is offset toward the face since the hat/ears fly
// off to the upper-left while the face itself stays anchored in place.
//
// **Each costume now carries its own `scale`, not one shared constant** —
// reported directly ("Position him right pls"): the old single `DISPLAY_SCALE`
// (tuned against wait/tell's own head-only art) blew the new full-body
// `defeat` costume (1514x1982, a much taller texture than a head-only
// costume) up to 941px tall rendered into a 700px canvas, clipping both the
// ears off the top *and* the feet off the bottom — confirmed directly via
// `getBounds()` (y: -111 to 830, both well outside [0, 700]); `wait`/`tell`
// were quietly clipped the same way at the top (y: -143), just less
// noticeably since nothing below their own face-and-shoulders art was ever
// missing. `HEAD_SCALE` (~0.21) targets roughly the same on-screen head
// height the original pre-redesign art had (~320px tall); `DEFEAT_SCALE`
// (~0.246) is sized specifically for the new full-body art so the whole
// standing figure — hat/ears included — fits inside the canvas with room
// to spare, landing the feet below the new `arena_bg.png`'s own floor-wall
// junction line (~y=417 of 700) the way a standing figure should, since
// defeat keeps the exact same face anchor `wait`/`tell` use (so the head
// doesn't jump position when the fight ends) and just lets the now-visible
// legs/feet fall wherever that implies at the corrected scale.
const HEAD_SCALE = 0.21;
const DEFEAT_SCALE = 0.246;
const COSTUMES = {
  wait:   { url: 'assets/sprites/kangaroo/wait.png',   anchor: [0.4663, 0.4709], scale: HEAD_SCALE },
  tell:   { url: 'assets/sprites/kangaroo/tell.png',   anchor: [0.4659, 0.4707], scale: HEAD_SCALE },
  defeat: { url: 'assets/sprites/kangaroo/defeat.png', anchor: [0.537, 0.334],   scale: DEFEAT_SCALE },
};

// **Generalized for kangunroodelta.js's own "final stand" duel** — opts.
// hitsToWin/onWin/onLose are all optional and default to exactly the
// original behaviour (5 hits, defeat flag flips with no callback, a Bang
// costs 1 HP and the same duel just continues) so the CYBER ZOO fight
// below is bit-for-bit unaffected when none are passed. Kangunroo Delta's
// own "higher stakes" rule (a single miss ends the duel as an outright
// loss, instead of costing 1 HP and continuing) lives entirely behind
// onLose being set — see that file's own header for why.
const HITS_TO_WIN = 5;
const WAIT_MIN = 0.7, WAIT_MAX = 1.6;   // random stare-down before the tell
const WINDOW = 0.35;                    // forgiving reaction window after the tell
// Recovery beat between rounds, before the next kangWait taunt plays. Long
// enough to let the round's own jingle (kangHit ~1.5s, kangBang/lose ~2.3s)
// finish first — otherwise the next taunt cuts in over its tail.
const HIT_RECOVER = 1.5;
const BANG_RECOVER = 2.2;
const BOSS_Y = -2.1;

// NORMAL leaves the hand-drawn art's own colours alone (PIXI tint multiplies,
// so anything but white would wash out its actual palette); DIM/RED are
// state flashes (hit recoil / defeat / foul) and are fine to tint over it.
const NORMAL = 0xffffff, DIM = 0x1f4a7a, RED = 0xff5555;

export class Kangaroo {
  constructor(world, hud, opts = {}) {
    this.world = world; this.hud = hud;
    this.opts = opts;
    this.hitsToWin = opts.hitsToWin || HITS_TO_WIN;
    this.alive = true; this.defeated = false; this.lost = false;
    this.hits = 0;
    this.t = 0; this.wait = 0;
    this.foulT = 0; this.flashA = 0;

    // Arena backdrop: a hand-drawn corridor, present only for this fight —
    // appears the moment the boss does and is torn down with it (destroy()),
    // never touching any other phase/level's look.
    this.bg = PIXI.Sprite.from('assets/sprites/kangaroo/arena_bg.png');
    this.bg.zIndex = -1;
    this.bg.position.set((SCREEN_W - 900) / 2, 0);   // centred on a widened screen
    world.stage.addChild(this.bg);

    this.container = new PIXI.Container();
    this.container.zIndex = 8;
    const [sx, sy] = toScreen(0, BOSS_Y);
    this.baseX = sx; this.baseY = sy;

    // All three costumes live as children the whole time; only the current
    // one is visible, so switching state is just a visibility flip (no
    // texture pop-in mid-round).
    this.sprites = {};
    // opts.urls swaps in another texture per costume (same anchors/scales):
    // Kangunroo Delta's duel uses pink-outlined copies of this same art.
    for (const [name, c] of Object.entries(COSTUMES)) {
      const spr = PIXI.Sprite.from((opts.urls && opts.urls[name]) || c.url);
      spr.anchor.set(c.anchor[0], c.anchor[1]);
      spr.visible = false;
      this.container.addChild(spr);
      this.sprites[name] = spr;
    }
    world.stage.addChild(this.container);

    // Magenta "tell" ring behind the head — the cue to strike.
    this.ring = new PIXI.Graphics();
    this.ring.zIndex = 7; this.ring.alpha = 0;
    this.ring.position.set(sx, sy);
    world.stage.addChild(this.ring);

    // "SHOOT!" pops up with the tell, per direct request ("not all players
    // won't get what to do. So make so when it's time to shot there will be
    // poping up text like 'shoot!'"). Between the head and the ship.
    this.shoot = new PIXI.Text('SHOOT!', { fontFamily: 'Tektur, monospace', fontSize: 64, fill: 0xffe400, letterSpacing: 6 });
    this.shoot.anchor.set(0.5);
    this.shoot.position.set(SCREEN_W / 2, sy + 245);
    this.shoot.zIndex = 8; this.shoot.visible = false;
    world.stage.addChild(this.shoot);

    // Full-screen Bang! flash.
    this.flash = new PIXI.Graphics();
    this.flash.beginFill(0xff00d4).drawRect(0, 0, SCREEN_W, SCREEN_H).endFill();
    this.flash.alpha = 0; this.flash.zIndex = 200;
    world.stage.addChild(this.flash);

    this.setState('wait');
    this.updateHud();
  }

  updateHud() { this.hud.setPhaseText('PHASE 5  ' + (this.hitsToWin - this.hits)); }

  tint(c) { for (const spr of Object.values(this.sprites)) spr.tint = c; }

  // wait/hit/bang/recover all share the stare-down face; only the tell and
  // the knockout have their own drawn costume.
  setCostume(name) {
    for (const [n, spr] of Object.entries(this.sprites)) spr.visible = (n === name);
  }

  setState(s) {
    this.state = s; this.t = 0;
    const costume = s === 'tell' ? 'tell' : s === 'defeat' ? 'defeat' : 'wait';
    this.container.scale.set(COSTUMES[costume].scale);
    this.container.position.set(this.baseX, this.baseY);
    this.container.rotation = 0;
    this.ring.alpha = 0;
    // ...except on HARD ("...exept in hard mode"): there you read the tell alone.
    this.shoot.visible = s === 'tell' && !(this.world.difficulty && this.world.difficulty.id === 'arcade');
    this.setCostume(costume);
    if (s === 'wait') { this.wait = rand(WAIT_MIN, WAIT_MAX); this.tint(NORMAL); this.world.audio.play('kangWait', 0.5); }
  }

  place(dy = 0) { this.container.position.set(this.baseX, this.baseY + dy); }

  // Per direct request ("He should stand still on the ground and not
  // hover"): idle no longer bobs up/down (the old `Math.sin(this.bob * 3)
  // * 4` vertical offset read as floating in place, not standing) -- it
  // just holds position, same `place()` call every other state already
  // uses for its own fixed/animated offset.
  idle() {
    this.tint(this.foulT > 0 ? RED : NORMAL);
    this.place(0);
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    if (this.foulT > 0) this.foulT -= dt;
    if (this.flashA > 0) { this.flashA -= dt * 5; this.flash.alpha = Math.max(0, this.flashA); }

    const fire = input.wasPressed('fire');

    switch (this.state) {
      case 'wait':
        this.idle();
        if (fire) { this.foul(); break; }
        if (this.t >= this.wait) this.setState('tell');
        break;

      case 'tell':
        this.container.scale.set(COSTUMES.tell.scale * 1.25);
        this.tint(NORMAL);
        this.ring.clear();
        this.ring.lineStyle({ width: 6, color: 0xff00d4, alpha: 1 });
        this.ring.drawCircle(0, 0, 150 + 30 * Math.sin(this.t * 40));
        this.ring.alpha = 1;
        this.shoot.scale.set(1 + 0.6 * Math.max(0, 1 - this.t / 0.08));   // pop in
        if (fire) { this.land(); break; }
        if (this.t >= WINDOW) this.bang();
        break;

      case 'hit':
        this.tint(DIM);
        this.place(-46 * Math.max(0, 1 - this.t / 0.3));   // recoil up
        if (this.t >= 0.45) { this.recoverT = HIT_RECOVER; this.setState('recover'); }
        break;

      case 'bang':
        this.tint(NORMAL);
        this.place(34 * Math.max(0, 1 - this.t / 0.25));    // lunge down at the player
        if (this.t >= 0.45) {
          // Kangunroo Delta's own "higher stakes" rule: a single miss ends
          // the whole duel right here instead of just costing HP and
          // looping back to 'wait' -- see this.bang()'s own branch below.
          if (this.lost) { this.destroy(); if (this.opts.onLose) this.opts.onLose(this); break; }
          this.recoverT = BANG_RECOVER; this.setState('recover');
        }
        break;

      case 'recover':
        this.idle();
        if (this.t >= this.recoverT) this.setState('wait');
        break;

      case 'defeat':
        this.ring.alpha = 0;
        this.tint(DIM);
        if (this.t >= 1.0) {
          this.defeated = true;
          this.destroy();
          if (this.opts.onWin) this.opts.onWin(this);
        }
        break;
    }
  }

  foul() {
    this.foulT = 0.35;
    this.wait = rand(WAIT_MIN, WAIT_MAX);
    this.t = 0;
    this.world.audio.play('kangFoul', 0.55);
  }

  land() {
    this.hits++;
    this.updateHud();
    this.world.audio.play('kangHit', 0.6);
    if (this.hits >= this.hitsToWin) {
      this.world.audio.play('bossDefeat', 0.9);   // same "boss destroyed" cue TrapWheel uses
      this.setState('defeat');
      this.hud.setPhaseText('');
    } else this.setState('hit');
  }

  bang() {
    this.flashA = 0.9;
    this.world.audio.play('kangBang', 0.6);
    // Default (no onLose): the original CYBER ZOO rule -- costs 1 HP, the
    // same duel just continues. Kangunroo Delta's own onLose instead ends
    // the duel here outright (see the 'bang' state's own branch above) --
    // it deals its own 2 HP penalty itself, so this doesn't also spend the
    // ordinary 1 HP on top of it.
    if (this.opts.onLose) { this.lost = true; }
    else {
      const p = this.world.player;
      if (p) p.takeDamage(1);
    }
    this.setState('bang');
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() { return { shapes: [], label: 'MISSED THE DUEL WINDOW' }; }
  destroy() {
    this.alive = false;
    if (this.bg && !this.bg.destroyed) this.bg.destroy();
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
    if (this.ring && !this.ring.destroyed) this.ring.destroy();
    if (this.shoot && !this.shoot.destroyed) this.shoot.destroy();
    if (this.flash && !this.flash.destroyed) this.flash.destroy();
  }
}
