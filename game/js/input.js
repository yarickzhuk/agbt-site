// input.js — raw keyboard state, no framework.
const down = new Set();
const pressed = new Set();   // edge: went down this frame
const released = new Set();  // edge: came up this frame

const CODES = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  KeyZ: 'fire', Space: 'fire', KeyC: 'lock', KeyV: 'weapon', KeyX: 'pause',
  ControlLeft: 'ctrl', ControlRight: 'ctrl',       // held while entering the hidden unlock-all code (cheat.js)
  ShiftLeft: 'shift', ShiftRight: 'shift',         // save the game (savegame.js)
  Enter: 'enter',                                  // loads the save (savegame.js); with Ctrl held, submits the hidden code
  Escape: 'back',                                  // menu/hub/scoreboard "back to title" -- main.js's own gameplay loop never reads this, on purpose (no in-level quit)
};

let onFirstKey = null;
// Full-360° movement direction from the mobile joystick (mobile.js) — set
// while it's actively deflected, cleared on release. axis() prefers this
// over the discrete key-based 8-way computation when present, so a
// keyboard/gamepad never loses its snap-to-8-directions feel (nothing sets
// this off a touch device) while a touch joystick isn't artificially
// limited to 8 directions the way four boolean keys would be.
let analogAxis = null;

// DELTA costume: the whole picture is mirrored left-right (mobile.js), so
// left and right swap here too — every press, keyboard or touch, and the
// joystick's analog x — and "right" still moves things right on screen.
let mirror = false;
const flip = k => mirror && k === 'left' ? 'right' : mirror && k === 'right' ? 'left' : k;
const swapHeld = (set) => {
  const l = set.has('left'), r = set.has('right');
  set.delete('left'); set.delete('right');
  if (l) set.add('right'); if (r) set.add('left');
};

// Shared by real keydown/keyup and touch controls (mobile.js) so a virtual
// press behaves identically to a physical one everywhere that reads
// isDown/wasPressed/wasReleased/axis.
function setDown(k) {
  k = flip(k);
  if (!down.has(k)) pressed.add(k);
  down.add(k);
  if (onFirstKey) { onFirstKey(); onFirstKey = null; }
}
function setUp(k) {
  k = flip(k);
  down.delete(k);
  released.add(k);
}

// A tap or click anywhere on the page: a phone has no keys, so the
// "press any key" sound gate (intro.js) and the first-input audio unlock
// have to accept a touch too, or the game sits on its gate looking frozen.
let tappedEdge = false;
// A phone tap on the game screen, in design coordinates (mobile.js sets it on
// a quick touch that didn't drag and didn't land on a control button), so
// menus can be tapped directly instead of steered with the joystick.
let tapPoint = null;
const pointersDown = new Set();
window.addEventListener('pointerdown', e => {
  tappedEdge = true;
  pointersDown.add(e.pointerId);
  if (onFirstKey) { onFirstKey(); onFirstKey = null; }
}, true);
// A quick tap lifts before the next frame; keep it "down" two more frames so
// a per-frame isDown-style check still sees it.
const pointerOff = e => requestAnimationFrame(() => requestAnimationFrame(() => pointersDown.delete(e.pointerId)));
window.addEventListener('pointerup', pointerOff, true);
window.addEventListener('pointercancel', pointerOff, true);

window.addEventListener('keydown', e => {
  const k = CODES[e.code];
  if (!k) return;
  e.preventDefault();
  setDown(k);
});
window.addEventListener('keyup', e => {
  const k = CODES[e.code];
  if (!k) return;
  e.preventDefault();
  setUp(k);
});

export const input = {
  isDown: k => down.has(k),
  wasPressed: k => pressed.has(k),
  wasReleased: k => released.has(k),
  // "Back out" on navigational screens (hub, OPTIONS, COSTUMES, scoreboard):
  // [X], per direct request ("change exit button from [esc] to [x]"). X is
  // the pause key, but those screens never run alongside gameplay, so there's
  // no clash — and on mobile the on-screen X button now backs out too. Esc
  // still works as a silent alias. Text-entry screens (save code, PIN) keep
  // Esc, since X is a letter you can type there.
  backPressed: () => pressed.has('pause') || pressed.has('back'),
  // This frame's presses in the actual order their keydown events fired (a
  // Set iterates in insertion order) — needed anywhere press *order* within
  // a single frame matters, e.g. the cheat code: checking a fixed key order
  // instead would silently swap two direction presses landing in the same
  // ~16ms frame and break an otherwise-correct sequence.
  pressedOrder: () => [...pressed],
  // Feed a virtual key press/release (touch controls) through the exact same
  // state the real keyboard listeners use, so every system that reads input
  // (movement, firing, menus, the cheat code, ...) can't tell the difference.
  simulateDown: setDown,
  simulateUp: setUp,
  axis: () => (analogAxis && mirror ? { x: -analogAxis.x, y: analogAxis.y } : analogAxis) || {
    x: (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0),
    y: (down.has('down') ? 1 : 0) - (down.has('up') ? 1 : 0),
  },
  // Touch joystick only — see analogAxis above.
  setAnalogAxis: v => { analogAxis = v; },
  clearAnalogAxis: () => { analogAxis = null; },
  // A key held while the mirror changes keeps its meaning on screen and
  // still lifts cleanly (its keyup is flipped the new way).
  setMirror: on => { on = !!on; if (on === mirror) return; mirror = on; swapHeld(down); },
  isMirrored: () => mirror,
  // clear per-frame edges; call at end of each frame
  endFrame: () => { pressed.clear(); released.clear(); tappedEdge = false; tapPoint = null; },
  // True for the frame after a tap/click anywhere on the page.
  tapped: () => tappedEdge,
  // This frame's tap on the screen ({ x, y } in design units) or null.
  // See tap.js for the helpers menus use to test it against their rows.
  tapAt: () => tapPoint,
  setTap: p => { tapPoint = p; },
  // True while a finger/mouse button is down anywhere on the page (the
  // level title cards' "press any key" accepts a touch as a key).
  touching: () => pointersDown.size > 0,
  onFirst: fn => { onFirstKey = fn; },
  // A screen that reads `wasPressed(key)` from its very first frame is
  // vulnerable right after a `location.reload()` (end screens, TRY AGAIN):
  // if the player is still physically holding the key, OS key-repeat can
  // fire a fresh keydown into the newly loaded page before they've let go,
  // instantly triggering whatever that key does there (e.g. launching the
  // stage-select cursor's first row instead of showing the hub). armGuard
  // returns a check() that only starts reporting presses once the key has
  // been observed *up* at least once — normally that's the very first frame
  // (the key usually isn't down yet), so it costs nothing in the common case.
  armGuard: key => {
    let armed = false;
    return () => {
      if (!armed && !down.has(key)) armed = true;
      return armed && pressed.has(key);
    };
  },
};
