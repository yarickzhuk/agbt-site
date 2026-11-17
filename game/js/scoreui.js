// scoreui.js — arcade initials entry and the top-10 scoreboard screen.
// Both run on the shared ticker and own the input while they're up (they clear
// input edges each frame themselves; the main loop is dormant during end
// screens). Resolve when the player finishes.
import { input } from './input.js';
import { SCREEN_W, SCREEN_H, formatScore } from './core.js';
import { topScores, submitScore, isNameClaimed } from './leaderboard.js';
import { createKeypad } from './mobile.js';
import { CODE_LEN } from './pin.js';

// All UI text is white (dim/highlight variants keep their alpha via call sites).
const CYAN = 0xffffff, WHITE = 0xffffff, GREEN = 0xffffff, DIM = 0xffffff;
const FONT = 'Tektur, monospace';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Shows an on-screen keypad on mobile for a raw-keyboard entry screen
// (PIN / save code below), hiding the persistent movement/fire touch
// controls while it's up since the two occupy overlapping screen space.
// Returns a teardown to call alongside the screen's own cleanup, or null on
// desktop where there's nothing to show.
function mobileKeypad(world, { charset, allowCancel, handleKey }) {
  if (!world.isMobile) return null;
  if (world.touchControls) world.touchControls.hide();
  const keypad = createKeypad(world, {
    charset,
    onChar: c => handleKey(c),
    onBackspace: () => handleKey('Backspace'),
    onEnter: () => handleKey('Enter'),
    onCancel: allowCancel ? () => handleKey('Escape') : null,
  });
  return () => {
    keypad.destroy();
    if (world.touchControls) world.touchControls.show();
  };
}

// e.key alone misses digits typed on a numpad with NumLock off (it reports
// navigation names like "End"/"ArrowDown" there instead of "1") — e.code is
// the physical key, unaffected by NumLock or layout, so check both. Returns
// the typed digit character, or null if this key isn't a digit at all.
function digitFromEvent(e) {
  if (/^[0-9]$/.test(e.key)) return e.key;
  if (e.code && /^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (e.code && /^Numpad[0-9]$/.test(e.code)) return e.code.slice(6);
  return null;
}

// Remembers the last initials typed on this device/browser, so returning
// players don't have to re-spell their name every run. A dedicated key
// (not part of progress.js's agbt_progress) so it survives the fresh-tab
// progress wipe (resetOnFreshOpen) the same way the PIN/scoreboard data does —
// this is a device convenience, not career progress.
const LAST_INITIALS_KEY = 'agbt_last_initials';
function getLastInitials() {
  try { return localStorage.getItem(LAST_INITIALS_KEY); } catch (e) { return null; }
}
function setLastInitials(name) {
  try { localStorage.setItem(LAST_INITIALS_KEY, name); } catch (e) {}
}

// Remembers the name+PIN a submission actually succeeded under, so later
// submissions on this device skip the initials/PIN screens entirely and
// just post under that same identity -- "enter your name ONCE but it will
// update as you gain more points," per direct request. Distinct from
// LAST_INITIALS_KEY above (that's only ever a pre-fill convenience the
// player can still change); this one is a real remembered login. Same
// device-only key convention as the rest of this file.
const IDENTITY_KEY = 'agbt_identity';
function getIdentity() {
  try { return JSON.parse(localStorage.getItem(IDENTITY_KEY)); } catch (e) { return null; }
}
function setIdentity(name, pin) {
  try { localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name, pin: pin || '' })); } catch (e) {}
}
// The name the game knows this player by: the remembered identity, else
// the last initials typed, else plain "PLAYER" (THE FINALE's victory screen).
export function getPlayerName() {
  const id = getIdentity();
  return (id && id.name) || getLastInitials() || 'PLAYER';
}

function clearIdentity() {
  try { localStorage.removeItem(IDENTITY_KEY); } catch (e) {}
}

function text(str, size, fill, x, y, anchor = 0.5) {
  const t = new PIXI.Text(str, { fontFamily: FONT, fontSize: size, fill, letterSpacing: 4, align: 'center' });
  t.anchor.set(anchor, 0.5);
  t.position.set(x, y);
  return t;
}

