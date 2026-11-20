// endless.js — ENDLESS MODE, per direct request: "If this game is so short,
// why'd people would keep playing? And that's where Endless Mode comes into
// play. In it randomise attacks, but make it so it won't be impossible.
// Bosses will be after each 4 phases (each phase of 1 boss in this mode will
// count as it's own boss battle)". Plus the author's rules for this mode:
//   1. Kangunroo Delta's jumping phase much easier, with spam attacks added
//   2. Trap Circle (SHAPE LIMBO's, not Delta) follows the player
//   3. no Kangunroo Delta phase 2 (the duel is just the normal K.A.N.G fight)
//   4. the purple and pink crystals (24-cell / 120-cell) are attacks, nerfed
//   5. crystal extractions (with the mothership that isn't THE FINALE's
//      phase 1) are bosses, without the bombs/lasers the levels use
//   6. the Delta Unit's three ship types are three separate attacks
//
// How a run goes: ROUND 1, 2, ... Each round is four attack PHASES, then a
// BOSS. A phase is PHASE_TIME seconds of 1–3 attacks picked at random under
// a danger budget that grows a little every round (capped), with rules that
// keep a mix fair (one centre-screen hazard at most, the big ones alone).
// A heal-orb breather sits before every phase and boss. One life, the
// difficulty picked on the title screen, every weapon free with [V]. Score
// counts as usual; the best round/score are kept on this device.
import { HALF_W, HALF_H, rand, randInt, edgeSpawn } from '../core.js';
import { bossWarning, breather, startStarfield, showmanDeltaMaze } from './outerspace.js';
import { spawnMeteorBatch } from '../meteor.js';
import { Bomb } from '../bomb.js';
import { spawnLaser, spawnVerticalLaser } from '../laser.js';
import { splashBurst } from '../splash.js';
import { spawnPress } from '../press.js';
import { Saw } from '../saw.js';
import { Crock, QUARTERS } from '../crock.js';
import { Beam } from '../beam.js';
import { spawnPirania } from '../pirania.js';
import { spawnDevilFish } from '../devilfish.js';
import { spawnAtom } from '../atom.js';
import { Corn } from '../corn.js';
import { FireworkRocket } from '../firework.js';
import { Clown } from '../clown.js';
import { spawnDartWave } from '../dart.js';
import { Knight } from '../knight.js';
import { Ghost } from '../ghost.js';
import { spawnFlame } from '../flame.js';
import { spawnSpear } from '../spear.js';
import { spawnGemWarning } from '../gemwarning.js';
import { Wheel } from '../wheel.js';
import { spawnAsteroid } from '../asteroid.js';
import { spawnComet } from '../comet.js';
import { Disruptor } from '../disruptor.js';
import { FleetShip } from '../fleet.js';
import { loadPoly, unloadPoly, PolyField, PolyHazard } from '../polytope.js';
import { TrapWheel } from '../boss.js';
import { Kangaroo } from '../kangaroo.js';
import { Showman } from '../showman.js';
import { ForceField } from '../forcefield.js';
import { Plasmadrache } from '../plasmadrache.js';
import { TrapCircleDelta } from '../trapcircledelta.js';
import { KangunrooDelta } from '../kangunroodelta.js';
import { PlasmadracheDelta } from '../plasmadrachedelta.js';
import { MothershipBoss, DEFEAT_SEQUENCE_TIME } from '../finale.js';
import { DeltaBoss, startSphereBackdrop } from '../delta.js';
import { Crystal } from '../crystal.js';
import { Mothership, MothershipChase } from '../mothership.js';

const PHASE_TIME = 20;          // seconds per attack phase
const PHASES_PER_ROUND = 4;
const BUDGET_START = 2, BUDGET_MAX = 5;   // danger points per phase; +1 every 2 rounds
const PACE_STEP = 0.04, PACE_MAX = 1.3;   // spawn rates speed up 4% a round, at most 30%
const RECORD_KEY = 'agbt_endless_record';
const START_KEY = 'agbt_endless';

// --- the record (this device) and TRY AGAIN's straight-back-in flag ---
export function getEndlessRecord() {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY)) || null; } catch (e) { return null; }
}
// Keeps the best round reached and the best score, separately.
export function submitEndlessRecord(round, score) {
  const old = getEndlessRecord() || { round: 0, score: 0 };
  const rec = { round: Math.max(old.round, round), score: Math.max(old.score, score) };
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(rec)); } catch (e) {}
  return { record: rec, newRound: round > old.round, newScore: score > old.score };
}
export function requestEndlessStart() { try { sessionStorage.setItem(START_KEY, '1'); } catch (e) {} }
export function consumeEndlessStart() {
  try { const v = sessionStorage.getItem(START_KEY) === '1'; sessionStorage.removeItem(START_KEY); return v; } catch (e) { return false; }
}

