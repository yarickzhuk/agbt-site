// bullet.js — flies straight, hit tested by distance against every Hittable.
// A torpedo (charged) punches through Purple and kills DarkBlue; a normal
// bullet breaks on anything it can't destroy.
import { buildSprite } from './retro.js';
import { makeSkinSprite, setSkinFrame, bulletKey, hasSkinShot, shotTint } from './costumes.js';
import { toScreen, HALF_W, HALF_H, dist, wallHit, playerHit, playerBossHit } from './core.js';

const SPEED = 14;      // world units / s
const LIFETIME = 3;
const SUPER_DAMAGE = 10;   // the Charge Cannon's supercharge buff -- see the Bullet doc comment below
const PELLET_DAMAGE = 2;  // Cyber Shotgun's own nerfed per-pellet damage -- see opts.pellet below

export class Bullet {
  // opts.superCharged: the Charge Cannon's own buff (player.js's SUPER_HOLD_TIME
  // -- hold well past the normal full charge) -- a bigger Hadouken shot dealing
  // SUPER_DAMAGE (10) instead of the usual 3 on a charged hit, "like a
  // point-blank Cyber Shotgun volley landing all at once". Still `charged`
  // underneath (pierces Purple, kills DarkBlue, the same wall/boss rules),
  // just a third damage tier on top -- nothing about a plain charged shot changed.
  //
  // opts.pellet: a Cyber Shotgun pellet (player.js's fireShotgun). Still
  // `charged` underneath for DarkBlue-kill purposes (a pellet still one-shots
  // a saw/crock/knight/etc. the same way a torpedo does), but nerfed to
  // PELLET_DAMAGE (2, down from a torpedo's 3) and no longer pierces Purple --
  // see checkHits() below for where that's actually enforced.
  constructor(world, x, y, dir, charged, opts = {}) {
    this.world = world;
    this.x = x; this.y = y;
    this.charged = charged;
    this.superCharged = !!opts.superCharged;
    this.isPellet = !!opts.pellet;
    this.hitSound = opts.hitSound || null;   // played once per volley on first hit
    this.volley = opts.volley || null;
    this.shot = opts.shot || null;   // DEVIL FISH's streak token (player.js)
    const speed = opts.speed != null ? opts.speed : SPEED;
    this.vx = dir.x * speed;
    this.vy = dir.y * speed;
    this.radius = this.superCharged ? 0.16 : 0.1;
    this.life = LIFETIME;
    this.alive = true;
    this.dying = false;
    this.struck = new Set();   // Hittables already hit, so a pierce counts once each

    const shapeName = this.superCharged ? 'Hadouken' : (charged ? 'Torpedo' : 'Bullet');
    const scale = opts.scale != null ? opts.scale : (this.superCharged ? 1.2 : (charged ? 1 : 0.9));
    // OPTIONS → COSTUMES: a reskinned ship fires its own skin's shots (same
    // plain/torpedo/hadouken choice and the same sizes as the stock shapes).
    this.skin = world.player && world.player.skin !== 'default' ? world.player.skin : null;
    this.skinKind = shapeName.toLowerCase();
    this.skinScale = scale;
    this.age = 0;
    this.skinShot = this.skin && hasSkinShot(this.skin, this.skinKind);
    this.container = this.skinShot
      ? makeSkinSprite(this.skin, bulletKey(this.skin, this.skinKind), scale)
      : buildSprite(shapeName, { lineWidth: 2, scale, tint: shotTint(this.skin) });
    this.container.rotation = Math.atan2(dir.y, dir.x);
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
  }

