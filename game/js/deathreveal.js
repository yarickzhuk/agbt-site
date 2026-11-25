// deathreveal.js — "show hitbox on death", a passive feature added after a
// "how tf I died?" complaint. The instant the player dies, the frame freezes
// for REVEAL_TIME and the hitboxes involved are drawn over it: the player's
// own (yellow) and whatever killed them (red). Then the death carries on as
// before — Game Over, or OUTER SPACE's respawn.
//
// The killer is `world.killedBy` (player.takeDamage records it; roast.js
// reads the same thing). Its hitbox is SNAPSHOT at the moment of death
// (`captureDeath`, called from player.die()), because plenty of hazards
// destroy themselves on contact (splash dots, asteroids) and phase code can
// clear the field right after a death.
//
// A hazard describes its hitbox by an optional `hitbox()` method returning
// `{ shapes, label? }`; anything without one that has numeric
// x/y/radius is drawn as that circle. Shapes are world units:
//   { circle: [x, y, r] }               { ring: [x, y, r, band] }
//   { seg: [x0, y0, x1, y1, halfW] }    { rect: [x0, y0, x1, y1] }
//   { poly: [[x, y], ...] }             { wedge: [x, y, r, a0, a1] }
//   { annulus: [x, y, r0, r1, a0, a1] } { dots: [[x, y], ...], r }
// The player's own hitbox is the ship's triangle (player.hull(),
// shiphull.js); `label` names a death that has no shape (a lost duel, the
// maze clock).
import { toScreen, PPU, SCREEN_W, SCREEN_H } from './core.js';
import { paletteColor } from './retro.js';

export const REVEAL_TIME = 1.8;   // seconds frozen on the death (first-pass)
const SKIP_AFTER = 0.5;           // fire skips the rest after this long

// Deaths that bypass takeDamage name themselves with a string.
const STRING_LABELS = {
  chomp: 'CHOMPED',
  nom: 'NOMMED — DON\'T TOUCH HIS HEAD',
  mazetimeout: 'OUT OF TIME',
  speedruntimeout: "TIME'S UP",
};

function describe(world, killer) {
  if (typeof killer === 'string') {
    const out = { shapes: [], label: STRING_LABELS[killer] || '' };
    // Plasmadrache Delta's nom: show the head it came from, if it's still there
    if (killer === 'nom') {
      const d = world.hittables.find(h => h.constructor.name === 'PlasmadracheDelta');
      if (d && d.hitbox) out.shapes = d.hitbox().shapes;
    }
    return out;
  }
  if (!killer) return { shapes: [] };
  if (typeof killer.hitbox === 'function') {
    try { return killer.hitbox() || { shapes: [] }; } catch (e) { return { shapes: [] }; }
  }
  if (typeof killer.x === 'number' && typeof killer.y === 'number' && typeof killer.radius === 'number') {
    return { shapes: [{ circle: [killer.x, killer.y, killer.radius] }] };
  }
  return { shapes: [] };
}

// Snapshot the hitboxes at the moment of death. Idempotent per death.
export function captureDeath(world) {
  if (world.deathSnap) return;
  const p = world.player;
  const d = describe(world, world.killedBy);
  world.deathSnap = {
    px: p.x, py: p.y,
    hull: p.hull ? p.hull() : null,
    shapes: d.shapes || [],
    label: d.label || '',
  };
}

const px = v => v * PPU;

