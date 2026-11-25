// player.js — movement, look direction, charge/fire, HP. No physics.
import { captureDeath } from './deathreveal.js';
import { buildSprite } from './retro.js';
import { getCostumeId, makeSkinSprite, setSkinFrame, shipKey, SkinGhost, skinSound } from './costumes.js';
import { input } from './input.js';
import { toScreen, HALF_W, HALF_H, clamp, blockedByWalls, PURPLE, PINK_DAMAGE } from './core.js';
import { Bullet } from './bullet.js';
import { BouncyBall } from './bouncyball.js';
import { BombShield, SHIELD_CHARGE, drawChargePreview } from './bombshield.js';
import { swingSlash, spawnDashGhost, dashHit, DASH_SPEED, DASH_TIME, DASH_GHOST_INTERVAL } from './lineslasher.js';
import { recordHit } from './progress.js';
const DASH_TICK = 1 / 60;   // dash damage tick ("1 damage per frame" at 60 fps)
import { reviveAtCheckpoint } from './checkpoint.js';
import { hullAt, HULL_STROKE, pointPolyDist, segPolyDist, polyPolyDist } from './shiphull.js';

const SPEED = 7;            // world units / s
const MOBILE_SPEED_SCALE = 0.7;   // touch joystick gives coarser control than a keyboard
// THE OG's downside for its heal-orb magnet (heal.js): always 75% speed, so
// slower than stock but well above the Cyber Shotgun's 50%; stacks like it.
const OG_SPEED_SCALE = 0.75;
// FIREWORK: a full-charge release also bursts FIREWORK_PELLETS shotgun
// pellets in a ring around the ship; its downside, +1 damage from purple.
const FIREWORK_PELLETS = 6, FIREWORK_PELLET_SPEED = 20;
const FIREWORK_SPEED_SCALE = 1.2;   // FIREWORK also moves faster, to pay for the purple weakness
// DEVIL FISH: FISH_STREAK shots in a row that hit earn a free charge -- the
// next release fires fully charged however briefly it was held. Its
// downside, one fewer life, is costumes.js's livesCap.
const FISH_STREAK = 3;
// DRAGON: holding fire keeps firing its tap attack every DRAGON_AUTO_GAP
// (about a fast tap rate, not faster) while the charge still builds, and the
// charge fills DRAGON_CHARGE_RATE times as fast. Downside: 1 less max HP.
const DRAGON_AUTO_GAP = 0.2, DRAGON_CHARGE_RATE = 1.4;
const CHARGE_TO_FULL = 0.85;
// The Charge Cannon's own buff: hold this much longer *past* CHARGE_TO_FULL
// for a supercharged shot (bullet.js's Hadouken tier, 10 damage -- "like a
// point-blank Cyber Shotgun") instead of the ordinary charged torpedo.
// Only the Charge Cannon reads this -- Bouncy Ball/Line Slasher's own charge
// still caps at the plain full-charge tier, same as before this existed.
const SUPER_HOLD_TIME = 0.9;
// How long fire must be held before the charge-up sounds (chargeStart's
// stinger, chargeHold's loop) actually start -- see the charging block in
// update() for why.
const RELOAD_SOUND_DELAY = 0.12;   // seconds after the shotgun blast
const CHARGE_SOUND_DELAY = 0.15;

// Mobile aim assist: a touch joystick can't aim as precisely as 8-way
// keyboard input, so on mobile a shot fired close enough to (and roughly
// facing) a killable target snaps onto it instead of going out exactly
// along `facing`. Desktop is untouched — `assistedDir` is a no-op there.
const AIM_ASSIST_RANGE = 4.5;                 // world units — "close enough" to lock onto
const AIM_ASSIST_CONE = 30 * Math.PI / 180;   // half-angle tolerance around facing

// buildSprite groups a shape's layers by colour into one PIXI.Graphics per
// colour -- a `tint`-overridden build (every layer forced to one colour, as
// the charge-glow copies below are) collapses to a single child, but this
// still walks all of them rather than assuming that shape.
function additiveGlow(container) {
  container.children.forEach(c => { c.blendMode = PIXI.BLEND_MODES.ADD; });
  return container;
}

