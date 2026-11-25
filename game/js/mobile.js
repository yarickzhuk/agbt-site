// mobile.js — phone/tablet support: device detection, forcing the fixed
// 900x700 canvas into landscape regardless of the phone's physical
// orientation, and touch controls (a virtual joystick + buttons, plus a
// keypad for PIN/save-code entry) built as plain DOM elements overlaid on
// the canvas.
//
// Why DOM elements and not PixiJS graphics (an earlier version of this used
// Pixi): deployed on itch.io, this page runs inside itch's own embed
// iframe, and that iframe's box can end up portrait-shaped — or simply fail
// to reflow at all on rotation — independently of how the phone is actually
// held. Trying to *detect* the real device orientation (screen.orientation,
// window.orientation, even comparing real screen.width/height) and show a
// "please rotate" prompt turned out not to be reliable there in practice.
// The fix instead is to stop caring what the OS/iframe reports and just
// ALWAYS render the game landscape: whenever this document's own box is
// portrait-shaped (taller than wide — a plain, always-accurate fact about
// the box we're actually given, regardless of *why* it's that shape),
// rotate a wrapper 90deg via CSS so the 900x700 landscape canvas fills it.
// This needs no orientation detection at all, so it can't be fooled by a
// non-reflowing embed the way the earlier approach could.
//
// The one thing a CSS-rotated <canvas> breaks is touch coordinates: Pixi's
// own pointer-event system maps a tap to canvas-local pixels using a plain
// scale factor (bounding-rect-width / canvas-width), which comes out wrong
// once the bounding rect's width/height are swapped by a 90deg rotation —
// Pixi has no built-in awareness of the rotation. Rather than depend on
// Pixi's internal event-mapping code (a private implementation detail, and
// untestable here since this sandbox can't load Pixi from its CDN), touch
// controls are plain HTML/CSS elements layered over the canvas instead of
// Pixi Graphics: native DOM hit-testing already accounts for CSS transforms
// correctly (that's ordinary browser behavior, not something this project
// reimplements), so button taps just work regardless of rotation. The only
// place actual rotation math is needed is the joystick's drag *vector*
// (relative motion, not an absolute position) — see toLocalDelta() below.
//
// Everything here feeds the exact same input.js state a real keyboard would
// (input.simulateDown/simulateUp), so no gameplay code needed to change:
// movement, firing, menus, and the cheat code all read touch input exactly
// like a keypress.
import { input } from './input.js';
import { SCREEN_W, SCREEN_H } from './core.js';
import { getDisplayScale, getDisplayMode, getScreenBorder, getCostumeSetting, getUnlockedCostumes,
         getOrientation, setOrientation } from './settings.js';

// (hover: none) + (pointer: coarse) is true on phones/tablets but false on a
// touchscreen laptop (it still has a mouse/trackpad, so hover:hover holds) —
// a far more reliable signal than sniffing the UA string or screen size.
export function isMobileDevice() {
  try { return matchMedia('(hover: none) and (pointer: coarse)').matches; }
  catch (e) { return false; }
}

// True while the screen, as the player holds it, is taller than wide: the
// page's shape, swapped when the game is turned sideways inside it. Read off
// the screen itself rather than "sensor says 0/180", which would call a
// landscape-first tablet held normally "vertical".
// On a phone the game is never drawn upright any more, so this reads the
// phone itself: a tall page with the tilt sensor saying upright/upside down.
export function isPortraitScreen() {
  const tall = window.innerWidth < window.innerHeight;
  // (no sensor reading: whatever the game is drawn as -- upright in VERTICAL)
  if (isMobileDevice()) return tall && (sensedAngle !== null ? sensedAngle % 180 === 0 : currentTurn % 180 === 0);
  return currentTurn % 180 === 0 ? tall : !tall;
}

// Fullscreen and the iOS tilt permission need a real user gesture, which a
// touch's pointerdown (where the first-input hook runs) isn't; the actual
// requests happen on touchend/click (onGestureEnd, hooked up in
// fitCanvasToViewport). Kept as the first-input hook's entry point.
export function tryEnterFullscreen() {
  if (!isMobileDevice()) return;
  listenTilt();
}

// --- Shared layout state --------------------------------------------------
// `wrap` (index.html's #stage-wrap) holds both the canvas and every touch
// control; rotating IT — rather than the canvas directly — means everything
// inside rotates together as one unit with zero extra bookkeeping: the
// canvas, the joystick, every button, the keypad, all inherit the same CSS
// transform automatically.
let wrap = null;
let layout = { scale: 1, rotated: 0 };   // rotated: the CSS turn in degrees, 0/90/180/270
const reflowListeners = new Set();
function notifyReflow() { reflowListeners.forEach(fn => fn()); }

// Scale the canvas to fit whatever viewport it's shown in, and rotate the
// wrapper 90deg whenever this document's own box is portrait-shaped, so the
// landscape game always fills the box it's given. In WINDOWED mode (the
// default — settings.js's DISPLAY_MODES) a desktop window never upscales
// past native size; BORDERLESS/FULLSCREEN drop that cap. Polls every 500ms
// in addition to resize/orientationchange, since some embeds (itch.io's
// iframe among them) don't reliably fire either event on every size change.
//
// **On a phone the picture follows the phone, all four ways** — per direct
// request ("Mobile screen should ALWAYS respond to turns and be able to turn
// in all 4 directions (0, 90, 180, 270) regardless if it's a level, menu or
// any of loading screens", and "Fix the bug where screen wants to be the
// opposite side you turned"). The game is turned by
//   turn = (how the phone is physically turned) - (how the OS turned the page)
// so it is always upright to whoever holds the phone: held upright it stands
// upright, upside down it's turned 180, on either side it's landscape —
// whether the OS rotated the page itself (auto-rotate) or the rotation lock
// is on. The physical turn comes from the tilt sensor's gravity direction
// (below); the page's turn from screen.orientation.angle. The old rule only
// knew two sideways turns, kept a stale sideways turn once the phone stood
// back up (the picture stayed on its side, "the opposite side"), and read
// the left/right tilt alone, whose sign flips when the phone leans forward.
// Without a sensor reading the page is drawn as the OS turned it.
// Desktop keeps the old rule: a portrait-shaped box is turned 90deg.
function pageAngle() {
  let a = null;
  try { if (screen.orientation && typeof screen.orientation.angle === 'number') a = screen.orientation.angle; } catch (e) {}
  if (a === null && typeof window.orientation === 'number') a = window.orientation;
  if (a === null) a = window.innerWidth < window.innerHeight ? 0 : 90;
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
}

