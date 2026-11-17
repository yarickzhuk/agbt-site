// stageselect.js — the hub screen's behaviour (not its looks). Lists the 4
// real stages (TUTORIAL/SCOREBOARD/ENTER CODE live on the title screen now,
// not here -- see menu.js), moves a cursor, and resolves with the chosen
// level when fire is pressed on an unlocked one, or `null` if [ESC] backs
// out to the title screen instead -- see showStageSelect's own doc comment.
// Drawing is delegated to stageselect_visuals.js so the art can be
// redesigned independently.
import { input } from './input.js';
import { SCREEN_W, SCREEN_H } from './core.js';
import { LEVELS } from './levels/registry.js';
import { syncCostumeUnlocks, getCostumeId, monoFilter } from './costumes.js';
import { isUnlocked, isCleared, getWeaponId, setWeaponId, markCleared, setCareerScore } from './progress.js';
import { weaponById, availableWeaponOrder, sanitizeWeaponId } from './weapon.js';
import { createStageSelectView } from './stageselect_visuals.js';
import { showScoreboard, enterCode, enterInitialsAndSubmit, enterPin } from './scoreui.js';
import { decodePin } from './pin.js';

// "AAAAAA" is the save code's own encoding of score 0 (5 zero-digits plus
// their own checksum digit) -- reserved as a developer easter egg rather
// than left as a trivially-guessable "does nothing" code anyone could type.
// Typing it prompts for a second, wholly separate secret (never shown or
// hinted at anywhere in the UI) before it's honored at all; get it wrong
// and it's indistinguishable from any other bad code -- just silently
// rejected, same as a mistyped one.
// (The 7-symbol code for score 0 with nothing cleared, AAAAAAA, is reserved
// the same way.)
const DEV_CODES = ['AAAAAA', 'AAAAAAA'];
const DEV_PIN = '6969';

export async function handleEnterCode(world) {
  const code = await enterCode(world);
  if (code && DEV_CODES.includes(code.trim().toUpperCase())) {
    const pin = await enterPin(world, { title: "ENTER DEVELOPER'S SCORE CODE", allowSkip: false });
    if (pin !== DEV_PIN) return;   // wrong or cancelled -- no hint given either way
  }
  const save = decodePin(code);
  if (save == null) return;                // cancelled or invalid
  const { score } = save;
  // Restore the progress the code carries: its cleared stages (only ever
  // added, never un-cleared) and the career score it was written at.
  save.cleared.forEach(markCleared);
  syncCostumeUnlocks();   // a restored code's stages earn their costumes too
  setCareerScore(score);
  world.bankedScore = score;
  const name = await enterInitialsAndSubmit(world, score);
  await showScoreboard(world, name);
}

