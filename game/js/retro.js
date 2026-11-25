// retro.js — turns the vector shape JSON into clean line art with PixiJS.
//
// Mirrors the "vector mode" rules from the Unity project's RetroRasterizer:
//   * a shape uses its layers tagged "V"; if it has none, it outlines its
//     flat "8" layers instead;
//   * "clip" layers are shading, not real edges, so they are skipped;
//   * "erase" layers are drawn as lines rather than cutting holes.
//
// Flat, crisp strokes on black — no glow, no bloom. The look is early-vector
// arcade, not a neon mobile game.
//
// One canonical mapping: 1 design unit = WORLD_SCALE screen pixels. Every
// shape shares it, so a shape's design size is its on-screen size and the
// hand-written hit-radius maths stay consistent.

// 1 world unit = 100 design units = PPU(70) px, so 0.70 px per design unit.
export const WORLD_SCALE = 0.70; // px per design unit

const shapes = {};   // name -> shape JSON
let palette = null;  // { role: "#rrggbb" }

// `onItem`, if given, is called once per shape as it finishes loading --
// main.js's own boot-progress percentage reads off this (see its own
// `#boot-status` handling) rather than this file needing to know anything
// about a loading screen itself.
export async function loadRetro(shapeNames, onItem) {
  const pj = await fetch('assets/palette/vector.json').then(r => r.json());
  palette = {};
  pj.names.forEach((n, i) => { palette[n] = pj.colors[i]; });
  palette._meta = pj;

  await Promise.all(shapeNames.map(async name => {
    shapes[name] = await fetch(`assets/shapes/${name}.json`).then(r => r.json());
    if (onItem) onItem();
  }));
}

export function getShape(name) { return shapes[name]; }

function colorOf(role) {
  const hex = (palette && (palette[role] || palette.white)) || '#ffffff';
  return parseInt(hex.slice(1), 16);
}

// Looks up a palette role's colour as a Pixi-style 0xRRGGBB int — for callers
// (e.g. bouncyball.js's fully-orange charged tint) that need a palette colour
// outside of buildSprite's own per-layer lookup.
export function paletteColor(role) { return colorOf(role); }

function modesOf(layer) {
  return (layer.modes || '8,16,32').split(',').map(s => s.trim());
}

// Pick the layers that make up the vector outline of a shape.
function vectorLayers(shape) {
  const v = shape.layers.filter(l => modesOf(l).includes('V') && !l.clip);
  if (v.length) return v;
  return shape.layers.filter(l => !l.clip && modesOf(l).includes('8'));
}