// The phone's physical turn, 0/90/180/270 in screen.orientation.angle's own
// convention (90 = top turned to the left), or null before any reading.
// Worked out from where "up" points in the screen's plane: with the W3C
// Z-X'-Y'' angles, world-up in device axes is
//   (-sin(gamma)cos(beta), sin(beta), cos(gamma)cos(beta)).
// Unlike gamma alone, that stays right however far the phone leans. A new
// direction needs to be within SNAP degrees of its centre (so a phone held
// near 45deg doesn't flicker) and the phone not lying nearly flat (FLAT).
//
// **Responsive, not delayed** — per direct request ("rotation is still
// shitty because it's either force locks you or has really long delays...
// Screen rotation is now THE MOST IMPORTANT PART"). A turn used to wait a
// fixed SETTLE in case the OS was about to turn the page itself. Now the
// game learns whether the OS follows each kind of turn (sideways, upside
// down) — `osFollows`, from what the page actually did last time:
//   - OS doesn't follow (rotation lock, or no upside-down portrait): the
//     game turns the instant the sensor sees it.
//   - OS follows: the game lets the OS turn the page (applied the moment the
//     page resizes), with OS_WAIT as a fallback if it doesn't.
//   - Not known yet: turns at once too ("Remove delay"); if the OS then
//     turns the page as well, that's learned and the game turns back.
let currentTurn = 0;        // the turn the last fit drew
let lastSideways = 90;      // tall page: the sideways turn held while the phone is upright
let lastUpright = 0;        // tall page, VERTICAL: upright (0) or upside down (180)
let deviceAngle = null;     // applied physical turn
let sensedAngle = null;     // latest reading
let settleTimer = null;
let tiltListening = false;
let tiltGranted = false;
const SNAP = 38, FLAT = 0.3, OS_WAIT = 0.7;
// Learned per direction the phone is turned to (not per kind of turn: an
// iPhone follows both landscapes but never upside-down portrait, and
// landscape-to-landscape and upright-to-upside-down are both "180" turns).
// Remembered per device (`agbt_rotation`): a phone's auto-rotate setting
// rarely changes, so only the very first session has anything to learn,
// and a wrong memory just relearns on the first turn.
const ROT_KEY = 'agbt_rotation';
const osFollows = { 0: null, 90: null, 180: null, 270: null };
// iOS can't lock the OS orientation (no fullscreen API on iPhone), so the
// first-ever turn there can't be made the game's own. Instead an unknown
// direction waits for the OS (OS_WAIT) rather than turning at once: with
// auto-rotate the OS's own turn comes in that window and is applied the
// moment the page resizes, so nothing is drawn turned the wrong way; with
// a rotation lock it's a one-time wait, then remembered. An iPhone never
// turns the page upside down, so that direction is known up front.
const UA = navigator.userAgent || '';
const IS_IOS = /iP(hone|od|ad)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
try {
  const saved = JSON.parse(localStorage.getItem(ROT_KEY) || 'null');
  if (saved) for (const k of [0, 90, 180, 270]) if (typeof saved[k] === 'boolean') osFollows[k] = saved[k];
} catch (e) {}
if (/iP(hone|od)/.test(UA) && osFollows[180] === null) osFollows[180] = false;
// What one landscape does, the other almost always does too (rotation lock
// blocks both, auto-rotate allows both), so learning one fills in the other
// until the page proves otherwise.
function learn(q, follows) {
  if (osLocked) return;                                // our own lock, not the player's setting
  osFollows[q] = follows;
  const twin = (q + 180) % 360;
  if (q % 180 !== 0 && osFollows[twin] === null) osFollows[twin] = follows;
  try { localStorage.setItem(ROT_KEY, JSON.stringify(osFollows)); } catch (e) {}
}
// The first reading of a session already says something: a page that
// doesn't match how the phone is held means the OS didn't turn it (rotation
// lock); a sideways phone on a matching sideways page means auto-rotate is
// on, so it'll turn back upright too.
function learnFromFirstReading(q) {
  if (osLocked) return;
  const page = pageAngle();
  if (q !== page) learn(q, false);
  else if (q % 180 !== 0) { learn(q, true); if (osFollows[0] === null) learn(0, true); }
}
function applySensed() {
  clearTimeout(settleTimer); settleTimer = null;
  if (sensedAngle === null || sensedAngle === deviceAngle) return;
  deviceAngle = sensedAngle;
  if (doFit) doFit();
}
function onTilt(e) {
  const g = e.gamma, b = e.beta;
  if (typeof g !== 'number' || typeof b !== 'number') return;
  tiltGranted = true;
  const r = Math.PI / 180;
  const ux = -Math.sin(g * r) * Math.cos(b * r), uy = Math.sin(b * r);
  if (Math.hypot(ux, uy) < FLAT) return;               // lying flat: keep what we have
  const deg = (Math.atan2(ux, uy) / r + 360) % 360;    // 0 upright, 90 top-left, 180, 270 top-right
  const q = (Math.round(deg / 90) % 4) * 90;
  const off = Math.abs(((deg - q + 540) % 360) - 180);
  if (q === sensedAngle || off > SNAP) return;
  sensedAngle = q;
  // A wide page is drawn straight whatever the sensor says (see fit), and a
  // reading taken on a turned page may be relative to it: nothing to learn
  // or apply until the page is tall again (notePageTurn picks it up then).
  if (window.innerWidth >= window.innerHeight) return;
  if (deviceAngle === null) learnFromFirstReading(q);
  if (deviceAngle === null || q === deviceAngle || osLocked) { tryOrientationLock(); applySensed(); return; }
  const page = pageAngle();
  if (q === page) { applySensed(); return; }           // the OS already turned the page this way
  // No waiting unless the OS is known (or, on iOS, might) turn the page
  // this way itself: then its own turn is what the player sees, and
  // OS_WAIT only covers it not coming (a rotation lock).
  if (osFollows[q] === false || (osFollows[q] === null && !IS_IOS)) { applySensed(); return; }
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    // the OS didn't turn the page in time: it doesn't follow this direction
    if (pageAngle() === page) learn(q, false);
    applySensed();
  }, OS_WAIT * 1000);
}
// The page turned (OS auto-rotate): the OS follows that direction, and the
// phone is now turned at least that far. If our own reading still says the
// direction the OS just left (the OS's rotation threshold can fire before
// our SNAP band is reached), trust the OS — otherwise the game would be
// drawn turned against the freshly turned page until the next reading.
let lastPage = null;
function notePageTurn() {
  const page = pageAngle();
  if (lastPage !== null && page !== lastPage && !osLocked) {
    learn(page, true);
    if (osFollows[lastPage] === null) learn(lastPage, true);   // auto-rotate is on: it'll turn back too
    if (sensedAngle !== null) {
      clearTimeout(settleTimer); settleTimer = null;
      if (sensedAngle === lastPage) sensedAngle = page;
      deviceAngle = sensedAngle;
    }
  }
  lastPage = page;
}
function listenTilt() {
  if (tiltListening || typeof window.DeviceOrientationEvent === 'undefined') return;
  tiltListening = true;
  window.addEventListener('deviceorientation', onTilt);
}
// iOS asks the player before a page may read the tilt sensor, and only from
// a real user gesture. A touch's pointerdown/touchstart isn't one (that was
// why the sensor never turned on and the picture stayed locked to the OS),
// so it's asked on touchend/click, again on every tap until it's granted.
// Elsewhere the listener just starts.
let tiltAsking = false;
function requestTiltPermission() {
  try {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      if (tiltGranted || tiltAsking) return;
      tiltAsking = true;
      D.requestPermission()
        .then(r => { tiltAsking = false; if (r === 'granted') { tiltGranted = true; listenTilt(); } })
        .catch(() => { tiltAsking = false; });
    } else listenTilt();
  } catch (e) {}
}
// DISABLED (see CLAUDE.md, "Boots landscape, never stuck upright"): a
// locked OS left no way to turn if the sensor stalled. Was: Android, in fullscreen: lock the OS to the page's current orientation, so
// it never rotates the page itself and every turn is the game's own, from
// the tilt sensor, instantly — no guessing whether auto-rotate is on, so no
// first-turn flicker even on a device's very first session. Only once tilt
// readings are arriving (else the picture couldn't follow the phone at
// all). iOS has no lock API; it keeps the learned behaviour.
let osLocked = false, lockAsking = false;
function tryOrientationLock() {
  return;   // disabled: a locked OS can't be turned back if the sensor stalls
  if (osLocked || lockAsking || !tiltGranted || !document.fullscreenElement) return;
  try {
    const so = screen.orientation;
    if (!so || typeof so.lock !== 'function' || !so.type) return;
    lockAsking = true;
    so.lock(so.type)
      .then(() => { lockAsking = false; osLocked = !!document.fullscreenElement; clearTimeout(settleTimer); settleTimer = null; })
      .catch(() => { lockAsking = false; });
  } catch (e) { lockAsking = false; }
}
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) tryOrientationLock();
  else osLocked = false;                               // leaving fullscreen drops the lock
});
let fullscreenAsked = false;
function onGestureEnd() {
  requestTiltPermission();
  if (fullscreenAsked) return;
  fullscreenAsked = true;
  try {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !document.fullscreenElement) {
      const p = req.call(el);
      if (p && p.then) p.then(tryOrientationLock, () => {});
    }
  } catch (e) {}
}

