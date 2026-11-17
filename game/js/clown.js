// clown.js — CRAZY CARNIVAL's phase-3 hazard: a wandering clown you have to
// shoot down. Ported from the author's own Scratch prototype
// (Clown.sprite3). The source also had a "spawn 20 tiny clone clowns"
// script, but it was bound to a literal spacebar keypress the author used
// for their own testing — never touched by any other script, and outside
// this phase's stated brief ("destroy clown and 4 lollypops") — so only
// the wandering target itself is ported, not that swarm.
//
// DARK BLUE, not cyan — a plain any-shot kill made him just an annoying
// sound spammer, gone the instant you tapped fire once. A charged shot
// (torpedo / shotgun pellet) is needed instead, same rule saw.js/crock.js
// use for their own dark-blue hazards, so he's actually a real target to
// line up, not a free kill.
//
// Its laugh (Clown_A.wav/Clown_C.wav) is remade into a robotic noise —
// ring-modulated and bit-crushed — rather than played as literal human
// laughter, the same "processed, not human" character `warning_robot.wav`
// already has for the boss-warning cue.
import { buildSprite } from './retro.js';
import { Hittable, DARKBLUE, toScreen, HALF_W, HALF_H, rand, pick, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const GLIDE_TIME = 3.2;      // seconds per random hop (source used 10s; sped up for gameplay)
const LAUGH_INTERVAL = 2.5;  // seconds between laugh cues while alive
const RADIUS = 0.55;
const LAUGHS = ['clownLaughA', 'clownLaughC'];
const DARKBLUE_TINT = 0x3355FF;   // same dark-blue tint saw.js/crock.js use

export class Clown extends Hittable {
  constructor(world) {
    const x = rand(-HALF_W * 0.7, HALF_W * 0.7), y = rand(-HALF_H * 0.7, HALF_H * 0.7);
    super(world, { x, y, color: DARKBLUE, radius: RADIUS, damage: 1, countsAsProgress: false });
    this.world = world;
    this.glideT = 0;
    this.laughT = 0;
    this.fromX = x; this.fromY = y;
    this.toX = x; this.toY = y;
    this.pickNewTarget();

    this.container = buildSprite('Clown', { lineWidth: 2, tint: DARKBLUE_TINT });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    world.stage.addChild(this.container);
    this.place();
    this.world.audio.play(pick(LAUGHS), 0.6);
  }

  pickNewTarget() {
    this.fromX = this.x; this.fromY = this.y;
    this.toX = rand(-HALF_W * 0.75, HALF_W * 0.75);
    this.toY = rand(-HALF_H * 0.75, HALF_H * 0.75);
    this.glideT = 0;
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;
    this.glideT += dt;
    const k = Math.min(1, this.glideT / GLIDE_TIME);
    this.x = this.fromX + (this.toX - this.fromX) * k;
    this.y = this.fromY + (this.toY - this.fromY) * k;
    if (k >= 1) this.pickNewTarget();
    this.place();

    this.laughT += dt;
    if (this.laughT >= LAUGH_INTERVAL) {
      this.laughT = 0;
      this.world.audio.play(pick(LAUGHS), 0.4);
    }

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.world.addScore(200);
    this.world.audio.play('destroyCyan', 0.7);
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
