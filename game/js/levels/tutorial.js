// levels/tutorial.js — each hub stage's own weapon tutorial. Per direct
// request ("Each level starts with tutorial of it's weapon, that also means
// remove 'tutorial' button"): there is no TUTORIAL level any more. A hub
// stage played while still uncleared (so locked to its weapon) runs
// `runWeaponTutorial` right after its title card:
//
//   1. MOVE      — fly around
//   2. SAVE      — [Shift] saves, [Enter] loads (savegame.js); the player
//                  has to save once to go on
//   3. HEAL      — a Kangunroo-style Bang! takes 1 HP, then grab the orb
//   4. the weapon's own course (COURSES) — tap / charge, and how it handles
//                  cyan, dark blue and purple
//   5. AIM       — [C] locks your facing; hit targets in all 8 directions,
//                  each weapon its own way (desktop only: no C on a phone)
//
// Not on a TRY AGAIN or a LOAD (main.js's `world.weaponTutorial`). Practice
// targets score nothing and nothing here can cost a life except walking into
// the LINE SLASHER lesson's beam; HP is refilled when it ends.
import { resetLevelChallenges } from '../achievements.js';
import { Hittable, CYAN, DARKBLUE, PURPLE, toScreen, HALF_W, HALF_H, SCREEN_W, SCREEN_H, PPU } from '../core.js';
import { buildSprite } from '../retro.js';
import { spawnStaticLaser } from '../laser.js';
import { BombShield } from '../bombshield.js';
import { Bullet } from '../bullet.js';
import { BouncyBall } from '../bouncyball.js';
import { input } from '../input.js';
import { spawnHealOrb } from '../heal.js';

const TINT = { [CYAN]: 0x00E6FF, [DARKBLUE]: 0x3355FF };

// A stationary practice target. Not a real hazard: it can't hurt the player
// and scores nothing — it just sits there waiting to be shot. `dead` flips
// true once destroyed (poll it to know the lesson is done).
//   opts.hp      — takes this much damage before dying (LINE SLASHER's
//                  3-slash dark-blue target); default 1, any qualifying hit
//   opts.minHit  — only a single hit of at least this much damage kills it;
//                  anything weaker just clangs off (the Charge Cannon's
//                  10-damage supercharge lesson)
//   opts.shieldOnly — only the CYBER SHOTGUN's BOMB SHIELD spheres hurt it
//                  (the throw lesson); pellets just clang off
//   opts.lockOnly — only an attack made while [C] (aim lock) was held hurts
//                  it (the AIM lesson); anything else just clangs off
//   opts.dashOnly — only LINE SLASHER's DASH hurts it (the slasher's AIM lesson)
//   opts.scale / opts.radius / opts.tint — size and look (the purple shield)
function spawnTarget(world, x, y, color, opts = {}) {
  const t = new Hittable(world, {
    x, y, color, radius: opts.radius || 0.45, hurtsPlayer: false, countsAsProgress: false,
  });
  const sprite = buildSprite('LaserBlock', {
    scale: opts.scale || 3.5, lineWidth: opts.lineWidth || 2, tint: opts.tint || TINT[color],
  });
  const [sx, sy] = toScreen(x, y);
  sprite.position.set(sx, sy);
  sprite.zIndex = 5;
  world.stage.addChild(sprite);
  let hp = opts.hp || 1;
  let flash = 0;
  const blink = () => {
    world.audio.play('bossHurt', 0.5);
    flash = 0.15; sprite.alpha = 0.3;
    const fade = () => {
      flash -= world.app.ticker.deltaMS / 1000;
      if (flash <= 0 || sprite.destroyed) { world.app.ticker.remove(fade); if (!sprite.destroyed) sprite.alpha = 1; }
    };
    world.app.ticker.add(fade);
  };
  const baseDie = t.die.bind(t);
  t.die = (dmg = 1) => {
    if (t.dead) return;
    if (opts.shieldOnly && !(world._updating instanceof BombShield)) { blink(); return; }
    if (opts.minHit && dmg < opts.minHit) { blink(); return; }
    if (opts.dashOnly && !world.player.dashing) { blink(); return; }
    if (opts.lockOnly && !lockOk(world)) {
      blink();
      // A ball that isn't allowed to kill would ping-pong between two ring
      // targets until its lifetime ran out, holding up the ball cap: it breaks.
      if (world._updating instanceof BouncyBall) world._updating.life = 0;
      return;
    }
    hp -= dmg;
    if (hp > 0) { blink(); return; }
    world.audio.play(color === DARKBLUE ? 'destroyIndigo' : 'destroyCyan', 0.6);
    baseDie();
  };
  // destroy() (also what world.clearEntities() calls) takes the sprite with it
  t.destroy = () => {
    t.dead = true;
    if (!sprite.destroyed) sprite.destroy({ children: true });
    const i = world.hittables.indexOf(t);
    if (i >= 0) world.hittables.splice(i, 1);
  };
  t.onDie = () => t.destroy();
  return t;
}