// --- Screen border ----------------------------------------------------------
// The empty bars around the game (the page is rarely exactly 9:7) get art
// instead of black, per direct request (like Antonball Deluxe's faded
// character borders): a flat arcade-yellow field with Kangunroo on one side
// and Plasmadrache on the other, facing the game, each with its name. Plain
// DOM behind #stage-wrap, turned the same way the game is, so on an upright
// phone the two sit above and below it. OPTIONS → SCREEN BORDER turns it off.
const BORDER_CHARS = [
  { name: 'KANGUNROO', src: 'assets/sprites/border/kangunroo.svg', w: 342.7, h: 418, color: '#1d00ff' },
  { name: 'PLASMADRACHE', src: 'assets/sprites/border/plasmadrache.svg', w: 329, h: 415.5, color: '#ff00a0' },
];
const BORDER_YELLOW = '#ffd420', BORDER_RAY = '#ffbe12';
const BORDER_FADE = 0.5;    // the art and names sit well back from the game
const BORDER_ART_H = 0.5;   // side bars holding the touch controls: the character stays in the top half
const BORDER_MIN_BAR = 40;  // px; narrower bars just show the yellow
let border = null;
function ensureBorder() {
  if (border) return border;
  const root = document.createElement('div');
  root.id = 'screen-border';
  root.style.cssText = 'position:fixed;left:50%;top:50%;z-index:0;pointer-events:none;overflow:hidden;' +
    `background:repeating-conic-gradient(from 0deg at 50% 50%, ${BORDER_YELLOW} 0deg 10deg, ${BORDER_RAY} 10deg 20deg);`;
  const slots = BORDER_CHARS.map(c => {
    const slot = document.createElement('div');
    slot.style.cssText = `position:absolute;opacity:${BORDER_FADE};`;
    const img = document.createElement('img');
    img.src = c.src; img.alt = '';
    img.style.cssText = 'position:absolute;';
    const label = document.createElement('div');
    label.textContent = c.name;
    label.style.cssText = `position:absolute;font-family:Tektur,monospace;font-weight:bold;color:${c.color};` +
      'letter-spacing:0.08em;white-space:nowrap;text-shadow:0.08em 0.08em 0 #1a0050;line-height:1;';
    slot.append(img, label);
    root.appendChild(slot);
    return { slot, img, label, c };
  });
  document.body.insertBefore(root, document.body.firstChild);
  border = { root, slots };
  return border;
}
const px = v => Math.round(v) + 'px';
// bw/bh: the border's own (unturned) size; gw/gh: the game's size inside it.
function layoutBorder(turn, bw, bh, gw, gh, controlsInBars) {
  const b = ensureBorder();
  b.root.style.display = getScreenBorder() ? '' : 'none';
  // DELTA costume: the border goes monochrome with everything else.
  const mono = deltaEquipped();
  b.root.style.filter = mono ? 'grayscale(1)' : '';
  b.root.style.width = px(bw); b.root.style.height = px(bh);
  b.root.style.transform = `translate(-50%,-50%) rotate(${turn}deg)`;
  const side = bw - gw >= bh - gh;          // bars left/right, else above/below
  const bar = side ? (bw - gw) / 2 : (bh - gh) / 2;
  b.slots.forEach(({ slot, img, label, c }, i) => {
    slot.style.display = bar < BORDER_MIN_BAR ? 'none' : '';
    if (bar < BORDER_MIN_BAR) return;
    // slot box: the bar itself (Kangunroo first: left / top)
    const sx = side ? (i ? bw - bar : 0) : 0, sy = side ? 0 : (i ? bh - bar : 0);
    const sw = side ? bar : bw, sh = side ? bh : bar;
    slot.style.left = px(sx); slot.style.top = px(sy); slot.style.width = px(sw); slot.style.height = px(sh);
    const pad = Math.min(sw, sh) * 0.06;
    if (side) {
      // name across the top, the character right under it; the bottom of
      // the bar stays empty
      const fs = Math.min((sw - 2 * pad) / (c.name.length * 0.72), sh * 0.07);
      label.style.fontSize = px(fs);
      label.style.left = '50%'; label.style.top = px(pad + fs * 0.3);
      label.style.transform = 'translateX(-50%)';
      // Under the name. Only where the joystick/FIRE sit in these bars (a
      // phone, placeControls) does it keep to the top half; elsewhere (a
      // computer) it gets the whole height -- per direct request ("why
      // waste the space?").
      const top = pad * 2 + fs * 1.6;
      const room = controlsInBars ? sh * BORDER_ART_H : sh - top - pad;
      // As big as it fits whole; on a computer, centred in the bar (per
      // direct follow-up: "make them as big as you can see them whole and
      // move to the middle" -- a first pass let them overhang, cropped by
      // the screen edge, which looked bad).
      const k = Math.min((sw - 2 * pad) / c.w, room / c.h);
      const ih = c.h * k;
      img.style.width = px(c.w * k); img.style.height = px(ih);
      img.style.left = px((sw - c.w * k) / 2);
      img.style.top = px(controlsInBars ? top : Math.max(top, (sh - ih) / 2));
    } else {
      // character at the outer end, the name beside it, toward the middle
      const k = (sh - 2 * pad) / c.h;
      const iw = c.w * k;
      img.style.width = px(iw); img.style.height = px(sh - 2 * pad); img.style.top = px(pad);
      img.style.left = px(i ? sw - pad - iw : pad);
      const room = sw - iw - 3 * pad;
      const fs = Math.min(room / (c.name.length * 0.72), sh * 0.3);
      label.style.fontSize = px(fs); label.style.transform = 'translateY(-50%)';
      label.style.top = '50%';
      label.style.left = px(i ? pad : pad * 2 + iw);
    }
  });
}