// A repeating spawner: calls `fn` every `every` seconds (the first after `first`).
const every = (first, gap, fn) => {
  let next = first;
  return (t, pace) => { while (t >= next) { fn(); next += gap / pace; } };
};
// Keep up to `cap` of something alive, topping up every `gap` seconds.
const keep = (cap, gap, make) => {
  const alive = []; let next = 0.5;
  return (t, pace) => {
    for (let i = alive.length - 1; i >= 0; i--) if (alive[i].dead) alive.splice(i, 1);
    if (alive.length < cap && t >= next) { const e = make(); if (e) alive.push(e); next = t + gap / pace; }
  };
};
// A spawn spot on an edge that isn't right next to the player.
function spotAwayFromPlayer(w, minD = 3) {
  const p = w.player;
  for (let i = 0; i < 10; i++) {
    const s = edgeSpawn();
    if (!p || Math.hypot(s.x - p.x, s.y - p.y) >= minD) return s;
  }
  return edgeSpawn();
}
function stubFleet() { return { swayX: 0, enraged: false }; }

// ---- the attacks ----
// cost: danger points against the phase budget. center: occupies the middle
// of the screen (at most one per phase). solo: only ever on its own (or with
// one 1-point attack, for `withLight`). setup(w) runs once, returns a tick.
// `extract: false` keeps it out of crystal extractions (rule 5).
const ATTACKS = {
  meteors:   { name: 'METEORS', cost: 1, setup: w => every(0.5, 5, () => spawnMeteorBatch(w, 3)) },
  bombs:     { name: 'BOMBS', cost: 1, extract: false, setup: w => {
    for (let i = 0; i < 3; i++) { const s = spotAwayFromPlayer(w); w.add(new Bomb(w, s.x * 0.7, s.y * 0.7)); }
    return () => {}; } },
  lasers:    { name: 'LASERS', cost: 2, extract: false, setup: w => { let n = 0;
    return every(0.5, 6, () => spawnLaser(w, n++ % 2 ? 'right' : 'left')); } },
  vlasers:   { name: 'VERTICAL LASERS', cost: 2, extract: false, setup: w =>
    every(0.5, 6, () => spawnVerticalLaser(w, Math.random() < 0.5 ? 'top' : 'bottom')) },
  splash:    { name: 'SPLASH', cost: 1, setup: w => every(1.5, 5, () => splashBurst(w)) },
  presses:   { name: 'PRESSES', cost: 2, setup: w => every(0.5, 1.6, () => spawnPress(w, { slow: 1.5 })) },
  saw:       { name: 'SAW', cost: 2, center: true, setup: w => { w.add(new Saw(w, 0, 0)); return () => {}; } },
  crock:     { name: 'C.R.O.C.K.', cost: 2, setup: w => { let last = -1;
    return every(0.5, 5, () => { let q; do { q = randInt(4); } while (q === last); last = q; w.add(new Crock(w, QUARTERS[q])); }); } },
  beam:      { name: 'BEAM', cost: 3, center: true, setup: w => { w.add(new Beam(w)); return () => {}; } },
  piranhas:  { name: 'PIRANHAS', cost: 1, setup: w => every(1, 2.2, () => spawnPirania(w)) },
  devilfish: { name: 'DEVIL FISH', cost: 1, setup: w => every(0.5, 1.1, () => spawnDevilFish(w)) },
  atoms:     { name: 'ATOMS', cost: 2, setup: w => every(1, 2.6, () => spawnAtom(w)) },
  corn:      { name: 'CORN', cost: 2, setup: w => { w.add(new Corn(w)); return () => {}; } },
  fireworks: { name: 'FIREWORKS', cost: 1, setup: w => keep(2, 2.5, () => w.add(new FireworkRocket(w, rand(-HALF_W * 0.75, HALF_W * 0.75)))) },
  clown:     { name: 'CLOWN', cost: 1, setup: w => keep(1, 3, () => w.add(new Clown(w))) },
  darts:     { name: 'DARTS', cost: 2, setup: w => { const darts = []; return every(0.5, 5, () => spawnDartWave(w, darts, 1)); } },
  knights:   { name: 'KNIGHTS', cost: 2, setup: w => keep(1, 1.5, () => { const s = spotAwayFromPlayer(w); return w.add(new Knight(w, s.x, s.y)); }) },
  ghosts:    { name: 'GHOSTS', cost: 2, setup: w => keep(2, 3, () => { const s = spotAwayFromPlayer(w); return w.add(new Ghost(w, s.x, s.y)); }) },
  flames:    { name: 'FLAMES', cost: 1, setup: w => { w.audio.loop('flameIdle', 0.12); return every(0.5, 2.8, () => spawnFlame(w)); },
               stop: w => w.audio.stopLoop('flameIdle') },
  spears:    { name: 'SPEARS', cost: 1, setup: w => every(1, 2.2, () => spawnSpear(w)) },
  gems:      { name: 'GEM WALLS', cost: 2, walls: true, setup: w => every(1, 2.4, () => spawnGemWarning(w)) },
  wheel:     { name: 'THE WHEEL', cost: 3, center: true, solo: true, setup: w => { w.add(new Wheel(w, 0, 0)); return () => {}; } },
  asteroids: { name: 'ASTEROIDS', cost: 1, setup: w => every(0.5, 4, () => spawnAsteroid(w)) },
  comets:    { name: 'COMETS', cost: 1, setup: w => every(1, 3.5, () => spawnComet(w)) },
  disruptor: { name: 'DISRUPTOR', cost: 2, center: true, setup: w => { w.add(new Disruptor(w, 0, -1)); return () => {}; } },
  // Rule 6: the Delta Unit's ships, one attack per type, never in formation.
  divebombers: { name: 'DIVEBOMBERS', cost: 2, setup: w => keep(2, 3, () => {
    const s = w.add(new FleetShip(w, stubFleet(), 'D', 0, 0, 0));
    s.x = rand(-HALF_W * 0.8, HALF_W * 0.8); s.y = -HALF_H - 0.8; s.heading = Math.PI / 2; s.startDive();
    return s; }) },
  shooters:  { name: 'SHOOTERS', cost: 2, setup: w => keep(3, 2.5, () => {
    const slotX = rand(-HALF_W * 0.75, HALF_W * 0.75), slotY = rand(-HALF_H + 0.8, -HALF_H + 1.8);
    return w.add(new FleetShip(w, stubFleet(), 'S', slotX, slotY, slotX < 0 ? HALF_W * 0.6 : -HALF_W * 0.6)); }) },
  commando:  { name: 'COMMANDO', cost: 2, setup: w => keep(1, 3, () => {
    const s = w.add(new FleetShip(w, stubFleet(), 'C', 0, 0, 0));
    s.x = rand(-HALF_W * 0.8, HALF_W * 0.8); s.y = -HALF_H - 0.8; s.heading = Math.PI / 2; s.startDive();
    return s; }) },
  // Rule 4: the purple 24-cell and the pink 120-cell, nerfed (polytope.js's
  // `nerf`: smaller, slower, 1 HP a touch). Their sprite sheets load first.
  cell24:    { name: 'PURPLE CRYSTAL', cost: 2, center: true, poly: 'icositetrachoron',
               setup: (w, data) => { w.add(new PolyHazard(w, 'icositetrachoron', data, { nerf: true })); return () => {}; } },
  cell120:   { name: 'PINK CRYSTAL', cost: 3, center: true, poly: 'hecatonicosachoron',
               setup: (w, data) => { w.add(new PolyHazard(w, 'hecatonicosachoron', data, { nerf: true })); return () => {}; } },
};
export const ATTACK_IDS = Object.keys(ATTACKS);

