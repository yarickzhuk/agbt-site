// speedrun.js — SPEEDRUN MODE, per direct request: "timer of 35 minutes is set
// and you have those time to beat all game, this is level rush, you got
// healed automatically between phases (instead of healing orbs) and have only
// one life for all game, although you are on easy mode. If time's up, you die
// INSTANTLY. Timer starts when you pressed button at start, then no
// titlescreens... Global Record: if you passed mode faster, time shrinks to
// your exact record + 1 second... Timer stops once you killed Delta."
//
// The author's choices on the open points:
// - Unlocked by beating the game (the DELTA costume, like OPTIONS → ENDING).
// - Fixed order, every weapon free with [V]: SHAPE LIMBO → CYBER ZOO →
//   CRAZY CARNIVAL → OCCÜLTACRESBURG → OUTER SPACE (Stages 1–3, THE FINALE).
// - No pause during a speedrun ([X] does nothing; main.js).
// - The record is kept on this device for now; "a real backend later".
//   getRecord/submitRecord are async so a server can replace localStorage
//   without touching their callers.
//
// How it runs: one page, no reloads. Each level is run from its phase 1
// (`startPhase: 1` skips its title card and tutorial), OUTER SPACE skips its
// stage title cards and STAGE CLEAR beats too (`world.speedrun`). Heal orbs
// become instant full heals (heal.js). EASY's damage-meter orbs, saves and
// loads are off. One life: OUTER SPACE's respawn needs more than one, so a
// death is always the end (main.js shows the speedrun result screen).
import { resetLevelChallenges, checkLevelChallenges } from './achievements.js';
import { LEVELS, OUTER_SPACE } from './levels/registry.js';
import { isCostumeUnlocked } from './costumes.js';
import { SCREEN_W } from './core.js';

export const SPEEDRUN_LIMIT = 35 * 60;   // seconds, until there's a record
const RECORD_KEY = 'agbt_speedrun_record';
const START_KEY = 'agbt_speedrun';       // one-shot: TRY AGAIN starts a run straight after the reload

export const isSpeedrunUnlocked = () => isCostumeUnlocked('delta');

// --- the record (this device for now; see the header) ---
export async function getRecord() {
  try { const v = parseFloat(localStorage.getItem(RECORD_KEY)); return v > 0 ? v : null; } catch (e) { return null; }
}
// Resolves { record, isNew }.
export async function submitRecord(seconds) {
  const old = await getRecord();
  if (old == null || seconds < old) {
    try { localStorage.setItem(RECORD_KEY, String(seconds)); } catch (e) {}
    return { record: seconds, isNew: true, old };
  }
  return { record: old, isNew: false, old };
}
// The time you get: 35:00 until someone finishes, then the record + 1s.
export async function timeLimit() {
  const r = await getRecord();
  return r == null ? SPEEDRUN_LIMIT : r + 1;
}

export function requestSpeedrunStart() { try { sessionStorage.setItem(START_KEY, '1'); } catch (e) {} }
export function consumeSpeedrunStart() {
  try { const v = sessionStorage.getItem(START_KEY) === '1'; sessionStorage.removeItem(START_KEY); return v; } catch (e) { return false; }
}

export const formatTime = (s, cs = true) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), sec = s - m * 60;
  const whole = Math.floor(sec);
  const str = String(m).padStart(2, '0') + ':' + String(whole).padStart(2, '0');
  return cs ? str + '.' + String(Math.floor((sec - whole) * 100)).padStart(2, '0') : str;
};

// --- the timer: counts down on the HUD, kills the player at 0 ---
// Real time, each frame's step capped at 0.1s (a tab in the background
// stops the game and the clock together).
function startTimer(world, limit) {
  const run = world.speedrun;
  run.limit = limit; run.elapsed = 0; run.running = true;
  const t = new PIXI.Text('', { fontFamily: 'Tektur, monospace', fontSize: 22, fill: 0xffffff, letterSpacing: 3 });
  t.anchor.set(0.5, 0);
  t.position.set(SCREEN_W / 2, 38);
  world.hud.layer.addChild(t);
  const step = () => {
    if (!run.running) return;
    run.elapsed += Math.min(world.app.ticker.deltaMS / 1000, 0.1);
    const left = run.limit - run.elapsed;
    t.text = formatTime(left);
    t.style.fill = left < 60 ? 0xFF2020 : 0xffffff;
    const p = world.player;
    if (left <= 0 && p && !p.dead) {
      run.running = false;
      run.timeUp = true;
      run.elapsed = run.limit;
      t.text = formatTime(0);
      world.killedBy = 'speedruntimeout';
      p.die();
    }
  };
  world.app.ticker.add(step);
  run.stopTimer = () => { run.running = false; world.app.ticker.remove(step); };
  run.hideTimer = () => { if (!t.destroyed) t.visible = false; };
}

// The whole rush. Resolves when Delta dies (the player alive) or on death.
export async function runSpeedrun(world, hud) {
  const run = world.speedrun;
  const p = world.player;
  startTimer(world, await timeLimit());
  const between = () => {
    world.clearEntities();
    world.boss = null;
    world.checkpoint = null;
    world.audio.stopAllLoops();
    hud.setCenter(''); hud.setPhaseText(''); hud.setNearHp && hud.setNearHp('');
    p.hp = p.maxHP; p.frozen = false; p.charging = false; p.dashing = false;
    p.x = 0; p.y = 2.5; p.render();
  };
  for (const level of LEVELS) {
    run.levelName = level.name;
    world.currentLevelId = level.id;
    resetLevelChallenges(world);
    await level.run(world, hud, { startPhase: 1 });
    if (p.dead) return;
    checkLevelChallenges(world, 0.5);
    between();
  }
  run.levelName = OUTER_SPACE.name;
  world.currentLevelId = OUTER_SPACE.id;
  resetLevelChallenges(world);
  await OUTER_SPACE.run(world, hud, { startStage: 0, startPhase: 1 });
  if (!p.dead && run.stopTimer) { run.stopTimer(); run.finished = true; }
}

// The pseudo-level the title screen resolves with.
export const SPEEDRUN = { id: 'speedrun', name: 'SPEEDRUN', unlockedBy: null, run: runSpeedrun };
