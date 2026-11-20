// shiphull.js — the player's hitbox is the ship's own triangle, not a circle.
//
// Per direct request ("why triangle still has blind spots in it's hitbox?
// Why you can't make it EXACT SHAPE AND SIZE"): a 0.22 circle round the
// ship both missed the two back corners (they sit 0.224 out) and covered
// empty space ahead of the nose and beside the slanted sides -- and while
// moving the ship is drawn as a different, forward-shifted triangle the
// circle didn't follow at all. Every hazard now tests the player against
// the drawn triangle, turned with the ship, plus half its stroke.
//
// Plain geometry on [x, y] point lists; the same functions work in world
// units or in a sprite's local pixels (silhouette.js), as long as all the
// inputs share one space.
import { PPU } from './core.js';
import { shapeParts } from './retro.js';

// The ship's outer triangle, from its own shape file: PlayerNormal at rest,
// PlayerMove while moving (a slimmer triangle drawn further forward; its
// exhaust flame behind isn't part of the ship, so it doesn't count). Centred
// the way buildSprite centres it, in world units, nose along +x.
const BASE = {};
function baseHull(name) {
  if (!BASE[name]) {
    const part = shapeParts(name, 1).find(q => q.poly);
    BASE[name] = part ? part.poly.map(([x, y]) => [x / PPU, y / PPU])
                      : [[-0.175, -0.14], [0.175, 0], [-0.175, 0.14]];
  }
  return BASE[name];
}
// The ship is drawn with a 2px stroke centred on that outline: half of it
// lies outside, so it's part of what you see.
export const HULL_STROKE = 1 / PPU;

// The triangle in world units at (x, y), turned by `rot` radians.
export function hullAt(x, y, rot, moving = false) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return baseHull(moving ? 'PlayerMove' : 'PlayerNormal')
    .map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}

export function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)) : 0;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cross(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
function segsCross(a, b, c, d) {
  const d1 = cross(c[0], c[1], d[0], d[1], a[0], a[1]), d2 = cross(c[0], c[1], d[0], d[1], b[0], b[1]);
  const d3 = cross(a[0], a[1], b[0], b[1], c[0], c[1]), d4 = cross(a[0], a[1], b[0], b[1], d[0], d[1]);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function segSegDist(a, b, c, d) {
  if (segsCross(a, b, c, d)) return 0;
  return Math.min(segDist(a[0], a[1], c[0], c[1], d[0], d[1]), segDist(b[0], b[1], c[0], c[1], d[0], d[1]),
                  segDist(c[0], c[1], a[0], a[1], b[0], b[1]), segDist(d[0], d[1], a[0], a[1], b[0], b[1]));
}

// Distance from a point to a polygon's area (0 inside).
export function pointPolyDist(x, y, poly) {
  if (inPoly(x, y, poly)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, segDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return best;
}

// Distance between a segment and a polygon's area (0 if they overlap).
export function segPolyDist(x0, y0, x1, y1, poly) {
  if (inPoly(x0, y0, poly) || inPoly(x1, y1, poly)) return 0;
  const a = [x0, y0], b = [x1, y1];
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, segSegDist(a, b, poly[j], poly[i]));
    if (best === 0) return 0;
  }
  return best;
}

// Distance between two polygons' areas (0 if they overlap).
export function polyPolyDist(A, B) {
  if (inPoly(A[0][0], A[0][1], B) || inPoly(B[0][0], B[0][1], A)) return 0;
  let best = Infinity;
  for (let i = 0, j = A.length - 1; i < A.length; j = i++) {
    for (let k = 0, l = B.length - 1; k < B.length; l = k++) {
      best = Math.min(best, segSegDist(A[j], A[i], B[l], B[k]));
      if (best === 0) return 0;
    }
  }
  return best;
}

// Farthest point of a polygon from (x, y).
export function farthest(x, y, poly) {
  let best = 0;
  for (const [px, py] of poly) best = Math.max(best, Math.hypot(px - x, py - y));
  return best;
}