// Was [C] held for the attack that's hitting right now? A shot, ball or
// thrown BOMB SHIELD is stamped by the AIM lesson's tracker (below) the
// first frame it's seen; anything unstamped (a SLASH, a DASH, a shot on
// its very first frame) reads the key as it is now.
function lockOk(world) {
  const u = world._updating;
  if (u instanceof BombShield) return u._lockThrow !== undefined ? u._lockThrow : input.isDown('lock');
  if (u && u._lockSeen !== undefined) return u._lockSeen;
  return input.isDown('lock');
}
function spawnLockTracker(world) {
  const t = {
    update() {
      for (const u of world.updatables) {
        if ((u instanceof Bullet || u instanceof BouncyBall) && u._lockSeen === undefined) u._lockSeen = input.isDown('lock');
      }
      const sh = world.playerShield;
      if (sh && sh.state === 'thrown' && sh._lockThrow === undefined) sh._lockThrow = input.isDown('lock');
    },
    destroy() { t.alive = false; },
  };
  world.add(t);
}

// A purple shield: a big unkillable block parked in front of a target, so
// each weapon can show how it deals with PURPLE (torpedo pierces it, a pellet
// breaks on it, a ball ricochets off it).
const spawnShield = (world, x, y) =>
  spawnTarget(world, x, y, PURPLE, { scale: 5.5, radius: 0.7, lineWidth: 3, tint: 0xB300FF });

// The shield lessons only teach anything if the player can't just fly up
// past the shield and shoot the target from the side. A faint dashed line
// across the screen (FENCE_Y, just under the lesson text) that the player
// can't cross: their own ticker step runs after main.js's player update
// (registered later) and clamps them back below it, before the frame
// renders. It's an updatable with destroy(), so the lesson's own
// clearEntities() removes it with everything else.
const FENCE_Y = -0.2;
function spawnFence(world) {
  const p = world.player;
  const minY = FENCE_Y + p.hitRadius;
  if (p.y < minY + 1) { p.y = minY + 1.5; p.render(); }
  const g = new PIXI.Graphics();
  g.lineStyle({ width: 2, color: 0xffffff, alpha: 0.35 });
  const [, sy] = toScreen(0, FENCE_Y);
  for (let x = 0; x < SCREEN_W; x += 24) g.moveTo(x, sy).lineTo(x + 12, sy);
  g.zIndex = 4;
  world.stage.addChild(g);
  const step = () => { if (p.y < minY) { p.y = minY; p.render(); } };
  world.app.ticker.add(step);
  const fence = {
    update() {},
    destroy() {
      world.app.ticker.remove(step);
      if (!g.destroyed) g.destroy();
      fence.alive = false;
    },
  };
  world.add(fence);
}

// A shield lesson's setup: the purple shield, its target tucked behind it
// (above the line, so the only shots are through or around the shield), and
// the fence keeping the player below.
function shieldSetup(world, color) {
  spawnFence(world);
  spawnShield(world, -2.5, -3.0);
  return [spawnTarget(world, -2.5, -4.3, color)];
}