export class Player {
  constructor(world, x, y) {
    this.world = world;
    this.x = x; this.y = y;
    this.facing = { x: 1, y: 0 };
    this.isMoving = false;
    this.charging = false;
    this.chargeHeld = 0;

    this.maxHP = world.difficulty ? world.difficulty.startHP : 3;
    this.hp = this.maxHP;
    // The hitbox is the ship's own triangle (hull(), shiphull.js) -- every
    // hazard tests that. This circle is only what walls, the tutorial fence
    // and a few spawn-clearance checks keep the ship's centre away from
    // (a turning triangle would wedge itself into a wall). The LINE SLASHER
    // dash's own damage area is separate (DASH_HIT_R).
    this.hitRadius = 0.22;
    this.invulnTime = 1.0;
    this.invulnUntil = -1;
    this.time = 0;
    this.dead = false;
    this.shotgunCooldown = 0;   // burst weapon: can't be tap-spammed like a minigun
    this.dashing = false;       // LINE SLASHER's charged release — see updateDash()
    this.dashTime = 0;
    this.dashGhostT = 0;
    this.dashDir = { x: 1, y: 0 };

    this.normalArt = buildSprite('PlayerNormal', { lineWidth: 2 });
    this.moveArt = buildSprite('PlayerMove', { lineWidth: 2 });
    this.moveArt.visible = false;
    // Charge status, shown as the ship's own brightness (render()'s
    // chargeGlowAlpha) -- a second white copy of each triangle, additively
    // blended on top. Tint alone can't do this: PIXI's tint multiplies, so
    // it can only ever darken/rescale this shape's own saturated `hull`
    // yellow, never brighten it -- the identical problem plasmadrache.js's
    // own white/pink chomp flash already solved with additive blending
    // instead of a plain tint (see that file's own comment on why).
    this.normalGlow = additiveGlow(buildSprite('PlayerNormal', { lineWidth: 2, tint: 0xffffff }));
    this.moveGlow = additiveGlow(buildSprite('PlayerMove', { lineWidth: 2, tint: 0xffffff }));
    this.normalGlow.alpha = 0;
    this.moveGlow.alpha = 0;
    this.moveGlow.visible = false;
    this.container = new PIXI.Container();
    this.container.addChild(this.normalArt, this.moveArt, this.normalGlow, this.moveGlow);
    // COSTUMES: a reskin swaps all four stock triangles for one
    // raster sprite (+ its own additive glow copy), its costume picked each
    // frame by costumes.js's shipKey — see that file for each skin's rules.
    this.skin = getCostumeId();
    if (this.skin === 'dragon') { this.maxHP = Math.max(1, this.maxHP - 1); this.hp = this.maxHP; }
    this.skinGhostT = 0;
    if (this.skin !== 'default') {
      this.normalArt.visible = this.moveArt.visible = false;
      this.normalGlow.visible = this.moveGlow.visible = false;
      const key = shipKey(this.skin, {});
      this.skinArt = makeSkinSprite(this.skin, key);
      this.skinGlow = makeSkinSprite(this.skin, key);
      this.skinGlow.blendMode = PIXI.BLEND_MODES.ADD;
      this.skinGlow.alpha = 0;
      this.container.addChild(this.skinArt, this.skinGlow);
    }
    // CYBER SHOTGUN's BOMB SHIELD charge (bombshield.js): the spheres
    // gathering round the ship while fire is held.
    this.shieldPreview = new PIXI.Graphics();
    this.container.addChild(this.shieldPreview);
    this.container.zIndex = 10;
    world.stage.addChild(this.container);
  }

  get invulnerable() { return this.time < this.invulnUntil; }