// Pick a fair mix under `budget` danger points.
export function pickAttacks(budget, opts = {}) {
  const pool = ATTACK_IDS.filter(id => !(opts.exclude || []).includes(id) && !(opts.extract && ATTACKS[id].extract === false));
  for (let tries = 0; tries < 40; tries++) {
    const chosen = [];
    let left = budget, center = !!opts.noCenter, solo = false;
    const order = pool.slice().sort(() => Math.random() - 0.5);
    for (const id of order) {
      const a = ATTACKS[id];
      if (a.cost > left || chosen.length >= 3) continue;
      if (a.center && center) continue;
      if (a.solo && chosen.length) continue;
      if (solo && a.cost > 1) continue;
      if (a.walls && chosen.some(c => ATTACKS[c].center || ATTACKS[c].walls)) continue;
      if (a.center && chosen.some(c => ATTACKS[c].walls)) continue;
      if (a.poly && chosen.some(c => ATTACKS[c].poly)) continue;
      chosen.push(id); left -= a.cost;
      if (a.center) center = true;
      if (a.solo) { solo = true; left = Math.min(left, 1); }
      if (left <= 0) break;
    }
    if (chosen.length && !(opts.last && chosen.slice().sort().join() === opts.last)) return chosen;
  }
  return ['meteors'];
}