  update(dt) {
    if (this.dying) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.skinShot) {   // animated skin shots (devil fish's jellyfish torpedo)
      this.age += dt;
      const key = bulletKey(this.skin, this.skinKind, this.age);
      if (this.container._skinKey !== key) setSkinFrame(this.container, this.skin, key, this.skinScale);
    }
    this.place();
    // A solid maze wall (wall.js, e.g. Showman's intro) blocks a shot the same
    // way it blocks the player — otherwise the maze is decorative, since
    // anything behind a wall could just be shot through it. A plain (grape)
    // wall always breaks it here, same as hitting anything else it can't get
    // past; a colour-tinted one (plasmadrache.js's own ring/cobalt walls)
    // follows the same CYAN/DARKBLUE rule any other Hittable would — an
    // eligible shot destroys the wall instead, and only a charged one then
    // pierces on through the gap it just opened.
    const wall = wallHit(this.world, this.x, this.y, this.radius);
    if (wall) {
      if (wall.canBeDestroyedBy(this.charged)) {
        wall.destroy();
        this.world.audio.play(wall.color === 'darkblue' ? 'destroyIndigo' : 'destroyCyan', 0.6);
        if (!this.charged) { this.breakAndDie(); return; }
      } else if (!(wall.pierceable && this.charged && !this.isPellet)) {
        // A pierceable wall (Plasmadrache's, wall.js) lets a charged shot
        // fly on through; pellets still break, like on any PURPLE.
        this.breakAndDie(); return;
      }
    }
    this.checkHits();
    if (this.life <= 0 ||
        this.x < -HALF_W - 1 || this.x > HALF_W + 1 ||
        this.y < -HALF_H - 1 || this.y > HALF_H + 1) {
      this.destroy();
    }
  }

  checkHits() {
    // 10 damage on a supercharged hit (the Charge Cannon's own buff --
    // "like a point-blank Cyber Shotgun" landing all its pellets at once),
    // 2 for a Cyber Shotgun pellet (nerfed from 3 -- still enough to
    // one-shot most multi-hit hazards that don't have a lot of HP, just not
    // as hard-hitting as a full torpedo any more), 3 for any other charged
    // shot (a torpedo) -- "acts like a torpedo" against DarkBlue/multi-hit
    // hazards, 1 otherwise. Single-hit-kill Hittables ignore this entirely
    // (their own die()/tryHit() never reads it), so it only matters to the
    // ones that actually count hits.
    const dmg = this.superCharged ? SUPER_DAMAGE : (this.isPellet ? PELLET_DAMAGE : (this.charged ? 3 : 1));

    // Boss isn't a Hittable — it checks its own weak sector.
    // A supercharged Hadouken already deals 10, so it never pierces a boss
    // ("give all bosses penetration immunity against fully charged shot of
    // charge cannon") -- neither the world.boss slot (TrapWheel, Trap
    // Circle Delta, Kangunroo Delta) nor a Hittable flagged `isBoss`. A
    // piercing torpedo also only hits the world.boss once (`struck`), like
    // it already only hits each Hittable once.
    const boss = this.world.boss;
    if (boss && !this.struck.has(boss) && playerBossHit(this.world, boss, this.x, this.y, this.charged, dmg)) {
      this.struck.add(boss);
      this.playHit();
      if (!this.charged || this.superCharged) { this.breakAndDie(); return; }
    }

    const list = this.world.hittables;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (!h || h.dead) continue;
      // Most Hittables are a point+radius; some (the sweeping Beam) test their
      // own shape via hitTest(x, y, r).
      const within = h.hitTest ? h.hitTest(this.x, this.y, this.radius)
                               : dist(this.x, this.y, h.x, h.y) <= this.radius + h.radius;
      if (!within) continue;

      if (h.canBeDestroyedBy(this.charged)) {
        if (this.struck.has(h)) continue;   // don't re-hit the same target while piercing
        this.struck.add(h);
        playerHit(this.world, h, dmg);
        this.playHit();
        // `noPierce` (THE FINALE's Delta, "immunity to penetration"): even
        // a charged shot or pellet stops on it instead of flying on through.
        if (!this.charged || h.noPierce || (this.superCharged && h.isBoss)) { this.breakAndDie(); return; }
        continue;                       // torpedo pierces
      }
      // A pellet still counts as charged for DarkBlue-kill purposes above,
      // but the shotgun nerf means it no longer flies through Purple the way
      // an actual torpedo does -- pass `false` here so Hittable.stopsBullet's
      // PURPLE rule (normally `!charged`) reads it as an ordinary bullet and
      // stops it dead, same as ATOM/flame/pirania/etc. already stop a tap shot.
      if (h.stopsBullet(this.isPellet ? false : this.charged)) { this.breakAndDie(); return; }
    }
  }

  // Play the weapon's hit sound at most once per fired volley.
  playHit() {
    if (!this.hitSound) return;
    if (this.volley) { if (this.volley.played) return; this.volley.played = true; }
    this.world.audio.play(this.hitSound, 0.6);
  }

  breakAndDie() {
    this.dying = true;
    this.container.destroy({ children: true });
    this.container = this.skin && hasSkinShot(this.skin, 'break')
      ? makeSkinSprite(this.skin, 'break', 0.9)
      : buildSprite('BulletBreak', { lineWidth: 2, scale: 0.9, tint: shotTint(this.skin) });
    this.container.rotation = Math.atan2(this.vy, this.vx);
    this.world.stage.addChild(this.container);
    this.place();
    setTimeout(() => this.destroy(), 60);
  }

  destroy() {
    if (this.shot) { const s = this.shot; this.shot = null; s.end(); }
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
