// menu.js — the title screen, shown on every boot.
//
// Flat cyan-on-black, matching the rest of the game (no glow): the title logo,
// the menu (STAGE MENU / LOAD GAME (while a save exists) / OPTIONS / READ THE
// MANUAL / QUIT GAME / ENTER THE OUTER SPACE (once unlocked) — MENU_ROWS),
// and the difficulty picker. Resolves with the level to play. STAGE MENU
// resolves with whatever `showStageSelect` resolves with (or, if [X] backed
// out of the hub, round-trips back to a fresh title screen); OPTIONS, READ
// THE MANUAL (manual.js, built into the game) and QUIT GAME round-trip back
// to a fresh title screen; LOAD GAME reloads into the save (savegame.js).
// There's no TUTORIAL row: each stage opens with its own weapon's tutorial.
//
// **A 6th row, ENTER THE OUTER SPACE, appears below QUIT GAME once every
// weapon's own level has been cleared** -- per direct request ("create new
// level sandbox, called Outer Space... add option 'Enter the Outer Space'
// which will appear on main menu ONLY after you have all weapons").
// Deliberately NOT a hub entry (`levels/registry.js`'s own LEVELS array,
// which stageselect_visuals.js's fixed 4-triangle emblem is built around,
// never includes it) -- the final stage gets its own gate, checked fresh
// every `showMenu()` call against `WEAPON_LEVEL_IDS` (SHAPE LIMBO/CYBER
// ZOO/CRAZY CARNIVAL/OCCÜLTACRESBURG, the same four levels `weapon.js`'s
// own per-weapon gates already key off).
//
// **Picking it starts one merged OUTER SPACE run** (Stages 1-3 and THE
// FINALE back to back, respawning at the stage you died in while lives
// last -- outerspace.js's runOuterSpace). It used to open a STAGE 1/2/3/
// FINALE submenu; that's gone with the merge.
//
// **OPTIONS is a small submenu (`showOptions` below), not two top-level
// rows** -- added per direct request ("add [options] and put there
// [scoreboard] and [enter savecode]") to get SCOREBOARD/ENTER SAVECODE off
// the title screen's own main list. It loops on itself: picking either one
// shows that screen, then reopens a fresh OPTIONS list rather than falling
// all the way back to the title, so checking both in one visit doesn't need
// two separate trips back through TUTORIAL/STAGE MENU/etc. `[ESC]` backs out
// of OPTIONS early, same convention as the hub/scoreboard's own `[ESC]`.
import { showAchievements, unlockAchievement } from './achievements.js';
import { SCREEN_W, SCREEN_H, BOOT_BORDER, formatScore } from './core.js';
import { input } from './input.js';
import { tapRow, tapOn, tappedAnywhere } from './tap.js';
import { encodePin, SAVE_LEVELS } from './pin.js';
import { enterInitialsAndSubmit, showScoreboard, getPlayerName } from './scoreui.js';
import { paletteColor, buildSprite } from './retro.js';
import { COSTUMES, isCostumeUnlocked, getCostumeId, setCostumeId, makeSkinSprite, shipKey, bulletKey, hasSkinShot, shotTint } from './costumes.js';
import { setCareerScore, setLives, getDifficultyId, setDifficultyId, setChompCount, setDamageMeter, isCleared } from './progress.js';
import { difficultyById, availableDifficulties, resolveDifficultyId } from './difficulty.js';
import { OUTER_SPACE } from './levels/registry.js';
import { hasSave, loadGame } from './savegame.js';
import { ENDLESS, getEndlessRecord, submitEndlessRecord, requestEndlessStart } from './levels/endless.js';
import { SPEEDRUN, isSpeedrunUnlocked, getRecord, timeLimit, submitRecord, formatTime, requestSpeedrunStart } from './speedrun.js';
import { showManual } from './manual.js';
import { showStageSelect, handleEnterCode } from './stageselect.js';
import { getMasterVolume, setMasterVolume, DISPLAY_SCALES, getDisplayScale, setDisplayScale,
         DISPLAY_MODES, getDisplayMode, setDisplayMode,
         getToxicMode, setToxicMode, getShowHitbox, setShowHitbox, getScreenBorder, setScreenBorder,
         ORIENTATIONS, getOrientation, setOrientation } from './settings.js';
import { refitCanvas, applyDisplayMode } from './mobile.js';
import { playIntro } from './intro.js';
import { playOutro } from './outro.js';
import { waitForSounds } from './audio.js';
import { updateCheatEntry } from './cheat.js';

const TITLE_STYLE = {
  fontFamily: 'Tektur, monospace',
  fontWeight: '800',
  fontSize: 54,
  fill: 0x00e6ff,
  letterSpacing: 6,
  align: 'center',
  lineHeight: 62,
};
const SUB_STYLE = {
  fontFamily: 'Tektur, monospace',
  fontSize: 20,
  fill: 0xffffff,
  letterSpacing: 3,
  align: 'center',
};

// A chunky 3D-extruded block-letter title logo (per the author's own
// reference mockup): a solid purple slab stepping down-right behind a flat
// cyan face, like the letters are cut from thick material rather than drawn
// flat. `depth` solid purple copies are stacked one texel-step apart (so the
// extrusion reads as a stepped block, not a blurred drop shadow) with the
// cyan face layer on top at zero offset. Returns a Container (children are
// pre-centered; position the container, don't set .anchor).
function extrudeText(str, style, { depth = 7, step = 1.4, shadowColor = 0xb300ff } = {}) {
  // Outlined like all the game's text (outline.js): a purple outline set
  // back by the full depth, then the cyan outlined face in front with a
  // black fill, so the face hides the back copy's lines behind it.
  const container = new PIXI.Container();
  const back = new PIXI.Text(str, { ...style, fill: shadowColor });
  back.anchor.set(0.5);
  back.position.set(depth * step, depth * step);
  container.addChild(back);
  const face = new PIXI.Text(str, style);
  face.anchor.set(0.5);
  face.outlineFill = 0x000000;
  container.addChild(face);
  return container;
}