// The BOMB SHIELD lesson's practice fire: a purple turret that lobs slow
// dots at the player. A dot that reaches an orbiting shield is blocked
// (one sphere used up, as in a real fight) and counted; one that reaches the
// player without a shield does no damage, it just tells them to raise it —
// a tutorial shouldn't cost a life for not knowing the trick yet.
const DOT_SPEED = 2.6, DOT_EVERY = 1.1, DOT_R = 0.12;
function spawnTurret(world, hud, x, y) {
  spawnTarget(world, x, y, PURPLE, { tint: 0xB300FF });
  const turret = { blocked: 0, t: 0.6, dots: [], alive: true };
  const g = new PIXI.Graphics();
  g.zIndex = 5;
  world.stage.addChild(g);
  let nag = 0;
  turret.update = dt => {
    const p = world.player;
    turret.t -= dt;
    if (turret.t <= 0) {
      turret.t = DOT_EVERY;
      const dx = p.x - x, dy = p.y - y, m = Math.hypot(dx, dy) || 1;
      turret.dots.push({ x, y: y + 0.4, vx: dx / m * DOT_SPEED, vy: dy / m * DOT_SPEED });
    }
    nag = Math.max(0, nag - dt);
    if (world.playerShield && !world.playerShield.dead) nag = 0;   // raised: drop the hint at once
    g.clear();
    g.lineStyle({ width: 2, color: 0xB300FF });
    turret.dots = turret.dots.filter(d => {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (Math.abs(d.x) > HALF_W + 1 || Math.abs(d.y) > HALF_H + 1) return false;
      const sh = world.playerShield;
      if (sh && !sh.dead && sh.state === 'orbit' && Math.hypot(d.x - p.x, d.y - p.y) <= 0.65 + DOT_R) {
        if (sh.blockHit()) turret.blocked++;
        return false;
      }
      if (Math.hypot(d.x - p.x, d.y - p.y) <= p.hitRadius + DOT_R) {
        world.audio.play('ricochet', 0.5);
        if (nag <= 0) { hud.setPhaseText(world.isMobile ? 'NO SHIELD - HOLD FIRE' : 'NO SHIELD - HOLD Z TO RAISE IT'); nag = 2.5; }
        return false;
      }
      const [sx, sy] = toScreen(d.x, d.y);
      g.drawCircle(sx, sy, DOT_R * PPU);
      return true;
    });
    if (nag <= 0) hud.setPhaseText('BLOCKED ' + turret.blocked + ' / 2');
  };
  turret.destroy = () => {
    turret.alive = false;
    if (!g.destroyed) g.destroy();
    hud.setPhaseText('');
  };
  world.add(turret);
  return turret;
}

// Lesson text is written for a keyboard; a phone says FIRE instead.
const say = (world, text) => world.isMobile
  ? text.replace(/Z \/ SPACE/g, 'FIRE').replace(/HOLD Z\b/g, 'HOLD FIRE') : text;

// Show a lesson's message, wait until every target in it is dead, then
// clear the field for the next one.
async function lesson(world, hud, text, targets) {
  const p = world.player;
  hud.setCenter(say(world, text));
  await world.waitUntil(() => p.dead || targets.every(t => t.dead));
  if (p.dead) return false;
  hud.setCenter('');
  world.clearEntities();
  await world.wait(0.5);
  return !p.dead;
}

// --- the four weapon-specific courses --------------------------------------
// Each teaches its own weapon's taps, charge, and how it handles each colour.
// Targets sit at y -2.6..-3.4 (screen-y ~110-170), clear of hud.center's
// message block (centred on screen-y 260).