// Resolves with the chosen level, or `null` if the player backed out with
// [ESC] instead of picking one -- added per direct request ("no quit"
// applies to an actual run in progress, not to a navigational screen like
// this one, which had no way back to the title short of closing the tab).
// Callers that recurse back into a fresh showMenu()/showStageSelect() on a
// `null` result (menu.js's own STAGE MENU branch) read as "cancelled, go
// back" rather than "no level chosen" crashing anything downstream.
export function showStageSelect(world) {
  return new Promise(resolve => {
    // Looping hub theme. `Audio.loop` no-ops if it's already playing (checked
    // by name), so this is safe to call every time the hub is (re)shown --
    // it only actually stops once a level is chosen (see `resolve` below).
    world.audio.loop('stageMenu', 0.5);

    // TUTORIAL is its own title-screen entry now (menu.js), not a hub row --
    // the hub is just the 4 real stages, one per triforce triangle.
    const items = LEVELS.filter(l => l.id !== 'tutorial').map(l => ({ level: l }));

    const rows = items.map(it => {
      const u = isUnlocked(it.level), c = isCleared(it.level.id);
      // No "✓" suffix -- a cleared level's own triforce triangle glows
      // yellow instead (stageselect_visuals.js), driven by this same
      // `accent` flag.
      return {
        label: u ? it.level.name : '??????   [LOCKED]',
        dim: !u, accent: c, id: it.level.id,
      };
    });

    // Weapon loadout: the Cyber Shotgun is earned by clearing CYBER ZOO with
    // it, BOUNCY BALL by clearing CRAZY CARNIVAL with it, LINE SLASHER by
    // clearing OCCÜLTACRESBURG with it, and the CHARGE CANNON itself by
    // clearing SHAPE LIMBO with it (weapon.js's own doc comment on
    // availableWeaponOrder explains why the Charge Cannon needs a gate at
    // all, despite being the starting weapon) — each gates only its own
    // weapon in the [V] cycle (availableWeaponOrder below), not whether [V]
    // does anything at all. An earlier version also required CYBER ZOO
    // cleared before [V] would do *anything*, even to reach an
    // already-earned Bouncy Ball — a redundant, confusing lock on top of the
    // per-weapon one.
    const canSwitchWeapon = isCleared('cyberzoo');
    const canUseBouncyBall = isCleared('crazycarnival');
    const canUseLineSlasher = isCleared('occultacresburg');
    const canUseChargeCannon = isCleared('shapelimbo');
    const unlockedWeapons = { shotgun: canSwitchWeapon, bouncy: canUseBouncyBall, lineslasher: canUseLineSlasher, chargecannon: canUseChargeCannon };
    let weapon = weaponById(sanitizeWeaponId(getWeaponId(), unlockedWeapons));
    setWeaponId(weapon.id);
    world.weapon = weapon;

    const weaponOrder = availableWeaponOrder(unlockedWeapons);
    const canSwitchAtAll = weaponOrder.length > 1;

    const view = createStageSelectView({
      rows, screenW: SCREEN_W, screenH: SCREEN_H,
      weaponName: weapon.name, canSwitchWeapon: canSwitchAtAll,
    });
    // DELTA equipped: the hub is monochrome too (per direct request). On the
    // view itself, so it goes with it when the hub closes.
    if (getCostumeId() === 'delta') { const f = monoFilter(); if (f) view.container.filters = [f]; }
    world.stage.addChild(view.container);

    const selectable = i => isUnlocked(items[i].level);
    let idx = items.findIndex((_, i) => selectable(i));
    if (idx < 0) idx = 0;
    view.setCursor(idx);

    // Guards against a held fire key carrying over from the previous
    // screen's location.reload() (e.g. CONTINUE) and instantly selecting
    // whatever's under the cursor before the player sees the hub.
    const firePressed = input.armGuard('fire');

    const move = dir => {
      let i = idx;
      for (let n = 0; n < items.length; n++) {
        i = (i + dir + items.length) % items.length;
        if (i !== idx) { idx = i; break; }
      }
      view.setCursor(idx);
      world.audio.play('levelSelectPress', 0.6);
    };

    const close = () => {
      world.app.ticker.remove(step);
      world.stage.removeChild(view.container);
      view.container.destroy({ children: true });
      // Flushes the fire press that just chose this level, so a screen
      // reading `wasPressed`/`armGuard` on its very own first frame doesn't
      // see that same edge and instantly act on it -- unlike a
      // `location.reload()`-driven transition (which wipes this module's
      // state entirely), this stays in the same page/session, so the edge
      // would otherwise leak straight into whatever comes next.
      input.endFrame();
    };

    const step = () => {
      view.update?.(world.app.ticker.deltaMS / 1000);
      if (canSwitchAtAll && input.wasPressed('weapon')) {
        const order = availableWeaponOrder(unlockedWeapons);
        const i = (order.indexOf(weapon.id) + 1) % order.length;
        weapon = weaponById(order[i]);
        setWeaponId(weapon.id);
        world.weapon = weapon;
        view.setWeapon(weapon.name);
      }
      if (input.wasPressed('up')) move(-1);
      if (input.wasPressed('down')) move(1);
      if (input.backPressed()) {
        world.audio.stopLoop('stageMenu');
        close(); resolve(null); return;
      }
      if (firePressed()) {
        const it = items[idx];
        if (isUnlocked(it.level)) {
          // levelSelectStart plays here, on actually confirming a level --
          // it used to fire once on hub entry instead, which meant it never
          // announced "a level is starting" at all, just "you're on the
          // hub"; moved per direct report ("It's supposed to play when you
          // press play on choosen level").
          world.audio.play('levelSelectStart', 0.6);
          world.audio.stopLoop('stageMenu');
          close(); resolve(it.level); return;
        }
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}