// Start a set of attacks; returns { tick(t), stop() }.
async function startAttacks(w, ids, pace) {
  const ticks = [];
  // A centre-screen hazard (saw, beam, wheel, ...) never appears on top of you.
  const p = w.player;
  if (ids.some(id => ATTACKS[id].center) && p && Math.hypot(p.x, p.y) < 3) { p.x = -3; p.y = 2.8; p.render(); }
  for (const id of ids) {
    const a = ATTACKS[id];
    const data = a.poly ? await loadPoly(a.poly) : null;
    ticks.push(a.setup(w, data));
  }
  return {
    tick: t => { for (const f of ticks) f(t, pace); },
    stop: () => { for (const id of ids) { const a = ATTACKS[id]; if (a.stop) a.stop(w); if (a.poly) unloadPoly(a.poly); } },
  };
}

// Run some attacks alongside a fight until `done()` is true (used by the
// bosses that get spam: Kangunroo Delta, the crystal extractions).
function spamWhile(w, att, done) {
  return new Promise(resolve => {
    let t = 0;
    const step = () => {
      if (w.paused) return;
      t += Math.min(w.app.ticker.deltaMS / 1000, 0.05);
      att.tick(t);
      if (done() || w.player.dead) { w.app.ticker.remove(step); resolve(); }
    };
    w.app.ticker.add(step);
  });
}

// ---- the bosses (each phase of a multi-phase boss is its own) ----
async function warn(w, hud, startY = 2.5) {
  const p = w.player;
  w.clearEntities();
  p.x = 0; p.y = startY; p.frozen = true; p.render();
  hud.setPhaseText('');
  await bossWarning(w, hud);
  p.frozen = false;
}
const slotBoss = (w, boss) => { w.add(boss); let won = false; boss.onDefeated = () => { won = true; }; return () => won || w.player.dead; };