// CHARGE CANNON: tap / torpedo / supercharge.
async function chargeCannonCourse(world, hud) {
  const W = world;
  if (!await lesson(W, hud, 'CYAN DIES TO ANY SHOT\nTAP  Z / SPACE',
    [spawnTarget(W, -2.4, -2.6, CYAN), spawnTarget(W, 0, -3.0, CYAN), spawnTarget(W, 2.4, -2.6, CYAN)])) return false;
  if (!await lesson(W, hud, 'DARK BLUE NEEDS A TORPEDO\nHOLD Z / SPACE, THEN LET GO',
    [spawnTarget(W, -1.6, -2.6, DARKBLUE), spawnTarget(W, 1.6, -2.6, DARKBLUE)])) return false;
  if (!await lesson(W, hud, 'TORPEDOES PIERCE PURPLE\nFIRE THROUGH IT FROM BELOW',
    shieldSetup(W, DARKBLUE))) return false;
  return lesson(W, hud, 'HOLD EVEN LONGER, LET GO\nWHEN THE SHIP PULSES: 10 DMG',
    [spawnTarget(W, 0, -3.0, DARKBLUE, { minHit: 10, scale: 5, radius: 0.65 })]);
}

// CYBER SHOTGUN: tap volleys, pellets kill dark blue, break on purple, then
// the charged BOMB SHIELD: it blocks hits, and moving throws it for combos.
async function shotgunCourse(world, hud) {
  const W = world;
  if (!await lesson(W, hud, 'TAP FOR A 3-PELLET VOLLEY\nONE BLAST, WHOLE CLUSTER',
    [spawnTarget(W, -0.5, -3.0, CYAN), spawnTarget(W, 0, -3.3, CYAN), spawnTarget(W, 0.5, -3.0, CYAN)])) return false;
  if (!await lesson(W, hud, 'PELLETS KILL DARK BLUE\nNO CHARGING NEEDED',
    [spawnTarget(W, -2.4, -2.6, DARKBLUE), spawnTarget(W, 2.4, -2.6, DARKBLUE)])) return false;
  if (!await lesson(W, hud, 'PELLETS BREAK ON PURPLE\nANGLE PAST IT FROM BELOW',
    shieldSetup(W, CYAN))) return false;
  // BOMB SHIELD, part 1: it blocks hits while it orbits you.
  const p = W.player;
  p.x = 0; p.y = 2.5; p.render();
  const turret = spawnTurret(W, hud, 0, -3.3);
  if (!await lesson(W, hud, 'HOLD, LET GO: BOMB SHIELD\nSTAND STILL - IT BLOCKS HITS',
    [{ get dead() { return turret.blocked >= 2; } }])) return false;
  // part 2: moving throws it, and every sphere hits for 2 — line them up.
  if (W.playerShield) W.playerShield.destroy();
  p.x = 2.2; p.y = 1.6; p.render();
  if (!await lesson(W, hud, 'RAISE IT, MOVE TO THROW IT\nONE THROW, WHOLE ROW: COMBO',
    [-0.8, -2.2, -3.6, -5.0].map(x => spawnTarget(W, x, 1.6, DARKBLUE, { hp: 2, shieldOnly: true })))) return false;
  hud.setCenter('THE SHOTGUN SLOWS YOU DOWN\nAND RELOADS AFTER EACH SHOT');
  await W.wait(2.6);
  hud.setCenter('');
  return !W.player.dead;
}

// BOUNCY BALL: tap balls, charged balls (dark blue, edge bounces), purple ricochets.
async function bouncyCourse(world, hud) {
  const W = world;
  if (!await lesson(W, hud, 'TAP: THE BALL BOUNCES OFF\nWHATEVER IT KILLS',
    [spawnTarget(W, -2.4, -2.6, CYAN), spawnTarget(W, 0, -3.0, CYAN), spawnTarget(W, 2.4, -2.6, CYAN)])) return false;
  if (!await lesson(W, hud, 'FULL CHARGE KILLS DARK BLUE\nAND BOUNCES OFF THE EDGES',
    [spawnTarget(W, -4.6, -3.4, DARKBLUE), spawnTarget(W, 4.6, -3.4, DARKBLUE)])) return false;
  return lesson(W, hud, 'BALLS RICOCHET OFF PURPLE\nANGLE PAST IT FROM BELOW',
    shieldSetup(W, CYAN));
}

