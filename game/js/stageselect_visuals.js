// stageselect_visuals.js
// ============================================================================
//  EDIT THIS FILE to design the hub / stage-select screen. This is the "visuals
//  gap" — the behaviour (cursor, locking, picking a level) lives in
//  stageselect.js and never needs touching. This file only draws.
//
//  Contract: export createStageSelectView(opts) -> { container, setCursor(i), setWeapon(name), update(dt) }
//    opts.rows : [{ label, dim, accent, id }]   — ready-to-draw menu rows
//                  dim=true    -> locked / unselectable look
//                  accent=true -> cleared / highlighted (green)
//                  id          -> the level id, one of TRIANGLES' own keys
//    opts.screenW, opts.screenH : numbers
//    container      : a PIXI.Container you build however you like
//    setCursor(i)   : called when the highlighted row changes (0-based)
//    update(dt)     : optional, called once a frame by stageselect.js -- used
//                     here to drive the triforce's cyan/dark-blue blink
//
//  Replace everything below with real art whenever you're ready — backgrounds,
//  per-stage thumbnails, animation, etc. Keep the exported shape the same and
//  the logic keeps working.
// ============================================================================
//
// Mega-Man-style portrait select, not a scrolling text list: a big centred
// triforce emblem (traced from the author's own `Level_select.sprite3`
// Scratch upload) is the whole screen's centrepiece, with the current
// selection's name shown big up top -- same idea as robot-master select,
// reworked around this game's own triforce reference art instead of a grid
// of portraits. `stageselect.js`'s cursor is a single up/down index over
// the 4 real stages -- the hub's whole job now, since TUTORIAL/SCOREBOARD/
// ENTER CODE moved to the title screen (menu.js) and no longer duplicate
// themselves here (per direct request: "why stage select has it? Remove
// those" -- the old "3 non-triangle slot portraits in a row underneath"
// this doc used to describe is gone along with them). Each of the 4 levels
// is one of the triforce's 4 triangles.
//
// The 4 triangle outlines are purple (`grape`) by default, or yellow
// (`hull`, glowing) once that level's been cleared; whichever one is the
// current selection blinks cyan <-> dark blue (`ring`/`cobalt` -- this
// game's own palette roles for the source SVG's own highlight-cyan / idle
// hues) regardless of cleared status -- the active-selection blink always
// wins over the idle cleared-glow. Each head icon sits inside its triangle.
import { paletteColor } from './retro.js';
import { formatScore } from './core.js';
import { getBestScore, getHitsTaken } from './progress.js';

const FONT = 'Tektur, monospace';
const CYAN = 0xffffff, WHITE = 0xffffff, GREEN = 0xffffff;

// Palette roles already used elsewhere in the game for these exact hues --
// grape (#B300FF) is the source SVG's idle purple, ring (#00E6FF) is its
// highlight cyan, cobalt (#2B00FF) is the dark blue half of the requested
// cyan/dark-blue blink, hull (#FFEA00-ish yellow) is what a cleared
// triangle glows -- replacing the old "✓" text suffix on its label.
const GRAPE = () => paletteColor('grape');
const HILITE_CYAN = () => paletteColor('ring');
const HILITE_DARKBLUE = () => paletteColor('cobalt');
const CLEARED_YELLOW = () => paletteColor('hull');

const BLINK_PERIOD = 0.5;   // seconds per half-cycle, matching the game's other flashes (e.g. K.A.N.G's WARNING)

