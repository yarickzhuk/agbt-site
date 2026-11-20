// crock.js — C.R.O.C.K, the phase-2 menace. It surfaces from the side into one
// of the four screen quarters, spits a spread of jellyfish toward the middle,
// then retreats. It's DARK BLUE — only a charged shot (torpedo / shotgun
// pellet) damages it; normal bullets break on it. Takes 3 such hits to
// destroy (clang, clang, shatter) and cuts its cycle short when killed.
import { buildSprite } from './retro.js';
import { Hittable, DARKBLUE, toScreen, HALF_W, HALF_H, rand } from './core.js';
import { useSilhouette } from './silhouette.js';
import { Jellyfish } from './jellyfish.js';

// Centres of the four quarters.
export const QUARTERS = [
  { x: -HALF_W * 0.5, y: -HALF_H * 0.5 },
  { x:  HALF_W * 0.5, y: -HALF_H * 0.5 },
  { x: -HALF_W * 0.5, y:  HALF_H * 0.5 },
  { x:  HALF_W * 0.5, y:  HALF_H * 0.5 },
];

const RADIUS = 0.8;
const HP = 3;

export class Crock extends Hittable {
  constructor(world, quarter) {
    const fromLeft = quarter.x < 0;
    const offX = fromLeft ? -HALF_W - 1.8 : HALF_W + 1.8;
    super(world, { x: offX, y: quarter.y, color: DARKBLUE, radius: RADIUS, damage: 1, countsAsProgress: true });
    this.world = world;
    this.alive = true;
    this.hp = HP;
    this.flashT = 0;
    this.tx = quarter.x; this.ty = quarter.y;
    this.offX = offX;
    this.phase = 'in'; this.t = 0; this.spat = false;

    this.container = buildSprite('CrockHead', { scale: 1.6, lineWidth: 2.5, tint: 0x3355FF });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    // The sprite faces left; when entering from the left it should face right
    // (jaws toward the middle), so flip it.
    this.container.scale.set(fromLeft ? -1.6 : 1.6, 1.6);
    this.container.zIndex = 6;
    world.stage.addChild(this.container);
    this.place();
    world.audio.beep(300, 0.12, 0.22);   // surfacing growl
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.phase === 'in') {
      this.x += (this.tx - this.x) * Math.min(1, dt * 4);
      if (Math.abs(this.x - this.tx) < 0.06) { this.x = this.tx; this.phase = 'spit'; this.t = 0; }
    } else if (this.phase === 'spit') {
      if (!this.spat) { this.spat = true; this.spit(); }
      if (this.t > 0.9) { this.phase = 'out'; this.t = 0; }
    } else {
      this.x += (this.offX - this.x) * Math.min(1, dt * 4);
      if (Math.abs(this.x - this.offX) < 0.12) { this.destroy(); return; }
    }
    this.place();

    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(1);
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.container.alpha = this.flashT > 0 ? 0.35 : 1;
    }
  }

  spit() {
    this.world.crockSpilled = true;   // achievement "Crockodile Bully" (level1.js phase 2)
    const base = Math.atan2(-this.y, -this.x);   // roughly toward screen centre
    for (let i = 0; i < 3; i++) {
      const a = base + (i - 1) * 0.45 + rand(-0.1, 0.1);
      this.world.add(new Jellyfish(this.world, this.x, this.y, Math.cos(a), Math.sin(a)));
    }
    this.world.audio.beep(520, 0.08, 0.22);
  }

  // A charged hit lands here (Hittable.canBeDestroyedBy returns charged for
  // DARKBLUE). Three hits destroy it; the earlier ones just clang and flash.
  // `dmg` (default 1, same as before the Charge Cannon's own supercharge
  // buff existed) lets a bigger hit knock off more than one hit at once,
  // same as knight.js/plasmadrache.js/saw.js already do.
  die(dmg = 1) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp > 0) {
      this.world.audio.play('bossHurt', 0.7);
      this.flashT = 0.1;
      return;                              // survives — the shot pierces onward
    }
    this.dead = true;
    this.world.addScore(200);
    this.world.audio.play('sawBreak', 0.9);
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