const BOSSES = {
  trapwheel: { name: 'TRAP CIRCLE', run: async (w, hud) => {
    await warn(w, hud, 0); if (w.player.dead) return;
    await w.waitUntil(slotBoss(w, new TrapWheel(w, { follow: true })));
  } },
  kang: { name: 'K.A.N.G', run: async (w, hud) => {
    await warn(w, hud, 2.4); if (w.player.dead) return;
    w.player.frozen = true;
    const boss = w.add(new Kangaroo(w, hud));
    await w.waitUntil(() => boss.defeated || w.player.dead);
    w.player.frozen = false;
  } },
  showman: { name: 'SHOWMAN', run: async (w, hud) => {
    await warn(w, hud); if (w.player.dead) return;
    const showman = w.add(new Showman(w, true));
    let field = null;
    const newField = () => { field = w.add(new ForceField(w)); field.onReset = () => { field.destroy(); field = null; }; };
    newField();
    w.audio.play('showmanVoice', 0.8);
    w.audio.loop('showmanTheme', 0.55);
    const att = await startAttacks(w, ['meteors', 'clown'], 1);
    try {
      await spamWhile(w, att, () => {
        if (!field || field.dead) newField();   // a touched or closed field starts over
        hud.setPhaseText('SHOWMAN  ' + Math.max(0, showman.hp));
        return showman.dead;
      });
    } finally { att.stop(); w.audio.stopLoop('showmanTheme'); }
  } },
  plasmadrache: { name: 'PLASMADRACHE', run: async (w, hud) => {
    await warn(w, hud); if (w.player.dead) return;
    const boss = w.add(new Plasmadrache(w, 0, -1.3));
    w.audio.loop('plasmaTheme', 0.5);
    try { await w.waitUntil(() => { hud.setPhaseText('PLASMADRACHE  ' + Math.max(0, boss.hp)); return boss.dead || w.player.dead; }); }
    finally { w.audio.stopLoop('plasmaTheme'); hud.setNearHp(''); }
  } },
  trapcircledelta: { name: 'TRAP CIRCLE DELTA', run: async (w, hud) => {
    await warn(w, hud, 0); if (w.player.dead) return;
    await w.waitUntil(slotBoss(w, new TrapCircleDelta(w)));
  } },
  kangunroodelta: { name: 'KANGUNROO DELTA', run: async (w, hud, round) => {
    await warn(w, hud, 0); if (w.player.dead) return;
    const done = slotBoss(w, new KangunrooDelta(w, hud, { easy: true }));   // rules 1 and 3
    const att = await startAttacks(w, pickAttacks(1 + Math.min(1, Math.floor(round / 3)), { noCenter: true }), 1);
    try { await spamWhile(w, att, done); } finally { att.stop(); }
  } },
  showmandelta: { name: 'SHOWMAN DELTA', run: async (w, hud) => {
    await showmanDeltaMaze(w, hud, 'SHOWMAN DELTA');
  } },
  plasmadeltabody: { name: 'PLASMADRACHE DELTA', run: async (w, hud) => {
    await warn(w, hud, HALF_H - 0.8); if (w.player.dead) return;
    const boss = w.add(new PlasmadracheDelta(w, 0, 0, { only: 1 }));
    w.audio.loop('plasmaDeltaTheme', 0.5);
    try { await w.waitUntil(() => { hud.setPhaseText('PLASMADRACHE DELTA  ' + Math.max(0, boss.hp)); return boss.dead || w.player.dead; }); }
    finally { w.audio.stopLoop('plasmaDeltaTheme'); }
  } },
  plasmadeltahead: { name: 'PLASMADRACHE DELTA HEAD', run: async (w, hud) => {
    await warn(w, hud, HALF_H - 0.8); if (w.player.dead) return;
    const boss = w.add(new PlasmadracheDelta(w, 0, -HALF_H, { only: 2 }));   // far from the player: touching the head is a nom
    try { await w.waitUntil(() => { hud.setPhaseText('PLASMADRACHE DELTA  ' + Math.max(0, boss.hp)); return boss.dead || w.player.dead; }); }
    finally { w.audio.stopLoop('plasmaDeltaHeadTheme'); }
  } },
  mothership: { name: 'THE MOTHERSHIP', run: async (w, hud) => {
    await warn(w, hud, HALF_H - 1.2); if (w.player.dead) return;
    const boss = w.add(new MothershipBoss(w));
    await w.waitUntil(() => { hud.setPhaseText('MOTHERSHIP  ' + boss.hp); return boss.defeated || w.player.dead; });
    if (!w.player.dead) { hud.setPhaseText(''); await w.wait(DEFEAT_SEQUENCE_TIME); }
  } },
  tesseract: { name: 'TESSERACT', run: (w, hud) => polyField(w, hud, 'tesseract', 'TESSERACT') },
  pentachoron: { name: '5-CELL', run: (w, hud) => polyField(w, hud, 'pentachoron', '5-CELL') },
  delta: { name: 'DELTA', run: async (w, hud) => {
    await warn(w, hud, HALF_H - 1.2); if (w.player.dead) return;
    const stopSphere = startSphereBackdrop(w);
    w.audio.loop('deltaTheme', 0.6);
    try {
      const boss = w.add(new DeltaBoss(w, { maxHp: 30 }));   // FINALE's 100 is too long for a round
      await w.waitUntil(() => { hud.setPhaseText('DELTA  ' + boss.hp); return boss.defeated || w.player.dead; });
    } finally { w.audio.stopLoop('deltaTheme', 0.3); stopSphere(); }
  } },
  extraction: { name: 'CRYSTAL EXTRACTION', run: (w, hud, round) => extraction(w, hud, round) },
};
export const BOSS_IDS = Object.keys(BOSSES);

async function polyField(w, hud, key, name) {
  const data = await loadPoly(key);
  await warn(w, hud, HALF_H - 1); if (w.player.dead) { unloadPoly(key); return; }
  const field = w.add(new PolyField(w, key, data));
  await w.waitUntil(() => { hud.setPhaseText(name + '  ' + field.hp); return field.defeated || w.player.dead; });
  hud.setPhaseText('');
  if (!w.player.dead) await w.waitUntil(() => field.dead || w.player.dead);
  unloadPoly(key);
}

