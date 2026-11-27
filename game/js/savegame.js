// savegame.js — the manual save, a normal feature for everyone (per direct
// request: "remove manual save/load cheat code and make manual save/load a
// default feature, it should be explained in a tutorial"). It used to be the
// hidden save-state cheat in cheat.js.
//
// [Shift] (SAVE on the phone controls) saves during a level; [Enter] (LOAD)
// loads it, and the title screen shows LOAD GAME while a save exists.
//
// A save remembers which PHASE of which level you were in, plus HP / lives /
// score / weapon and a snapshot of your progress (cleared stages, ...) — not
// the exact position of every hazard. Loading reloads the page and re-enters
// that level at that phase's fresh start (levels/*.js's `run(world, hud,
// { startPhase })`), the same mechanism TRY AGAIN uses for a full restart.
//
// It lives in localStorage, so unlike the rest of progress (wiped on every
// fresh tab, progress.js) it survives closing the game: LOAD GAME on a fresh
// tab brings the run back, cleared stages included. One slot; saving again
// overwrites it.
import { weaponById } from './weapon.js';
import { snapshotProgress, restoreProgress } from './progress.js';

const SAVE_KEY = 'agbt_save';
const LOAD_PENDING_KEY = 'agbt_load_pending';

function flash(hud, text, ms = 1200) {
  if (!hud) return;
  hud.setCenter(text);
  setTimeout(() => { if (hud.center && hud.center.text === text) hud.setCenter(''); }, ms);
}

export function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; }
  catch (e) { return null; }
}
export const hasSave = () => !!readSave();

export function saveGame(world) {
  const p = world.player;
  if (!world.currentLevelId || !p || p.dead || world._over) return false;
  const data = {
    levelId: world.currentLevelId,
    phase: world.currentPhase || 0,
    stage: world.currentStage || 0,   // OUTER SPACE's stage index (outerspace.js)
    hp: p.hp,
    lives: world.lives,
    score: world.totalScore,
    weaponId: world.weapon ? world.weapon.id : 'default',
    usedNormalAttack: !!world.usedNormalAttack,   // achievements.js's per-level challenges
    healPicked: !!world.healPicked,
    // the career total in the snapshot is the run's total right now (this
    // stage's points included), so loading restores it everywhere at once
    progress: { ...snapshotProgress(), score: world.totalScore },
    time: Date.now(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { flash(world.hud, 'SAVE FAILED'); return false; }
  world.audio.play('checkpointReach', 0.6);
  flash(world.hud, 'GAME SAVED');
  if (world.onGameSaved) world.onGameSaved();
  return true;
}

// Reloads into the save. `hud` (optional) shows NO SAVE YET when there's none.
export function loadGame(hud) {
  if (!hasSave()) { flash(hud, 'NO SAVE YET'); return false; }
  try { sessionStorage.setItem(LOAD_PENDING_KEY, '1'); } catch (e) {}
  location.reload();
  return true;
}

// Called once at boot (main.js). Returns the save to apply, or null, and
// consumes the one-shot "please load" flag either way. Restores the saved
// progress right away, so the level's weapon locks read the saved stages.
export function consumePendingLoad() {
  let pending = false;
  try {
    pending = sessionStorage.getItem(LOAD_PENDING_KEY) === '1';
    sessionStorage.removeItem(LOAD_PENDING_KEY);
  } catch (e) {}
  if (!pending) return null;
  const save = readSave();
  if (save) restoreProgress(save.progress);
  return save;
}

// Apply a loaded save's stats to a freshly booted world/player. Doesn't touch
// level selection (main.js) or a level's weapon lock, which still wins.
export function applySave(world, save) {
  world.bankedScore = save.score;
  world.lives = save.lives;
  world.weapon = weaponById(save.weaponId);
  world.usedNormalAttack = !!save.usedNormalAttack;
  world.healPicked = !!save.healPicked;
  world.player.hp = Math.max(1, Math.min(save.hp, world.player.maxHP));
}
