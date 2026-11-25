// levels/registry.js — the list of levels the game knows about.
//
// To add a level: make a new levels/levelN.js exporting `run(world, hud)`, then
// add one entry here. `unlockedBy` is the id of the level that must be cleared
// first (null = always unlocked). Order here is the order shown on stage select.
import { run as runLevel1 } from './level1.js';
import { run as runLevel2 } from './level2.js';
import { run as runLevel3 } from './level3.js';
import { run as runLevel4 } from './level4.js';
import { runOuterSpace } from './outerspace.js';

export const LEVELS = [
  // No TUTORIAL level any more: each stage opens with its own weapon's
  // tutorial the first time (tutorial.js's runWeaponTutorial).
  { id: 'shapelimbo',     name: 'SHAPE LIMBO',     unlockedBy: null, run: runLevel2 },
  { id: 'cyberzoo',       name: 'CYBER ZOO',       unlockedBy: null, run: runLevel1 },
  // Empty sandbox, not yet built out -- see level3.js's header comment.
  { id: 'crazycarnival',  name: 'CRAZY CARNIVAL',  unlockedBy: null, run: runLevel3 },
  // Introduces LINE SLASHER -- see level4.js's header comment.
  { id: 'occultacresburg', name: 'OCCÜLTACRESBURG', unlockedBy: null, run: runLevel4 },
];

// The level a brand-new player drops straight into, first time only.
// OUTER SPACE, the final stage — deliberately NOT in `LEVELS` (the array
// that drives the hub's 4-triangle emblem; stageselect_visuals.js's
// TRIANGLES only has entries for the 4 real stages, so a 5th/6th LEVELS
// entry would silently break its row/triangle mapping). Per direct
// request, it's reached only from its own title-screen entry (menu.js),
// shown once every weapon's own level has been cleared.
//
// **Merged back into one run since** (per direct request: "merge all
// stages of Outer Space into one, but if you die, you respawn at stage
// where you died, and lives are restored when you reached next stage"):
// one OUTER_SPACE level plays Stages 1-3 and THE FINALE in a row — see
// outerspace.js's runOuterSpace. The old per-stage ids (outerspace1..3,
// finale) are still what the save code records as each stage is beaten,
// and levelById maps them to this level so an old TRY AGAIN/save state
// still lands somewhere sensible.
export const OUTER_SPACE = { id: 'outerspace', name: 'OUTER SPACE', unlockedBy: null, run: runOuterSpace };
const OUTER_SPACE_IDS = ['outerspace', 'outerspace1', 'outerspace2', 'outerspace3', 'finale'];

export function levelById(id) {
  return LEVELS.find(l => l.id === id) || (OUTER_SPACE_IDS.includes(id) ? OUTER_SPACE : null);
}