// The title menu's rows, by key. LOAD GAME shows only while there's a
// manual save (savegame.js); ENTER THE OUTER SPACE only once every weapon's
// own level is cleared (allWeaponsUnlocked in showMenu). There's no TUTORIAL
// row any more: each stage teaches its own weapon (tutorial.js).
const MENU_ROWS = [
  { key: 'stages', label: 'STAGE MENU' },
  { key: 'load', label: 'LOAD GAME', when: () => hasSave() },
  { key: 'options', label: 'OPTIONS' },
  { key: 'achievements', label: 'ACHIEVEMENTS' },   // achievements.js
  { key: 'manual', label: 'READ THE MANUAL' },
  { key: 'quit', label: 'QUIT GAME' },
  { key: 'outerspace', label: 'ENTER THE OUTER SPACE', when: () => DEV_ALWAYS_SHOW_OUTERSPACE || WEAPON_LEVEL_IDS.every(isCleared) },
  { key: 'speedrun', label: 'SPEEDRUN MODE', when: () => isSpeedrunUnlocked() },   // speedrun.js
  { key: 'endless', label: 'ENDLESS MODE', when: () => isSpeedrunUnlocked() },     // levels/endless.js
];
const ITEM_TOP = 250, ITEM_GAP = 42;
// The 4 levels that each earn one weapon -- see weapon.js's own doc
// comment on availableWeaponOrder, and main.js's identical FORCED_WEAPON_BY_
// LEVEL/LEVEL_CLEARED maps (kept in sync by hand, same as that file's own
// WEAPON_PICK_TARGET/FORCED_WEAPON_BY_LEVEL pair already are).
const WEAPON_LEVEL_IDS = ['shapelimbo', 'cyberzoo', 'crazycarnival', 'occultacresburg'];
// Was `true` while OUTER SPACE was being built ("FOR NOW (until release)
// make option 'enter the open space' always avaliable for easier testing");
// switched off per direct request ("lock Outer Space until all stages are
// completed"), so ENTER THE OUTER SPACE only appears once all four hub
// stages are cleared. Flip back to `true` to test it without the grind.
const DEV_ALWAYS_SHOW_OUTERSPACE = false;

// Two kinds of OPTIONS row: 'adjust' ones are tuned in place with ←/→ (VOLUME,
// RESOLUTION, DISPLAY MODE — settings.js), 'action' ones are confirmed with
// fire like every other menu row in this game (SCOREBOARD, ENTER SAVECODE).
const OPTIONS_ROWS = [
  { type: 'adjust', key: 'volume' },
  { type: 'adjust', key: 'resolution' },
  { type: 'adjust', key: 'displayMode' },
  { type: 'adjust', key: 'orientation', mobileOnly: true },
  { type: 'adjust', key: 'border' },
  { type: 'adjust', key: 'toxic' },
  { type: 'adjust', key: 'hitbox' },
  { type: 'action', key: 'costumes', label: 'COSTUMES' },
  { type: 'action', key: 'cutscenes', label: 'WATCH CUTSCENES' },
  { type: 'action', key: 'scoreboard', label: 'SCOREBOARD' },
  { type: 'action', key: 'entercode', label: 'ENTER SAVECODE' },
];
const ORIENTATION_LABEL = { horizontal: 'HORIZONTAL', vertical: 'VERTICAL', auto: 'AUTO' };
const DISPLAY_MODE_LABEL = { windowed: 'WINDOWED', borderless: 'BORDERLESS', fullscreen: 'FULLSCREEN' };

