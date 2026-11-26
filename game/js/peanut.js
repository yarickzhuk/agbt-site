// peanut.js — CRAZY CARNIVAL's peanut: a slow-homing pickup/hazard that
// rewards or punishes depending on how (and whether) you shoot it before it
// reaches you. Ported from the author's own Scratch prototype
// (Peanut.sprite3): it drifts toward the player, tumbling slowly; touching
// the player resolves it into one of two outcomes, decided by its last-hit
// costume.
//
// It's a CYAN Hittable (any shot registers, matching bullet/torpedo/shotgun
// pellet alike) but, like beam.js's cannon, getting shot doesn't destroy
// it — die() just re-rolls its outcome instead, mirroring the source
// script's own "touching a bullet -> switch to a random costume" branch.
// Every hit re-rolls the coin flip, so only the shot that actually lands
// closest to when it reaches you decides the outcome — that's the
// risk/reward the original script sets up, not a bug to fix.
import { buildSprite, paletteColor } from './retro.js';
import { Hittable, CYAN, HALF_W, HALF_H, toScreen, dist, rand } from './core.js';
import { useSilhouette } from './silhouette.js';
import { unlockAchievement } from './achievements.js';

const SPEED = 1.6;          // world units/s — slow enough to outrun while undecided
const SPIN = 2.4;           // rad/s, cosmetic tumble (the source's own "turn right" loop)
const RADIUS = 0.32;
const HEAL_AMOUNT = 2;
const OBSTACLE_DAMAGE = 1;
const SPAWN_AREA = 0.7;     // keep it off the very edge when it appears
export class Peanut extends Hittable {
  constructor(world) {
    super(world, {
      x: rand(-HALF_W * SPAWN_AREA, HALF_W * SPAWN_AREA),
      y: rand(-HALF_H * SPAWN_AREA, HALF_H * SPAWN_AREA),
      color: CYAN, radius: RADIUS, damage: OBSTACLE_DAMAGE,
      hurtsPlayer: false, countsAsProgress: false,
    });
    this.world = world;
    this.state = 'neutral';   // 'neutral' (never shot) | 'good' | 'bad'
    this.settled = false;     // true once it has planted itself as an obstacle
    this.spin = 0;

    this.container = buildSprite('Peanut', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
    world.audio.play('peanutSpawn', 0.6);
  }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = this.spin;
  }

  // Any shot re-rolls the outcome instead of destroying it — see the header
  // comment for why every hit re-rolling (rather than locking in on the
  // first) is the intended risk/reward, not a bug.
  die() {
    if (this.settled) return;
    this.state = Math.random() < 0.5 ? 'good' : 'bad';
    this.retint();
    this.world.audio.play('peanutPop', 0.5);
  }

  retint() {
    const roles = { neutral: 'ring', good: 'heal', bad: 'grape' };
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
    this.container = buildSprite('Peanut', { lineWidth: 2, tint: paletteColor(roles[this.state]) });
    this.world.stage.addChild(this.container);
    this.place();
  }

  update(dt) {
    if (this.dead) return;
    this.spin += SPIN * dt;
    const p = this.world.player;
    if (!p || p.dead) { this.place(); return; }

    if (!this.settled) {
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (!this.touches(p)) {
        this.x += (dx / d) * SPEED * dt;
        this.y += (dy / d) * SPEED * dt;
      } else {
        this.resolve();
        // A 'good' resolve destroy()s this (container torn down); nothing
        // below this point may touch it, so bail out before the place()
        // call below does exactly that on a dead container.
        if (this.dead) return;
      }
    } else if (!p.invulnerable) {
      if (this.touches(p)) p.takeDamage(this.damage);
    }
    this.place();
  }

  // Reached the player: green heals and vanishes; purple (or never-shot,
  // matching the source script's fall-through) plants itself in place as a
  // permanent touch-hazard for the rest of the phase.
  resolve() {
    if (this.state === 'good') {
      this.world.player.heal(HEAL_AMOUNT);
      this.world.healPicked = true;   // "No health wasted" (achievements.js)
      this.world.audio.play('peanutGood', 0.7);
      // Achievement "2 for 1 price": both of a DARTS phase's peanuts green
      // (level3.js's phase4 zeroes the count).
      this.world.greenPeanuts = (this.world.greenPeanuts || 0) + 1;
      if (this.world.greenPeanuts >= 2) unlockAchievement(this.world, 'twoforone');
      this.destroy();
      return;
    }
    this.settled = true;
    if (this.state !== 'bad') { this.state = 'bad'; this.retint(); }
    this.world.audio.play('peanutBad', 0.7);
    this.world.player.takeDamage(OBSTACLE_DAMAGE);
  }

  destroy() {
    this.dead = true;
    this.alive = false;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