// A side bar's width in design units, or 0 when the bars are above/below.
function barWidth(bw, bh, scale) {
  const gw = SCREEN_W * scale, gh = SCREEN_H * scale;
  return bw - gw >= bh - gh ? (bw - gw) / 2 / scale : 0;
}

const deltaEquipped = () => getCostumeSetting() === 'delta' && getUnlockedCostumes().includes('delta');

let doFit = null;
export function fitCanvasToViewport() {
  wrap = document.getElementById('stage-wrap');
  if (!wrap || !document.getElementById('game')) return;
  const mobile = isMobileDevice();
  // index.html's canvas box-shadow glow shows on a phone as teal bands in
  // the black around the game; flat black there instead.
  if (mobile) {
    document.getElementById('game').style.boxShadow = 'none';
    listenTilt();   // Android etc. need no permission
    window.addEventListener('touchend', onGestureEnd, true);
    window.addEventListener('click', onGestureEnd, true);
  }
  const fit = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    // A resize alone (keyboard, browser bars, or the box arriving a frame
    // before the new angle) changes nothing here: only a real page turn
    // (notePageTurn) or a sensor reading moves deviceAngle.
    if (mobile) notePageTurn();
    let turn;
    if (!mobile) turn = vw < vh ? 90 : 0;
    // No tilt reading (yet, or ever: iOS before the motion permission, an
    // embed that blocks the sensor): this is a landscape game, so a portrait
    // page is turned sideways rather than drawn upright and stuck there.
    // A wide box is drawn straight, always: the OS (or itch's frame) already
    // turned it, and some Android browsers report the tilt relative to the
    // turned screen, which cancelled out the page angle and drew the game
    // upright while the phone was held sideways.
    // A tall page is always drawn sideways, filling it (the author's pick
    // over an upright game in big bars): the tilt sensor only chooses which
    // way, and held upright or upside down it keeps the last sideways turn.
    else if (vw >= vh) turn = 0;
    else {
      const q = deviceAngle === null ? null : (deviceAngle - (pageAngle() === 180 ? 180 : 0) + 360) % 360;
      if (q === 90 || q === 270) lastSideways = q;
      if (q === 0 || q === 180) lastUpright = q;
      // OPTIONS → ORIENTATION / the rotate button (settings.js)
      const mode = getOrientation();
      if (mode === 'vertical') turn = lastUpright;
      else if (mode === 'auto') turn = q === null ? 90 : q;
      else turn = lastSideways;
    }
    currentTurn = turn;
    const sideways = turn % 180 !== 0;
    const fill = mobile || getDisplayMode() !== 'windowed';
    const raw = sideways ? Math.min(vw / SCREEN_H, vh / SCREEN_W) : Math.min(vw / SCREEN_W, vh / SCREEN_H);
    const scale = fill ? raw : Math.min(raw, 1) * getDisplayScale();
    wrap.style.width = Math.floor(SCREEN_W * scale) + 'px';
    wrap.style.height = Math.floor(SCREEN_H * scale) + 'px';
    wrap.style.transform = turn ? 'rotate(' + turn + 'deg)' : '';
    const barD = barWidth(sideways ? vh : vw, sideways ? vw : vh, scale);
    layoutBorder(turn, sideways ? vh : vw, sideways ? vw : vh, SCREEN_W * scale, SCREEN_H * scale,
      mobile && barD >= BAR_CONTROLS_MIN);
    // the loading banner (plain HTML, outside the wrap) turns the same way
    const boot = document.getElementById('boot-status');
    if (boot) boot.style.transform = turn ? 'rotate(' + turn + 'deg)' : '';
    // DELTA costume: everything is mirrored left-right (per direct request,
    // "MAKE EVERYTHING MIRRORED WITH DELTA") — the canvas only, so the DOM
    // touch controls and the border stay as they are; input.js swaps
    // left/right to match.
    const mirrored = deltaEquipped();
    document.getElementById('game').style.transform = mirrored ? 'scaleX(-1)' : '';
    input.setMirror(mirrored);
    layout = { scale, rotated: turn };
    placeControls(barD);
    notifyReflow();
  };
  doFit = fit;
  fit();
  // A rotation can report its new size/angle a few frames late (iOS
  // especially), so after any rotation-ish event refit every frame for a
  // second instead of waiting on the 500ms poll.
  let burstUntil = 0;
  const burst = () => {
    const go = burstUntil === 0 || performance.now() > burstUntil;
    burstUntil = performance.now() + 1000;
    fit();
    if (!go) return;
    const tick = () => { fit(); if (performance.now() < burstUntil) requestAnimationFrame(tick); else burstUntil = 0; };
    requestAnimationFrame(tick);
  };
  window.addEventListener('resize', burst);
  window.addEventListener('orientationchange', burst);
  try { if (screen.orientation) screen.orientation.addEventListener('change', burst); } catch (e) {}
  // Exiting fullscreen (the browser's own [X]/Esc, not just this game's own
  // OPTIONS row) changes the viewport back without necessarily firing
  // 'resize' in every browser -- reflow immediately either way.
  document.addEventListener('fullscreenchange', fit);
  setInterval(fit, 500);
}

