// fleet.js — OUTER SPACE Stage 3's boss, DELTA UNIT: a Galaga-
// style armada of 102 ships, 34 each of three types ported from the
// author's own Scratch prototypes (`Divebomber.sprite3`, `Shooter.sprite3`,
// `Commando.sprite3`). The brief fixed the count and "follow color rules";
// waves, formation, and attack patterns were left to this port.
//
// What each source script does, and how it's kept:
// - Divebomber: fly up from the bottom, glide to its formation point (PT1,
//   2s), then `repeat until distance to Player < 50 { point towards Player;
//   move 3 }`, then glide back to its point and go again, forever. Kept as a
//   homing dive (turn-rate-limited so it can be juked), a short overshoot
//   once it's close, then straight back into another dive -- it doesn't
//   return to its slot, it keeps at you until shot down (only one attack
//   is ever live at a time; see ATTACK_GAP). Its body is a cyan wedge →
//   CYAN, any shot kills it.
// - Shooter: glide to PT2, `point in direction 180` (down), then fire a
//   bullet clone straight along its facing every 2s while patrolling. Kept
//   as formation gunners that never dive and shoot straight down. Its body
//   is the dark-blue block → DARKBLUE, charged shots only.
// - Commando: the Divebomber's dive (with its own 1s glide in), plus a
//   bullet clone along its facing every 0.4s until within 100 of the Player.
//   Its art is a dark-blue core hung between two cyan engine pods, so it
//   follows both rules in order: any shot strips the pods (CYAN), then the
//   bare core needs a charged shot (DARKBLUE).
// Bullets (both guns) are PURPLE chip bullets, same as every other enemy
// projectile in this game.
//
// Source dive sounds (Dive_A/Dive_B) were the usual looped export (one 4s
// rising cycle repeated 4 times) — trimmed to one cycle, played per dive and
// cut off when the dive ends, matching the source's own `stop all sounds`.
import { buildSprite, getShape, paletteColor } from './retro.js';
import { spawnHealOrb } from './heal.js';
import { Hittable, CYAN, DARKBLUE, PURPLE, toScreen, HALF_W, HALF_H, dist, rand, pick } from './core.js';
import { useSilhouette } from './silhouette.js';

// 8 waves, 34 of each type in total (checked below).
export const WAVES = [
  { D: 8 },
  { S: 6, D: 6 },
  { C: 4, D: 8 },
  { S: 8, C: 4 },
  { S: 6, C: 6, D: 4 },
  { C: 8, D: 4 },
  { S: 8, C: 6 },
  { S: 6, C: 6, D: 4 },
];
export const FLEET_SIZE = WAVES.reduce((n, w) => n + (w.D || 0) + (w.S || 0) + (w.C || 0), 0);   // 102

const ROW_Y = { C: -3.6, S: -2.75, D: -1.9 };   // formation rows, top to bottom
const COL_GAP = 1.15;
// The arena outline: the player is kept inside a thin box whose top edge sits
// just under the lowest formation row. Without it you could park in a top
// corner, level with the rows, and spam piercing shots sideways through a
// whole row at once. It stops the player, dash included (the clamp runs every
// frame) -- shots and ships pass it, or the Shooters could never be hit.
const FENCE_INSET = 0.06;
const FENCE_Y = -1.1;
const FENCE_BOTTOM = HALF_H - FENCE_INSET;

const SWAY_AMP = 0.9, SWAY_RATE = 0.6;          // whole formation drifts side to side
const ENTER_TIME = { D: 2.0, S: 2.0, C: 1.4 };  // source glide times (Commando's 1s eased a little)
const ENTER_STAGGER = 0.14;                     // s between ships of a wave flying in

const DIVE = {
  D: { speed: 5.4, turn: 3.0 },
  C: { speed: 4.0, turn: 2.4 },
};
const DIVE_CLOSE = 1.34;      // the source's "distance < 50" (Scratch units → world units)
const PASS_TIME = 0.55;       // overshoot straight past before heading home
const DIVE_MAX = 5;           // give up a dive that hasn't connected by then