// The 4 triangle vertex sets + icon placement, straight from the source SVG
// (332.318 x 259.435 viewBox, after its own translate(-86.5705,-71.30567)).
// Icon sizes are that same PNG's pixel size divided by the scale it was
// extracted at, so they land at their original in-emblem proportions.
const EMBLEM_W = 332.318, EMBLEM_H = 259.435;
const TRIANGLES = {
  // Positions match the source Level_select.sprite3 mockup exactly: SHAPE
  // LIMBO is the small upper/"top" triangle (apex-up, nestled between the
  // two big top ones), CYBER ZOO is the big bottom triangle (apex-down) --
  // confirmed by reading each costume's own baked-in title text, and per
  // direct correction ("Shape limbo should be on top, like in file I sent
  // you") after a prior turn had swapped these the other way around.
  shapelimbo: {
    verts: [[165.221, 6.887], [244.804, 127.963], [85.123, 128.287]],
    iconUrl: 'assets/sprites/stageselect/icon_shapelimbo.png',
    iconCenter: [165.0, 84], iconSize: [58.5, 59.1],
    boss: 'TRAPWHEEL', weapon: 'CHARGE CANNON',
  },
  cyberzoo: {
    verts: [[163.802, 257.135], [86.205, 135.030], [243.901, 135.734]],
    iconUrl: 'assets/sprites/stageselect/icon_cyberzoo.png',
    iconCenter: [164.6, 179], iconSize: [89.5, 78],
    boss: 'K.A.N.G', weapon: 'CYBER SHOTGUN',
  },
  crazycarnival: {
    verts: [[79.879, 123.365], [2.282, 1.260], [159.978, 1.965]],
    iconUrl: 'assets/sprites/stageselect/icon_crazycarnival.png',
    iconCenter: [80.7, 44], iconSize: [60.6, 88.0],
    boss: 'SHOWMAN', weapon: 'BOUNCY BALL',
  },
  occultacresburg: {
    verts: [[249.904, 123.847], [172.307, 1.742], [330.003, 2.446]],
    iconUrl: 'assets/sprites/stageselect/icon_occultacresburg.png',
    iconCenter: [250.7, 45], iconSize: [52.75, 73.5],
    boss: 'PLASMADRACHE', weapon: 'LINE SLASHER',
  },
};

const EMBLEM_SCALE = 1.32;
const MOBILE_DROP = 112;   // phone: everything below the touch buttons' row