// LINE SLASHER: slash up close, 3 slashes for dark blue, dash through hazards.
async function slasherCourse(world, hud) {
  const W = world, p = W.player;
  if (!await lesson(W, hud, 'GET CLOSE, TAP TO SLASH\nSHORT RANGE, WIDE ARC',
    [spawnTarget(W, -2.4, -2.6, CYAN), spawnTarget(W, 0, -3.0, CYAN), spawnTarget(W, 2.4, -2.6, CYAN)])) return false;
  if (!await lesson(W, hud, 'SLASHES CUT DARK BLUE TOO\nBUT ONLY 1 DAMAGE EACH',
    [spawnTarget(W, 0, -3.0, DARKBLUE, { hp: 3, scale: 5, radius: 0.65 })])) return false;
  // A laser gate between the player and the last target: a charged release
  // DASHES, and the dash is invulnerable, so it carries you through the beam.
  p.x = -4; p.y = 1; p.render();
  spawnStaticLaser(W, 0, 'up', { noBlock: true });   // no block: the dash is the only way through
  const last = spawnTarget(W, 4, 1, CYAN);
  return lesson(W, hud, 'CHARGE + LET GO TO DASH\nDASHES PASS THROUGH BEAMS', [last]);
}

// HEAL: a hit out of nowhere (Kangunroo's own Bang! — the pink flash and
// its sound), then a green orb to grab. The hit can't kill: it never takes
// the last HP. Orbs that lapse are replaced until one is picked up.
async function healLesson(world, hud) {
  const W = world, p = W.player;
  const flash = new PIXI.Graphics();
  flash.beginFill(0xff00d4).drawRect(0, 0, SCREEN_W, SCREEN_H).endFill();
  flash.zIndex = 200;
  W.stage.addChild(flash);
  let a = 0.9;
  const fade = () => {
    a -= W.app.ticker.deltaMS / 1000 * 5;
    if (a <= 0 || flash.destroyed) { W.app.ticker.remove(fade); if (!flash.destroyed) flash.destroy(); return; }
    flash.alpha = a;
  };
  flash.alpha = a;
  W.app.ticker.add(fade);
  W.audio.play('kangBang', 0.6);
  if (p.hp > 1) p.hp -= 1;
  await W.wait(0.6);
  if (p.dead) return false;
  const before = W.healOrbsCollected || 0;
  hud.setCenter('OUCH! GREEN ORBS HEAL YOU\nTOUCH IT: +1 HP');
  let orb = spawnHealOrb(W);
  await W.waitUntil(() => {
    if (p.dead || (W.healOrbsCollected || 0) > before) return true;
    if (!orb.alive) orb = spawnHealOrb(W);
    return false;
  });
  W.healOrbsCollected = before;   // practice orbs don't feed Plasmadrache's chomp
  hud.setCenter('');
  W.clearEntities();
  await W.wait(0.5);
  return !p.dead;
}

