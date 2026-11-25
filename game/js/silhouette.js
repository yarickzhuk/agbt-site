// silhouette.js — hitboxes that match the drawn art instead of a circle.
//
// Per direct request ("make saw hitboxes match spikes (and other stuff like
// that where there's nothing in hitboxes)"): most hazards tested the player
// against one circle, so the SAW hurt you in the empty notches between its
// spikes, a Knight's circle was twice its body (and its sword never hurt),
// and long shapes (lollipop, piranha) had circles that missed half of them.
//
// A hazard that calls useSilhouette(this) is tested against the outline of
// every visible sprite buildSprite made inside its container (sword
// included): inside a layer's polygon, or within the hit radius (+ half the
// stroke) of any of its edges. It follows the container's live position,
// rotation, scale and flips. Both touching the player (`touches(p)`, the
// ship's own triangle against the outline, shiphull.js) and
// shots hitting it (`hitTest`, read by bullet.js/bouncyball.js and the
// LINE SLASHER dash) use it. `radius` is left alone: the SLASH, aim assist
// and edge bounces still read it as a rough bound.
import { shapeParts } from './retro.js';
import { PPU, SCREEN_W, SCREEN_H } from './core.js';
import { HULL_STROKE, segPolyDist, polyPolyDist } from './shiphull.js';

const partCache = new Map();
function partsOf(sh) {
  const key = sh.name + '|' + sh.scale;
  let p = partCache.get(key);
  if (!p) { p = shapeParts(sh.name, sh.scale); partCache.set(key, p); }
  return p;
}

// Every visible sprite built from a shape, with its transform into the
// stage's own coordinates (where toScreen() positions everything).
function shapeNodes(root, stage) {
  const out = [];
  const walk = node => {
    if (!node || node.destroyed || !node.visible) return;
    if (node._shape) {
      const m = new PIXI.Matrix();
      const chain = [];
      for (let o = node; o && o !== stage; o = o.parent) {
        o.transform.updateLocalTransform();
        chain.push(o.transform.localTransform);
      }
      for (let i = chain.length - 1; i >= 0; i--) m.append(chain[i]);
      out.push({ node, m, parts: partsOf(node._shape), lw: node._shape.lineWidth });
    }
    (node.children || []).forEach(walk);
  };
  walk(root);
  return out;
}

function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)) : 0;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Does a circle at world (wx, wy), radius r, touch the art under `root`?
export function silhouetteHit(stage, root, wx, wy, r) {
  const sp = new PIXI.Point(SCREEN_W / 2 + wx * PPU, SCREEN_H / 2 + wy * PPU);
  for (const { m, parts, lw } of shapeNodes(root, stage)) {
    const k = Math.min(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) || 1;
    const q = m.applyInverse(sp);
    const tol = r * PPU / k + lw / 2;
    for (const part of parts) {
      if (part.seg) {
        const [x0, y0, x1, y1] = part.seg;
        if (segDist(q.x, q.y, x0, y0, x1, y1) <= tol + part.r) return true;
        continue;
      }
      const poly = part.poly;
      if (inPoly(q.x, q.y, poly)) return true;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (segDist(q.x, q.y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]) <= tol) return true;
      }
    }
  }
  return false;
}

// Does the player's ship (a polygon in world units, player.hull()) touch the
// art under `root`? The same outline test, polygon against polygon.
export function silhouetteHitPoly(stage, root, wpoly) {
  const sp = wpoly.map(([x, y]) => new PIXI.Point(SCREEN_W / 2 + x * PPU, SCREEN_H / 2 + y * PPU));
  for (const { m, parts, lw } of shapeNodes(root, stage)) {
    const k = Math.min(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) || 1;
    const q = sp.map(pt => { const l = m.applyInverse(pt); return [l.x, l.y]; });
    const tol = HULL_STROKE * PPU / k + lw / 2;
    for (const part of parts) {
      if (part.seg) {
        const [x0, y0, x1, y1] = part.seg;
        if (segPolyDist(x0, y0, x1, y1, q) <= tol + part.r) return true;
      } else if (polyPolyDist(q, part.poly) <= tol) return true;
    }
  }
  return false;
}

// The same outline in world units, for deathreveal.js to draw.
export function silhouetteShapes(stage, root) {
  const toW = (m, x, y) => {
    const p = m.apply(new PIXI.Point(x, y));
    return [(p.x - SCREEN_W / 2) / PPU, (p.y - SCREEN_H / 2) / PPU];
  };
  const out = [];
  for (const { m, parts } of shapeNodes(root, stage)) {
    const k = Math.min(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) || 1;
    for (const part of parts) {
      if (part.seg) {
        const [x0, y0, x1, y1] = part.seg;
        out.push({ seg: [...toW(m, x0, y0), ...toW(m, x1, y1), part.r * k / PPU] });
      } else {
        out.push({ poly: part.poly.map(([x, y]) => toW(m, x, y)) });
      }
    }
  }
  return out;
}

// Opt a hazard in: hits and touches follow `h.container`'s drawn outline.
export function useSilhouette(h) {
  h.usesSilhouette = true;
  h.hitTest = (x, y, r) => silhouetteHit(h.world.stage, h.container, x, y, r);
  h.touches = p => p.hull ? silhouetteHitPoly(h.world.stage, h.container, p.hull())
                          : silhouetteHit(h.world.stage, h.container, p.x, p.y, p.hitRadius);
  if (!h.hitbox) h.hitbox = () => ({ shapes: silhouetteShapes(h.world.stage, h.container) });
}