// Re-reads settings.js's own display-scale/mode and reflows immediately —
// called from the OPTIONS menu right after changing either, so the change
// is visible right away instead of waiting for the next resize/poll tick.
export function refitCanvas() { if (doFit) doFit(); }

// Requests or exits the real Fullscreen API to match `mode` ('fullscreen'
// requests it, anything else exits if currently in it). Must be called
// from a user gesture (a menu confirm keypress counts) — both requesting
// and exiting can reject outside one, so failures are swallowed rather than
// surfaced; the CSS fill/letterbox math above already makes BORDERLESS read
// as "fullscreen" visually even when the real API call didn't go through.
export function applyDisplayMode(mode) {
  try {
    if (mode === 'fullscreen') {
      if (!document.fullscreenElement) {
        const p = document.documentElement.requestFullscreen?.();
        if (p && p.catch) p.catch(() => {});
      }
    } else if (document.fullscreenElement) {
      const p = document.exitFullscreen?.();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {}
}

// --- DOM control helpers ---------------------------------------------------
function el(tag, cssText, parent) {
  const e = document.createElement(tag);
  e.style.cssText = cssText;
  (parent || wrap).appendChild(e);
  return e;
}

// Position/size an element in the game's 900x700 design space, converted to
// actual on-screen pixels via the current scale. Because the element is a
// DOM descendant of `wrap`, the browser applies wrap's rotation (if any) to
// it automatically — nothing here needs to know or care whether the game is
// currently rotated.
function place(e, x, y, w, h) {
  e.style.left = Math.round(x * layout.scale) + 'px';
  e.style.top = Math.round(y * layout.scale) + 'px';
  e.style.width = Math.round(w * layout.scale) + 'px';
  e.style.height = Math.round(h * layout.scale) + 'px';
}

const BASE_CSS = 'position:absolute;box-sizing:border-box;border:2px solid rgba(255,255,255,0.55);' +
  'border-radius:50%;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;' +
  'color:#fff;font-family:Tektur,monospace;letter-spacing:1px;touch-action:none;user-select:none;';

// `pos` is read on every reflow, so a button follows it when it moves
// (FIRE does: placeControls()).
function circleButton(parent, pos, r, label, fontSize) {
  const b = el('div', BASE_CSS + 'font-size:' + fontSize + 'px;', parent);
  b.textContent = label || '';
  const reflow = () => place(b, pos.x - r, pos.y - r, r * 2, r * 2);
  reflow();
  reflowListeners.add(reflow);
  return b;
}

// A top-row button: an invisible SMALL_R touch target holding the drawn
// circle (`b.face`), which can be shrunk and faded without shrinking the
// target. `label` is text, or an element (the full-screen icon).
function smallButton(parent, pos, label, fontSize) {
  const b = el('div', 'position:absolute;touch-action:none;user-select:none;', parent);
  const face = el('div', BASE_CSS + 'inset:0;font-size:' + fontSize + 'px;transition:transform .15s,opacity .15s;', b);
  if (typeof label === 'string') face.textContent = label; else face.appendChild(label);
  b.face = face;
  const reflow = () => place(b, pos.x - SMALL_R, pos.y - SMALL_R, SMALL_R * 2, SMALL_R * 2);
  reflow();
  reflowListeners.add(reflow);
  return b;
}

// Four corner brackets: the full-screen button's icon.
function fullscreenIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.cssText = 'width:46%;height:46%;overflow:visible;';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '2.4');
  svg.appendChild(path);
  return svg;
}