// AIM: [C] holds your facing while you move, so you can strafe and keep
// shooting the same way. Desktop only (a phone's stick aims as it moves,
// and there's no C button). Eight targets around the player, one per
// direction; each weapon puts its own spin on it:
//   CHARGE CANNON — plain target practice, any shot made while holding C
//   CYBER SHOTGUN — toss the BOMB SHIELD at each one (held C aims the throw)
//   BOUNCY BALL   — two rings of 16: tap-spam balls, they bounce on
//   LINE SLASHER  — DASH through each one
const AIM_CX = 0, AIM_CY = 0.9;
const DIRS8 = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
const AIM_TEXT = {
  default: 'HOLD C TO LOCK YOUR AIM\nSHOOT ALL 8 WAYS WITH C HELD',
  shotgun: 'HOLD C TO LOCK YOUR AIM\nTOSS THE SHIELD ALL 8 WAYS',
  bouncy: 'HOLD C TO LOCK YOUR AIM\nSPAM BALLS ALL 8 WAYS',
  lineslasher: 'HOLD C TO LOCK YOUR AIM\nDASH ALL 8 WAYS',
};
async function aimLesson(world, hud, weaponId) {
  const W = world, p = W.player;
  p.x = AIM_CX; p.y = AIM_CY; p.render();
  spawnLockTracker(W);
  const ring = (r, color, opts) => DIRS8.map(([dx, dy]) =>
    spawnTarget(W, AIM_CX + dx * r, AIM_CY + dy * r, color, { lockOnly: true, ...opts }));
  let targets;
  if (weaponId === 'shotgun') targets = ring(2.6, DARKBLUE, { hp: 2, shieldOnly: true });
  else if (weaponId === 'bouncy') targets = [...ring(2.0, CYAN), ...ring(3.4, CYAN)];
  else if (weaponId === 'lineslasher') targets = ring(2.4, CYAN, { dashOnly: true });
  else targets = ring(2.6, CYAN);
  // The ring overlaps the lesson text, so the text only shows for a few
  // seconds; the phase line keeps the count.
  hud.setCenter(say(W, AIM_TEXT[weaponId] || AIM_TEXT.default));
  const shownAt = W.time;
  await W.waitUntil(() => {
    if (W.time - shownAt > 4 && hud.center && hud.center.text) hud.setCenter('');
    hud.setPhaseText('HOLD C  ' + targets.filter(t => t.dead).length + ' / ' + targets.length);
    return p.dead || targets.every(t => t.dead);
  });
  hud.setCenter('');
  hud.setPhaseText('TUTORIAL');
  if (W.playerShield) W.playerShield.destroy();
  W.clearEntities();
  await W.wait(0.5);
  return !p.dead;
}

const COURSES = {
  default: chargeCannonCourse, shotgun: shotgunCourse, bouncy: bouncyCourse, lineslasher: slasherCourse,
};

// Runs the weapon's tutorial. Resolves true when it's done (false if the
// player died), with the field cleared and the player back at the start.
export async function runWeaponTutorial(world, hud, weaponId) {
  const p = world.player, m = world.isMobile;
  hud.setPhaseText('TUTORIAL');

  // 1. MOVE — wait until the player actually flies somewhere.
  hud.setCenter(m ? 'MOVE\nDRAG THE STICK' : 'MOVE\nARROWS / WASD');
  const sx = p.x, sy = p.y;
  await world.waitUntil(() => p.dead || Math.hypot(p.x - sx, p.y - sy) > 1.8);
  if (p.dead) return false;
  hud.setCenter(''); await world.wait(0.4);

  // 2. SAVE — save once to go on (savegame.js flashes GAME SAVED).
  let saved = false;
  world.onGameSaved = () => { saved = true; };
  hud.setCenter(m ? 'SAVE ANY TIME: TAP SAVE\nTAP LOAD TO GO BACK TO IT' : 'SAVE ANY TIME: SHIFT\nPRESS ENTER TO LOAD IT');
  await world.waitUntil(() => p.dead || saved);
  world.onGameSaved = null;
  if (p.dead) return false;
  await world.wait(1.0);
  hud.setCenter('YOUR SAVE STAYS AFTER YOU QUIT\nLOAD GAME IS ON THE TITLE SCREEN');
  await world.wait(3.0);
  hud.setCenter(''); await world.wait(0.4);

  // 3. HEAL — a hit, then a green orb to grab.
  if (!await healLesson(world, hud)) return false;

  // 4. The weapon's own course.
  const course = COURSES[weaponId];
  if (course && !await course(world, hud)) return false;

  // 5. AIM — [C] in all 8 directions, the weapon's own way (desktop only).
  if (!m && !await aimLesson(world, hud, weaponId)) return false;

  world.clearEntities();
  hud.setPhaseText('');
  hud.setCenter('TUTORIAL COMPLETE\nGOOD LUCK!');
  await world.wait(2.0);
  hud.setCenter('');
  if (p.dead) return false;
  p.hp = p.maxHP;
  p.x = 0; p.y = 2.5; p.facing = { x: 1, y: 0 }; p.render();
  resetLevelChallenges(world);   // the lessons' taps and heals don't count against the stage
  return true;
}
