// tap.js — tapping menus directly on a phone, per direct request ("in
// mobile mode make so you can press on buttons by hand (like so you don't
// need to use joystic just to switch volume etc.)").
//
// mobile.js turns a quick touch on the game screen into input.tapAt() (design
// units, rotation and the DELTA mirror already undone). A menu's step reads
// it with these helpers, against the bounds of what it actually draws.
import { input } from './input.js';

// The tap, if it landed inside `obj`'s on-screen box grown by pad x / pad y.
function inside(obj, padX, padY) {
  const p = input.tapAt();
  if (!p || !obj || obj.destroyed || !obj.visible) return false;
  const b = obj.getBounds();
  return p.x >= b.x - padX && p.x <= b.x + b.width + padX &&
         p.y >= b.y - padY && p.y <= b.y + b.height + padY;
}

// Index of the row tapped, or -1. Rows are text lines stacked `gap` apart, so
// each row's hit band reaches halfway to its neighbours; sideways it reaches
// `padX` past the text (a short label is still easy to hit).
export function tapRow(items, gap = 40, padX = 120) {
  const p = input.tapAt();
  if (!p) return -1;
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    if (!t || t.destroyed || !t.visible) continue;
    const b = t.getBounds(), cy = b.y + b.height / 2;
    if (Math.abs(p.y - cy) <= gap / 2 && p.x >= b.x - padX && p.x <= b.x + b.width + padX) return i;
  }
  return -1;
}

// -1 / +1 for a tap on the left / right half of `obj` (its ◄ … ► arrows),
// 0 otherwise.
export function tapSide(obj, padX = 60, padY = 14) {
  if (!inside(obj, padX, padY)) return 0;
  const b = obj.getBounds();
  return input.tapAt().x < b.x + b.width / 2 ? -1 : 1;
}

// -1 / +1 for a tap on the left / right half of the whole screen (page turns).
export function tapHalf(screenW) {
  const p = input.tapAt();
  return p ? (p.x < screenW / 2 ? -1 : 1) : 0;
}

export function tapOn(obj, padX = 20, padY = 14) { return inside(obj, padX, padY); }
export function tappedAnywhere() { return !!input.tapAt(); }