// QUIT GAME. A browser can only close a tab the page itself opened, so
// this usually stays up: it says the tab can be closed now, and [X] (or
// fire) goes back to the title — it used to be a dead end with no way back
// (fixed per direct request: "fix quit screen").
function showQuitScreen(world) {
  try { window.close(); } catch (e) {}
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 200;
    const t = new PIXI.Text('THANKS FOR PLAYING!\n\nYOU CAN CLOSE THIS TAB NOW',
      { fontFamily: 'Tektur, monospace', fontSize: 28, fill: 0xffffff, letterSpacing: 3, align: 'center' });
    t.anchor.set(0.5);
    t.position.set(SCREEN_W / 2, SCREEN_H / 2 - 30);
    const hint = new PIXI.Text(world.isMobile ? 'TAP X TO GO BACK' : 'X  BACK TO THE TITLE SCREEN', { ...SUB_STYLE, fontSize: 16 });
    hint.anchor.set(0.5);
    hint.position.set(SCREEN_W / 2, SCREEN_H / 2 + 90);
    hint.alpha = 0.7;
    layer.addChild(t, hint);
    world.stage.addChild(layer);
    const firePressed = input.armGuard('fire');
    const step = () => {
      if (input.backPressed() || firePressed() || tappedAnywhere()) {
        world.app.ticker.remove(step);
        world.stage.removeChild(layer); layer.destroy({ children: true });
        input.endFrame();
        resolve();
        return;
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}

// Show the title screen on `world`. Resolves with the level to play --
// TUTORIAL resolves directly with `FIRST_LEVEL`, STAGE MENU resolves with
// whatever `showStageSelect` itself resolves with. SCOREBOARD/ENTER SAVECODE
// don't resolve at all -- they round-trip back to a fresh title screen
// (mirroring `stageselect.js`'s own SCOREBOARD/ENTER CODE entries), and
// QUIT GAME never resolves, full stop (see `showQuitScreen`).
export function showMenu(world, opts = {}) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 200;   // above the HUD (100)

    // ENTER THE OUTER SPACE only appears once every weapon's own level has
    // been cleared -- per direct request ("will appear on main menu ONLY
    // after you have all weapons"). Appended after QUIT GAME rather than
    // spliced in earlier so OPTIONS_INDEX/MANUAL_INDEX (read once, from the
    // fixed base list) never need to shift.
    const ROWS = MENU_ROWS.filter(r => !r.when || r.when());
    const MENU_ITEMS = ROWS.map(r => r.label);

    const title = extrudeText('A GAME\nBEFORE TIME', TITLE_STYLE);
    title.position.set(SCREEN_W / 2, 112);

    const controls = new PIXI.Text(
      world.isMobile
        ? 'DRAG STICK  MOVE      TAP FIRE  SHOOT (HOLD = CHARGE)'
        : 'ARROWS / WASD  MOVE      Z / SPACE  FIRE      C  LOCK FACING',
      SUB_STYLE);
    controls.anchor.set(0.5);
    controls.position.set(SCREEN_W / 2, SCREEN_H - 60);
    controls.alpha = 0.7;

    // Difficulty picker: ← / → cycles it, persisted so it sticks after start.
    // Only what's on offer here (difficulty.js): HARD once the game is
    // beaten; a phone gets EASY (+ HARD), never NORMAL. main.js resolves
    // the stored choice the same way, so the picker never lies.
    const DIFFS = availableDifficulties(world.isMobile);
    let diffIdx = Math.max(0, DIFFS.indexOf(resolveDifficultyId(getDifficultyId(), world.isMobile)));
    const diff = new PIXI.Text('', { ...SUB_STYLE, fontSize: 22, letterSpacing: 3 });
    diff.anchor.set(0.5);
    // 7+ rows (OUTER SPACE, SPEEDRUN MODE, LOAD GAME) close up to fit
    const gap = MENU_ITEMS.length > 8 ? 32 : MENU_ITEMS.length > 6 ? 36 : ITEM_GAP;
    diff.position.set(SCREEN_W / 2, ITEM_TOP + MENU_ITEMS.length * gap + 34);
    // SPEEDRUN MODE has its own rules, shown in place of the difficulty
    // picker while its row is selected.
    let speedrunInfo = '';
    Promise.all([timeLimit(), getRecord()]).then(([lim, rec]) => {
      speedrunInfo = 'EASY  ·  1 LIFE  ·  LIMIT ' + formatTime(lim) + '  ·  RECORD ' + (rec == null ? '--:--' : formatTime(rec));
      if (!diff.destroyed) showDiff();
    });
    const showDiff = () => {
      if (ROWS[idx] && ROWS[idx].key === 'speedrun') { diff.text = speedrunInfo; return; }
      if (ROWS[idx] && ROWS[idx].key === 'endless') {   // ENDLESS MODE has fixed rules, no picker
        const rec = getEndlessRecord();
        diff.text = '3 HP  ·  1 LIFE  ·  BEST ROUND ' + (rec ? rec.round : '--');
        return;
      }
      diff.text = DIFFS.length < 2
        ? 'DIFFICULTY : ' + difficultyById(DIFFS[0]).name + (world.isMobile ? '  (MOBILE)' : '')
        : '◄  DIFFICULTY : ' + difficultyById(DIFFS[diffIdx]).name + '  ►';
    };
    let idx = 0;
    showDiff();
    setDifficultyId(DIFFS[diffIdx]);   // make sure a value is stored

    // The 5-item menu itself, same cursor-list look `endScreen` uses.
    const itemY = i => ITEM_TOP + i * gap;
    const items = MENU_ITEMS.map((label, i) => {
      const t = new PIXI.Text(label, { ...SUB_STYLE, fontSize: 26, letterSpacing: 4 });
      t.anchor.set(0.5);
      t.position.set(SCREEN_W / 2, itemY(i));
      return t;
    });
    const cursor = new PIXI.Text('>', { ...SUB_STYLE, fontSize: 26 });
    cursor.anchor.set(0.5);
    const place = () => {
      items.forEach((t, i) => t.scale.set(i === idx ? 1.1 : 1));
      cursor.position.set(SCREEN_W / 2 - items[idx].width / 2 - 26, itemY(idx));
      showDiff();
    };
    place();

    // The hidden cheat codes (cheat.js) can be typed here too — the HUD isn't
    // shown on the title, so the entry readout and the flash get their own
    // text. `opts.notice` is that flash carried over a redraw (the unlock-all
    // code rebuilds the menu so the OUTER SPACE row appears).
    const cheatEntry = new PIXI.Text('', { ...SUB_STYLE, fontSize: 18, letterSpacing: 6 });
    cheatEntry.anchor.set(0, 1);
    cheatEntry.position.set(16, SCREEN_H - 12);
    const cheatMsg = new PIXI.Text('', { ...SUB_STYLE, fontSize: 24, letterSpacing: 4 });
    cheatMsg.anchor.set(0.5);
    cheatMsg.position.set(SCREEN_W / 2, SCREEN_H - 100);
    cheatMsg.style.fill = paletteColor('hull');
    const cheatUi = {
      setCheatEntry: t => { if (!cheatEntry.destroyed) cheatEntry.text = t; },
      setCenter: t => { if (!cheatMsg.destroyed) cheatMsg.text = t; },
    };
    if (opts.notice) { cheatUi.setCenter(opts.notice); setTimeout(() => cheatUi.setCenter(''), 1600); }

    layer.addChild(title, controls, diff, cursor, cheatEntry, cheatMsg, ...items);
    world.stage.addChild(layer);

    const close = () => {
      world.app.ticker.remove(step);
      world.stage.removeChild(layer);
      layer.destroy({ children: true });
      // Flushes the fire press that just selected this option, so a screen
      // reading `wasPressed`/`armGuard` on its very own first frame (e.g.
      // showStageSelect, recursing back into a fresh showMenu) doesn't see
      // that same edge and instantly select its own default -- unlike a
      // `location.reload()`-driven transition (which wipes this module's
      // state entirely), this stays in the same page/session, so the edge
      // would otherwise leak straight into whatever comes next.
      input.endFrame();
    };

    // Guards against a key already held down from mashing it during the
    // async asset load above (see input.armGuard) so the menu always shows.
    const firePressed = input.armGuard('fire');
    const select = async i => {
      const key = ROWS[i].key;
      close();
      if (key === 'stages') {
        // showStageSelect resolves `null` if the player backed out with
        // [X] instead of picking a level -- round-trip back to a fresh
        // title screen rather than treating `null` as a level to load.
        const chosen = await showStageSelect(world);
        resolve(chosen || await showMenu(world));
        return;
      }
      if (key === 'load') { loadGame(); return; }   // reloads into the save
      if (key === 'options') { await showOptions(world); resolve(await showMenu(world)); return; }
      if (key === 'achievements') { await showAchievements(world); resolve(await showMenu(world)); return; }
      if (key === 'manual') { await showManual(world); resolve(await showMenu(world)); return; }
      // One merged run (outerspace.js's runOuterSpace).
      if (key === 'outerspace') { resolve(OUTER_SPACE); return; }
      if (key === 'speedrun') { resolve(SPEEDRUN); return; }   // the timer starts with the run
      if (key === 'endless') { resolve(ENDLESS); return; }
      await showQuitScreen(world);
      resolve(await showMenu(world));
    };
    const step = () => {
      if (updateCheatEntry(world, cheatUi) === 'unlockAll') {
        close();
        showMenu(world, { notice: 'EVERYTHING UNLOCKED!' }).then(resolve);
        return;
      }
      if (input.isDown('ctrl')) { input.endFrame(); return; }   // arrows are cheat input while Ctrl is held
      const fixedRules = ROWS[idx] && (ROWS[idx].key === 'endless' || ROWS[idx].key === 'speedrun');
      if (!fixedRules && DIFFS.length > 1 && input.wasPressed('left'))  { diffIdx = (diffIdx + DIFFS.length - 1) % DIFFS.length; showDiff(); setDifficultyId(DIFFS[diffIdx]); }
      if (!fixedRules && DIFFS.length > 1 && input.wasPressed('right')) { diffIdx = (diffIdx + 1) % DIFFS.length; showDiff(); setDifficultyId(DIFFS[diffIdx]); }
      if (input.wasPressed('up'))   { idx = (idx + MENU_ITEMS.length - 1) % MENU_ITEMS.length; place(); }
      if (input.wasPressed('down')) { idx = (idx + 1) % MENU_ITEMS.length; place(); }
      // a phone: tap a row to pick it; tap the difficulty line for the next difficulty
      const tapped = tapRow(items, gap);
      if (tapped >= 0) { idx = tapped; place(); select(idx); return; }
      if (!fixedRules && DIFFS.length > 1 && tapOn(diff, 60)) { diffIdx = (diffIdx + 1) % DIFFS.length; showDiff(); setDifficultyId(DIFFS[diffIdx]); }
      if (firePressed()) { select(idx); return; }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}

// The OPTIONS submenu -- see this file's own header comment for why it
// exists. Loops on itself (picking an action row shows that screen, then
// reopens a fresh OPTIONS list) rather than falling all the way back to the
// title; [ESC] backs out early instead, resolving with nothing for
// `showMenu`'s own OPTIONS branch to round-trip on. Same up/down + fire
// cursor-list look `showMenu`/`endScreen` both already use, just without the
// title logo -- VOLUME/RESOLUTION/DISPLAY MODE are cursor rows too, but
// ←/→-adjustable in place (like the title screen's own difficulty picker)
// rather than fire-confirmed, so all five rows share one list and one
// up/down cursor instead of splitting adjustable settings off into their
// own separate always-visible strip.
function showOptions(world) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 200;

    const title = new PIXI.Text('OPTIONS', { ...SUB_STYLE, fontSize: 40, letterSpacing: 6 });
    title.anchor.set(0.5);
    title.position.set(SCREEN_W / 2, 160);

    // Local copies of the persisted settings, written through to
    // settings.js (and applied live) on every ←/→ press.
    let volume = getMasterVolume();
    let resIdx = Math.max(0, DISPLAY_SCALES.indexOf(getDisplayScale()));
    let modeIdx = Math.max(0, DISPLAY_MODES.indexOf(getDisplayMode()));
    let toxic = getToxicMode();
    let hitbox = getShowHitbox();
    // ORIENTATION only means something on a phone (mobile.js's fit)
    const ROWS = OPTIONS_ROWS.filter(r => !r.mobileOnly || world.isMobile);
    let border = getScreenBorder();

    const top = 225, gap = ROWS.length > 10 ? 36 : 39;   // 10 rows: 225..576 (11: ..585), hint at 645/651
    const itemY = i => top + i * gap;

    // Selected rows: adjustable ones show ◄/► framing to signal they take
    // ←/→ instead of fire, same as this file's own difficulty-picker
    // convention ('◄  DIFFICULTY : NORMAL  ►').
    const rowLabel = i => {
      const r = ROWS[i];
      const sel = i === idx;
      if (r.key === 'volume') {
        const s = 'VOLUME : ' + Math.round(volume * 100) + '%';
        return sel ? '◄  ' + s + '  ►' : s;
      }
      if (r.key === 'resolution') {
        const s = 'RESOLUTION : ' + Math.round(DISPLAY_SCALES[resIdx] * 100) + '%';
        return sel ? '◄  ' + s + '  ►' : s;
      }
      if (r.key === 'displayMode') {
        const s = 'DISPLAY : ' + DISPLAY_MODE_LABEL[DISPLAY_MODES[modeIdx]];
        return sel ? '◄  ' + s + '  ►' : s;
      }
      if (r.key === 'orientation') {
        const s = 'ORIENTATION : ' + ORIENTATION_LABEL[getOrientation()];
        return sel ? '◄  ' + s + '  ►' : s;
      }
      if (r.key === 'border') {
        const s = 'SCREEN BORDER : ' + (border ? 'ON' : 'OFF') + (border !== BOOT_BORDER ? '  (RELOADS)' : '');
        return sel ? '◄  ' + s + '  ►' : s;
      }
      if (r.key === 'toxic') {
        const s = 'TOXIC MODE (12+) : ' + (toxic ? 'ON' : 'OFF');
        return sel ? '◄  ' + s + '  ►' : s;
      }
      if (r.key === 'hitbox') {
        const s = 'DEATH HITBOX : ' + (hitbox ? 'ON' : 'OFF');
        return sel ? '◄  ' + s + '  ►' : s;
      }
      return r.label;
    };

    const items = ROWS.map((r, i) => {
      const t = new PIXI.Text('', { ...SUB_STYLE, fontSize: 24, letterSpacing: 3 });
      t.anchor.set(0.5);
      t.position.set(SCREEN_W / 2, itemY(i));
      return t;
    });
    const cursor = new PIXI.Text('>', { ...SUB_STYLE, fontSize: 24 });
    cursor.anchor.set(0.5);
    let idx = 0;
    const place = () => {
      items.forEach((t, i) => { t.text = rowLabel(i); t.scale.set(i === idx ? 1.1 : 1); });
      cursor.position.set(SCREEN_W / 2 - items[idx].width / 2 - 24, itemY(idx));
    };
    place();

    const hint = new PIXI.Text(world.isMobile ? 'TAP A ROW TO OPEN IT OR CHANGE IT      X  BACK' : '↑ ↓  CHOOSE      ← →  ADJUST      Z / SPACE  SELECT      X  BACK',
      { ...SUB_STYLE, fontSize: 15 });
    hint.anchor.set(0.5);
    hint.position.set(SCREEN_W / 2, itemY(ROWS.length) + 30);
    hint.alpha = 0.7;

    // TOXIC MODE's age warning, shown while its row is selected — per direct
    // request ("warn them that toxic mode is not for all ages (12+)").
    const note = new PIXI.Text('RUDE LANGUAGE - NOT FOR YOUNG PLAYERS (12+)', { ...SUB_STYLE, fontSize: 16 });
    note.anchor.set(0.5);
    note.position.set(SCREEN_W / 2, itemY(ROWS.length) - 4);
    note.style.fill = paletteColor('blood');
    const showNote = () => { note.visible = ROWS[idx].key === 'toxic'; };
    showNote();

    layer.addChild(title, cursor, hint, note, ...items);
    world.stage.addChild(layer);

    const close = () => {
      world.app.ticker.remove(step);
      world.stage.removeChild(layer);
      layer.destroy({ children: true });
      // Same reason showMenu's own close() flushes this -- a screen reading
      // `wasPressed`/`armGuard` on its very own first frame (showScoreboard,
      // or a recursed showOptions on the way back) shouldn't see this same
      // fire edge and act on it instantly.
      input.endFrame();
    };

    const adjust = (dir, wrap = false) => {
      const r = ROWS[idx];
      if (r.key === 'volume') {
        volume = wrap && volume >= 0.999 ? 0 : Math.max(0, Math.min(1, Math.round((volume + dir * 0.1) * 10) / 10));
        setMasterVolume(volume);
        world.audio.setMasterVolume(volume);
      } else if (r.key === 'resolution') {
        resIdx = (resIdx + dir + DISPLAY_SCALES.length) % DISPLAY_SCALES.length;
        setDisplayScale(DISPLAY_SCALES[resIdx]);
        refitCanvas();
      } else if (r.key === 'displayMode') {
        modeIdx = (modeIdx + dir + DISPLAY_MODES.length) % DISPLAY_MODES.length;
        const mode = DISPLAY_MODES[modeIdx];
        setDisplayMode(mode);
        applyDisplayMode(mode);   // requests/exits real Fullscreen API as needed
        refitCanvas();
      } else if (r.key === 'orientation') {
        const n = ORIENTATIONS.length;
        setOrientation(ORIENTATIONS[(ORIENTATIONS.indexOf(getOrientation()) + dir + n) % n]);
        refitCanvas();
      } else if (r.key === 'border') {
        border = !border;
        setScreenBorder(border);
        refitCanvas();
      } else if (r.key === 'toxic') {
        toxic = !toxic;
        setToxicMode(toxic);
      } else if (r.key === 'hitbox') {
        hitbox = !hitbox;
        setShowHitbox(hitbox);
      } else {
        return;   // action rows ignore ←/→
      }
      place();
    };

    const firePressed = input.armGuard('fire');
    const select = async i => {
      const r = ROWS[i];
      if (r.type !== 'action') return;   // ←/→-only rows ignore fire
      close();
      if (r.key === 'scoreboard') { await showScoreboard(world); resolve(await showOptions(world)); return; }
      if (r.key === 'costumes') { await showCostumes(world); resolve(await showOptions(world)); return; }
      if (r.key === 'cutscenes') { await showCutscenes(world); resolve(await showOptions(world)); return; }
      await handleEnterCode(world);
      resolve(await showOptions(world));
    };
    const step = () => {
      if (input.wasPressed('up'))    { idx = (idx + ROWS.length - 1) % ROWS.length; place(); showNote(); }
      if (input.wasPressed('down'))  { idx = (idx + 1) % ROWS.length; place(); showNote(); }
      if (input.wasPressed('left'))  adjust(-1);
      if (input.wasPressed('right')) adjust(1);
      // a phone: tap a row; a setting steps to its next value (VOLUME past 100% wraps to 0%)
      const tapped = tapRow(items, gap, 260);
      if (tapped >= 0) {
        idx = tapped; place(); showNote();
        if (ROWS[idx].type === 'action') { select(idx); return; }
        adjust(1, true);
      }
      if (input.backPressed()) {
        close();
        // the game's width is set at boot from this (core.js): reload to apply it
        if (border !== BOOT_BORDER) { location.reload(); return; }
        resolve(); return;
      }
      if (firePressed()) { select(idx); return; }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}

// OPTIONS → COSTUMES: the player-ship reskins (costumes.js), per direct
// request ("in settings add 'Costumes' option... reskins, you unlock them
// when completing levels"). A cursor list on the left, a big preview of the
// highlighted costume's ship and its three shots on the right. Fire equips
// an unlocked one; a locked one names the level that earns it. ESC backs out.
function costumePreview(id, locked) {
  const c = new PIXI.Container();
  const ship = id === 'default'
    ? buildSprite('PlayerNormal', { lineWidth: 2 })
    : makeSkinSprite(id, shipKey(id, {}));
  ship.scale.set(ship.scale.x * 3, ship.scale.y * 3);
  ship.position.set(0, -40);
  c.addChild(ship);
  ['bullet', 'torpedo', 'hadouken'].forEach((kind, i) => {
    const shape = { bullet: 'Bullet', torpedo: 'Torpedo', hadouken: 'Hadouken' }[kind];
    const s = id === 'default' || !hasSkinShot(id, kind)
      ? buildSprite(shape, { lineWidth: 2, scale: 2, tint: id === 'default' ? undefined : shotTint(id) })
      : makeSkinSprite(id, bulletKey(id, kind), 2);
    s.position.set((i - 1) * 90, 90);
    c.addChild(s);
  });
  if (locked) {
    // Locked: a dim silhouette — enough to want it, not a full reveal.
    c.children.forEach(ch => { ch.alpha = 0.18; });
  }
  return c;
}

export function showCostumes(world) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 200;
    const title = new PIXI.Text('COSTUMES', { ...SUB_STYLE, fontSize: 40, letterSpacing: 6 });
    title.anchor.set(0.5);
    title.position.set(SCREEN_W / 2, 90);

    const unlocked = COSTUMES.map(c => isCostumeUnlocked(c.id));
    let equipped = getCostumeId();
    const top = 200, gap = 54, listX = 250;
    const itemY = i => top + i * gap;
    const items = COSTUMES.map((c, i) => {
      const t = new PIXI.Text('', { ...SUB_STYLE, fontSize: 24, letterSpacing: 3 });
      t.anchor.set(0.5);
      t.position.set(listX, itemY(i));
      return t;
    });
    const cursor = new PIXI.Text('>', { ...SUB_STYLE, fontSize: 24 });
    cursor.anchor.set(0.5);
    const note = new PIXI.Text('', { ...SUB_STYLE, fontSize: 18 });
    note.anchor.set(0.5);
    note.position.set(620, 480);
    // a costume's passive ability (costumes.js's `passive`), once unlocked
    const passive = new PIXI.Text('', { ...SUB_STYLE, fontSize: 14, align: 'center', wordWrap: true, wordWrapWidth: 380 });
    passive.anchor.set(0.5);
    passive.position.set(620, 520);
    passive.style.fill = paletteColor('heal');
    const hint = new PIXI.Text(world.isMobile ? 'TAP TO LOOK      TAP AGAIN TO EQUIP      X  BACK' : '↑ ↓  CHOOSE      Z / SPACE  EQUIP      X  BACK', { ...SUB_STYLE, fontSize: 15 });
    hint.anchor.set(0.5);
    hint.position.set(SCREEN_W / 2, 600);
    hint.alpha = 0.7;
    layer.addChild(title, cursor, note, passive, hint, ...items);

    let idx = Math.max(0, COSTUMES.findIndex(c => c.id === equipped));
    let preview = null;
    const place = () => {
      items.forEach((t, i) => {
        const c = COSTUMES[i];
        t.text = unlocked[i] ? c.name : '???';
        t.style.fill = c.id === equipped ? paletteColor('hull') : 0xffffff;
        t.alpha = unlocked[i] ? 1 : 0.45;
        t.scale.set(i === idx ? 1.1 : 1);
      });
      cursor.position.set(listX - items[idx].width / 2 - 24, itemY(idx));
      if (preview) { layer.removeChild(preview); preview.destroy({ children: true }); }
      preview = costumePreview(COSTUMES[idx].id, !unlocked[idx]);
      preview.position.set(620, 300);
      layer.addChild(preview);
      const c = COSTUMES[idx];
      note.text = !unlocked[idx] ? 'LOCKED — CLEAR ' + c.levelName
        : (c.id === equipped ? 'EQUIPPED' : world.isMobile ? 'TAP AGAIN TO EQUIP' : 'PRESS FIRE TO EQUIP');
      note.style.fill = !unlocked[idx] ? paletteColor('blood') : (c.id === equipped ? paletteColor('hull') : 0xffffff);
      passive.text = unlocked[idx] && c.passive ? 'PASSIVE: ' + c.passive : '';
    };
    place();
    world.stage.addChild(layer);

    const close = () => {
      world.app.ticker.remove(step);
      world.stage.removeChild(layer);
      layer.destroy({ children: true });
      input.endFrame();   // same leaked-edge reason as showOptions' own close()
    };
    const firePressed = input.armGuard('fire');
    const step = () => {
      if (input.wasPressed('up'))   { idx = (idx + COSTUMES.length - 1) % COSTUMES.length; world.audio.play('levelSelectPress', 0.5); place(); }
      if (input.wasPressed('down')) { idx = (idx + 1) % COSTUMES.length; world.audio.play('levelSelectPress', 0.5); place(); }
      if (input.backPressed()) { close(); resolve(); return; }
      // a phone: tap a costume to look at it, tap it again (or its preview) to equip it
      let tapEquip = false;
      const tapped = tapRow(items, gap, 60);
      if (tapped >= 0 && tapped !== idx) { idx = tapped; world.audio.play('levelSelectPress', 0.5); place(); }
      else if (tapped === idx || (preview && tapOn(preview, 40, 40))) tapEquip = true;
      if (firePressed() || tapEquip) {
        if (unlocked[idx]) {
          equipped = COSTUMES[idx].id;
          setCostumeId(equipped);
          world.audio.setReverseAll(equipped === 'delta');
          refitCanvas();   // DELTA mirrors the picture and swaps left/right (mobile.js)
          world.audio.play('levelSelectStart', 0.5);
        } else {
          world.audio.play('bossHurt', 0.4);
        }
        place();
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}

// OPTIONS → WATCH CUTSCENES, per direct request ("add in options 'Watch
// cutscenes' and in it 'ending' so you can watch ending cutscene without
// needing to beat final boss again... for others make it so you can watch it
// only after beating the game"). The intro is always open (every player has
// seen it); the ending opens once the game is beaten — read off the DELTA
// costume's unlock, which beating THE FINALE earns and which lives in
// settings.js, so it outlives the fresh-tab progress wipe the same way.
// Picking one plays it, then comes back here; X backs out to OPTIONS.
const CUTSCENES = [
  { key: 'intro', name: 'INTRO', play: w => playIntro(w), unlocked: () => true },
  { key: 'ending', name: 'ENDING', play: w => waitForSounds(w).then(() => playOutro(w)), unlocked: () => isCostumeUnlocked('delta') },
];

export function showCutscenes(world) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 200;
    const title = new PIXI.Text('WATCH CUTSCENES', { ...SUB_STYLE, fontSize: 40, letterSpacing: 6 });
    title.anchor.set(0.5);
    title.position.set(SCREEN_W / 2, 160);

    const unlocked = CUTSCENES.map(c => c.unlocked());
    const top = 300, gap = 54;
    const itemY = i => top + i * gap;
    const items = CUTSCENES.map((c, i) => {
      const t = new PIXI.Text(unlocked[i] ? c.name : '???', { ...SUB_STYLE, fontSize: 24, letterSpacing: 3 });
      t.anchor.set(0.5);
      t.position.set(SCREEN_W / 2, itemY(i));
      t.alpha = unlocked[i] ? 1 : 0.45;
      return t;
    });
    const cursor = new PIXI.Text('>', { ...SUB_STYLE, fontSize: 24 });
    cursor.anchor.set(0.5);
    const note = new PIXI.Text('', { ...SUB_STYLE, fontSize: 18 });
    note.anchor.set(0.5);
    note.position.set(SCREEN_W / 2, itemY(CUTSCENES.length) + 20);
    const hint = new PIXI.Text(world.isMobile ? 'TAP TO WATCH      X  BACK' : '↑ ↓  CHOOSE      Z / SPACE  WATCH      X  BACK', { ...SUB_STYLE, fontSize: 15 });
    hint.anchor.set(0.5);
    hint.position.set(SCREEN_W / 2, itemY(CUTSCENES.length) + 80);
    hint.alpha = 0.7;
    layer.addChild(title, cursor, note, hint, ...items);

    let idx = 0;
    const place = () => {
      items.forEach((t, i) => t.scale.set(i === idx ? 1.1 : 1));
      cursor.position.set(SCREEN_W / 2 - items[idx].width / 2 - 24, itemY(idx));
      note.text = unlocked[idx] ? '' : 'LOCKED — BEAT THE GAME';
      note.style.fill = paletteColor('blood');
    };
    place();
    world.stage.addChild(layer);

    const close = () => {
      world.app.ticker.remove(step);
      world.stage.removeChild(layer);
      layer.destroy({ children: true });
      input.endFrame();   // same leaked-edge reason as showOptions' own close()
    };
    const firePressed = input.armGuard('fire');
    const step = () => {
      if (input.wasPressed('up'))   { idx = (idx + CUTSCENES.length - 1) % CUTSCENES.length; world.audio.play('levelSelectPress', 0.5); place(); }
      if (input.wasPressed('down')) { idx = (idx + 1) % CUTSCENES.length; world.audio.play('levelSelectPress', 0.5); place(); }
      if (input.backPressed()) { close(); resolve(); return; }
      const tapped = tapRow(items, gap);   // a phone: tap one to watch it
      if (tapped >= 0) { idx = tapped; place(); }
      if (firePressed() || tapped >= 0) {
        if (unlocked[idx]) {
          close();
          CUTSCENES[idx].play(world).then(() => showCutscenes(world)).then(resolve);
          return;
        }
        world.audio.play('bossHurt', 0.4);
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}

// Enter initials -> post the score -> show the scoreboard -> reload. Shared by
// SUBMIT SCORE and GIVE UP. `score` is the value posted (captured before any
// career reset), so resetting the career total first doesn't change what's sent.
function submitFlow(world, score) {
  enterInitialsAndSubmit(world, score)
    .then(name => showScoreboard(world, name))
    .then(() => location.reload());
}

// Shared end screen (Game Over / Stage Clear): clears the field, shows the score
// and its save code, and a menu of `options` ([{ label, run }], run tears the
// screen down itself). Runs on the ticker and owns the input (the main loop is
// dormant once `world._over` is set).
//
// `lines` (the victory screen only): rows of coloured [text, fill] segments
// shown under the title; `sound` replaces the stageClear jingle.
function endScreen(world, { title, titleFill = 0xffffff, jingle, sound, lines, options, hideScore }) {
  world.clearEntities();
  world.baseFilters = null;   // DELTA's monochrome playfield ends with the level
  world.stage.filters = null;
  ['bossTheme', 'mothership'].forEach(n => world.audio.stopLoop(n));
  if (sound) world.audio.play(sound, 0.9);
  else if (jingle) world.audio.play('stageClear', 0.9);

  const score = world.totalScore;   // shown, encoded, and submittable this run
  // the code carries cleared stages too, so a later ENTER SAVECODE restores them
  const code = encodePin(score, SAVE_LEVELS.filter(isCleared));
  const cx = SCREEN_W / 2;
  const layer = new PIXI.Container();
  layer.zIndex = 200;

  const mk = (s, size, fill, y, ls = 4) => {
    const t = new PIXI.Text(s, { fontFamily: 'Tektur, monospace', fontSize: size, fill, letterSpacing: ls, align: 'center' });
    t.anchor.set(0.5); t.position.set(cx, y); layer.addChild(t); return t;
  };

  // a row of differently coloured text pieces, centred as one line
  const mkRow = (segs, size, y) => {
    const parts = segs.map(([s, fill]) => {
      const t = new PIXI.Text(s, { fontFamily: 'Tektur, monospace', fontSize: size, fill, letterSpacing: 2 });
      t.anchor.set(0, 0.5); layer.addChild(t); return t;
    });
    let x = cx - parts.reduce((w, t) => w + t.width, 0) / 2;
    for (const t of parts) { t.position.set(x, y); x += t.width; }
  };

  let scoreY = SCREEN_H / 2 - 66, codeY = SCREEN_H / 2 - 30, optTop = SCREEN_H / 2 + 34;
  if (lines) {
    mk(title, 48, titleFill, 80);
    lines.forEach((row, i) => mkRow(row, 22, 150 + i * 44));
    scoreY = 150 + lines.length * 44 + 40;
    codeY = scoreY + 36;
    optTop = codeY + 66;
  } else {
    mk(title, 52, titleFill, SCREEN_H / 2 - 130);
  }
  if (hideScore) optTop = scoreY + 30;
  else {
    mk('SCORE  ' + formatScore(score), 30, 0xffffff, scoreY);
    mk('CODE  ' + code, 22, 0xffffff, codeY);
  }

  const optY = i => optTop + i * 46;
  const opt = options.map((o, i) => mk(o.label, 26, 0xffffff, optY(i)));
  const cursor = mk('>', 26, 0xffffff, optY(0));
  let idx = 0;
  const place = () => {
    opt.forEach((o, i) => { o.scale.set(i === idx ? 1.1 : 1); o.style.fill = 0xffffff; });
    cursor.position.set(cx - opt[idx].width / 2 - 26, optY(idx));
  };
  place();
  world.stage.addChild(layer);

  const teardown = () => { world.stage.removeChild(layer); layer.destroy({ children: true }); };

  let t = 0;
  const step = () => {
    t += world.app.ticker.deltaMS / 1000;
    if (input.wasPressed('up')) { idx = (idx + options.length - 1) % options.length; place(); }
    if (input.wasPressed('down')) { idx = (idx + 1) % options.length; place(); }
    const tapped = t > 0.4 ? tapRow(opt, 46) : -1;   // a phone: tap an option to pick it
    if (tapped >= 0) { idx = tapped; place(); }
    if (t > 0.4 && (input.wasPressed('fire') || tapped >= 0)) {
      world.app.ticker.remove(step);
      options[idx].run({ score, teardown });
      return;   // input.endFrame skipped on purpose — screen is torn down / reloading
    }
    input.endFrame();
  };
  world.app.ticker.add(step);
}

// Stage clear: play the jingle. SUBMIT SCORE registers the full total; CONTINUE
// banks it and reloads to stage select so the score carries into the next stage.
export function showStageClear(world) {
  endScreen(world, {
    title: 'STAGE CLEAR', jingle: true,
    options: [
      { label: 'SUBMIT SCORE', run: ({ score, teardown }) => { setCareerScore(score); teardown(); submitFlow(world, score); } },
      { label: 'CONTINUE',     run: () => { setCareerScore(world.totalScore); location.reload(); } },
    ],
  });
}

// THE FINALE's ending: Delta is down, so instead of Stage Clear the game
// thanks the player, in the colours the author picked for each piece --
// title yellow, crystals green, thanks purple, the player's name dark blue,
// "Developed by" pink, Oxygen cyan, "and" red, Claude orange -- over
// Destroyed_Delta.wav in place of the stage-clear jingle. Same SUBMIT SCORE /
// CONTINUE options as any Stage Clear.
export function showVictory(world) {
  const c = r => paletteColor(r);
  endScreen(world, {
    title: 'Congratulations!', titleFill: c('hull'), sound: 'deltaDestroyed',
    lines: [
      [['You saved all the crystals,', c('heal')]],
      [['Thank you so much for playing my game, ', c('grape')], [getPlayerName(), c('cobalt')]],
      [['Developed by ', c('core')], ['Oxygen', c('ring')], [' and ', c('blood')], ['Claude', c('amber')]],
      [['PROGRESS AUTOSAVED', 0xffffff]],
    ],
    options: [
      { label: 'SUBMIT SCORE', run: ({ score, teardown }) => { setCareerScore(score); teardown(); submitFlow(world, score); } },
      { label: 'CONTINUE',     run: () => { setCareerScore(world.totalScore); location.reload(); } },
    ],
  });
}

// Game over. TRY AGAIN drops just this stage's points (career reverts to what
// was banked before the stage) and replays the level. GIVE UP submits the score,
// then starts a fresh run — career score wiped to 0 and lives refilled — keeping
// stage-unlock progress. Once lives hit 0, TRY AGAIN is dropped in every
// difficulty, leaving GIVE UP as the only way out.
export function showGameOver(world) {
  const startLives = world.difficulty.startLives;
  const canRetry = world.lives > 0;

  const tryAgain = {
    label: 'TRY AGAIN',
    run: () => {
      setCareerScore(world.bankedScore);   // drop this stage's points only
      try { sessionStorage.setItem('agbt_retry', world.currentLevelId || ''); } catch (e) {}
      location.reload();
    },
  };
  const giveUp = {
    label: 'GIVE UP',
    run: ({ score, teardown }) => {
      setCareerScore(0);      // fresh run: score erased...
      setLives(startLives);   // ...lives refilled...
      setChompCount(0);       // ...and Plasmadrache's own tally forgotten
      setDamageMeter(0);      // ...and EASY's heal-orb meter
      teardown();
      submitFlow(world, score);
    },
  };

  // Easter egg: dying on a phone held upright ("Game on mobile is already
  // hard so holding phone vertically can do only someone insane") — its own
  // line plays once the death cue has finished, and the title asks why.
  // TOXIC MODE only now (main.js sets diedVertical only with it on).
  if (world.diedVertical) {
    const when = Math.max(world.audio.now(), world.deathCueEnd || 0) + 0.15;
    world.audio.play('roastVertical', 1, when);
  }
  endScreen(world, {
    title: world.diedVertical ? 'Y u do this?' : 'GAME OVER',
    options: canRetry ? [tryAgain, giveUp] : [giveUp],
  });
}

// ENDLESS MODE's result (levels/endless.js): how far the run got, the
// score, and the best round/score on this device.
export function showEndlessEnd(world) {
  const run = world.endless || {};
  if (world.player && world.player.container) world.player.container.visible = false;
  const c = r => paletteColor(r);
  const W = 0xffffff;
  const round = run.round || 1;
  const res = submitEndlessRecord(round, world.totalScore);
  endScreen(world, {
    title: 'ENDLESS OVER', titleFill: c('blood'), hideScore: true,   // no save code for this mode
    lines: [
      [['SCORE  ', W], [formatScore(world.totalScore), c('hull')]],
      [['REACHED  ', W], ['ROUND ' + round, c('ring')], ['   BOSSES BEATEN  ', W], [String(run.bosses || 0), c('ring')]],
      res.newRound || res.newScore
        ? [['NEW BEST!', c('hull')]]
        : [['BEST  ', W], ['ROUND ' + res.record.round, c('ring')], ['  ·  ', W], [formatScore(res.record.score), c('ring')]],
    ],
    options: [
      { label: 'TRY AGAIN', run: () => { requestEndlessStart(); location.reload(); } },
      { label: 'TITLE SCREEN', run: () => location.reload() },
    ],
  });
}

// SPEEDRUN MODE's result (speedrun.js): cleared = Delta's down. A clear posts
// the time as the record if it's faster (the limit becomes the record + 1s);
// a death or TIME'S UP shows how far the run got. No score or save code.
export async function showSpeedrunEnd(world, cleared) {
  const run = world.speedrun || {};
  if (run.hideTimer) run.hideTimer();   // the result screen shows the time itself
  if (world.player && world.player.container) world.player.container.visible = false;
  const c = r => paletteColor(r);
  const W = 0xffffff;
  const opts = [
    { label: 'TRY AGAIN', run: () => { requestSpeedrunStart(); location.reload(); } },
    { label: 'TITLE SCREEN', run: () => location.reload() },
  ];
  if (cleared) {
    const res = await submitRecord(run.elapsed);
    if (res.isNew) unlockAchievement(world, 'hedgehog', { delay: 2 });   // "Ya do it hedgehog style"
    endScreen(world, {
      title: 'SPEEDRUN CLEAR', titleFill: c('hull'), jingle: true, hideScore: true,
      lines: [
        [['TIME  ', W], [formatTime(run.elapsed), c('ring')]],
        res.isNew ? [['NEW RECORD!', c('hull')]] : [['RECORD  ', W], [formatTime(res.record), c('ring')]],
        [['NEXT TIME LIMIT  ', W], [formatTime(res.record + 1), c('ring')]],
      ],
      options: opts,
    });
    return;
  }
  endScreen(world, {
    title: run.timeUp ? "TIME'S UP" : 'GAME OVER', titleFill: c('blood'), hideScore: true,
    lines: [
      [['REACHED  ', W], [run.levelName || '', c('ring')]],
      [['TIME  ', W], [formatTime(run.elapsed || 0), c('ring')], ['  OF  ', W], [formatTime(run.limit || 0), c('ring')]],
    ],
    options: opts,
  });
}
