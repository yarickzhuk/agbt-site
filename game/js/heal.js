// heal.js — the green orb dropped between waves. Picked up by touch (not shot),
// restores 1 HP (and scores 1 point), and fades out over its last few seconds before vanishing.
import { buildSprite } from './retro.js';
import { toScreen, HALF_W, HALF_H, rand, dist } from './core.js';

const LIFETIME = 12, BLINK = 3;   // seconds
const PICKUP_R = 0.4;
// The player's reach for a pickup: kept at the old 0.35 hit radius when the
// hurtbox shrank to the ship's size, so orbs stay as easy to grab as before.
const PICKUP_REACH = 0.35;
const AREA = 0.75;                // keep it off the very edge
// THE OG's passive (costumes.js): while it's charging, orbs within
// MAGNET_R are pulled to it at MAGNET_SPEED.
const MAGNET_R = 2.5, MAGNET_SPEED = 5;   // world units, units/s

class HealOrb {
  constructor(world) {
    this.world = world;
    this.alive = true;
    this.age = 0;
    this.x = rand(-HALF_W * AREA, HALF_W * AREA);
    this.y = rand(-HALF_H * AREA, HALF_H * AREA);
    // An electron, so a minus. The DELTA costume plays everything backwards,
    // so it sees a plus instead: a hidden easter egg, kept out of the manual.
    const delta = world.player && world.player.skin === 'delta';
    this.container = buildSprite(delta ? 'HealOrbPlus' : 'HealOrb', { scale: 1, lineWidth: 2 });
    world.stage.addChild(this.container);
    this.place();
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  update(dt) {
    this.age += dt;
    const p = this.world.player;
    if (p && !p.dead && p.skin === 'og' && p.charging && p.chargeSoundStarted) {
      const d = dist(this.x, this.y, p.x, p.y);
      if (d > 0 && d <= MAGNET_R) {
        const step = Math.min(d, MAGNET_SPEED * dt);
        this.x += (p.x - this.x) / d * step;
        this.y += (p.y - this.y) / d * step;
        this.place();
      }
    }
    if (p && !p.dead && dist(this.x, this.y, p.x, p.y) <= PICKUP_R + PICKUP_REACH) {
      if (p.hp < p.maxHP) p.heal(1);
      this.world.addScore(1);   // 1 point per orb picked up
      // Counted as "collected" on touch alone, even at full HP -- plasmadrache.js's
      // own chomp mechanic (OCCÜLTACRESBURG's boss) heals itself by this count.
      this.world.healOrbsCollected = (this.world.healOrbsCollected || 0) + 1;
      this.world.healPicked = true;   // "No health wasted" (achievements.js)
      this.destroy();
      return;
    }
    if (this.age >= LIFETIME) { this.destroy(); return; }
    if (this.age > LIFETIME - BLINK) {
      this.container.alpha = 0.35 + 0.65 * ((LIFETIME - this.age) / BLINK);
    }
  }

  destroy() {
    this.alive = false;
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// SPEEDRUN MODE (speedrun.js) heals the player to full on the spot instead
// of dropping an orb. The stand-in has what callers touch on a real orb.
export function spawnHealOrb(world) {
  if (world.speedrun) {
    const p = world.player;
    if (p && !p.dead) p.heal(p.maxHP);
    return { alive: false, dead: true, x: 0, y: 0, place() {} };
  }
  return world.add(new HealOrb(world));
}
