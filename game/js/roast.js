// TOXIC MODE (OPTIONS → TOXIC MODE ON/OFF): on every death, a voiceline that
// roasts the player for whatever killed them. Voice only, no subtitles.
//
// player.takeDamage() records the killer as world.killedBy -- a hazard
// object (by default whatever world.update() was running) or, for the few
// scripted kills that skip takeDamage, a plain string ('chomp', 'nom',
// 'mazetimeout'). killerKey() turns that into one of the KEYS below.
//
// Lines live in assets/sounds/roasts/ as <key>_<n>.wav (n from 1). ROASTS
// says how many each key has; a key with none falls back to 'generic'.
// They load in the background after boot, so a slow file never holds up
// the loading screen.

import { getToxicMode, getRoastsHeard, addRoastHeard } from './settings.js';
import { unlockAchievement } from './achievements.js';

// Hazard class name -> roast key. Several classes share a key where the
// player sees them as one thing (a hazard and its own projectiles).
const CLASS_KEY = {
  MeteorShard: 'meteor', Bomb: 'bomb', LaserWall: 'laser', SplashDot: 'splash',
  PressHazard: 'press', TrapWheel: 'trapcircle',
  Mothership: 'mothership', MothershipChase: 'mothership',
  Saw: 'saw', SawShard: 'saw', Crock: 'crock', Jellyfish: 'jellyfish',
  Beam: 'beam', Pirania: 'piranha', DevilFish: 'devilfish', Atom: 'atom',
  Kangaroo: 'kangunroo',
  Corn: 'corn', CornSeed: 'corn', FireworkRocket: 'firework', RocketShard: 'firework',
  Clown: 'clown', Lollypop: 'lollipop', Dart: 'dart', Peanut: 'peanut',
  ForceField: 'forcefield',
  Knight: 'knight', Ghost: 'ghost', Flame: 'flame', Spear: 'spear', Wheel: 'wheel',
  Plasmadrache: 'plasmadrache', PlasmaFlame: 'plasmaflame',
  Asteroid: 'asteroid', Disruptor: 'disruptor', DisruptorWave: 'disruptor', Comet: 'comet',
  TrapCircleDelta: 'trapcircledelta', KangunrooDelta: 'kangunroodelta',
  PlasmadracheDelta: 'plasmadrachedelta',
  FleetShip: 'fleet', FleetBullet: 'fleet',
  MothershipBoss: 'mothershipboss', GunBullet: 'mothershipboss', SplashShard: 'mothershipboss',
  DeltaBoss: 'delta', DeltaShot: 'delta',
};
const POLY_KEY = {
  tesseract: 'tesseract', pentachoron: 'pentachoron',
  icositetrachoron: 'cell24', hecatonicosachoron: 'cell120',
};

// Number of recorded lines per key. 0 = none (falls back to 'generic').
export const ROASTS = {
  generic: 1,
  meteor: 1, bomb: 1, laser: 1, splash: 1, press: 1, trapcircle: 1, mothership: 1,
  saw: 1, crock: 1, jellyfish: 1, beam: 1, piranha: 1, devilfish: 1, atom: 1, kangunroo: 1,
  corn: 1, firework: 1, clown: 1, lollipop: 1, dart: 1, peanut: 1, forcefield: 1,
  knight: 1, ghost: 1, flame: 1, spear: 1, wheel: 1, plasmadrache: 1, plasmaflame: 1, chomp: 1,
  asteroid: 1, disruptor: 1, comet: 1, trapcircledelta: 1, kangunroodelta: 1,
  mazetimeout: 1, plasmadrachedelta: 1, nom: 1, fleet: 1, mothershipboss: 1,
  tesseract: 1, pentachoron: 1, cell24: 1, cell120: 1, delta: 1,
  speedrunfail: 1,   // any death in SPEEDRUN MODE, timeout included
};

// "You will not be missed..." (achievements.js): hear every roast key that
// can still play. The Disruptor's line can't any more (its phase was
// replaced by presses + bombs), so it isn't required.
const UNREACHABLE = ['disruptor'];
export const REQUIRED_ROASTS = Object.keys(ROASTS).filter(k => !UNREACHABLE.includes(k));
function heard(world, key, endsAt) {
  addRoastHeard(key);
  const got = getRoastsHeard();
  if (REQUIRED_ROASTS.every(k => got.includes(k)))
    unlockAchievement(world, 'notmissed', { delay: Math.max(0, endsAt - world.audio.now()) });
}

export function killerKey(k) {
  if (!k) return 'generic';
  if (typeof k === 'string') return k;
  // Kangunroo Delta's final-stand duel is the base Kangaroo class with an onLose hook.
  if (k.constructor.name === 'Kangaroo' && k.opts && k.opts.onLose) return 'kangunroodelta';
  if (k.key && POLY_KEY[k.key]) return POLY_KEY[k.key];
  return CLASS_KEY[k.constructor.name] || 'generic';
}

const soundName = (key, n) => `roast_${key}_${n}`;

export function loadRoasts(audio) {
  // SPEEDRUN MODE's own line first: a speedrun can end within seconds of a
  // TRY AGAIN reload, before the rest have loaded.
  audio.loadFile(soundName('speedrunfail', 1), 'roasts/speedrunfail_1.wav');
  for (const [key, count] of Object.entries(ROASTS))
    for (let n = 1; n <= count; n++) if (key !== 'speedrunfail') audio.loadFile(soundName(key, n), `roasts/${key}_${n}.wav`);
}

let last = null;
// Gap between the end of the death cue and the roast line.
const ROAST_GAP = 0.15;

// Called once per death (main.js). Picks a random loaded line for the killer,
// never the same one twice in a row when there's a choice. The line starts
// once the death cue (`world.deathCueEnd`, set where the player dies) has
// finished, so the two never overlap.
export function playRoast(world) {
  if (!getToxicMode()) return;
  const audio = world.audio;
  const pool = key => {
    const out = [];
    for (let n = 1; n <= (ROASTS[key] || 0); n++)
      if (audio.has(soundName(key, n))) out.push(soundName(key, n));
    return out;
  };
  // A failed speedrun plays only its own line, whatever killed you — never
  // a hazard's line, even if this one hasn't loaded yet (then it plays as
  // soon as it has).
  if (world.speedrun) {
    const name = soundName('speedrunfail', 1);
    const go = () => {
      const when = Math.max(audio.now(), world.deathCueEnd || 0) + ROAST_GAP;
      audio.play(name, 1, when);
      world.roastEnd = when + audio.duration(name);
      heard(world, 'speedrunfail', world.roastEnd);
    };
    if (audio.has(name)) go();
    else audio.loadFile(name, 'roasts/speedrunfail_1.wav').then(ok => { if (ok) go(); });
    return;
  }
  let key = killerKey(world.killedBy);
  let lines = pool(key);
  if (!lines.length) { key = 'generic'; lines = pool('generic'); }
  if (!lines.length) return;
  const choices = lines.length > 1 ? lines.filter(l => l !== last) : lines;
  last = choices[Math.floor(Math.random() * choices.length)];
  const when = Math.max(audio.now(), world.deathCueEnd || 0) + ROAST_GAP;
  audio.play(last, 1, when);
  // when the line ends, so OUTER SPACE's respawn can wait for it (outerspace.js)
  world.roastEnd = when + audio.duration(last);
  heard(world, key, world.roastEnd);
}