const SHOOTER_FIRE = [2, 3.4];   // source: every 2s, jittered so a row isn't a wall
const COMMANDO_FIRE = 0.4;       // source cadence
const COMMANDO_FIRE_RANGE = 2.68;   // the source's "until distance < 100"
const BULLET_SPEED = { S: 3.4, C: 4.6 };

// One attack at a time: either a single Commando or a pair of Divebombers
// dives at the player, and keeps diving until it's shot down -- only then
// does the next attacker peel off the formation (ATTACK_GAP later).
const ATTACK_GAP = 1.2;             // s between one attacker dying and the next launching
const DIVEBOMBER_PAIR = 2;          // Divebombers come in pairs; Commandos always alone
const COMMANDO_CHANCE = 0.4;        // odds the next attack is a Commando when both are available
const WAVE_REST = 4;                // breather after a cleared wave: a heal orb drops, then the next wave
const THEME_VOLUME = 0.5;           // Delta_Unit part, level with the beats loop's own 0.5

const SHAPE_SCALE = 1;
function shapeRadius(name) {
  const s = getShape(name);
  return s ? Math.max(s.width, s.height) / 100 / 2 * 0.8 * SHAPE_SCALE : 0.3;
}

// Pews from 30 Shooters would machine-gun the mixer; one per type per 80ms.
const lastPew = {};
function pew(world, name, vol) {
  const now = performance.now();
  if (lastPew[name] && now - lastPew[name] < 80) return;
  lastPew[name] = now;
  world.audio.play(name, vol);
}

