// progress.js — what the player has done, saved in the browser (localStorage).
//
// This is the Pixi equivalent of the Unity project's GameProgress: a thin
// wrapper over storage. Swap the storage later (a PIN-based save, a server,
// whatever) and nothing else has to change — the game only calls these names.
//
//   cleared[id]   — which levels have been beaten (drives unlocks)

const KEY = 'agbt_progress';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function save(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
}

// Career score — the running total that accumulates across stages. It survives
// the page reloads between stages and is only wiped by resetProgress() (a full
// restart), so the score keeps adding up until the player starts over.
export function getCareerScore() { return load().score || 0; }
export function setCareerScore(n) {
  const o = load();
  o.score = Math.max(0, Math.min(1000000, Math.floor(n || 0)));
  save(o);
}

// Chosen difficulty id (persisted so it sticks after the start menu).
export function getDifficultyId() { return load().difficulty || null; }
export function setDifficultyId(id) { const o = load(); o.difficulty = id; save(o); }

// Chosen weapon id (persisted). Unset -> null, so callers fall back to the
// first-run default (the Charge Cannon — every weapon, including this one
// once something else is earned, stays gated behind its own level; see
// weapon.js). Switched on the stage-select hub with [V].
export function getWeaponId() { return load().weapon || null; }
export function setWeaponId(id) { const o = load(); o.weapon = id; save(o); }

// Lives remaining in the current run (including the life being played). Carries
// across stages like the career score; `fallback` is the difficulty's starting
// count, returned when no run is in progress. Reset on a new run / full restart.
export function getLives(fallback) { const o = load(); return (o.lives != null) ? o.lives : fallback; }
export function setLives(n) { const o = load(); o.lives = Math.max(0, Math.floor(n || 0)); save(o); }

// How many times Plasmadrache (OCCÜLTACRESBURG's boss, plasmadrache.js) has
// chomped the player *in this run* — carries across stages like lives/score,
// and drives which taunt line his end-of-run cutscene shows. Reset alongside
// lives on GIVE UP (menu.js's showGameOver); unlike lives, TRY AGAIN does
// *not* reset it, since it's still the same run.
export function getChompCount() { return load().chompCount || 0; }
export function setChompCount(n) { const o = load(); o.chompCount = Math.max(0, Math.floor(n || 0)); save(o); }

// EASY's heal-orb meter: damage dealt toward the next orb (main.js drops one
// per HEAL_EVERY_DAMAGE). Carries across stages like lives; reset on GIVE UP.
export function getDamageMeter() { return load().damageMeter || 0; }
export function setDamageMeter(n) { const o = load(); o.damageMeter = Math.max(0, Math.floor(n || 0)); save(o); }

// Per-level best score, shown on the stage-select hub's level cards. Keyed by
// level id, mirroring the `cleared` object; a fresh level has no entry (best = 0).
export function getBestScore(id) { return (load().bestScore || {})[id] || 0; }
export function recordBestScore(id, score) {
  const o = load();
  o.bestScore = o.bestScore || {};
  o.bestScore[id] = Math.max(o.bestScore[id] || 0, Math.floor(score || 0));
  save(o);
}

// Per-level cumulative hit count, also shown on the hub's level cards: how many
// times the player has ever been hit in that stage (`total`), and how many of
// those hits were the one that killed them (`lethal`) -- a rough "how brutal is
// this stage" readout. Never resets except via resetProgress().
export function getHitsTaken(id) {
  const h = (load().hitsTaken || {})[id];
  return h ? { total: h.total || 0, lethal: h.lethal || 0 } : { total: 0, lethal: 0 };
}
export function recordHit(id, lethal) {
  if (!id) return;
  const o = load();
  o.hitsTaken = o.hitsTaken || {};
  const h = o.hitsTaken[id] || { total: 0, lethal: 0 };
  h.total += 1;
  if (lethal) h.lethal += 1;
  o.hitsTaken[id] = h;
  save(o);
}

export function isCleared(id) { return !!(load().cleared || {})[id]; }
export function markCleared(id) {
  const o = load();
  o.cleared = o.cleared || {};
  o.cleared[id] = true;
  save(o);
}

// A level is playable if it has no prerequisite or its prerequisite is cleared.
export function isUnlocked(level) {
  return !level.unlockedBy || isCleared(level.unlockedBy);
}

// Wipe everything — handy while testing (call from the console: __resetProgress()).
export function resetProgress() { save({}); }

// Wipe progress once per browser *tab session* (not on every internal
// location.reload() the game itself does between stages / TRY AGAIN — those
// share the same tab session, so this only fires the first time). This is
// what makes progress "reset every time you open the game": closing the tab
// and coming back starts clean, pushing players toward jotting down their
// save code (pin.js) if they want their score back. sessionStorage is
// tab-scoped and reload-persistent, unlike localStorage (survives forever)
// or a plain in-memory flag (wouldn't survive the reload).
const SESSION_KEY = 'agbt_session';
export function resetOnFreshOpen() {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch (e) { return; }   // sessionStorage unavailable — leave progress alone
  resetProgress();
  // ...except to the last AUTOSAVE, if the game has been beaten (below).
  const snap = loadAutosave();
  if (snap) save(snap);
}

// Beating THE FINALE's last boss autosaves (per direct request: "when you
// complete the game (aka beat final boss) it'll autosave, making beating
// final boss only way to save your progress"). A fresh tab then starts from
// that snapshot instead of from nothing: every cleared stage, the career
// score at the win, best scores/hit stats, difficulty and weapon. Lives and
// the chomp tally start fresh. Nothing else autosaves.
const AUTOSAVE_KEY = 'agbt_autosave';
function loadAutosave() {
  try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY)) || null; }
  catch (e) { return null; }
}
export function autosaveProgress(score) {
  const o = load();
  const snap = {
    cleared: o.cleared || {}, bestScore: o.bestScore || {}, hitsTaken: o.hitsTaken || {},
    score: Math.max(0, Math.min(1000000, Math.floor(score || 0))),
    difficulty: o.difficulty || null, weapon: o.weapon || null,
  };
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap)); } catch (e) {}
}

// The whole progress object, for the manual save (savegame.js) to snapshot,
// and a restore that never un-clears a stage: `cleared` is merged, the run's
// own numbers (score, lives, difficulty, weapon, tallies) come from the save.
export function snapshotProgress() { return load(); }
export function restoreProgress(snap) {
  if (!snap) return;
  const o = load();
  const cleared = { ...(o.cleared || {}), ...(snap.cleared || {}) };
  save({ ...o, ...snap, cleared });
}