// Trace one layer's geometry onto a Graphics as a closed/open polyline.
// Coordinates are shifted so the shape's centre sits at (0,0).
function traceLayer(g, layer, cx, cy, s) {
  const X = x => (x - cx) * s;
  const Y = y => (y - cy) * s;

  switch (layer.type) {
    case 'polygon': {
      const p = layer.points;
      g.moveTo(X(p[0]), Y(p[1]));
      for (let i = 2; i < p.length; i += 2) g.lineTo(X(p[i]), Y(p[i + 1]));
      g.lineTo(X(p[0]), Y(p[1]));
      break;
    }
    case 'rect': {
      const x = layer.x, y = layer.y, w = layer.w, h = layer.h;
      const r = layer.radius || 0;
      if (r > 0) {
        g.moveTo(X(x + r), Y(y));
        g.lineTo(X(x + w - r), Y(y));
        g.quadraticCurveTo(X(x + w), Y(y), X(x + w), Y(y + r));
        g.lineTo(X(x + w), Y(y + h - r));
        g.quadraticCurveTo(X(x + w), Y(y + h), X(x + w - r), Y(y + h));
        g.lineTo(X(x + r), Y(y + h));
        g.quadraticCurveTo(X(x), Y(y + h), X(x), Y(y + h - r));
        g.lineTo(X(x), Y(y + r));
        g.quadraticCurveTo(X(x), Y(y), X(x + r), Y(y));
      } else {
        g.moveTo(X(x), Y(y));
        g.lineTo(X(x + w), Y(y));
        g.lineTo(X(x + w), Y(y + h));
        g.lineTo(X(x), Y(y + h));
        g.lineTo(X(x), Y(y));
      }
      break;
    }
    case 'ellipse': {
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const px = X(layer.cx + Math.cos(a) * layer.rx);
        const py = Y(layer.cy + Math.sin(a) * layer.ry);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      break;
    }
    case 'capsule': {
      // rounded line segment from (x1,y1) to (x2,y2), radius r
      const { x1, y1, x2, y2, r } = layer;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const N = 16;
      const pts = [];
      for (let i = 0; i <= N; i++) {           // cap at end 2
        const a = ang - Math.PI / 2 + (i / N) * Math.PI;
        pts.push([x2 + Math.cos(a) * r, y2 + Math.sin(a) * r]);
      }
      for (let i = 0; i <= N; i++) {           // cap at end 1
        const a = ang + Math.PI / 2 + (i / N) * Math.PI;
        pts.push([x1 + Math.cos(a) * r, y1 + Math.sin(a) * r]);
      }
      pts.push(pts[0]);
      pts.forEach(([px, py], i) => {
        if (i === 0) g.moveTo(X(px), Y(py)); else g.lineTo(X(px), Y(py));
      });
      break;
    }
    case 'star': {
      const { cx: sx, cy: sy, rOuter, rInner, count } = layer;
      const rot = (layer.rotation || 0) * Math.PI / 180;
      const N = count * 2;
      for (let i = 0; i <= N; i++) {
        const a = rot + (i / N) * Math.PI * 2 - Math.PI / 2;
        const rr = (i % 2 === 0) ? rOuter : rInner;
        const px = X(sx + Math.cos(a) * rr);
        const py = Y(sy + Math.sin(a) * rr);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      break;
    }
  }
}

// Build a glowing container for a named shape.
// opts.tint overrides every layer colour (used for damage flashes, etc.).
export function buildSprite(name, opts = {}) {
  const shape = shapes[name];
  if (!shape) { console.warn('no shape', name); return new PIXI.Container(); }

  const s = WORLD_SCALE * (opts.scale || 1);
  const cx = shape.width / 2, cy = shape.height / 2;
  const lineWidth = opts.lineWidth || 2;

  const container = new PIXI.Container();
  const layers = vectorLayers(shape);

  // Group layers by colour; one clean stroke per colour, no glow.
  const byColor = new Map();
  for (const layer of layers) {
    // opts.layerTints: { <index in shape.layers>: colour } wins over tint for
    // those layers (Showman Delta's pink moustache).
    const li = opts.layerTints ? shape.layers.indexOf(layer) : -1;
    const col = li >= 0 && opts.layerTints[li] != null ? opts.layerTints[li]
      : opts.tint != null ? opts.tint : colorOf(layer.fill);
    if (!byColor.has(col)) byColor.set(col, []);
    byColor.get(col).push(layer);
  }

  for (const [col, ls] of byColor) {
    const g = new PIXI.Graphics();
    for (const layer of ls) {
      g.lineStyle({ width: lineWidth, color: col, alpha: 1, cap: 'round', join: 'round' });
      traceLayer(g, layer, cx, cy, s);
    }
    container.addChild(g);
  }

  // What silhouette.js needs to rebuild this sprite's outline as a hitbox.
  container._shape = { name, scale: opts.scale || 1, lineWidth };
  return container;
}

// The shape's drawn outline in the sprite's own local pixels (the same
// coordinates buildSprite traces in): one closed polygon per layer, or a
// segment-plus-radius for a capsule. silhouette.js tests hits against it.
export function shapeParts(name, scale = 1) {
  const shape = shapes[name];
  if (!shape) return [];
  const s = WORLD_SCALE * scale;
  const cx = shape.width / 2, cy = shape.height / 2;
  const P = (x, y) => [(x - cx) * s, (y - cy) * s];
  const out = [];
  for (const l of vectorLayers(shape)) {
    if (l.type === 'polygon') {
      const p = l.points, poly = [];
      for (let i = 0; i < p.length; i += 2) poly.push(P(p[i], p[i + 1]));
      out.push({ poly });
    } else if (l.type === 'rect') {
      out.push({ poly: [P(l.x, l.y), P(l.x + l.w, l.y), P(l.x + l.w, l.y + l.h), P(l.x, l.y + l.h)] });
    } else if (l.type === 'ellipse') {
      const poly = [];
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2;
        poly.push(P(l.cx + Math.cos(a) * l.rx, l.cy + Math.sin(a) * l.ry));
      }
      out.push({ poly });
    } else if (l.type === 'capsule') {
      out.push({ seg: [...P(l.x1, l.y1), ...P(l.x2, l.y2)], r: l.r * s });
    } else if (l.type === 'star') {
      const rot = (l.rotation || 0) * Math.PI / 180, N = l.count * 2, poly = [];
      for (let i = 0; i < N; i++) {
        const a = rot + (i / N) * Math.PI * 2 - Math.PI / 2;
        const rr = (i % 2 === 0) ? l.rOuter : l.rInner;
        poly.push(P(l.cx + Math.cos(a) * rr, l.cy + Math.sin(a) * rr));
      }
      out.push({ poly });
    }
  }
  return out;
}
