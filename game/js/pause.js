// pause.js — NES-style hard pause: everything freezes exactly where it is,
// no menu, no overlay text. The one modern concession is desaturating the
// screen while paused, so a frozen game doesn't just read as lag (that's
// what a raw freeze looked like on actual 1980s hardware, but a browser tab
// that stops moving reads as broken rather than intentional). [X] toggles it;
// main.js gates it out on the pre-game/end screens, which own the ticker
// themselves while they're up.
//
// Mega Man 1 pause-glitch homage: a charged (piercing) bullet only ever
// lands one hit on a given target — bullet.js's per-bullet `struck` set
// blocks a re-hit even while the bullet is still passing through it. On
// unpause, any target a piercing bullet is STILL touching gets re-armed, so
// pause-spamming while a torpedo sits inside a big hitbox (the SAW, C.R.O.C.K)
// lands extra hits — the same frame-stepping abuse the NES original was
// (in)famous for, done on purpose here.
import { Bullet } from './bullet.js';
import { dist } from './core.js';

let sharedFilter = null;
function greyFilter() {
  if (sharedFilter !== null) return sharedFilter;
  try {
    sharedFilter = new PIXI.filters.ColorMatrixFilter();
    sharedFilter.desaturate();
  } catch (e) {
    sharedFilter = false;   // ColorMatrixFilter unavailable — fall back below
  }
  return sharedFilter;
}

function setVisual(world, paused) {
  const f = greyFilter();
  // Unpausing restores the stage's own filters (DELTA's monochrome, costumes.js), not none.
  if (f) { world.stage.filters = paused ? [f] : (world.baseFilters || null); return; }
  // Fallback if the filter isn't available for some reason: a flat grey wash.
  if (!world._pauseOverlay) {
    const g = new PIXI.Graphics();
    g.beginFill(0x808080, 0.55).drawRect(0, 0, world.app.screen.width, world.app.screen.height).endFill();
    g.zIndex = 1000;
    world._pauseOverlay = g;
  }
  if (paused) world.stage.addChild(world._pauseOverlay);
  else if (world._pauseOverlay.parent) world.stage.removeChild(world._pauseOverlay);
}

export function togglePause(world) {
  world.paused = !world.paused;
  setVisual(world, world.paused);
  if (world.paused) {
    world.audio.play('pause', 0.6);
  } else {
    world.audio.play('unpause', 0.6);
    reArmOverlappingHits(world);
  }
}

// Clear a charged bullet's "already struck" record for any Hittable it's
// still physically overlapping, so the very next checkHits() (bullet.js)
// lands a fresh hit on it.
export function reArmOverlappingHits(world) {
  for (const e of world.updatables) {
    if (!(e instanceof Bullet) || !e.charged || e.dying || e.struck.size === 0) continue;
    for (const h of world.hittables) {
      if (!h || h.dead || !e.struck.has(h)) continue;
      const within = h.hitTest ? h.hitTest(e.x, e.y, e.radius)
                               : dist(e.x, e.y, h.x, h.y) <= e.radius + h.radius;
      if (within) e.struck.delete(h);
    }
  }
}