function drawShape(g, s) {
  if (s.circle) { const [x, y, r] = s.circle; const [sx, sy] = toScreen(x, y); g.drawCircle(sx, sy, px(r)); }
  else if (s.ring) {
    const [x, y, r, b] = s.ring; const [sx, sy] = toScreen(x, y);
    g.drawCircle(sx, sy, px(r + b)); if (r - b > 0) g.drawCircle(sx, sy, px(r - b));
  } else if (s.seg) {
    // a capsule: the segment's two sides plus a round cap at each end
    const [x0, y0, x1, y1, hw] = s.seg;
    const [ax, ay] = toScreen(x0, y0), [bx, by] = toScreen(x1, y1);
    const a = Math.atan2(by - ay, bx - ax), w = px(hw);
    const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
    g.moveTo(ax + nx, ay + ny); g.lineTo(bx + nx, by + ny);
    g.arc(bx, by, w, a + Math.PI / 2, a - Math.PI / 2, true);
    g.lineTo(ax - nx, ay - ny);
    g.arc(ax, ay, w, a - Math.PI / 2, a + Math.PI / 2, true);
    g.closePath();
  } else if (s.rect) {
    const [x0, y0, x1, y1] = s.rect; const [ax, ay] = toScreen(x0, y0), [bx, by] = toScreen(x1, y1);
    g.drawRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
  } else if (s.poly) {
    const pts = s.poly.map(([x, y]) => toScreen(x, y));
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  } else if (s.wedge) {
    const [x, y, r, a0, a1] = s.wedge; const [sx, sy] = toScreen(x, y);
    g.moveTo(sx, sy); g.arc(sx, sy, px(r), a0, a1); g.closePath();
  } else if (s.annulus) {
    const [x, y, r0, r1, a0, a1] = s.annulus; const [sx, sy] = toScreen(x, y);
    g.moveTo(sx + Math.cos(a0) * px(r1), sy + Math.sin(a0) * px(r1));
    g.arc(sx, sy, px(r1), a0, a1);
    g.lineTo(sx + Math.cos(a1) * px(r0), sy + Math.sin(a1) * px(r0));
    g.arc(sx, sy, px(r0), a1, a0, true);
    g.closePath();
  } else if (s.dots) {
    const r = Math.max(1.5, px(s.r || 0.03));
    for (const [x, y] of s.dots) { const [sx, sy] = toScreen(x, y); g.drawCircle(sx, sy, r); }
  }
}

// Starts the freeze: draws the snapshot over the frozen scene. main.js calls
// stepDeathReveal every frame until it returns true.
export function startDeathReveal(world) {
  captureDeath(world);
  const snap = world.deathSnap;
  const layer = new PIXI.Container();
  layer.zIndex = 140;   // over the field and HUD, under cutscenes/end screens

  const hazard = new PIXI.Graphics();
  const red = paletteColor('blood');
  for (const s of snap.shapes) {
    hazard.lineStyle({ width: 3, color: red, alpha: 1 });
    hazard.beginFill(red, 0.3);
    drawShape(hazard, s);
    hazard.endFill();
  }
  const me = new PIXI.Graphics();
  const [sx, sy] = toScreen(snap.px, snap.py);
  me.lineStyle({ width: 2.5, color: paletteColor('hull'), alpha: 1 });
  me.beginFill(paletteColor('hull'), 0.25);
  if (snap.hull) me.drawPolygon(snap.hull.flatMap(([x, y]) => toScreen(x, y)));
  me.endFill();
  me.moveTo(sx - 4, sy); me.lineTo(sx + 4, sy);
  me.moveTo(sx, sy - 4); me.lineTo(sx, sy + 4);
  layer.addChild(hazard, me);

  if (snap.label) {
    const t = new PIXI.Text(snap.label, {
      fontFamily: 'Tektur', fontSize: 26, fill: red, align: 'center',
    });
    t.anchor.set(0.5, 1);
    t.position.set(SCREEN_W / 2, SCREEN_H - 24);
    layer.addChild(t);
  }
  world.stage.addChild(layer);

  // Show the ship itself again, faintly, so its hitbox reads against it.
  const pc = world.player.container;
  if (pc) { pc.visible = true; pc.alpha = 0.5; }

  world.deathReveal = { t: 0, layer, hazard };
  world.paused = true;   // freezes the level's own waits/runFor (core.js) too
}

// Advances the freeze; returns true once it's over (and tears it down).
export function stepDeathReveal(world, dt, firePressed) {
  const r = world.deathReveal;
  if (!r) return true;
  r.t += dt;
  r.hazard.alpha = 0.8 + 0.2 * Math.cos(r.t * 9);   // a pulse, so it reads as an overlay
  if (r.t < REVEAL_TIME && !(firePressed && r.t >= SKIP_AFTER)) return false;
  endDeathReveal(world);
  return true;
}

export function endDeathReveal(world) {
  const r = world.deathReveal;
  if (r && r.layer && !r.layer.destroyed) r.layer.destroy({ children: true });
  const pc = world.player && world.player.container;
  if (pc) { pc.alpha = 1; if (world.player.dead) pc.visible = false; }
  world.deathReveal = null;
  world.deathRevealDone = true;
  world.deathSnap = null;
  world.paused = false;
}
