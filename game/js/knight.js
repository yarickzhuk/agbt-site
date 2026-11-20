// knight.js — OCCÜLTACRESBURG's phase-1 hazard: the first enemy built to put
// LINE SLASHER's melee identity through its paces. Ported from the author's
// own Scratch prototype (Knight.sprite3, plus a companion Knight_sword.sprite3
// that swings near it during its attack) — another thin skeleton, same
// situation clown.js/corn.js/firework.js were already in with their own
// sources: neither sprite has a damage/die script at all, just movement
// (point towards the player, glide to them) plus the sword's own swing
// animation and sound cues, so the fight itself (HP, per-weapon damage,
// touch-hurt) is built fresh from the brief on top of it.
//
// DARK BLUE, 3 HP: a charged shot (torpedo, a fully-charged Bouncy Ball, or
// any Cyber Shotgun pellet — all of bullet.js's own "charged" hits) deals 3
// damage, one-shotting it, the same "acts like a torpedo" rule those
// weapons already follow against DarkBlue. LINE SLASHER's own SLASH deals
// only 1 damage per swing — three separate slashes to bring one down — the
// deliberate tradeoff this enemy exists to teach: melee trades range for
// needing more hits than a ranged charged shot. The DASH is pure mobility
// and never damages anything at all (see lineslasher.js/player.js);
// landing the kill always comes down to an actual SLASH, dash or no dash.
import { buildSprite } from './retro.js';
import { Hittable, DARKBLUE, toScreen, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const MAX_HP = 3;
const RADIUS = 0.5;
// GLIDE_TIME started at the source's own literal 1s ("glide 1 secs to
// Player"), but closing a typical spawn-edge-to-player distance (several
// world units) in exactly 1s reads as a full sprint rather than a glide --
// tuned down to 2s (half the closing speed) after the author's own report
// that Knights felt like they were "moving like psychos." REST_TIME is a
// new addition on top of the source: without it, endAttack() re-glided the
// instant a swing finished, so a Knight was *always* either closing in or
// mid-swing, with literally zero downtime between attacks -- a big part of
// why repeated contact could chew through HP so fast. A short breather
// before the next approach gives the player an actual window to reposition.
const GLIDE_TIME = 2;          // seconds per glide-to-player hop
const REST_TIME = 0.6;         // pause after a swing before the next approach
const SWING_TIME = 0.6;        // total sword-swing animation, split into 3 equal beats
const SWING_BEAT = SWING_TIME / 3;
const DAMAGE = 1;              // touch damage per contact

export class Knight extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: DARKBLUE, radius: RADIUS, damage: DAMAGE, countsAsProgress: true });
    this.world = world;
    this.hp = MAX_HP;
    this.alive = true;
    this.state = 'approach';
    this.glideT = 0;
    this.swingT = 0;
    this.restT = 0;
    this._lastBeatIndex = -1;
    this.fromX = this.x; this.fromY = this.y;
    const p = world.player;
    this.toX = p ? p.x : this.x; this.toY = p ? p.y : this.y;
    // Knight.json's own visor bar (the `ring` polygon) points along local
    // +X, so this is the shape's own "face" -- facing tracks whichever
    // direction it's actually aimed at (set whenever it re-aims, below),
    // applied to the whole container in place() so both the body and the
    // sword swing toward the player instead of always facing the shape's
    // default (east) orientation regardless of where the player actually is.
    this.facing = Math.atan2(this.toY - this.fromY, this.toX - this.fromX);

    this.container = buildSprite('Knight', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    // The sword is a child of the Knight's container, not a world entity of
    // its own. It used to be purely cosmetic; with the drawn-outline
    // hitboxes (silhouette.js) it hurts too, but only while it's out
    // (visible), i.e. during the swing.
    this.sword = buildSprite('KnightSword', { lineWidth: 2 });
    this.sword.visible = false;
    this.container.addChild(this.sword);
    world.stage.addChild(this.container);
    this.place();
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = this.facing;
  }

  update(dt) {
    if (this.dead) return;
    if (this.state === 'rest') {
      this.restT += dt;
      // Doesn't touch-hurt while resting -- it's a genuine breather, not
      // just a delay before the next hit becomes available again.
      if (this.restT >= REST_TIME) {
        this.state = 'approach';
        this.glideT = 0;
        this.fromX = this.x; this.fromY = this.y;
        const p = this.world.player;
        this.toX = p ? p.x : this.x; this.toY = p ? p.y : this.y;
        this.facing = Math.atan2(this.toY - this.fromY, this.toX - this.fromX);
      }
      return;
    }
    if (this.state === 'approach') {
      this.glideT += dt;
      const k = Math.min(1, this.glideT / GLIDE_TIME);
      this.x = this.fromX + (this.toX - this.fromX) * k;
      this.y = this.fromY + (this.toY - this.fromY) * k;
      this.place();
      this.touchPlayer();
      if (k >= 1) this.startAttack();
      return;
    }

    // 'attack': three 4-turn-step beats (+60deg, -120deg, +60deg -- net
    // zero rotation, matching the source's own turn sequence exactly)
    // staggered over SWING_TIME instead of Scratch's own no-wait instant
    // pose changes, each beat opening with its own Knight_slash cue --
    // the same "no wait between iterations -> unreadable instant, not
    // something a player can actually see" bug class this session already
    // fixed for dart.js's flight and lineslasher.js's own slash arc.
    this.swingT += dt;
    const clamped = Math.min(SWING_TIME - 0.0001, this.swingT);
    const beatIndex = Math.floor(clamped / SWING_BEAT);
    if (beatIndex !== this._lastBeatIndex) {
      this._lastBeatIndex = beatIndex;
      this.world.audio.play('knightSlash', 0.6);
    }
    const starts = [0, Math.PI / 3, -Math.PI / 3];
    const ends = [Math.PI / 3, -Math.PI / 3, 0];
    const beatK = (clamped - beatIndex * SWING_BEAT) / SWING_BEAT;
    this.sword.rotation = starts[beatIndex] + (ends[beatIndex] - starts[beatIndex]) * beatK;
    this.touchPlayer();
    if (this.swingT >= SWING_TIME) this.endAttack();
  }

  startAttack() {
    this.state = 'attack';
    this.swingT = 0;
    this._lastBeatIndex = -1;
    this.sword.visible = true;
    this.sword.rotation = 0;
    this.world.audio.play('knightPop', 0.6);   // telegraph -- the sword's about to swing
  }

  // A short rest before approaching again; re-aiming at wherever the player
  // is now happens once that rest ends (the rest -> approach transition in
  // update()), matching the source's own "point towards Player" at the top
  // of each loop pass, just delayed by REST_TIME.
  endAttack() {
    this.state = 'rest';
    this.restT = 0;
    this.sword.visible = false;
  }

  touchPlayer() {
    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
    }
  }

  // `dmg` lets callers vary how much a given hit is worth: a charged shot
  // (bullet.js/bouncyball.js) passes 3, one-shotting it like a torpedo;
  // lineslasher.js's SLASH passes 1, needing three separate swings.
  die(dmg = 1) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp > 0) {
      this.world.audio.play('bossHurt', 0.6);
      return;
    }
    this.dead = true;
    this.world.addScore(200);
    this.world.audio.play('destroyIndigo', 0.8);
    this.destroy();
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