const STICK_REST = { x: 0, y: 0 };   // where the base sits when idle (placeControls)
const STICK_R = 72;
// A big invisible catch zone around the rest position: touching ANYWHERE in
// it recentres the visible base+knob to that exact point (a "floating"
// joystick) instead of requiring a precise tap on the small graphic — much
// more forgiving on a phone. Comfortably clear of FIRE's territory.
const STICK_ZONE = { x0: 0, y0: 0, x1: 0, y1: 0 };
const STICK_DEADZONE = 0.32;   // fraction of STICK_R before a direction engages
const FIRE = { x: 0, y: 0 };
const FIRE_R = 58;
// Where the joystick and FIRE go, per direct request: when the screen has
// side bars wide enough to hold them (a phone held sideways), the joystick
// sits in the bottom of the left bar and FIRE in the bottom of the right
// one -- off the game, under the border art (which keeps to the top half).
// Otherwise (an upright phone, a wide-mode screen) they sit inside the game
// as before. Positions are in design units, so a bar is negative x / past
// SCREEN_W; `barD` is a side bar's width in design units (0 if none).
const BAR_CONTROLS_MIN = 2 * STICK_R + 30;
function placeControls(barD) {
  if (barD >= BAR_CONTROLS_MIN) {
    Object.assign(STICK_REST, { x: -barD / 2, y: SCREEN_H - 120 });
    Object.assign(STICK_ZONE, { x0: -barD, y0: SCREEN_H * 0.45, x1: 0, y1: SCREEN_H });
    Object.assign(FIRE, { x: SCREEN_W + barD / 2, y: SCREEN_H - 120 });
  } else {
    Object.assign(STICK_REST, { x: 120, y: SCREEN_H - 120 });
    Object.assign(STICK_ZONE, { x0: 0, y0: 300, x1: 380, y1: SCREEN_H });
    Object.assign(FIRE, { x: SCREEN_W - 110, y: SCREEN_H - 110 });
  }
}
placeControls(0);
const SMALL_R = 42;
// The top row (X, V, ↻, SAVE, LOAD, and full screen on the website). Each
// button keeps a SMALL_R touch target; its pos is set by layoutTopRow, which
// packs the visible ones from the right (full screen goes top-left). During a level the row sits just
// under the HUD's top line and is drawn smaller and fainter (TOP_ROW_LEVEL), so it hides less of the
// play field; the touch targets stay the same size.
const TOP_ROW_GAP = 110;
const TOP_ROW_MENU = { y: 80, face: 1, alpha: 1 };
const TOP_ROW_LEVEL = { y: 92, face: 0.7, alpha: 0.42 };   // under the HUD's PHASE line
const PAUSE = { x: SCREEN_W - 50, y: 80 };
const WEAPON = { x: SCREEN_W - 160, y: 80 };
const ROTATE = { x: SCREEN_W - 270, y: 80 };
const SAVE_BTN = { x: SCREEN_W - 380, y: 80 };
const LOAD_BTN = { x: SCREEN_W - 490, y: 80 };
const FULL_BTN = { x: SCREEN_W - 600, y: 80 };
const SITE_MODE = (() => { try { return new URLSearchParams(location.search).has('site'); } catch (e) { return false; } })();
const FULLSCREEN_OK = (() => { try { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); } catch (e) { return false; } })();
const fullscreenEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// A touch counts as a tap on the screen (tap.js) if it lifts within TAP_TIME
// ms and moved less than TAP_SLOP real pixels.
const TAP_TIME = 600, TAP_SLOP = 16;

// Turn a page-space drag delta (dx, dy from a pointer's start, in real
// on-screen pixels) into the game's own un-rotated design-space axes. Only
// needed for the joystick, which cares about *direction*; every button
// below is a plain tap with no position math at all, since native DOM
// hit-testing already accounts for wrap's rotation on its own. Divides by
// the current scale so the result is in the same design-space units as
// STICK_R, regardless of how small the game renders on this screen —
// without that, the drag distance needed to reach full deflection would be
// a *fixed number of real pixels* (STICK_R, unscaled), which on a small
// phone (a small `scale`) is far more than the visibly-drawn joystick's own
// radius, making it feel unresponsive until the finger strays well outside
// the graphic. Derivation: CSS `rotate(90deg)` maps a local point (x,y) to
// visual (x',y') = (-y,x); the inverse (visual -> local) is x = y', y = -x'.
function toLocalDelta(dx, dy) {
  // CSS rotate(t) maps local (x,y) to visual (x cos t - y sin t, x sin t + y cos t);
  // this is its inverse. t = 0/90/180/270, so the trig is exact.
  const t = layout.rotated * Math.PI / 180;
  const c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t));
  return { x: (dx * c + dy * s) / layout.scale, y: (-dx * s + dy * c) / layout.scale };
}

// Page (client) coordinates -> this game's 900x700 design space, accounting
// for wrap's current scale and rotation. Used to recentre the floating
// joystick at wherever the player actually touches down.
function pageToDesign(clientX, clientY) {
  const rect = wrap.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const { x, y } = toLocalDelta(clientX - cx, clientY - cy);
  return { x: SCREEN_W / 2 + x, y: SCREEN_H / 2 + y };
}