// Rule 5: a crystal extraction is a boss, with the mothership from one of
// the four sides and random attacks instead of the levels' bombs and lasers.
const EXTRACTIONS = [
  { crystal: { x: 0, y: HALF_H - 1.2, tint: 0x00FF6A }, ship: () => ({ Cls: Mothership, opts: {} }), start: [0, -1] },
  { crystal: { x: 0, y: -HALF_H + 0.9, tint: 0xFF2020 }, ship: () => ({ Cls: Mothership, opts: { fromBottom: true } }), start: [0, 1] },
  { crystal: { x: HALF_W - 0.9, y: 0, tint: 0xFFE400 }, ship: () => ({ Cls: MothershipChase, opts: {} }), start: [-HALF_W + 2.5, 0] },
  { crystal: { x: -HALF_W + 0.9, y: 0, tint: 0xFFA000 }, ship: () => ({ Cls: MothershipChase, opts: { mirror: true } }), start: [HALF_W - 2.5, 0] },
];
async function extraction(w, hud, round) {
  const v = EXTRACTIONS[randInt(EXTRACTIONS.length)];
  const p = w.player;
  w.clearEntities();
  p.x = v.start[0]; p.y = v.start[1]; p.render();
  await warn(w, hud, v.start[1]); p.x = v.start[0]; p.render();
  if (p.dead) return;
  const crystal = w.add(new Crystal(w, v.crystal));
  const { Cls, opts } = v.ship();
  const ship = w.add(new Cls(w, opts));
  let fled = false;
  crystal.onCollected = () => ship.crystalCollected();
  ship.onEscape = () => { fled = true; };
  const att = await startAttacks(w, pickAttacks(2 + Math.min(1, Math.floor(round / 3)), { extract: true, noCenter: true }), 1);
  try {
    await spamWhile(w, att, () => {
      hud.setPhaseText(crystal.done ? 'ESCAPE' : 'CRYSTAL  ' + (9 - crystal.hits));
      if (crystal.done) att.tick = () => {};   // stop spawning once the crystal is out
      return crystal.collected && fled;
    });
  } finally { att.stop(); }
  if (!p.dead) await w.wait(1.5);
}

// Testing hook (Playwright): queue attack sets / bosses, shorten phases.
export const ENDLESS_TEST = { attacks: null, bosses: null, phaseTime: null };

// ---- the run ----
export async function runEndless(world, hud) {
  const w = world, run = w.endless;
  run.round = 0; run.bosses = 0;
  const stopStars = startStarfield(w);
  let lastSet = '', lastBoss = null;
  try {
    for (;;) {
      run.round++;
      const budget = Math.min(BUDGET_MAX, BUDGET_START + Math.floor((run.round - 1) / 2));
      const pace = Math.min(PACE_MAX, 1 + PACE_STEP * (run.round - 1));
      for (let ph = 1; ph <= PHASES_PER_ROUND; ph++) {
        const label = `ROUND ${run.round}  ·  PHASE ${ph}/${PHASES_PER_ROUND}`;
        await breather(w, hud, label);
        if (w.player.dead) return;
        const ids = (ENDLESS_TEST.attacks && ENDLESS_TEST.attacks.shift()) || pickAttacks(budget, { last: lastSet });
        lastSet = ids.slice().sort().join();
        const intro = ids.map(id => ATTACKS[id].name).join('  +  ');
        hud.setCenter(intro);
        w.wait(2).then(() => { if (hud.center.text === intro) hud.setCenter(''); });
        const att = await startAttacks(w, ids, pace);
        try {
          await w.runFor(ENDLESS_TEST.phaseTime || PHASE_TIME, (t, left) => {
            att.tick(t);
            hud.setPhaseText(label + '  ' + Math.ceil(left));
          });
        } finally { att.stop(); }
        hud.setPhaseText('');
        w.clearEntities();
        if (w.player.dead) return;
      }
      await breather(w, hud, `ROUND ${run.round}  ·  BOSS`);
      if (w.player.dead) return;
      let id = ENDLESS_TEST.bosses && ENDLESS_TEST.bosses.shift();
      if (!id) do { id = BOSS_IDS[randInt(BOSS_IDS.length)]; } while (id === lastBoss);
      lastBoss = id;
      run.bossName = BOSSES[id].name;
      w.currentPhase = run.round;
      await BOSSES[id].run(w, hud, run.round);
      hud.setPhaseText(''); hud.setCenter(''); if (hud.setNearHp) hud.setNearHp('');
      w.clearEntities(); w.boss = null;
      if (w.player.dead) return;
      run.bosses++;
    }
  } finally {
    stopStars();
  }
}

// The pseudo-level the title screen resolves with.
export const ENDLESS = { id: 'endless', name: 'ENDLESS', unlockedBy: null, run: runEndless };
