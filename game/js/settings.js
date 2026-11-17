// settings.js — device-level display/audio preferences, saved in
// localStorage. NOT game progress: a dedicated key outside progress.js's
// own agbt_progress, so it survives the fresh-tab progress wipe the same
// way agbt_last_initials/agbt_identity/agbt_scores already do — these are
// "how you like to play", not "how far you've gotten".
const KEY = 'agbt_settings';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function save(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
}

// Master volume, 0..1 in steps of 0.1. Unset -> 1 (full volume, matching
// every existing per-sound `play(name, volume)` call's own behavior before
// this setting existed).
export function getMasterVolume() {
  const v = load().volume;
  return v == null ? 1 : Math.max(0, Math.min(1, v));
}
export function setMasterVolume(v) {
  const o = load();
  o.volume = Math.max(0, Math.min(1, v));
  save(o);
}

// "RESOLUTION" in the OPTIONS menu -- really an on-screen display-size
// scale layered on top of mobile.js's own existing auto-fit-to-viewport
// math, not a true backing-store render resolution change (the game's
// world coordinates/canvas are always a fixed 900x700; this just changes
// how large that renders within the page). 100% reproduces the exact
// pre-existing "never upscale past native size" behavior, so a player who
// never touches this setting sees no change at all.
// Ascending, not descending -- menu.js's OPTIONS row steps through this array
// by index with </> (dir -1/+1), so ascending order is what makes -> actually
// raise the percentage and <- actually lower it, one step at a time, instead
// of -> silently *decreasing* resolution and <- jumping straight past 75%
// to 50% (a real bug caught by Playwright testing this row before it shipped).
export const DISPLAY_SCALES = [0.5, 0.75, 1];   // 50% / 75% / 100%
export function getDisplayScale() {
  const s = load().displayScale;
  // Falls back to 1 explicitly, not DISPLAY_SCALES[0] -- with the array now
  // ascending, [0] is 50%, and this setting's own contract (doc above) is
  // that an untouched setting must read as 100%, not whatever sits first.
  return DISPLAY_SCALES.includes(s) ? s : 1;
}
export function setDisplayScale(s) {
  const o = load();
  o.displayScale = s;
  save(o);
}

// WINDOWED / BORDERLESS / FULLSCREEN. Orthogonal to the resolution setting
// above: WINDOWED keeps the existing "never upscale past native size" cap
// (modulated by the resolution scale); BORDERLESS drops that cap and
// stretches the canvas to fill however big the current browser window
// actually is, edge to edge, but stays a normal tab (no Fullscreen API
// call — no OS/browser chrome removed); FULLSCREEN does the same fill *and*
// requests the real Fullscreen API, hiding the browser chrome too. There's
// no other meaningful distinction a web page can draw here — a browser tab
// has no OS window border to strip independently of going fullscreen, so
// "borderless" is implemented as the fill-without-fullscreen reading of it.
export const DISPLAY_MODES = ['windowed', 'borderless', 'fullscreen'];
export function getDisplayMode() {
  const m = load().displayMode;
  // Unset reads BORDERLESS (per direct request: "Make borderless the
  // default"); an explicit WINDOWED choice is kept.
  return DISPLAY_MODES.includes(m) ? m : 'borderless';
}
export function setDisplayMode(m) {
  const o = load();
  o.displayMode = m;
  save(o);
}

// OPTIONS → COSTUMES (costumes.js): the chosen player-ship reskin, plus the
// list of reskins ever unlocked on this device. Kept here rather than in
// progress.js on purpose — progress is wiped every fresh tab, and an earned
// costume shouldn't vanish with it.
export function getCostumeSetting() { return load().costume || 'default'; }
export function setCostumeSetting(id) {
  const o = load();
  o.costume = id;
  save(o);
}
export function getUnlockedCostumes() {
  const u = load().costumesUnlocked;
  return Array.isArray(u) ? u : [];
}
export function addUnlockedCostume(id) {
  const o = load();
  const u = Array.isArray(o.costumesUnlocked) ? o.costumesUnlocked : [];
  if (!u.includes(id)) { u.push(id); o.costumesUnlocked = u; save(o); }
}

// OPTIONS → DEATH HITBOX: the death freeze-frame with hitboxes drawn
// (deathreveal.js). On by default -- only an explicit OFF is stored.
export function getShowHitbox() { return load().hitbox !== false; }
export function setShowHitbox(on) {
  const o = load();
  o.hitbox = !!on;
  save(o);
}