class FleetBullet extends Hittable {
  constructor(world, x, y, vx, vy) {
    super(world, { x, y, color: PURPLE, radius: 0.12, damage: 1, countsAsProgress: false });
    this.world = world; this.vx = vx; this.vy = vy;
    this.container = buildSprite('FleetBullet', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.rotation = Math.atan2(vy, vx);
    world.stage.addChild(this.container);
    this.place();
  }
  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }
  update(dt) {
    if (this.dead) return;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.place();
    if (Math.abs(this.x) > HALF_W + 0.5 || Math.abs(this.y) > HALF_H + 0.5) { this.destroy(); return; }
    const p = this.world.player;
    if (p && !p.dead && !p.invulnerable && this.touches(p)) {
      p.takeDamage(this.damage);
      this.destroy();
    }
  }
  destroy() {
    this.alive = false; this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

export class FleetShip extends Hittable {
  constructor(world, fleet, type, slotX, slotY, startX) {
    const color = type === 'S' ? DARKBLUE : CYAN;   // Commando starts CYAN (pods), then DARKBLUE
    const shape = type === 'D' ? 'Divebomber' : type === 'S' ? 'Shooter' : 'CommandoCore';
    super(world, { x: startX, y: HALF_H + 0.8, color, radius: shapeRadius(shape), damage: 1,
                   destroySound: type === 'D' ? 'destroyCyan' : 'destroyIndigo' });
    this.world = world; this.fleet = fleet; this.type = type;
    this.slotX = slotX; this.slotY = slotY;
    this.state = 'enter'; this.t = 0;
    this.heading = -Math.PI / 2;
    this.podsUp = type === 'C';
    this.fireT = type === 'S' ? rand(...SHOOTER_FIRE) : 0;

    // Entrance: a cubic swoop up from the bottom, crossing the field before
    // tucking into the slot -- Galaga's fly-in, not a straight glide.
    const side = Math.sign(startX) || 1;
    this.path = [startX, HALF_H + 0.8, startX, -0.5, -side * 2.5, 1.5];

    this.container = new PIXI.Container();
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.body = buildSprite(shape, { lineWidth: 2, scale: SHAPE_SCALE });
    this.container.addChild(this.body);
    if (this.podsUp) {
      this.pods = buildSprite('CommandoPods', { lineWidth: 2, scale: SHAPE_SCALE });
      this.container.addChild(this.pods);
    }
    world.stage.addChild(this.container);
    this.place();
  }

  slotPos() { return [this.slotX + this.fleet.swayX, this.slotY]; }

  place() {
    const [sx, sy] = toScreen(this.x, this.y);
    this.container.position.set(sx, sy);
    this.container.rotation = this.heading;
  }

  canBeDestroyedBy(charged) {
    if (this.state === 'enter' && this.t < 0.15) return false;   // still off-screen
    return super.canBeDestroyedBy(charged);
  }

  die(dmg) {
    if (this.dead) return;
    if (this.podsUp) {
      // CYAN stage done: pods blown off, the dark-blue core is all that's left.
      this.podsUp = false;
      this.color = DARKBLUE;
      if (this.pods) { this.pods.destroy({ children: true }); this.pods = null; }
      this.world.addScore(100);
      this.world.audio.play('destroyCyan', 0.5);
      return;
    }
    if (this.type !== 'D') this.world.addScore(100);   // dark-blue kills are worth more
    this.stopDiveSound();
    super.die(dmg);
  }

  stopDiveSound() {
    if (this.diveSrc) { try { this.diveSrc.stop(); } catch (e) {} this.diveSrc = null; }
  }

  startDive() {
    this.state = 'dive'; this.t = 0; this.fireT = 0;
    this.diveSrc = this.world.audio.play(this.type === 'D' ? 'diveA' : 'diveB', 0.35);
  }

  steer(tx, ty, speed, turn, dt) {
    const want = Math.atan2(ty - this.y, tx - this.x);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += Math.max(-turn * dt, Math.min(turn * dt, d));
    this.x += Math.cos(this.heading) * speed * dt;
    this.y += Math.sin(this.heading) * speed * dt;
  }

  fire(speed, angle) {
    const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    this.world.add(new FleetBullet(this.world, this.x + Math.cos(angle) * 0.3, this.y + Math.sin(angle) * 0.3, vx, vy));
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const p = this.world.player;
    const [sx, sy] = this.slotPos();

    if (this.state === 'enter') {
      const k = Math.min(1, this.t / ENTER_TIME[this.type]);
      const [x0, y0, x1, y1, x2, y2] = this.path;
      const u = 1 - k;
      const nx = u*u*u*x0 + 3*u*u*k*x1 + 3*u*k*k*x2 + k*k*k*sx;
      const ny = u*u*u*y0 + 3*u*u*k*y1 + 3*u*k*k*y2 + k*k*k*sy;
      if (k < 1) this.heading = Math.atan2(ny - this.y, nx - this.x);
      this.x = nx; this.y = ny;
      if (k >= 1) { this.state = 'formation'; this.t = 0; }
    } else if (this.state === 'formation') {
      this.x = sx; this.y = sy;
      // Turn to face down the field (the Shooter's own `point in direction 180`).
      const d = Math.atan2(Math.sin(Math.PI / 2 - this.heading), Math.cos(Math.PI / 2 - this.heading));
      this.heading += d * Math.min(1, dt * 6);
      if (this.type === 'S') {
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = rand(...SHOOTER_FIRE) * (this.fleet.enraged ? 0.5 : 1);
          // Enraged (last few ships of a wave): aim at the player instead of straight down.
          const ang = this.fleet.enraged && p ? Math.atan2(p.y - this.y, p.x - this.x) : Math.PI / 2;
          this.fire(BULLET_SPEED.S, ang);
          pew(this.world, 'shooterPew', 0.3);
        }
      }
    } else if (this.state === 'dive') {
      const cfg = DIVE[this.type];
      if (p && !p.dead) this.steer(p.x, p.y, cfg.speed, cfg.turn, dt);
      else this.steer(this.x, HALF_H + 2, cfg.speed, cfg.turn, dt);
      if (this.type === 'C' && p && dist(this.x, this.y, p.x, p.y) > COMMANDO_FIRE_RANGE) {
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = COMMANDO_FIRE;
          this.fire(BULLET_SPEED.C, this.heading);
          pew(this.world, 'commandoPew', 0.35);
        }
      }
      if ((p && dist(this.x, this.y, p.x, p.y) < DIVE_CLOSE) || this.t > DIVE_MAX) {
        this.state = 'pass'; this.t = 0;
        this.stopDiveSound();
      }
    } else if (this.state === 'pass') {
      // Overshoot, then come straight back round for another dive -- an
      // attacker never returns to formation, it keeps at you until it's shot.
      const sp = DIVE[this.type].speed;
      this.x += Math.cos(this.heading) * sp * dt;
      this.y += Math.sin(this.heading) * sp * dt;
      if (this.t >= PASS_TIME) {
        // Off the edge? Galaga-style: reappear above the top and dive from there.
        if (Math.abs(this.y) > HALF_H + 0.6 || Math.abs(this.x) > HALF_W + 0.6) {
          this.x = rand(-HALF_W * 0.8, HALF_W * 0.8); this.y = -HALF_H - 0.8; this.heading = Math.PI / 2;
        }
        this.startDive();
      }
    }

    this.place();

    if (p && !p.dead && !p.invulnerable && this.touches(p)) {
      p.takeDamage(this.damage);
    }
  }