// Enter 3 initials, arcade style. up/down change the current letter,
// left/right move between slots, fire confirms (advances; confirms on the 3rd).
// Resolves with e.g. "OXY".
export function enterInitials(world) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 210;
    layer.addChild(text('ENTER YOUR NAME', 30, CYAN, SCREEN_W / 2, SCREEN_H / 2 - 90));

    // Pre-fill with the last initials typed on this device, if any.
    const remembered = getLastInitials();
    const slots = (remembered && remembered.length === 3)
      ? remembered.split('').map(ch => Math.max(0, LETTERS.indexOf(ch)))
      : [0, 0, 0];   // indices into LETTERS
    let cur = 0;
    const cx = SCREEN_W / 2, gap = 70, y = SCREEN_H / 2;
    const glyphs = slots.map((_, i) =>
      text('A', 64, WHITE, cx + (i - 1) * gap, y));
    glyphs.forEach(g => layer.addChild(g));
    const marks = slots.map((_, i) =>
      text('▲', 20, CYAN, cx + (i - 1) * gap, y - 52));
    marks.forEach(m => layer.addChild(m));

    layer.addChild(text('↑↓ LETTER   ←→ SLOT   Z / SPACE  OK', 18, CYAN, SCREEN_W / 2, SCREEN_H / 2 + 90)).alpha = 0.7;
    world.stage.addChild(layer);

    const redraw = () => {
      glyphs.forEach((g, i) => { g.text = LETTERS[slots[i]]; g.style.fill = (i === cur) ? WHITE : CYAN; });
      marks.forEach((m, i) => { m.visible = (i === cur); });
    };
    redraw();

    let t = 0;
    const step = () => {
      t += world.app.ticker.deltaMS / 1000;
      if (input.wasPressed('up')) { slots[cur] = (slots[cur] + 1) % 26; redraw(); }
      if (input.wasPressed('down')) { slots[cur] = (slots[cur] + 25) % 26; redraw(); }
      if (input.wasPressed('left') && cur > 0) { cur--; redraw(); }
      if (input.wasPressed('right') && cur < 2) { cur++; redraw(); }
      if (t > 0.3 && input.wasPressed('fire')) {
        if (cur < 2) { cur++; redraw(); }
        else {
          world.app.ticker.remove(step);
          world.stage.removeChild(layer); layer.destroy({ children: true });
          const name = slots.map(s => LETTERS[s]).join('');
          setLastInitials(name);
          resolve(name);
        }
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}

// A brief notice screen with a title/subtitle and a "continue" prompt.
// Shared by nameTaken and wrongPin below.
function notice(world, title, subtitle) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 210;
    layer.addChild(text(title, 26, CYAN, SCREEN_W / 2, SCREEN_H / 2 - 20));
    layer.addChild(text(subtitle, 18, DIM, SCREEN_W / 2, SCREEN_H / 2 + 20)).alpha = 0.8;
    layer.addChild(text('Z / SPACE  CONTINUE', 18, CYAN, SCREEN_W / 2, SCREEN_H / 2 + 70)).alpha = 0.7;
    world.stage.addChild(layer);

    let t = 0;
    const step = () => {
      t += world.app.ticker.deltaMS / 1000;
      if (t > 0.4 && input.wasPressed('fire')) {
        world.app.ticker.remove(step);
        world.stage.removeChild(layer); layer.destroy({ children: true });
        resolve();
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}

// Brief "name taken" notice, shown when an unsecured name already holds an
// equal-or-higher score (see leaderboard.js). Resolves when the player continues.
function nameTaken(world, name) {
  return notice(world, 'SORRY, "' + name + '" IS TAKEN', 'PICK DIFFERENT INITIALS');
}

// Brief "wrong PIN" notice, shown when a secured name's PIN doesn't match.
function wrongPin(world, name) {
  return notice(world, 'WRONG PIN FOR "' + name + '"', 'TRY AGAIN OR PICK A DIFFERENT NAME');
}

// Type a 4-digit PIN (real keyboard). Resolves with the digits typed, or null
// if cancelled/skipped (ESC). `allowSkip` just changes the hint text — ESC
// always resolves null either way, callers decide what that means.
export function enterPin(world, { title, subtitle, allowSkip = true } = {}) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 210;
    layer.addChild(text(title || 'ENTER PIN', 28, CYAN, SCREEN_W / 2, SCREEN_H / 2 - 90));
    if (subtitle) layer.addChild(text(subtitle, 16, DIM, SCREEN_W / 2, SCREEN_H / 2 - 56)).alpha = 0.8;
    const buf = text('_ _ _ _', 48, WHITE, SCREEN_W / 2, SCREEN_H / 2);
    layer.addChild(buf);
    const hint = '4 DIGITS   ENTER = OK   ESC = ' + (allowSkip ? 'SKIP' : 'CANCEL');
    layer.addChild(text(hint, 16, CYAN, SCREEN_W / 2, SCREEN_H / 2 + 70)).alpha = 0.7;
    world.stage.addChild(layer);

    let s = '';
    const render = () => { buf.text = s.padEnd(4, '_').split('').join(' '); };
    render();
    let teardownKeypad = null;
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      if (teardownKeypad) teardownKeypad();
      world.stage.removeChild(layer); layer.destroy({ children: true });
    };
    const handleKey = key => {
      if (key === 'Enter') { if (s.length === 4) { cleanup(); resolve(s); } return; }
      if (key === 'Escape') { cleanup(); resolve(null); return; }
      if (key === 'Backspace') { s = s.slice(0, -1); render(); return; }
      if (/^[0-9]$/.test(key) && s.length < 4) { s += key; render(); }
    };
    const onKey = e => {
      const d = digitFromEvent(e);
      if (e.key !== 'Enter' && e.key !== 'Escape' && e.key !== 'Backspace' && d == null) return;
      e.preventDefault(); e.stopPropagation();
      handleKey(d != null ? d : e.key);
    };
    window.addEventListener('keydown', onKey, true);
    teardownKeypad = mobileKeypad(world, { charset: '0123456789'.split(''), allowCancel: allowSkip, handleKey });
  });
}