// OPTIONS → TOXIC MODE: voiced roasts on death (roast.js). Off by default.
export function getToxicMode() { return !!load().toxic; }
export function setToxicMode(on) {
  const o = load();
  o.toxic = !!on;
  save(o);
}

// OPTIONS → SCREEN BORDER: the art (Kangunroo, Plasmadrache, their names)
// drawn in the empty bars around the game (mobile.js). On by default --
// only an explicit OFF is stored.
export function getScreenBorder() { return load().border !== false; }
export function setScreenBorder(on) {
  const o = load();
  o.border = !!on;
  save(o);
}

// OPTIONS → ORIENTATION (phones only, mobile.js's fit): how the game is drawn
// on a tall (upright) page. HORIZONTAL (default) draws it sideways, filling
// the screen, the tilt sensor picking which way; VERTICAL draws it upright,
// letterboxed; AUTO follows the phone all four ways. A wide page is always
// drawn straight. The mobile-only rotate button flips HORIZONTAL/VERTICAL.
export const ORIENTATIONS = ['horizontal', 'vertical', 'auto'];
export function getOrientation() {
  const m = load().orientation;
  return ORIENTATIONS.includes(m) ? m : 'horizontal';
}
export function setOrientation(m) {
  const o = load();
  o.orientation = m;
  save(o);
}

// Achievements (achievements.js): the ids earned on this device. Kept here
// for the same reason costumes are: progress is wiped every fresh tab, an
// earned achievement isn't.
export function getAchievementIds() {
  const a = load().achievements;
  return Array.isArray(a) ? a : [];
}
export function addAchievementId(id) {
  const o = load();
  const a = Array.isArray(o.achievements) ? o.achievements : [];
  if (!a.includes(id)) a.push(id);
  o.achievements = a;
  save(o);
}

// Every point ever scored on this device (achievements.js's screen shows
// it). Never capped, never wiped by the progress reset or TRY AGAIN.
export function getLifetimeScore() { return Math.max(0, Math.floor(load().lifetimeScore || 0)); }
export function addLifetimeScore(n) {
  if (!(n > 0)) return;
  const o = load();
  o.lifetimeScore = Math.max(0, Math.floor(o.lifetimeScore || 0)) + Math.floor(n);
  save(o);
}

// TOTAL SCORE EVER only started counting when the SCORE achievements went
// in, so points scored before that were never added. At boot (before the
// fresh-tab progress wipe) it's raised to the most this device can prove was
// scored: every name's score on the local scoreboard added up, the career
// total, the manual save, the autosave and the ENDLESS best. Only ever raises.
export function backfillLifetimeScore() {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const board = read('agbt_scores');
  const slot = read('agbt_save');
  const best = Math.max(
    Array.isArray(board) ? board.reduce((t, e) => t + num(e && e.score), 0) : 0,
    num((read('agbt_progress') || {}).score),
    num(slot && slot.score), num(slot && slot.progress && slot.progress.score),
    num((read('agbt_autosave') || {}).score),
    num((read('agbt_endless_record') || {}).score),
  );
  const o = load();
  if (best > Math.floor(o.lifetimeScore || 0)) { o.lifetimeScore = best; save(o); }
}

// TOXIC MODE roast keys heard on this device ("You will not be missed...").
export function getRoastsHeard() {
  const a = load().roastsHeard;
  return Array.isArray(a) ? a : [];
}
export function addRoastHeard(key) {
  const o = load();
  const a = Array.isArray(o.roastsHeard) ? o.roastsHeard : [];
  if (!a.includes(key)) a.push(key);
  o.roastsHeard = a;
  save(o);
}

// Lifetime counters for the MILESTONES achievements: damage dealt with the
// player's weapons, and deaths. Never wiped.
function counter(name) { return Math.max(0, Math.floor(load()[name] || 0)); }
function bump(name, n) {
  const o = load();
  o[name] = Math.max(0, Math.floor(o[name] || 0)) + n;
  save(o);
  return o[name];
}
export function getLifetimeDamage() { return counter('lifetimeDamage'); }
export function addLifetimeDamage(n) { return n > 0 ? bump('lifetimeDamage', n) : getLifetimeDamage(); }
export function getLifetimeDeaths() { return counter('lifetimeDeaths'); }
export function addLifetimeDeath() { return bump('lifetimeDeaths', 1); }
