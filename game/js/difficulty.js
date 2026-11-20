// difficulty.js — the run's difficulty modes and their rules.
//
// A run starts with `startLives` lives (shown next to HP as `lives - 1` yellow
// triangles — the current life isn't drawn, the classic arcade look) and
// `startHP` max/starting HP. A death consumes a life, and once lives hit 0,
// TRY AGAIN is gone for good — GIVE UP (fresh run, lives refilled, stage
// unlocks kept) is the only way off Game Over from then on, in every
// difficulty; lives never let you retry forever. The modes differ in lives,
// whether they refill, and how much HP a hit can take before it costs a life:
//
//   easy   — 4 HP, 3 lives, refilled to full every time you clear a stage.
//   normal — 3 HP, 3 lives, carried across the whole run, no refill.
//   arcade — HARD (id kept for saves): 2 HP, 2 lives (one fewer than NORMAL), no refill.
import { isCostumeUnlocked } from './costumes.js';
export const DIFFICULTIES = {
  easy:   { id: 'easy',   name: 'EASY',           startHP: 4, startLives: 3, refillOnClear: true  },
  normal: { id: 'normal', name: 'NORMAL',         startHP: 3, startLives: 3, refillOnClear: false },
  arcade: { id: 'arcade', name: 'HARD',           startHP: 2, startLives: 2, refillOnClear: false },
  // ENDLESS MODE only (levels/endless.js), never on the picker: fixed 3 HP,
  // one life, EASY's heal orb every 100 damage (main.js's onDamageDealt).
  endless: { id: 'endless', name: 'ENDLESS',      startHP: 3, startLives: 1, refillOnClear: false },
};

// Menu cycle order (easiest → hardest).
export const DIFFICULTY_ORDER = ['easy', 'normal', 'arcade'];

export const DEFAULT_DIFFICULTY = 'normal';

// HARD is locked until the game has been beaten once (the DELTA costume,
// earned by beating THE FINALE, kept in settings past the fresh-tab wipe).
// A phone offers EASY, plus HARD once unlocked; NORMAL stays desktop-only.
export const isHardUnlocked = () => isCostumeUnlocked('delta');
export function availableDifficulties(isMobile) {
  const ids = isMobile ? ['easy'] : ['easy', 'normal'];
  if (isHardUnlocked()) ids.push('arcade');
  return ids;
}
// The stored choice if it's on offer here, else this device's default.
export function resolveDifficultyId(id, isMobile) {
  const ids = availableDifficulties(isMobile);
  return ids.includes(id) ? id : (isMobile ? 'easy' : DEFAULT_DIFFICULTY);
}

export function difficultyById(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