// Enter initials, secure/verify a PIN for that name, and submit the score —
// looping back to re-enter if the name is taken (no PIN, score didn't beat
// it) or the PIN was wrong. Resolves with the name once the submission
// actually lands. See leaderboard.js for the PIN/ownership rules.
//
// A remembered identity (see IDENTITY_KEY above) skips all of that: once a
// submission has actually succeeded under some name+PIN on this device, every
// later call just posts under that same identity silently -- no prompts, no
// screens, whether or not it actually beats the last score. Only falls back
// to the full manual flow if that remembered identity itself gets rejected
// (e.g. the global board was reset, or storage was cleared on one device but
// not another sharing the same browser profile), in which case it's cleared
// so the stale identity doesn't keep failing forever.
export async function enterInitialsAndSubmit(world, score) {
  const identity = getIdentity();
  if (identity && identity.name) {
    const result = await submitScore(identity.name, score, identity.pin);
    if (result.ok) return identity.name;
    clearIdentity();
  }
  for (;;) {
    const name = await enterInitials(world);
    const claimed = await isNameClaimed(name);
    const pin = claimed
      ? await enterPin(world, { title: 'PIN FOR "' + name + '"', allowSkip: false })
      : await enterPin(world, { title: 'SECURE "' + name + '" WITH A PIN', subtitle: 'OPTIONAL — STOPS OTHERS FROM USING IT', allowSkip: true });
    if (claimed && pin == null) continue;   // cancelled verify -> pick a different name
    const result = await submitScore(name, score, pin);
    if (result.ok) { setIdentity(name, pin); return name; }
    if (result.reason === 'wrong-pin') await wrongPin(world, name);
    else await nameTaken(world, name);
  }
}