  update(dt) {
    if (this.dead) return;
    this.time += dt;
    if (this.frozen) { this.render(); return; }
    if (this.dashing) {
      this.updateDash(dt);
      // You can slash mid-dash — a fresh fire press swings immediately,
      // without touching the dash's own movement/timer, so dash-in,
      // slash, dash-out reads as one continuous motion rather than
      // forcing a stop to attack. Dash itself never damages anything
      // (see lineslasher.js) — landing a kill mid-dash always goes
      // through an actual SLASH.
      if (input.wasPressed('fire')) { this.world.usedNormalAttack = true; this.slashShot(); }
      this.render();
      return;
    }
    const a = input.axis();
    let ix = a.x, iy = a.y;
    this.isMoving = ix !== 0 || iy !== 0;

    if (this.isMoving) {
      const len = Math.hypot(ix, iy);
      ix /= len; iy /= len;
      const spd = SPEED * (this.world.isMobile ? MOBILE_SPEED_SCALE : 1) * (this.world.weapon ? this.world.weapon.moveScale : 1)
        * (this.skin === 'og' ? OG_SPEED_SCALE : this.skin === 'firework' ? FIREWORK_SPEED_SCALE : 1);
      const nx = clamp(this.x + ix * spd * dt, -HALF_W + 0.3, HALF_W - 0.3);
      const ny = clamp(this.y + iy * spd * dt, -HALF_H + 0.3, HALF_H - 0.3);
      // Resolved per axis (not both at once) so a maze wall (wall.js) slides
      // the player along it instead of just freezing on any contact. A wall
      // the player is already standing in (a dash that stopped inside a
      // pierceable one, or a wall that appeared on top of them) is ignored,
      // so they can always walk back out instead of being stuck solid.
      const inside = this.wallsOverlapping();
      const skip = inside.length ? (w => inside.includes(w)) : undefined;
      if (!blockedByWalls(this.world, nx, this.y, this.hitRadius, skip)) this.x = nx;
      if (!blockedByWalls(this.world, this.x, ny, this.hitRadius, skip)) this.y = ny;
      if (!input.isDown('lock')) this.facing = { x: ix, y: iy };
    }

    const wpn = this.world.weapon;
    if (wpn && wpn.spread) {
      // Cyber Shotgun: a piercing spread on tap — gated by a cooldown so
      // it's a burst tool, not a tap-spammable minigun. Holding fire on
      // past that charges the BOMB SHIELD (bombshield.js), raised on
      // release once SHIELD_CHARGE is reached, if none is out already.
      if (this.shotgunCooldown > 0) this.shotgunCooldown -= dt;
      if (input.wasPressed('fire')) {
        if (this.shotgunCooldown <= 0) {
          this.fireShotgun(wpn.spread);
          this.shotgunCooldown = wpn.spread.cooldown;
          // The reload rack, just after the blast so the two don't mash
          // together; it finishes about when the next volley is ready.
          const a = this.world.audio;
          a.play(skinSound(this.world, 'shotgunReload'), 0.9, a.now ? a.now() + RELOAD_SOUND_DELAY : 0);
        }
        this.charging = true; this.chargeHeld = 0; this.chargeSoundStarted = false;
      }
      // DRAGON's rapid fire: held fire keeps loosing volleys as the cooldown allows.
      if (this.skin === 'dragon' && this.charging && input.isDown('fire') && !input.wasPressed('fire')
          && this.shotgunCooldown <= 0) {
        this.fireShotgun(wpn.spread);
        this.shotgunCooldown = wpn.spread.cooldown;
        const a = this.world.audio;
        a.play(skinSound(this.world, 'shotgunReload'), 0.9, a.now ? a.now() + RELOAD_SOUND_DELAY : 0);
      }
      if (this.charging && input.isDown('fire')) {
        this.chargeHeld += dt * (this.skin === 'dragon' ? DRAGON_CHARGE_RATE : 1);
        if (!this.chargeSoundStarted && this.chargeHeld >= CHARGE_SOUND_DELAY) {
          this.chargeSoundStarted = true;
          this.world.audio.play(skinSound(this.world, 'chargeStart'), 0.6);
          this.world.audio.loop(skinSound(this.world, 'chargeHold'), 0.35);
        }
      }
      if (this.charging && input.wasReleased('fire')) {
        this.charging = false;
        this.world.audio.stopLoop('chargeHold');
        const ratio = this.releaseRatio(!this.world.playerShield);
        if (ratio >= 1) this.fireworkBurst();
        if (ratio >= 1 && !this.world.playerShield) {
          this.world.add(new BombShield(this.world, this));
          this.world.audio.play(skinSound(this.world, 'chargeFull'), 0.6);
        }
        this.chargeHeld = 0;
      }
    } else {
      if (input.wasPressed('fire')) {
        this.charging = true; this.chargeHeld = 0; this.chargeSoundStarted = false;
        this.autoT = DRAGON_AUTO_GAP;
      }
      // DRAGON's rapid fire: while fire is held, the tap attack repeats.
      if (this.skin === 'dragon' && this.charging && input.isDown('fire')) {
        this.autoT -= dt;
        if (this.autoT <= 0) { this.autoT += DRAGON_AUTO_GAP; this.tapAttack(wpn); }
      }
      if (this.charging && input.isDown('fire')) {
        this.chargeHeld += dt * (this.skin === 'dragon' ? DRAGON_CHARGE_RATE : 1);
        // A short delay before chargeStart/chargeHold actually start --
        // without it, every quick tap-fire (an uncharged bullet, released
        // almost immediately) still triggered the charge-up stinger and
        // briefly kicked the hold loop in and back out, oversounding a
        // plain tap. A sustained hold clears this before anyone would
        // notice the delay; a tap never reaches it.
        if (!this.chargeSoundStarted && this.chargeHeld >= CHARGE_SOUND_DELAY) {
          this.chargeSoundStarted = true;
          this.world.audio.play(skinSound(this.world, 'chargeStart'), 0.6);
          this.world.audio.loop(skinSound(this.world, 'chargeHold'), 0.35);
        }
      }
      if (this.charging && input.wasReleased('fire')) {
        this.charging = false;
        this.world.audio.stopLoop('chargeHold');   // no-op if never started
        const superCharged = this.isChargeCannon() && this.superRatio() >= 1;
        const ratio = this.releaseRatio(true);
        if (ratio >= 1) this.fireworkBurst();
        if (wpn && wpn.bouncy) this.fireBouncy(ratio);
        else if (wpn && wpn.melee) this.fireMelee(ratio);
        else this.fire(ratio, superCharged);
        this.chargeHeld = 0;
      }
    }

    this.render();
  }