export function createStageSelectView({ rows, screenW, screenH, weaponName, canSwitchWeapon, mobile }) {
  const container = new PIXI.Container();
  container.zIndex = 200;

  // ---- big current-selection title (Mega-Man's "robot master name" readout)
  const title = new PIXI.Text('', {
    fontFamily: FONT, fontSize: 40, fill: CYAN, letterSpacing: 4, align: 'center',
  });
  title.anchor.set(0.5);
  // A phone's X/V/↻/SAVE/LOAD buttons sit along the top (mobile.js, y 38-122),
  // so there the title and emblem start below them; the stat block still
  // clears the hint.
  const drop = mobile ? MOBILE_DROP : 0;
  title.position.set(screenW / 2, 38 + drop);
  container.addChild(title);

  // ---- the triforce emblem, the screen's centrepiece ----------------------
  const emblemX = screenW / 2, emblemY = 250 + drop;
  const toScreen = ([x, y]) => [
    emblemX + (x - EMBLEM_W / 2) * EMBLEM_SCALE,
    emblemY + (y - EMBLEM_H / 2) * EMBLEM_SCALE,
  ];

  const emblem = new PIXI.Container();
  container.addChild(emblem);

  // Which triangles are already cleared -- fixed for this view's lifetime
  // (rebuilt fresh on every hub entry), so it only needs computing once.
  const clearedMap = {};
  rows.forEach(r => { if (r.id && TRIANGLES[r.id]) clearedMap[r.id] = !!r.accent; });
  const idleColor = id => clearedMap[id] ? CLEARED_YELLOW() : GRAPE();

  const triShapes = {};   // id -> { gfx, verts, icon }
  Object.entries(TRIANGLES).forEach(([id, t]) => {
    const gfx = new PIXI.Graphics();
    emblem.addChild(gfx);
    triShapes[id] = { gfx, verts: t.verts.map(toScreen) };
    drawTriangle(gfx, triShapes[id].verts, idleColor(id), clearedMap[id]);

    const [icx, icy] = toScreen(t.iconCenter);
    const spr = PIXI.Sprite.from(t.iconUrl);
    spr.anchor.set(0.5);
    spr.width = t.iconSize[0] * EMBLEM_SCALE;
    spr.height = t.iconSize[1] * EMBLEM_SCALE;
    spr.position.set(icx, icy);
    emblem.addChild(spr);
    triShapes[id].icon = spr;
  });

  // ---- the per-level stat block below the emblem --------------------------
  const statsY = emblemY + 178;
  const statLines = [];
  for (let i = 0; i < 4; i++) {
    const t = new PIXI.Text('', {
      fontFamily: FONT, fontSize: 15, fill: CYAN, letterSpacing: 1, align: 'center',
    });
    t.anchor.set(0.5, 0);
    t.position.set(emblemX, statsY + i * (mobile ? 22 : 20));   // phone text is drawn bigger (outline.js)
    container.addChild(t);
    statLines.push(t);
  }

  function setStats(id) {
    const t = TRIANGLES[id];
    const visible = !!t;
    statLines.forEach(l => { l.visible = visible; });
    if (!visible) return;
    const best = getBestScore(id);
    const hits = getHitsTaken(id);
    statLines[0].text = 'BEST SCORE : ' + formatScore(best);
    statLines[1].text = `HITS TAKEN : ${hits.total}  (${hits.lethal} LETHAL)`;
    statLines[2].text = 'STAGE WEAPON : ' + t.weapon;
    statLines[3].text = 'STAGE BOSS : ' + t.boss;
  }

  // ---- hint + weapon readout -----------------------------------------------
  const hint = new PIXI.Text(mobile ? 'TAP A STAGE TO LOOK, TAP AGAIN TO PLAY      X  BACK' : '↑ ↓  CHOOSE      Z / SPACE  SELECT      X  BACK', {
    fontFamily: FONT, fontSize: 15, fill: CYAN, letterSpacing: 3, align: 'center',
  });
  hint.anchor.set(0.5);
  hint.alpha = 0.7;
  hint.position.set(screenW / 2, screenH - (mobile ? 40 : 32));
  container.addChild(hint);

  const weapon = new PIXI.Text('', {
    fontFamily: FONT, fontSize: 15, fill: WHITE, letterSpacing: 2, align: 'center',
  });
  weapon.anchor.set(0.5);
  weapon.alpha = 0.85;
  weapon.position.set(screenW / 2, screenH - (mobile ? 14 : 12));
  container.addChild(weapon);

  function setWeapon(name) {
    weapon.text = canSwitchWeapon
      ? 'WEAPON : ' + name + '      [V]  SWITCH'
      : 'WEAPON : ' + name;
  }
  setWeapon(weaponName);

  // ---- cursor / blink state -------------------------------------------------
  let blinkTarget = null;   // level id currently blinking, or null
  let blinkT = 0;

  function setCursor(idx) {
    const r = rows[idx];
    title.text = r ? r.label.trim() : '';
    title.style.fill = r && r.accent ? GREEN : CYAN;

    const mapped = r && !r.dim && TRIANGLES[r.id] ? r.id : null;
    if (mapped !== blinkTarget) {
      // Reset the outgoing triangle back to its idle colour (purple, or
      // yellow-glow if cleared) before switching.
      if (blinkTarget && triShapes[blinkTarget]) {
        drawTriangle(triShapes[blinkTarget].gfx, triShapes[blinkTarget].verts, idleColor(blinkTarget), clearedMap[blinkTarget]);
      }
      blinkTarget = mapped;
      blinkT = 0;
    }
    setStats(mapped);
  }

  function update(dt) {
    if (!blinkTarget) return;
    blinkT += dt;
    const onCyan = Math.floor(blinkT / BLINK_PERIOD) % 2 === 0;
    const t = triShapes[blinkTarget];
    drawTriangle(t.gfx, t.verts, onCyan ? HILITE_CYAN() : HILITE_DARKBLUE());
  }

  // Which row's triangle holds design point (x, y), or -1 (a phone's tap,
  // tap.js). The container sits at the origin, so its coords are the screen's.
  const inTri = ([ax, ay], [bx, by], [cx, cy], x, y) => {
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const rowAt = (x, y) => rows.findIndex(r => {
    const sh = r && triShapes[r.id];
    return !!sh && sh.verts.length >= 3 && inTri(sh.verts[0], sh.verts[1], sh.verts[2], x, y);
  });
  return { container, setCursor, setWeapon, update, rowAt };
}

// `glow`: a cleared level's triangle reads as "glowing yellow" -- per this
// game's own no-glow-filter rule (see CLAUDE.md's "flat lines are the
// look... don't reach for a glow filter"), that's faked here with a wider,
// low-alpha flat stroke laid underneath the normal one rather than an
// actual PIXI blur filter -- still flat strokes, just two of them.
function drawTriangle(gfx, verts, color, glow = false) {
  gfx.clear();
  if (glow) {
    gfx.lineStyle(7, color, 0.35);
    strokeTriangle(gfx, verts);
  }
  gfx.lineStyle(glow ? 3.2 : 2.5, color, 1);
  strokeTriangle(gfx, verts);
}

function strokeTriangle(gfx, verts) {
  gfx.moveTo(verts[0][0], verts[0][1]);
  gfx.lineTo(verts[1][0], verts[1][1]);
  gfx.lineTo(verts[2][0], verts[2][1]);
  gfx.lineTo(verts[0][0], verts[0][1]);
}