  destroy() {
    this.stopDiveSound();
    this.alive = false; this.dead = true;
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// The commander: spawns waves, sways the formation, and picks who dives.
// An updatable, not a Hittable -- there's nothing to shoot but its ships.
export class Fleet {
  constructor(world, hud) {
    this.world = world; this.hud = hud;
    this.wave = -1; this.ships = []; this.killed = 0;
    this.swayT = 0; this.swayX = 0;
    this.diveT = 1.5;
    this.breakT = 0.2;      // short beat before wave 1
    this.resting = false;
    this.pending = [];      // [delay, spawnFn] for the current wave's staggered fly-in
    this.enraged = false;
    this.defeated = false;
    this.theme = null;      // this wave's Delta_Unit part, once it's playing
    this.buildFence();
  }

  buildFence() {
    const w = this.world, p = w.player;
    const g = this.fence = new PIXI.Graphics();
    g.lineStyle({ width: 2, color: paletteColor('grape'), alpha: 0.8 });
    const [x0, y0] = toScreen(-HALF_W + FENCE_INSET, FENCE_Y);
    const [x1, y1] = toScreen(HALF_W - FENCE_INSET, FENCE_BOTTOM);
    g.drawRect(x0, y0, x1 - x0, y1 - y0);
    g.zIndex = 4;
    w.stage.addChild(g);
    // Runs after main.js's player update (registered later), so the clamp
    // lands before the frame renders.
    this.fenceStep = () => {
      const minY = FENCE_Y + p.hitRadius, maxY = FENCE_BOTTOM - p.hitRadius;
      if (p.y < minY) { p.y = minY; p.render(); }
      else if (p.y > maxY) { p.y = maxY; p.render(); }
    };
    w.app.ticker.add(this.fenceStep);
  }

  // Wave N plays part N of the Delta_Unit theme, but only once the wave has
  // finished flying in -- the fly-in itself is beats-only. Started on the
  // beats loop's next 4s seam (both stems share that grid) so they stay in
  // time; the part keeps going through the WAVE CLEAR breather and is cut
  // when the next wave's intro starts.
  startTheme() {
    this.theme = `deltaUnit${this.wave + 1}`;
    this.world.audio.loop(this.theme, THEME_VOLUME, 0.02, { to: 'trapCircleBeats', grid: 4 });
  }

  stopTheme() {
    if (this.theme) this.world.audio.stopLoop(this.theme, 0.3);
    this.theme = null;
  }

  get remaining() { return FLEET_SIZE - this.killed; }

  startWave(i) {
    this.stopTheme();
    this.wave = i;
    const w = WAVES[i];
    const spec = [];
    for (const type of ['C', 'S', 'D']) {
      const n = w[type] || 0;
      for (let k = 0; k < n; k++) spec.push([type, (k - (n - 1) / 2) * COL_GAP, ROW_Y[type]]);
    }
    // Alternate the entry side ship by ship so the wave pours in from both corners.
    spec.forEach(([type, sx, sy], k) => {
      const startX = (k % 2 ? 1 : -1) * rand(HALF_W * 0.45, HALF_W * 0.85);
      this.pending.push([k * ENTER_STAGGER, () => {
        const ship = new FleetShip(this.world, this, type, sx, sy, startX);
        this.world.add(ship);
        this.ships.push(ship);
      }]);
    });
    this.waveT = 0;
    const banner = i === WAVES.length - 1 ? 'FINAL WAVE' : `WAVE ${i + 1}`;
    this.hud.setCenter(banner);
    this.bannerT = 1.2;
  }

  update(dt) {
    if (this.defeated) return;
    this.swayT += dt;
    this.swayX = Math.sin(this.swayT * SWAY_RATE) * SWAY_AMP;

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.hud.setCenter('');
    }

    // count kills
    for (let i = this.ships.length - 1; i >= 0; i--) {
      if (this.ships[i].dead) { this.ships.splice(i, 1); this.killed++; }
    }

    // staggered fly-in of the current wave
    if (this.pending.length) {
      this.waveT += dt;
      while (this.pending.length && this.pending[0][0] <= this.waveT) this.pending.shift()[1]();
    }

    const waveDone = !this.pending.length && !this.ships.length;
    if (waveDone) {
      if (this.wave >= WAVES.length - 1) {
        this.defeated = true;
        this.stopTheme();
        this.world.audio.play('bossDefeat', 0.9);
        return;
      }
      // A cleared wave earns a breather: "WAVE CLEAR", a heal orb (heal.js, the
      // same pickup every level's interludes drop), then the next wave.
      if (!this.resting && this.wave >= 0) {
        this.resting = true;
        this.breakT = WAVE_REST;
        const orb = spawnHealOrb(this.world);
        orb.y = rand(FENCE_Y + 0.6, FENCE_BOTTOM - 0.6); orb.place();
        this.hud.setCenter('WAVE CLEAR');
        this.bannerT = 1.2;
      }
      this.breakT -= dt;
      if (this.breakT <= 0) { this.resting = false; this.startWave(this.wave + 1); }
      return;
    }

    if (!this.theme && !this.pending.length && !this.ships.some(s => s.state === 'enter')) this.startTheme();

    const left = this.ships.length + this.pending.length;
    this.enraged = !this.pending.length && left <= 3;

    // One attack at a time (see ATTACK_GAP): wait until the current
    // attacker(s) are all dead, then send the next -- a lone Commando or a
    // pair of Divebombers.
    const attacking = this.ships.some(s => s.state === 'dive' || s.state === 'pass');
    if (attacking) { this.diveT = ATTACK_GAP; return; }
    this.diveT -= dt;
    if (this.diveT > 0) return;
    const ready = type => this.ships.filter(s => s.state === 'formation' && s.type === type);
    const cs = ready('C'), ds = ready('D');
    if (!cs.length && !ds.length) return;
    if (cs.length && (!ds.length || Math.random() < COMMANDO_CHANCE)) {
      pick(cs).startDive();
    } else {
      for (let i = 0; i < DIVEBOMBER_PAIR && ds.length; i++) ds.splice(Math.floor(Math.random() * ds.length), 1)[0].startDive();
    }
  }

  destroy() {
    this.alive = false;
    this.stopTheme();
    if (this.fenceStep) this.world.app.ticker.remove(this.fenceStep);
    if (this.fence && !this.fence.destroyed) this.fence.destroy();
    for (const s of this.ships) s.destroy();
    this.ships.length = 0;
    this.pending.length = 0;
  }
}