  // The charge a release fires with: DEVIL FISH's banked free charge turns
  // a short hold into a full one (spent only when it's used: `canUse`).
  releaseRatio(canUse) {
    const r = this.chargeRatio();
    if (r < 1 && canUse && this.freeCharge) { this.freeCharge = false; return 1; }
    return r;
  }

  // DEVIL FISH's streak: a shot token every projectile of one shot carries
  // (bullet.js/bouncyball.js); core.js's playerHit marks it hit, and when the
  // last projectile is gone the shot counts as a hit or a miss.
  newShot(n) {
    if (this.skin !== 'devilfish') return null;
    const p = this;
    return { pending: n, hit: false, end() { if (--this.pending === 0) p.shotResolved(this.hit); } };
  }
  shotResolved(hit) {
    if (!hit) { this.hitStreak = 0; return; }
    this.hitStreak = (this.hitStreak || 0) + 1;
    if (this.hitStreak < FISH_STREAK) return;
    this.hitStreak = 0;
    if (!this.freeCharge && !this.dead) {
      this.freeCharge = true;
      this.world.audio.play(skinSound(this.world, 'chargeStart'), 0.6);
    }
  }
  slashShot() {
    const shot = this.newShot(1);
    this.world._shot = shot;
    try { swingSlash(this.world, this); } finally { this.world._shot = null; }
    if (shot) shot.end();
  }

  chargeRatio() {
    const wpn = this.world.weapon;
    return Math.min(1, this.chargeHeld / (wpn && wpn.spread ? SHIELD_CHARGE : CHARGE_TO_FULL));
  }

  // 0 until the ordinary full charge is reached, then climbs 0..1 across
  // SUPER_HOLD_TIME of additional hold -- the Charge Cannon's own
  // supercharge buff. Only meaningful for that weapon (see isChargeCannon).
  superRatio() {
    if (this.chargeHeld <= CHARGE_TO_FULL) return 0;
    return Math.min(1, (this.chargeHeld - CHARGE_TO_FULL) / SUPER_HOLD_TIME);
  }

  // The supercharge buff, its chargeFull release cue, and the glow's own
  // brightest tier are all Charge Cannon-only -- Bouncy Ball/Line Slasher
  // charge the same chargeHeld field (for their own DASH/speed-ramp), but
  // neither has a supercharged shot to reach.
  isChargeCannon() {
    const wpn = this.world.weapon;
    return !wpn || (!wpn.bouncy && !wpn.melee && !wpn.spread);
  }

