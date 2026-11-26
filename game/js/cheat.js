// cheat.js — the author's own hidden testing tool (per direct request: "a
// new cheat code which I'll not tell anyone... it will instantly unlock
// everything in the game"). Its arrow sequence is UNLOCK_ALL_CODE,
// deliberately not spelled out in comments or CLAUDE.md. Entered by holding
// [Ctrl], typing the eight arrows, then [Enter] (still holding Ctrl), in
// gameplay or on the title screen. It writes real progress: every level and
// OUTER SPACE stage cleared, every costume unlocked. The costumes stick
// (settings.js); the cleared stages go the way of all progress on the next
// fresh tab, so re-enter it there.
//
// This file used to also hold the save-state cheat (another code, then
// [Shift] save / [Enter] load). That's a normal feature now: savegame.js.
import { input } from './input.js';
import { markCleared } from './progress.js';
import { SAVE_LEVELS } from './pin.js';
import { COSTUMES } from './costumes.js';
import { addUnlockedCostume } from './settings.js';

const UNLOCK_ALL_CODE = ['up', 'right', 'down', 'left', 'up', 'down', 'right', 'left'];

let buffer = [];

// Arrow glyphs for the live entry readout (hud.js's bottom-left `cheat` text).
const ARROWS = { up: '↑', right: '→', down: '↓', left: '←' };

function flash(ui, text, ms = 1200) {
  if (!ui) return;
  ui.setCenter(text);
  setTimeout(() => ui.setCenter(''), ms);
}

// Briefly tints the player's art orange, then back to normal — the visual
// confirmation that goes with the "EVERYTHING UNLOCKED!" flash. Graphics
// tint multiplies the drawn colour (same technique as kangaroo.js's `tint`),
// so this doesn't disturb the shape's own palette once it's reverted.
function glowPlayer(world, color = 0xFF8800, ms = 900) {
  const p = world.player;
  if (!p) return;
  const layers = [...p.normalArt.children, ...p.moveArt.children];
  layers.forEach(g => { g.tint = color; });
  setTimeout(() => { layers.forEach(g => { g.tint = 0xffffff; }); }, ms);
}

// Call once per frame during live gameplay (works even while paused, like
// the pause toggle itself — it's just watching for key edges), or from the
// title screen with its own `ui` ({ setCheatEntry, setCenter }; gameplay uses
// the HUD). Returns 'unlockAll' on the frame that code goes in.
const sameCode = (a, b) => a.length === b.length && b.every((d, i) => a[i] === d);
export function updateCheatEntry(world, ui = world.hud) {
  if (!input.isDown('ctrl')) {
    if (buffer.length && ui) ui.setCheatEntry('');
    buffer = [];
    return;   // must hold Ctrl the whole time
  }
  // Read presses in their actual keydown order (not a fixed up/right/down/left
  // scan order) — two directions landing in the same ~16ms frame would
  // otherwise risk being recorded in the wrong order and silently breaking
  // an otherwise-correct sequence.
  for (const dir of input.pressedOrder()) {
    if (!ARROWS[dir]) continue;
    world.audio.play(buffer.length === 0 ? 'cheatStart' : 'cheatInput', 0.5);
    buffer.push(dir);
    if (buffer.length > UNLOCK_ALL_CODE.length) buffer.shift();   // rolling window: only the last 8 matter
  }
  if (ui) ui.setCheatEntry(buffer.map(d => ARROWS[d]).join(' '));
  if (input.wasPressed('enter')) {
    const hadInput = buffer.length > 0;
    const entered = buffer;
    buffer = [];
    if (ui) ui.setCheatEntry('');
    if (sameCode(entered, UNLOCK_ALL_CODE)) { unlockAll(world, ui); return 'unlockAll'; }
    else if (hadInput) flash(ui, 'WRONG CODE', 700);
  }
  return null;
}

// Every level and stage cleared, every costume unlocked — see the header.
export function unlockAll(world, ui) {
  [...SAVE_LEVELS, 'outerspace'].forEach(markCleared);
  COSTUMES.forEach(c => addUnlockedCostume(c.id));
  world.audio.play('cheatSuccess', 0.8);
  flash(ui, 'EVERYTHING UNLOCKED!', 1600);
  glowPlayer(world, 0xFFE400);
}
