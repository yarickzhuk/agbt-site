// clowntarget.js — the 5 stationary targets in Showman's Cruel Clownhouse
// maze intro (showman.js/levels/level3.js's phase5). Ported from the
// author's own Scratch prototype (Boss — Cruel Clownhouse.sb3): each "Clown
// Target" sprite just shows itself and waits until touching the "Bouncy
// Ball" sprite, then counts and hides.
//
// A real Hittable now, destroyable by any shot — not just a touch check
// against BouncyBall instances. The source's literal "touching Bouncy Ball"
// script made sense only because CRAZY CARNIVAL forces that weapon for its
// whole uncleared run; once the level's cleared and the player can freely
// switch weapons again (world.canSwitchAtAll — see main.js/weapon.js), a
// replay with the Charge Cannon or the shotgun equipped could never pop
// these targets at all. Generalizing to "any shot" (like every other CYAN
// Hittable in the game) fixes that without giving up anything the maze
// actually needs.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen } from './core.js';

const RADIUS = 0.4;

export class ClownTarget extends Hittable {
  constructor(world, x, y) {
    super(world, { x, y, color: CYAN, radius: RADIUS, damage: 0, hurtsPlayer: false, countsAsProgress: false });
    this.world = world;
    this.popped = false;
    this.alive = true;

    this.container = buildSprite('ClownTarget', { lineWidth: 2 });
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  die() {
    if (this.dead || this.popped) return;
    this.dead = true;
    this.popped = true;
    this.world.addScore(100);
    this.world.audio.play('destroyCyan', 0.6);
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