  // Snaps `dir` onto the nearest killable Hittable within AIM_ASSIST_RANGE
  // and AIM_ASSIST_CONE of it, mobile only; returns `dir` unchanged otherwise
  // (desktop, or nothing eligible nearby).
  assistedDir(dir, charged) {
    if (!this.world.isMobile) return dir;
    const list = this.world.hittables;
    if (!list || !list.length) return dir;
    const baseAngle = Math.atan2(dir.y, dir.x);
    let best = null, bestDiff = AIM_ASSIST_CONE;
    for (const h of list) {
      if (!h || h.dead || !h.canBeDestroyedBy(charged)) continue;
      const dx = h.x - this.x, dy = h.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > AIM_ASSIST_RANGE || d < 0.001) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - baseAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) { bestDiff = diff; best = { x: dx / d, y: dy / d }; }
    }
    return best || dir;
  }

  fire(ratio, superCharged = false) {
    const charged = ratio >= 1;
    if (!charged) this.world.usedNormalAttack = true;   // "Energised" (achievements.js)
    const dir = this.assistedDir(this.facing, charged);
    // spawn just ahead of the nose
    const mx = this.x + dir.x * 0.4;
    const my = this.y + dir.y * 0.4;
    this.world.add(new Bullet(this.world, mx, my, dir, charged, { superCharged, shot: this.newShot(1) }));
    // chargeFull is the supercharged shot's own release cue -- not a
    // mid-hold "you reached it" announcer -- so it plays here, replacing
    // torpedo/shoot for this one shot, instead of firing on its own partway
    // through the hold.
    this.world.audio.play(superCharged ? skinSound(this.world, 'chargeFull') : this.shotSound(charged ? 'torpedo' : 'shoot'), 0.6);
  }

  // Bouncy Ball: charge-and-release like the standard gun's torpedo, but
  // launches a BouncyBall (bouncyball.js) instead of a Bullet/Torpedo — see
  // that file for why it never breaks on contact the way a normal shot does,
  // and why a charged one also bounces off screen edges. That extra range is
  // compensated here: never more than `maxHP` balls (charged or not) alive
  // on screen at once — a held charge that can't be released yet doesn't
  // count against the cap.
  fireBouncy(ratio) {
    const active = this.world.updatables.filter(e => e instanceof BouncyBall && e.alive).length;
    if (active >= this.maxHP) return;
    const charged = ratio >= 1;
    if (!charged) this.world.usedNormalAttack = true;
    const dir = this.assistedDir(this.facing, charged);
    const mx = this.x + dir.x * 0.4;
    const my = this.y + dir.y * 0.4;
    this.world.add(new BouncyBall(this.world, mx, my, dir, ratio, this.newShot(1)));
    this.world.audio.play(this.shotSound('bouncyShoot'), 0.6);
  }

  // Cyber Shotgun: a fan of small, fast pellets, each still `charged` enough
  // to one-shot a DarkBlue hazard like a torpedo would -- but nerfed
  // (bullet.js's `pellet: true`) to 2 damage instead of 3, and no longer
  // punches through Purple the way an actual torpedo does. The blast is the
  // firing sound, played once per volley. Faster pellets read as a sharp
  // burst rather than a lingering spray.
  fireShotgun({ pellets, arc, pelletSpeed }) {
    this.world.usedNormalAttack = true;   // the tap volley is the shotgun's normal attack
    const assisted = this.assistedDir(this.facing, true);   // aim-assist still targets DarkBlue kills
    const base = Math.atan2(assisted.y, assisted.x);
    this.world.audio.play(this.shotSound('shotgunFire'), 0.6);
    const shot = this.newShot(pellets);   // one volley = one shot for DEVIL FISH's streak
    for (let i = 0; i < pellets; i++) {
      const off = pellets === 1 ? 0 : (i - (pellets - 1) / 2) * (arc / (pellets - 1));
      const a = base + off;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const mx = this.x + dir.x * 0.4, my = this.y + dir.y * 0.4;
      this.world.add(new Bullet(this.world, mx, my, dir, true, { scale: 0.55, speed: pelletSpeed, pellet: true, shot }));
    }
  }

  // One uncharged attack of the weapon (DRAGON's rapid fire).
  tapAttack(wpn) {
    if (wpn && wpn.bouncy) this.fireBouncy(0);
    else if (wpn && wpn.melee) { this.world.usedNormalAttack = true; this.slashShot(); }
    else this.fire(0);
  }

  // FIREWORK's passive: a ring of shotgun pellets out from the ship, the
  // first along `facing`. Pellets as the Cyber Shotgun's: 2 damage, kill
  // dark blue, break on purple.
  fireworkBurst() {
    if (this.skin !== 'firework') return;
    const base = Math.atan2(this.facing.y, this.facing.x);
    for (let i = 0; i < FIREWORK_PELLETS; i++) {
      const a = base + i * (Math.PI * 2 / FIREWORK_PELLETS);
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      this.world.add(new Bullet(this.world, this.x + dir.x * 0.4, this.y + dir.y * 0.4, dir, true,
        { scale: 0.55, speed: FIREWORK_PELLET_SPEED, pellet: true }));
    }
    this.world.audio.play(skinSound(this.world, 'shotgunFire'), 0.5);
  }

  // LINE SLASHER: tap (ratio < 1) swings an instant melee SLASH; a full
  // charge released instead triggers a DASH. See lineslasher.js for both.
  fireMelee(ratio) {
    if (ratio >= 1) this.startDash();
    else { this.world.usedNormalAttack = true; this.slashShot(); }
  }

  startDash() {
    this.dashing = true;
    this.dashTime = 0;
    this.dashGhostT = 0;
    this.dashHitT = 1e-6;   // so the first 1/60s frame lands a tick despite rounding
    const len = Math.hypot(this.facing.x, this.facing.y) || 1;
    this.dashDir = { x: this.facing.x / len, y: this.facing.y / len };
    // Reuses the ordinary hit-invulnerability window/visual (render()'s own
    // alpha dip) rather than a second flag — a dash is meant to barrel
    // through hazards unscathed, same "intangible for a beat" read.
    this.invulnUntil = this.time + DASH_TIME;
    this.world.audio.play(skinSound(this.world, 'slasherDash'), 0.7);
  }

  // The hitbox: the drawn ship's outer triangle (PlayerNormal, or PlayerMove
  // while moving), turned the way the ship faces, in world units (shiphull.js). The touches* tests add half the
  // drawn stroke, so contact starts where the visible line starts.
  hull() { return hullAt(this.x, this.y, Math.atan2(this.facing.y, this.facing.x), this.isMoving); }
  touchesCircle(x, y, r) { return pointPolyDist(x, y, this.hull()) <= r + HULL_STROKE; }
  touchesSeg(x0, y0, x1, y1, r) { return segPolyDist(x0, y0, x1, y1, this.hull()) <= r + HULL_STROKE; }
  touchesPoly(poly) { return polyPolyDist(this.hull(), poly) <= HULL_STROKE; }
  touchesRect(x0, y0, x1, y1) { return this.touchesPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); }
  hullBounds() {
    const h = this.hull(), xs = h.map(q => q[0]), ys = h.map(q => q[1]);
    return { x0: Math.min(...xs) - HULL_STROKE, x1: Math.max(...xs) + HULL_STROKE,
             y0: Math.min(...ys) - HULL_STROKE, y1: Math.max(...ys) + HULL_STROKE };
  }

  // Walls the player's own circle currently overlaps (see update()).
  wallsOverlapping() {
    const walls = this.world.walls;
    if (!walls || !walls.length) return [];
    const r = this.hitRadius;
    return walls.filter(w => this.x + r > w.x0 && this.x - r < w.x1 && this.y + r > w.y0 && this.y - r < w.y1);
  }

  // Advances the dash movement directly (bypassing the normal axis-driven
  // movement in update()). Deals damage now: every 1/60s tick of the dash
  // (DASH_TICK, fixed so the burst doesn't depend on frame rate) hits
  // whatever the player overlaps for 1 (lineslasher.js's dashHit) — the
  // "1 damage per frame" burst asked for; a mid-dash SLASH still works too.
  // A real bug fixed here: this used to only clamp against the screen edges,
  // never checking blockedByWalls at all — a dash (unlike every other form
  // of player movement, see update()'s own per-axis wall check above) could
  // barrel straight through a solid wall.js maze wall. Caught building
  // Showman's Delta Maze (outerspacemaze.js), whose own violet walls are
  // explicitly meant to block "any mean (charged shot or dash won't work)" —
  // resolved per axis, same slide-along-the-wall shape update()'s own check
  // already uses, so a dash grazing a wall corner still carries through
  // along the open axis instead of just stopping dead.
  // Pierceable walls (Plasmadrache's, wall.js) don't stop a dash at all.
  updateDash(dt) {
    this.dashTime += dt;
    this.dashGhostT += dt;
    const nx = clamp(this.x + this.dashDir.x * DASH_SPEED * dt, -HALF_W + 0.3, HALF_W - 0.3);
    const ny = clamp(this.y + this.dashDir.y * DASH_SPEED * dt, -HALF_H + 0.3, HALF_H - 0.3);
    const skip = w => w.pierceable;
    if (!blockedByWalls(this.world, nx, this.y, this.hitRadius, skip)) this.x = nx;
    if (!blockedByWalls(this.world, this.x, ny, this.hitRadius, skip)) this.y = ny;
    this.dashHitT += dt;
    while (this.dashHitT >= DASH_TICK && !this.dead) {
      this.dashHitT -= DASH_TICK;
      dashHit(this.world, this);
    }
    if (this.dashGhostT >= DASH_GHOST_INTERVAL) {
      this.dashGhostT = 0;
      spawnDashGhost(this.world, this.x, this.y, this.facing);
    }
    if (this.dashTime >= DASH_TIME) this.dashing = false;
  }

  render() {
    if (this.skinArt) this.renderSkin(); else this.renderStock();
    this.updateShieldPreview();
  }

  // The CYBER SHOTGUN's BOMB SHIELD charge: the spheres gathering round the
  // ship while fire is held (bombshield.js's drawChargePreview). Nothing
  // once one is out — you can't raise a second.
  updateShieldPreview() {
    const wpn = this.world.weapon;
    const show = this.charging && wpn && wpn.spread && !this.world.playerShield
      && this.chargeHeld >= CHARGE_SOUND_DELAY;
    drawChargePreview(this.shieldPreview, this, show ? this.chargeRatio() : 0,
      this.container.rotation, this.container.scale.x);
  }

  renderStock() {
    this.normalArt.visible = !this.isMoving;
    this.moveArt.visible = this.isMoving;
    this.normalGlow.visible = !this.isMoving;
    this.moveGlow.visible = this.isMoving;
    this.container.rotation = Math.atan2(this.facing.y, this.facing.x);
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    const fullyCharged = this.chargeRatio() >= 1;
    const supercharged = fullyCharged && this.isChargeCannon() && this.superRatio() >= 1;
    this.container.scale.set(supercharged ? 1.3 : (fullyCharged ? 1.15 : 1));
    this.container.alpha = this.invulnerable ? 0.5 : 1;
    const glowAlpha = this.chargeGlowAlpha();
    this.normalGlow.alpha = glowAlpha;
    this.moveGlow.alpha = glowAlpha;
  }

  // A costume's own fire sound, from its Scratch sprites (per direct
  // request: "Dragon and Firework costumes are supposed to have custom shoot
  // sounds"). DRAGON's ship plays Plasmadrache_flame on every trigger
  // release; FIREWORK's bullet plays Dart_shot on a charged (torpedo) shot —
  // shotgun pellets use the torpedo art here, so the shotgun blast too. The
  // supercharge keeps its own Charge_full release cue.
  shotSound(stock) {
    if (this.skin === 'dragon') return 'skinDragonShot';
    if (this.skin === 'firework' && (stock === 'torpedo' || stock === 'shotgunFire')) return 'skinFireworkShot';
    return skinSound(this.world, stock);   // DELTA: reversed
  }

  // render() for a costume (COSTUMES): same rotation/position/
  // scale-pop/invuln/glow rules as the stock ship, just one sprite whose
  // costume follows the skin's own script.
  renderSkin() {
    const fullyCharged = this.chargeRatio() >= 1;
    const supercharged = fullyCharged && this.isChargeCannon() && this.superRatio() >= 1;
    const key = shipKey(this.skin, {
      moving: this.isMoving || this.dashing,
      charging: this.charging,
      chargeRatio: this.chargeRatio(),
      superReady: supercharged,
      fireHeld: input.isDown('fire'),
      weaponId: this.world.weapon ? this.world.weapon.id : 'default',
      time: this.time,
    });
    if (this.skinArt._skinKey !== key) {
      setSkinFrame(this.skinArt, this.skin, key);
      setSkinFrame(this.skinGlow, this.skin, key);
    }
    this.container.rotation = Math.atan2(this.facing.y, this.facing.x);
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    // The dragon's own charge costumes already show the charge, so it skips
    // the size pop every other ship uses (per direct request).
    const scale = this.skin === 'dragon' ? 1 : (supercharged ? 1.3 : (fullyCharged ? 1.15 : 1));
    this.container.scale.set(scale);
    this.container.alpha = this.invulnerable ? 0.5 : 1;
    this.skinGlow.alpha = this.chargeGlowAlpha();
    // Delta leaves afterimages while it moves (its source's own trail clones).
    if (this.skin === 'delta' && (this.isMoving || this.dashing) && !this.frozen && !this.dead) {
      if (this.time - this.skinGhostT >= 0.05) {
        this.skinGhostT = this.time;
        this.world.add(new SkinGhost(this.world, this.skin, key, this.x, this.y, this.container.rotation, scale));
      }
    }
  }

  // Charge status, shown as the ship's own brightness climbing as a charge
  // builds: 0 while not charging, ramping through the ordinary full-charge
  // threshold, then (Charge Cannon only) climbing further through the
  // supercharge hold on top of that, finally pulsing once it's ready --
  // "release now" read the same way the ship's own charged scale-pop above
  // already reads "fully charged".
  chargeGlowAlpha() {
    if (!this.charging) return this.freeCharge ? 0.45 + Math.sin(this.time * 8) * 0.2 : 0;   // DEVIL FISH's banked charge
    const ratio = this.chargeRatio();
    if (ratio < 1) return ratio * 0.6;
    if (!this.isChargeCannon()) return 0.6;
    const superT = this.superRatio();
    if (superT < 1) return 0.6 + superT * 0.4;
    return 0.85 + Math.sin(this.time * 10) * 0.15;
  }

  // `source` is whatever hurt the player; defaults to the updatable world
  // .update() is running right now. Remembered on a lethal hit as
  // world.killedBy (roast.js's TOXIC MODE picks its line from it).
  takeDamage(n, source = this.world._updating) {
    if (this.invulnerable || this.dead) return;
    // An orbiting BOMB SHIELD takes the hit instead, using up a sphere.
    if (this.world.playerShield && this.world.playerShield.blockHit()) return;
    // FIREWORK is fragile to purple: +1 from a purple hazard (pink, already
    // PINK_DAMAGE, stays as it is).
    if (this.skin === 'firework' && source && (source.color === PURPLE || source.purpleTouch) && n < PINK_DAMAGE) n += 1;
    this.hp -= n;
    if (this.hp <= 0) this.world.killedBy = source || null;
    this.invulnUntil = this.time + this.invulnTime;
    this.world.audio.play('hurt');
    // A level that's set world.checkpoint (currently only OUTER SPACE, via
    // checkpoint.js's own activateCheckpoint) gets a revive here instead of
    // an ordinary death -- this has to happen inside takeDamage() itself,
    // not by reacting to `this.dead` later, since main.js's own per-frame
    // ticker checks `world.player.dead` and fires Game Over the instant
    // it's true, before the level's own async code would ever get a
    // chance to react. Not counted as a lethal hit (recordHit's own
    // `lethal` flag) -- the run didn't actually end.
    if (this.hp <= 0 && this.world.checkpoint) {
      recordHit(this.world.currentLevelId, false);
      reviveAtCheckpoint(this.world);
      return;
    }
    recordHit(this.world.currentLevelId, this.hp <= 0);
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }

  heal(n) { this.hp = Math.min(this.hp + n, this.maxHP); }

  die() {
    this.dead = true;
    captureDeath(this.world);   // "show hitbox on death": snapshot what hit us (deathreveal.js)
    this.world.audio.stopLoop('chargeHold');
    this.world.audio.play('death');
    // TOXIC MODE's roast waits for this cue to finish (roast.js)
    this.world.deathCueEnd = this.world.audio.now() + this.world.audio.duration('death');
    this.container.visible = false;
  }
}