// Type a save code (real keyboard). Resolves with the typed string, or null if
// cancelled. Used by the "ENTER CODE" hub option to reclaim a saved score.
export function enterCode(world) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 210;
    layer.addChild(text('ENTER SAVE CODE', 30, CYAN, SCREEN_W / 2, SCREEN_H / 2 - 70));
    const buf = text('_', 48, WHITE, SCREEN_W / 2, SCREEN_H / 2);
    layer.addChild(buf);
    layer.addChild(text('TYPE CODE   ENTER = OK   ESC = CANCEL', 18, CYAN, SCREEN_W / 2, SCREEN_H / 2 + 70)).alpha = 0.7;
    world.stage.addChild(layer);

    let s = '';
    let teardownKeypad = null;
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      if (teardownKeypad) teardownKeypad();
      world.stage.removeChild(layer); layer.destroy({ children: true });
    };
    const handleKey = key => {
      if (key === 'Enter') { cleanup(); resolve(s || null); return; }
      if (key === 'Escape') { cleanup(); resolve(null); return; }
      if (key === 'Backspace') { s = s.slice(0, -1); buf.text = s || '_'; return; }
      if (/^[a-zA-Z0-9]$/.test(key) && s.length < CODE_LEN) { s += key.toUpperCase(); buf.text = s || '_'; }
    };
    const onKey = e => {
      const d = digitFromEvent(e);   // numpad digits report as e.g. "End" in e.key with NumLock off
      if (e.key !== 'Enter' && e.key !== 'Escape' && e.key !== 'Backspace' && d == null && !/^[a-zA-Z0-9]$/.test(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      handleKey(d != null ? d : e.key);
    };
    window.addEventListener('keydown', onKey, true);
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
    teardownKeypad = mobileKeypad(world, { charset, allowCancel: true, handleKey });
  });
}

// Show the top-10 board. Resolves when the player presses fire to continue.
// highlightName: the entry to mark (the score just posted), optional.
// The board is this device's own (leaderboard.js), so there's nothing to
// refresh; the old global board's [R] REFRESH went with it.
export function showScoreboard(world, highlightName = null) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 210;
    layer.addChild(text('SCOREBOARD', 40, CYAN, SCREEN_W / 2, 70));
    layer.addChild(text('THIS DEVICE', 16, DIM, SCREEN_W / 2, 104)).alpha = 0.8;

    const rowsLayer = new PIXI.Container();
    layer.addChild(rowsLayer);
    world.stage.addChild(layer);

    const load = () => {
      rowsLayer.removeChildren().forEach(c => c.destroy());
      const loading = text('LOADING…', 22, CYAN, SCREEN_W / 2, SCREEN_H / 2);
      rowsLayer.addChild(loading);
      topScores(10).then(list => {
        if (rowsLayer.destroyed) return;   // screen already closed before this resolved
        rowsLayer.removeChildren().forEach(c => c.destroy());
        if (!list.length) rowsLayer.addChild(text('NO SCORES YET', 22, DIM, SCREEN_W / 2, SCREEN_H / 2));
        let highlighted = false;
        list.forEach((e, i) => {
          const mark = !highlighted && highlightName && e.name === highlightName;
          if (mark) highlighted = true;
          const row = `${String(i + 1).padStart(2, ' ')}   ${(e.name || '---').padEnd(3, ' ')}   ${formatScore(e.score)}`;
          const r = text(row, 24, mark ? GREEN : CYAN, SCREEN_W / 2, 160 + i * 40);
          r.style.fontFamily = 'monospace';
          rowsLayer.addChild(r);
        });
      });
    };
    load();

    layer.addChild(text('Z / SPACE  CONTINUE      X  BACK', 18, CYAN, SCREEN_W / 2, SCREEN_H - 40)).alpha = 0.7;

    let t = 0;
    const step = () => {
      t += world.app.ticker.deltaMS / 1000;
      // [ESC] backs out immediately -- no `t > 0.4` gate needed the way fire
      // has one, since Escape was never the key used to *enter* this screen
      // (see input.js's own armGuard doc for why fire needs that guard).
      if ((t > 0.4 && input.wasPressed('fire')) || input.backPressed()) {
        world.app.ticker.remove(step);
        world.stage.removeChild(layer); layer.destroy({ children: true });
        resolve();
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}