// Builds the persistent touch-control overlay (joystick, fire, pause,
// weapon-switch) and wires it straight into input.js. No lock-facing [C]
// button here — desktop's [C] key still works (facing sticks while you
// strafe), but the touch joystick already sets facing from its own drag
// vector, so locking it made aiming on mobile more confusing than useful.
// Added once, inside the same rotating wrapper as the canvas, so it survives every
// level/menu/end-screen transition and rotates in lockstep with the game.
// Kept on `world.touchControls` (a small {hide, show} object, not a Pixi
// display object) so scoreui.js can hide it while its own on-screen keypad
// (createKeypad, below) is up, since the two occupy overlapping screen space.
export function createTouchControls(world) {
  if (!wrap) return null;
  const layer = el('div', 'position:absolute;inset:0;pointer-events:none;z-index:10;', wrap);
  const child = b => { b.style.pointerEvents = 'auto'; return b; };

  // A big invisible zone catches the initial touch anywhere near the corner
  // (STICK_ZONE); the visible base+knob then jump to that exact point. The
  // base/knob themselves are pointer-events:none — the zone is what's
  // actually listened on, so a drag starting anywhere in it still tracks
  // correctly however far it wanders (setPointerCapture below).
  const stickZone = child(el('div', 'position:absolute;touch-action:none;', layer));
  const zoneReflow = () => place(stickZone, STICK_ZONE.x0, STICK_ZONE.y0, STICK_ZONE.x1 - STICK_ZONE.x0, STICK_ZONE.y1 - STICK_ZONE.y0);
  zoneReflow();
  reflowListeners.add(zoneReflow);

  let stickCenter = { ...STICK_REST };
  let stickPointerId = null;
  const stickBase = el('div', BASE_CSS + 'pointer-events:none;font-size:12px;', layer);
  const reflowBase = () => {
    if (stickPointerId === null) stickCenter = { ...STICK_REST };   // follows placeControls
    place(stickBase, stickCenter.x - STICK_R, stickCenter.y - STICK_R, STICK_R * 2, STICK_R * 2);
  };
  reflowBase();
  reflowListeners.add(reflowBase);

  const KNOB_R = STICK_R * 0.5;
  let knobOffset = { x: 0, y: 0 };   // design-space offset from stickCenter
  const stickKnob = el('div', 'position:absolute;border-radius:50%;background:rgba(255,255,255,0.35);pointer-events:none;', layer);
  const reflowKnob = () => place(stickKnob, stickCenter.x + knobOffset.x - KNOB_R, stickCenter.y + knobOffset.y - KNOB_R, KNOB_R * 2, KNOB_R * 2);
  reflowKnob();
  reflowListeners.add(reflowKnob);

  const fireBtn = child(circleButton(layer, FIRE, FIRE_R, 'FIRE', 16));
  const pauseBtn = child(smallButton(layer, PAUSE, 'X', 13));
  const weaponBtn = child(smallButton(layer, WEAPON, 'V', 13));
  // Flips OPTIONS → ORIENTATION between HORIZONTAL and VERTICAL (AUTO goes to
  // VERTICAL first), per direct request: "a button (mobile only) to switch
  // between vertical/horisontal".
  const rotateBtn = child(smallButton(layer, ROTATE, '↻', 26));
  // The manual save (savegame.js): the keyboard's [Shift] / [Enter]
  const saveBtn = child(smallButton(layer, SAVE_BTN, 'SAVE', 11));
  const loadBtn = child(smallButton(layer, LOAD_BTN, 'LOAD', 11));
  // Full screen, on the website only (its frame allows it; itch has its own
  // button), and only where the browser can (not on an iPhone).
  const fullBtn = child(smallButton(layer, FULL_BTN, fullscreenIcon(), 13));

  // Which top-row buttons show, per direct request ("do all four phone
  // fixes"): SAVE, LOAD and V only during a level (V on the hub too, where it
  // switches weapon), and only when they do something; X and ↻ always.
  const row = [
    [pauseBtn, PAUSE, () => true],
    [weaponBtn, WEAPON, m => m === 'hub' || (m === 'level' && !world.weaponForced && world.canSwitchAtAll)],
    [rotateBtn, ROTATE, () => true],
    [saveBtn, SAVE_BTN, m => m === 'level' && !world.speedrun && !world.endless],
    [loadBtn, LOAD_BTN, m => m === 'level' && !world.speedrun && !world.endless],
    [fullBtn, FULL_BTN, () => SITE_MODE && FULLSCREEN_OK],
  ];
  let rowKey = '';
  const layoutTopRow = () => {
    const mode = world.inLevel && !world._over ? 'level' : world.inHub ? 'hub' : 'menu';
    const look = mode === 'level' ? TOP_ROW_LEVEL : TOP_ROW_MENU;
    const shown = row.map(([, , show]) => !!show(mode));
    const key = mode + shown.join();
    if (key === rowKey) return;
    rowKey = key;
    let i = 0;
    row.forEach(([b, pos], j) => {
      b.style.display = shown[j] ? '' : 'none';
      if (!shown[j]) return;
      // full screen sits alone in the top-left corner, clear of the title logo
      if (b === fullBtn) Object.assign(pos, { x: 50, y: look.y });
      else Object.assign(pos, { x: SCREEN_W - 50 - TOP_ROW_GAP * i++, y: look.y });
      b.face.style.transform = look.face === 1 ? '' : 'scale(' + look.face + ')';
      b.face.style.opacity = look.alpha;
    });
    notifyReflow();
  };
  layoutTopRow();
  (function poll() { layoutTopRow(); requestAnimationFrame(poll); })();

  // --- Joystick: touching down anywhere in stickZone recentres the base to
  // that point (beginStick), then tracks the drag from there (updateStick).
  // setPointerCapture on the zone means the finger can wander anywhere on
  // screen mid-drag without losing tracking.
  const stickKeys = { left: false, right: false, up: false, down: false };
  const setStickKey = (k, on) => {
    if (stickKeys[k] === on) return;
    stickKeys[k] = on;
    if (on) input.simulateDown(k); else input.simulateUp(k);
  };
  const updateStick = (clientX, clientY) => {
    const rect = stickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const { x: ldx, y: ldy } = toLocalDelta(clientX - cx, clientY - cy);
    const d = Math.hypot(ldx, ldy);
    const clamped = Math.min(d, STICK_R);
    const nx = d > 0 ? ldx / d : 0, ny = d > 0 ? ldy / d : 0;
    knobOffset = { x: nx * clamped, y: ny * clamped };
    reflowKnob();
    const active = d > STICK_R * STICK_DEADZONE;
    // Full 360° movement in gameplay: player.js's axis() prefers this
    // continuous (nx,ny) over the discrete keys below whenever it's set.
    input.setAnalogAxis(active ? { x: nx, y: ny } : { x: 0, y: 0 });
    // Discrete up/down/left/right edges still drive menu navigation (cursor
    // movement, the letter picker, ...), which reads wasPressed edges, not
    // an analog vector — an 8-way snap reads fine there, same as keyboard.
    setStickKey('left', active && nx < -0.35);
    setStickKey('right', active && nx > 0.35);
    setStickKey('up', active && ny < -0.35);
    setStickKey('down', active && ny > 0.35);
  };
  const beginStick = (clientX, clientY) => {
    const p = pageToDesign(clientX, clientY);
    stickCenter = {
      x: clamp(p.x, STICK_ZONE.x0 + STICK_R, Math.max(STICK_ZONE.x0 + STICK_R, STICK_ZONE.x1 - STICK_R)),
      y: clamp(p.y, STICK_R, SCREEN_H - STICK_R),
    };
    reflowBase();
    knobOffset = { x: 0, y: 0 };
    reflowKnob();
    input.setAnalogAxis({ x: 0, y: 0 });
  };
  const resetStick = () => {
    stickCenter = { ...STICK_REST };
    reflowBase();
    knobOffset = { x: 0, y: 0 };
    reflowKnob();
    setStickKey('left', false); setStickKey('right', false);
    setStickKey('up', false); setStickKey('down', false);
    input.clearAnalogAxis();
    stickPointerId = null;
  };
  stickZone.addEventListener('pointerdown', e => {
    if (stickPointerId !== null) return;   // one finger drives the stick at a time
    stickPointerId = e.pointerId;
    stickZone.setPointerCapture(e.pointerId);
    beginStick(e.clientX, e.clientY);
  });
  stickZone.addEventListener('pointermove', e => {
    if (e.pointerId === stickPointerId) updateStick(e.clientX, e.clientY);
  });
  const endStick = e => { if (e.pointerId === stickPointerId) resetStick(); };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);

  // --- Simple tap/hold buttons — no position math needed at all; the
  // browser already routes each tap to the right element under the finger,
  // rotation and all.
  fireBtn.addEventListener('pointerdown', e => { fireBtn.setPointerCapture(e.pointerId); input.simulateDown('fire'); });
  fireBtn.addEventListener('pointerup', () => input.simulateUp('fire'));
  fireBtn.addEventListener('pointercancel', () => input.simulateUp('fire'));

  pauseBtn.addEventListener('pointerdown', () => { input.simulateDown('pause'); input.simulateUp('pause'); });
  weaponBtn.addEventListener('pointerdown', () => { input.simulateDown('weapon'); input.simulateUp('weapon'); });
  saveBtn.addEventListener('pointerdown', () => { input.simulateDown('shift'); input.simulateUp('shift'); });
  loadBtn.addEventListener('pointerdown', () => { input.simulateDown('enter'); input.simulateUp('enter'); });
  fullBtn.addEventListener('click', () => {
    try {
      if (fullscreenEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        const d = document.documentElement;
        const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {}
  });
  rotateBtn.addEventListener('pointerdown', () => {
    setOrientation(getOrientation() === 'vertical' ? 'horizontal' : 'vertical');
    refitCanvas();
  });

  // --- Taps on the screen itself (tap.js): a quick touch that didn't drag
  // and didn't land on one of the buttons above becomes input.tapAt(), in
  // design units, so menus can be pressed directly. A tap in the joystick's
  // catch zone counts too (with no drag the stick does nothing anyway).
  [fireBtn, pauseBtn, weaponBtn, rotateBtn, saveBtn, loadBtn, fullBtn].forEach(b => { b.dataset.notap = '1'; });
  const taps = new Map();
  window.addEventListener('pointerdown', e => {
    if (e.target && e.target.closest && e.target.closest('[data-notap]')) return;
    taps.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  }, true);
  const tapEnd = e => {
    const s = taps.get(e.pointerId);
    taps.delete(e.pointerId);
    if (!s || e.type !== 'pointerup') return;
    if (performance.now() - s.t > TAP_TIME || Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_SLOP) return;
    const p = pageToDesign(e.clientX, e.clientY);
    if (input.isMirrored()) p.x = SCREEN_W - p.x;   // DELTA: the canvas is drawn mirrored
    input.setTap(p);
  };
  window.addEventListener('pointerup', tapEnd, true);
  window.addEventListener('pointercancel', tapEnd, true);

  const controls = {
    hide() { layer.style.display = 'none'; },
    show() { layer.style.display = ''; },
  };
  world.touchControls = controls;
  return controls;
}

// A small on-screen keypad for scoreui.js's PIN / save-code entry — those
// read raw `keydown` events for arbitrary character input, which don't
// exist on a phone. `charset` is the buttons shown; the callbacks fire
// exactly like the keys they stand in for, so callers can drive the same
// handleKey(key) a real keydown listener would call.
export function createKeypad(world, { charset, onChar, onBackspace, onEnter, onCancel, y0 = SCREEN_H / 2 + 100 }) {
  if (!wrap) return { destroy() {} };
  const layer = el('div', 'position:absolute;inset:0;z-index:10;', wrap);
  layer.dataset.notap = '1';   // its keys aren't taps on the screen (tap.js)
  const myReflows = [];

  const cols = charset.length <= 10 ? 5 : 12;
  const cellW = Math.min(70, (SCREEN_W - 40) / cols);
  const cellH = 46;
  const startX = SCREEN_W / 2 - (cols * cellW) / 2 + cellW / 2;

  const keyCss = 'position:absolute;box-sizing:border-box;border:1.5px solid rgba(255,255,255,0.5);' +
    'background:rgba(255,255,255,0.08);color:#fff;font-family:Tektur,monospace;letter-spacing:1px;' +
    'display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none;border-radius:6px;';

  const makeKey = (text, cx, cy, w, h, onTap, fontSize) => {
    const k = el('div', keyCss + 'font-size:' + fontSize + 'px;', layer);
    k.textContent = text;
    const reflow = () => place(k, cx - w / 2, cy - h / 2, w, h);
    reflow();
    reflowListeners.add(reflow);
    myReflows.push(reflow);
    k.addEventListener('pointerdown', e => { e.stopPropagation(); onTap(); });
  };

  charset.forEach((ch, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    makeKey(ch, startX + col * cellW, y0 + row * cellH, cellW - 6, cellH - 6, () => onChar(ch), 18);
  });
  const rows = Math.ceil(charset.length / cols);
  const ctrlY = y0 + rows * cellH + 8;
  if (onCancel) makeKey('ESC', SCREEN_W / 2 - 110, ctrlY, 90, 38, onCancel, 15);
  makeKey('DEL', SCREEN_W / 2, ctrlY, 90, 38, onBackspace, 15);
  makeKey('OK', SCREEN_W / 2 + 110, ctrlY, 90, 38, onEnter, 15);

  return {
    destroy() {
      myReflows.forEach(fn => reflowListeners.delete(fn));
      layer.remove();
    },
  };
}
