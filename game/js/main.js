// main.js — boots PixiJS, loads assets, and drives the top-level flow:
//   every boot -> title screen -> the chosen level
//   win  -> mark the level cleared -> Stage Clear screen
//   loss -> Game Over screen
// Both end screens reload back to the title screen (progress is saved).
// The title screen no longer funnels a brand-new player into the tutorial --
// it's just one of its own 5 menu entries now, skippable like any other.
import './outline.js';   // every PIXI.Text drawn hollow (outline only)
import { loadRetro } from './retro.js';
import { Audio, SOUND_NAMES, waitForSounds } from './audio.js';
import { input } from './input.js';
import { World, SCREEN_W, SCREEN_H } from './core.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { showMenu, showGameOver, showStageClear, showVictory, showSpeedrunEnd, showEndlessEnd } from './menu.js';
import { showStageSelect } from './stageselect.js';
import { levelById } from './levels/registry.js';
import { INTRO_PNGS, shouldPlayIntro, playIntro } from './intro.js';
import { isSiteMode, shouldPlaySiteOpening, playTrailer } from './trailer.js';
import { OUTRO_PNGS, playOutro } from './outro.js';
import { MANUAL_PNGS } from './manual.js';
import { unlockAchievement, showPendingAchievements, ACHIEVEMENT_PNGS, checkScoreAchievements,
         checkLevelChallenges, recordDamage, recordDeath } from './achievements.js';
const STAGE_CLEAR_JINGLE = 5.2;   // Stage_Clear.wav's length (s): clear-time achievement banners wait it out
import { SKIN_PNGS, syncCostumeUnlocks, applyMonoSkin, getCostumeId, livesCap } from './costumes.js';
import { markCleared, resetProgress, resetOnFreshOpen,
         getCareerScore, getDifficultyId, getLives, setLives, getWeaponId,
         setWeaponId, isCleared, getChompCount, getDamageMeter, setDamageMeter, recordBestScore, autosaveProgress } from './progress.js';
import { difficultyById, resolveDifficultyId } from './difficulty.js';
import { weaponById, availableWeaponOrder, sanitizeWeaponId } from './weapon.js';
import { togglePause } from './pause.js';
import { updateCheatEntry } from './cheat.js';
import { saveGame, loadGame, consumePendingLoad, applySave } from './savegame.js';
import { SPEEDRUN, consumeSpeedrunStart } from './speedrun.js';
import { ENDLESS, consumeEndlessStart } from './levels/endless.js';
import { getMasterVolume, getShowHitbox, getToxicMode, addLifetimeScore, backfillLifetimeScore } from './settings.js';
import { loadRoasts, playRoast } from './roast.js';
import { startDeathReveal, stepDeathReveal } from './deathreveal.js';
import { spawnHealOrb } from './heal.js';
import { isMobileDevice, fitCanvasToViewport, createTouchControls,
         tryEnterFullscreen, isPortraitScreen } from './mobile.js';

// EASY: one heal orb per this much damage dealt (per direct request, "for easy
// mode add spawn of heal orb if you dealt 100 damage (doesen't reset between
// levels)").
const HEAL_EVERY_DAMAGE = 100;

const SHAPES = [
  'PlayerNormal', 'PlayerMove', 'Bullet', 'BulletBreak', 'Torpedo', 'Hadouken', 'BouncyBall',
  'MeteorShard', 'Bomb', 'BombExplosion',
  'LaserBlock', 'SplashDot', 'TrapWheel', 'Mothership',
  'CrystalV0', 'CrystalV1', 'CrystalV2', 'CrystalV3', 'CrystalV4',
  'CrystalV5', 'CrystalV6', 'CrystalV7', 'CrystalV8', 'CrystalV9',
  'CrystalExtracted',
  'SawBlade', 'Jellyfish', 'CrockHead', 'Beam', 'Pirania', 'Atom', 'DevilFish',
  'HealOrb', 'HealOrbPlus', 'Peanut', 'CornSeed', 'Rocket', 'RocketLaunch', 'RocketShard',
  'Clown', 'Lollypop', 'Dart', 'ClownTarget', 'Showman', 'LineSlash',
  'Knight', 'KnightSword', 'Ghost', 'Gem', 'Flame', 'Spear', 'Wheel', 'Asteroid',
  'Disruptor1', 'Disruptor2', 'Disruptor3', 'Comet', 'Checkpoint',
  'Divebomber', 'Shooter', 'CommandoPods', 'CommandoCore', 'FleetBullet',
  'GunBullet', 'SplashShard', 'CoreCrystal', 'Delta',
];

// Shown by index.html before any JS runs (plain HTML/CSS, so it survives a
// CDN or module load failure that would otherwise leave a blank black
// canvas with zero indication of whether the game is loading or dead).
// Removed once assets are ready; repurposed into a visible error message if
// boot throws anywhere along the way, instead of the game just silently
// never appearing (an unhandled rejection in the console is invisible to a
// player, and this file's own top-level `main()` call was never awaited or
// caught).
function bootFailed(err) {
  console.error('Boot failed:', err);
  const el = document.getElementById('boot-status');
  if (el) {
    // The author's error screen (index.html's #boot-error-tpl): TECHNICAL
    // DIFFICULTIES / PLEASE STAND BY beside a knocked-out Kangunroo.
    const tpl = document.getElementById('boot-error-tpl');
    if (tpl) el.replaceChildren(tpl.content.cloneNode(true));
    else el.textContent = 'TECHNICAL DIFFICULTIES — PLEASE STAND BY';
    el.classList.add('boot-error');
  }
}

// Per direct request ("can you add percantage count to the loading
// screen?"): `#boot-status`'s text now reads `LOADING… NN%` instead of a
// flat `LOADING…` the whole time. `done` is a float (the PNG batch below
// reports fractional progress mid-batch via PIXI.Assets.load's own
// onProgress callback) against a `total` fixed at boot -- every stage
// (shapes, sounds, hand-drawn PNGs, the Tektur font) counts as the same
// "one item" unit, so the percentage reflects actual items loaded, not an
// arbitrary guess at how long each stage takes relative to the others.
function updateBootProgress(done, total) {
  const el = document.getElementById('boot-status');
  if (el) el.textContent = `LOADING… ${Math.min(100, Math.round(done / total * 100))}%`;
}

async function main() {
  // The website (index.html?site=1): on a browser's first visit the trailer
  // plays while the game loads, then fades into the intro (trailer.js). Later
  // visits, and the game's own reloads, go straight to the title.
  const siteMode = isSiteMode();
  const siteOpening = shouldPlaySiteOpening();
  const trailerDone = siteOpening ? playTrailer() : null;
  // A fresh tab/window opening the game wipes saved progress (once per tab
  // session — the game's own location.reload()s between stages / TRY AGAIN
  // stay in the same session and don't re-trigger this). Encourages players
  // to jot down their save code if they want a score back next time.
  backfillLifetimeScore();   // old points into TOTAL SCORE EVER, before the wipe
  resetOnFreshOpen();
  // LOAD (savegame.js): restores the saved progress before anything reads it
  const savedLoad = consumePendingLoad();

  const app = new PIXI.Application({
    width: SCREEN_W, height: SCREEN_H,
    background: 0x000000, antialias: true,
    view: document.getElementById('game'),
  });
  app.stage.sortableChildren = true;
  // DELTA mirrors the canvas with CSS (mobile.js); Pixi maps a click off the
  // canvas's unmirrored box, so flip x back (the scoreboard's [REFRESH]).
  try {
    const ev = app.renderer.events, map = ev.mapPositionToPoint.bind(ev);
    ev.mapPositionToPoint = (point, x, y) => {
      map(point, x, y);
      if (input.isMirrored()) point.x = app.renderer.screen.width - point.x;
    };
  } catch (e) { /* no event system: [R] still refreshes */ }
  fitCanvasToViewport();   // scale the fixed 900x700 canvas to whatever viewport shows it

  // K.A.N.G's head, CRAZY CARNIVAL's corn, OCCÜLTACRESBURG's Plasmadrache
  // (head + fireball), Boss Rush's Plasmadrache Delta (the full-body
  // phase's layered body/wing/jaw sprites and all 90 frames of the head
  // phase's animation), and the stage-select hub's
  // triforce emblem icons are all hand-drawn PNG art (not shape-JSON),
  // preloaded here like everything else so none of them pops in mid-fight
  // (or mid-hub) — corn.js's 40-frame spew animation is one sprite sheet
  // (spew_sheet.png), not 40 separate files.
  const PNG_LIST = [
    'assets/sprites/kangaroo/wait.png',
    'assets/sprites/kangaroo/tell.png',
    'assets/sprites/kangaroo/defeat.png',
    'assets/sprites/kangaroo/arena_bg.png',
    'assets/sprites/corn/idle.png',
    'assets/sprites/corn/exposed.png',
    'assets/sprites/corn/spew_sheet.png',
    ...['tail', 'body', 'armL', 'armR', 'wingL', 'wingR', 'jaw'].map(l => `assets/sprites/plasmadrache/${l}.png`),
    'assets/sprites/plasmadrache/flame.png',
    'assets/sprites/kangunroo/ded.png',
    'assets/sprites/kangunroo/duel_wait.png',
    'assets/sprites/kangunroo/duel_tell.png',
    ...['front', 'side'].flatMap(c => ['body', 'wingL', 'wingR', 'jaw'].map(l => `assets/sprites/plasmadrachedelta/body/${c}_${l}.png`)),
    ...Array.from({ length: 90 }, (_, i) => `assets/sprites/plasmadrachedelta/head/frame${String(i).padStart(2, '0')}.png`),
    'assets/sprites/stageselect/icon_shapelimbo.png',
    'assets/sprites/stageselect/icon_cyberzoo.png',
    'assets/sprites/stageselect/icon_crazycarnival.png',
    'assets/sprites/stageselect/icon_occultacresburg.png',
    ...SKIN_PNGS,   // COSTUMES reskins (costumes.js)
    ...ACHIEVEMENT_PNGS,   // achievement icons (achievements.js)
    ...INTRO_PNGS,  // the intro cutscene (intro.js)
    ...OUTRO_PNGS,  // the final cutscene, part 1 (outro.js)
    ...MANUAL_PNGS, // the manual's picture pages (manual.js)
  ];
  // The font counts as one more "item" alongside the three asset stages
  // below, so `#boot-status`'s percentage still reaches a clean 100% once
  // everything (shapes + sounds + PNGs + the font) is actually ready.
  // Only the sounds the intro, title and menus need load before the game
  // shows (BOOT_SOUNDS); the rest (~80 MB of music and level sounds) load in
  // the background while the player watches the intro or browses the menus,
  // and a level waits for them (waitForSounds) only if they're not done yet.
  // Before, all of it loaded behind the LOADING screen.
  const BOOT_SOUNDS = SOUND_NAMES.filter(n => n.startsWith('intro') || n.startsWith('achievement') || [
    'levelSelectPress', 'levelSelectStart', 'stageMenu', 'pause', 'unpause', 'bossHurt',
    'cheatStart', 'cheatInput', 'cheatSuccess', 'checkpointReach', 'stageClear', 'death',
  ].includes(n));
  const LATER_SOUNDS = SOUND_NAMES.filter(n => !BOOT_SOUNDS.includes(n));
  const TOTAL_ITEMS = SHAPES.length + BOOT_SOUNDS.length + PNG_LIST.length + 1;
  let itemsDone = 0;
  const tick = () => updateBootProgress(++itemsDone, TOTAL_ITEMS);
  updateBootProgress(0, TOTAL_ITEMS);

  await loadRetro(SHAPES, tick);
  await Audio.load(BOOT_SOUNDS, tick);
  Audio.setMasterVolume(getMasterVolume());   // OPTIONS menu's persisted VOLUME setting
  loadRoasts(Audio);   // TOXIC MODE voicelines, in the background (not awaited)
  Audio.setReverseAll(getCostumeId() === 'delta');   // DELTA: every sound backwards (audio.js)
  try {
    const pngBase = itemsDone;
    await PIXI.Assets.load(PNG_LIST, progress => updateBootProgress(pngBase + progress * PNG_LIST.length, TOTAL_ITEMS));
  } catch (e) {}
  itemsDone += PNG_LIST.length;   // PIXI.Assets.load's own onProgress isn't guaranteed to land exactly on 1 before resolving
  try { await document.fonts.load('20px Tektur'); } catch (e) {}
  tick();   // the font itself
  document.getElementById('boot-status')?.remove();   // assets ready — the game takes over from here
  // the rest of the sounds, in the background (see BOOT_SOUNDS)
  Audio.loadLater(LATER_SOUNDS);

  input.onFirst(() => { Audio.unlock(); tryEnterFullscreen(); });

  const world = new World(app, Audio);
  showPendingAchievements(world);   // banners a reload cut short (achievements.js)
  world.isMobile = isMobileDevice();   // phone/tablet: show touch controls, on-screen keypads
  world.bankedScore = getCareerScore();   // carry the running total into this stage
  // Touch controls give coarser movement than a keyboard, so a phone gets
  // EASY, plus HARD once the game has been beaten; HARD is locked on desktop
  // too until then. A stored choice that isn't on offer falls back
  // (resolveDifficultyId).
  world.difficulty = difficultyById(resolveDifficultyId(getDifficultyId(), world.isMobile));
  world.lives = getLives(world.difficulty.startLives);   // carry the run's lives in
  world.chompCount = getChompCount();   // carry Plasmadrache's own tally into this stage (plasmadrache.js)
  world.healOrbsCollected = 0;          // this stage only -- reset per fresh World, like world.score
  // EASY: every HEAL_EVERY_DAMAGE damage the player deals drops a heal orb.
  // The meter carries across stages (progress.js), so it never resets
  // between levels. Checked per hit, since the difficulty can change on the
  // title screen after boot.
  // Every point scored: the lifetime total (achievements screen) and the
  // score achievements (10K … 1M on the HUD's total).
  world.onScore = (n) => { addLifetimeScore(n); checkScoreAchievements(world); };
  world.damageMeter = getDamageMeter();
  world.onDamageDealt = (n) => {
    recordDamage(world, n);   // MILESTONES: lifetime damage, every difficulty
    const endlessRun = world.difficulty.id === 'endless';
    if ((world.difficulty.id !== 'easy' && !endlessRun) || world.speedrun) return;   // speedrun: heals come between phases only
    world.damageMeter += n;
    while (world.damageMeter >= HEAL_EVERY_DAMAGE) {
      world.damageMeter -= HEAL_EVERY_DAMAGE;
      if (world.player && !world.player.dead) spawnHealOrb(world);
    }
    if (!endlessRun) setDamageMeter(world.damageMeter);   // ENDLESS keeps its own meter, per run
  };
  world.weapon = weaponById(getWeaponId());               // first run: the Charge Cannon (everything else locked until its own level is cleared)
  world.player = new Player(world, 0, 2.5);
  const hud = new HUD(world);
  world.hud = hud;   // cheat.js flashes brief messages through this
  if (world.isMobile) createTouchControls(world);
  world.player.container.visible = false;   // nothing on the pre-game screens
  window.__world = world;
  window.__resetProgress = resetProgress;   // console helper while testing


  // "Try again" from Game Over sets a one-shot flag to replay the same level,
  // skipping the menus.
  let retryId = null;
  try { retryId = sessionStorage.getItem('agbt_retry'); sessionStorage.removeItem('agbt_retry'); } catch (e) {}


  // Set on a hub stage's Stage Clear (below): open the stage-select hub
  // straight away instead of the title screen. Lowest priority of all;
  // [ESC] on the hub still backs out to the title.
  let toHub = false;
  try { toHub = sessionStorage.getItem('agbt_tohub') === '1'; sessionStorage.removeItem('agbt_tohub'); } catch (e) {}

  // Every boot shows the title screen, which itself resolves with the level
  // to play (TUTORIAL / STAGE MENU are two of its own 5 entries — see
  // menu.js). A pending cheat-code load or a Game Over TRY AGAIN takes
  // priority over both — they re-enter a specific level directly.
  // A fresh tab opens on the intro cutscene (intro.js) before the title
  // screen; the game's own reloads (Stage Clear, TRY AGAIN, ...) skip it.
  // SPEEDRUN MODE's TRY AGAIN (speedrun.js): straight back into a run.
  const speedrunStart = consumeSpeedrunStart();
  const endlessStart = consumeEndlessStart();   // ENDLESS MODE's TRY AGAIN (levels/endless.js)
  if (!savedLoad && !retryId && !toHub && !speedrunStart && !endlessStart && (siteMode ? (shouldPlayIntro(), siteOpening) : shouldPlayIntro())) {
    if (trailerDone) await trailerDone;
    await playIntro(world);
  }
  let level;
  if (speedrunStart) {
    level = SPEEDRUN;
  } else if (endlessStart) {
    level = ENDLESS;
  } else if (savedLoad && levelById(savedLoad.levelId)) {
    level = levelById(savedLoad.levelId);
  } else if (retryId && levelById(retryId)) {
    level = levelById(retryId);
  } else if (toHub) {
    level = (await showStageSelect(world)) || await showMenu(world);
  } else {
    level = await showMenu(world);
  }
  world.currentLevelId = level.id;
  // The world and its Player were built at boot, before the title screen —
  // so a difficulty or costume changed in the menus only showed up after the
  // next reload (reported: "if you changed settings in the menu (specially
  // difficulty or costumes) they aren't get applied until you die and exit
  // the level"). Re-read both now that a level is chosen: a new difficulty
  // starts its own lives count, and the Player is rebuilt so its HP and
  // costume match.
  // SPEEDRUN MODE: always EASY, one life, score from 0; nothing it does is
  // written into the normal run's lives or score (speedrun.js).
  const speedrun = level.id === SPEEDRUN.id;
  if (speedrun) {
    world.speedrun = {};
    world.difficulty = difficultyById('easy');
    world.lives = 1;
    world.bankedScore = 0;
  }
  const chosenDifficulty = difficultyById(resolveDifficultyId(getDifficultyId(), world.isMobile));
  // ENDLESS MODE (levels/endless.js): the chosen difficulty's HP, one life,
  // score from 0, every weapon free; nothing written to the normal run.
  const endless = level.id === ENDLESS.id;
  if (endless) {
    world.endless = {};
    world.difficulty = difficultyById('endless');   // fixed 3 HP, whatever the picker says
    world.damageMeter = 0;   // a heal orb every 100 damage, counted from the run's start
    world.lives = 1;
    world.bankedScore = 0;
  } else if (!speedrun && chosenDifficulty.id !== world.difficulty.id) {
    world.difficulty = chosenDifficulty;
    world.lives = chosenDifficulty.startLives;
    setLives(world.lives);
  }
  world.player.container.destroy({ children: true });
  world.player = new Player(world, 0, 2.5);
  world.player.container.visible = false;
  world.lives = Math.min(world.lives, livesCap(world, world.player.skin));   // DEVIL FISH: one life less
  applyMonoSkin(world);   // DELTA costume: monochrome playfield (costumes.js)
  // SHAPE LIMBO is where the CHARGE CANNON itself is "earned" (see
  // weapon.js's own doc comment on availableWeaponOrder for why): CYBER ZOO
  // is where the Cyber Shotgun is introduced, CRAZY CARNIVAL is where
  // BOUNCY BALL is, OCCÜLTACRESBURG is where LINE SLASHER is. An uncleared
  // run of any of the four is LOCKED to that level's own weapon (no choice,
  // no [V] toggle) — you clear the level with it, and clearing it is what
  // unlocks that weapon for free switching everywhere else. Not persisted
  // via setWeaponId — it's only forced for this playthrough; a cleared
  // replay of any of the four uses whatever's actually selected, like any
  // other level.
  const shapelimboCleared = isCleared('shapelimbo');
  const cyberzooCleared = isCleared('cyberzoo');
  const carnavalCleared = isCleared('crazycarnival');
  const slasherLevelCleared = isCleared('occultacresburg');
  const FORCED_WEAPON_BY_LEVEL = { shapelimbo: 'default', cyberzoo: 'shotgun', crazycarnival: 'bouncy', occultacresburg: 'lineslasher' };
  const LEVEL_CLEARED = { shapelimbo: shapelimboCleared, cyberzoo: cyberzooCleared, crazycarnival: carnavalCleared, occultacresburg: slasherLevelCleared };
  const forcedWeaponId = FORCED_WEAPON_BY_LEVEL[level.id];
  world.weaponForced = !speedrun && !endless && forcedWeaponId != null && !LEVEL_CLEARED[level.id];
  if (world.weaponForced) {
    world.weapon = weaponById(forcedWeaponId);
  }
  // Each hub stage opens with its own weapon's tutorial (tutorial.js) the
  // first time — while it's still uncleared — but not on a TRY AGAIN or a
  // LOAD, which jump back into the fight.
  world.weaponTutorial = world.weaponForced && !retryId && !savedLoad ? forcedWeaponId : null;
  // Each weapon gates only itself in the [V] cycle (availableWeaponOrder) —
  // the shotgun needs CYBER ZOO cleared, Bouncy Ball needs CRAZY CARNIVAL,
  // Line Slasher needs OCCÜLTACRESBURG, and the Charge Cannon needs SHAPE
  // LIMBO (once anything else is earned — see weapon.js). [V] itself isn't
  // gated on any one level specifically: that used to block switching to an
  // already-earned weapon too if a *different* gate happened not to be
  // cleared yet, a redundant lock on top of the per-weapon one.
  // SPEEDRUN MODE: every weapon free with [V] (the author's pick).
  world.canSwitchWeapon = speedrun || endless || cyberzooCleared;
  world.canUseBouncyBall = speedrun || endless || carnavalCleared;
  world.canUseLineSlasher = speedrun || endless || slasherLevelCleared;
  world.canUseChargeCannon = speedrun || endless || shapelimboCleared;
  const unlockedWeapons = {
    shotgun: world.canSwitchWeapon, bouncy: world.canUseBouncyBall, lineslasher: world.canUseLineSlasher, chargecannon: world.canUseChargeCannon,
  };
  world.canSwitchAtAll = availableWeaponOrder(unlockedWeapons).length > 1;
  // Defensive snap-back, mirroring stageselect.js's own: if a weapon the
  // player hasn't actually earned yet (or, for the Charge Cannon, no longer
  // gets a free pass on — see weapon.js) is somehow still selected and isn't
  // the one being forced right now, fall back to whatever's actually
  // available rather than silently handing out an unearned one.
  if (!world.weaponForced) {
    world.weapon = weaponById(sanitizeWeaponId(world.weapon.id, unlockedWeapons));
    setWeaponId(world.weapon.id);
  }
  // THE FINALE's double max HP now lives in outerspace.js's runOuterSpace,
  // applied when the merged OUTER SPACE run reaches that stage.
  // A cheat-code load restores its saved HP/lives/score/weapon on top of the
  // normal boot values (never written to real progress — see cheat.js); the
  // weapon-lock above still wins if it applies.
  if (savedLoad) {
    applySave(world, savedLoad);
    if (world.weaponForced) {
      world.weapon = weaponById(forcedWeaponId);
    }
  }
  world.lives = Math.min(world.lives, livesCap(world, world.player.skin));   // a load too: DEVIL FISH's cap
  await waitForSounds(world);   // the background sound load (BOOT_SOUNDS)
  world.player.container.visible = true;

  // Main game loop. Once an end screen is up (`world._over`), it goes dormant
  // and lets that screen own the ticker + input.
  app.ticker.add(() => {
    if (world._over) return;
    // [X] hard-freezes the game NES-style (see pause.js) — checked before
    // anything else so it still toggles while paused, and skips the rest of
    // the frame (nothing updates, nothing moves) once it is.
    // "Show hitbox on death" (deathreveal.js): a death freezes the frame for a
    // moment with the hitboxes drawn; nothing else runs until it's over.
    if (world.deathReveal) {
      const rdt = Math.min(app.ticker.deltaMS / 1000, 0.05);
      if (!stepDeathReveal(world, rdt, input.wasPressed('fire'))) { input.endFrame(); return; }
    }
    if (input.wasPressed('pause') && !world.speedrun) togglePause(world);   // no pause in a speedrun
    updateCheatEntry(world);   // Ctrl + arrow sequence + Enter — see cheat.js
    if (world.paused) { input.endFrame(); return; }
    // [V] switches weapon mid-level too, not just on the stage-select hub —
    // same gate as there (something else is actually unlocked to switch
    // to), and still locked out entirely while weaponForced (an uncleared
    // CYBER ZOO/CRAZY CARNIVAL run) overrides it.
    if (!world.weaponForced && world.canSwitchAtAll && input.wasPressed('weapon')) {
      const order = availableWeaponOrder({
        shotgun: world.canSwitchWeapon, bouncy: world.canUseBouncyBall, lineslasher: world.canUseLineSlasher,
        chargecannon: world.canUseChargeCannon,
      });
      const i = (order.indexOf(world.weapon.id) + 1) % order.length;
      world.weapon = weaponById(order[i]);
      setWeaponId(world.weapon.id);
    }
    // Manual save / load (savegame.js) — [Shift] / [Enter], SAVE / LOAD on a phone
    if (!world.speedrun && !world.endless && input.wasPressed('shift')) saveGame(world);
    if (!world.speedrun && !world.endless && input.wasPressed('enter') && !input.isDown('ctrl')) loadGame(hud);
    const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
    world.player.update(dt);
    world.update(dt);
    hud.update();
    if (world.player.dead) {
      // OUTER SPACE (outerspace.js's runOuterSpace) respawns the player at the
      // start of the stage they died in while lives remain, instead of Game
      // Over. `respawning` holds this branch off until the revive is done.
      if (world.respawning) { input.endFrame(); return; }
      // The "Y u do this?" easter egg: dying on a phone held upright
      // (menu.js's showGameOver). Read on the death's first frame.
      // TOXIC MODE only (12+), like every other rude line.
      if (world.diedVertical == null) world.diedVertical = getToxicMode() && world.isMobile && isPortraitScreen();
      // OPTIONS → DEATH HITBOX (on by default) turns the freeze off
      if (!world.deathRevealDone && getShowHitbox()) { startDeathReveal(world); input.endFrame(); return; }
      world.deathRevealDone = false;   // armed again for the next death (OUTER SPACE respawns)
      world.deathSnap = null;          // die() snapshots even with the reveal off
      const respawn = world.canRespawn && world.lives > 1;
      // TOXIC MODE: once per death, before respawn or Game Over — except an
      // upright-phone Game Over, which plays its own line (showGameOver)
      // (a speedrun's result screen has no such line, so it always roasts)
      if (respawn || world.speedrun || !world.diedVertical) playRoast(world);
      // MILESTONES: every death counts (O7 at 100, Bro... at 1,000)
      recordDeath(world, Math.max(0, Math.max(world.deathCueEnd || 0, world.roastEnd || 0) - world.audio.now()));
      // Achievement "I saw it hilarious": die in CYBER ZOO's SAW phase. Its
      // banner waits for the death cue and any roast line to finish.
      if (world.currentLevelId === 'cyberzoo' && world.currentPhase === 1) {
        const quiet = Math.max(world.deathCueEnd || 0, world.roastEnd || 0) - world.audio.now();
        unlockAchievement(world, 'sawhilarious', { delay: Math.max(0, quiet) });
      }
      // Achievement "Diabetus": killed by a lollipop, anywhere.
      const k = world.killedBy;
      if (k && typeof k === 'object' && k.constructor && k.constructor.name === 'Lollypop') {
        const quiet = Math.max(world.deathCueEnd || 0, world.roastEnd || 0) - world.audio.now();
        unlockAchievement(world, 'diabetus', { delay: Math.max(0, quiet) });
      }
      // Achievement "DED": chomped by OCCÜLTACRESBURG's Plasmadrache.
      if (world.killedBy === 'chomp') {
        const quiet = Math.max(world.deathCueEnd || 0, world.roastEnd || 0) - world.audio.now();
        unlockAchievement(world, 'ded', { delay: Math.max(0, quiet) });
      }
      // "Here we go again...": nommed by Plasmadrache Delta's head.
      // "YOU JUST GOT... Hadoukened!": killed by Delta's 10-damage supercharge.
      {
        const quiet = Math.max(0, Math.max(world.deathCueEnd || 0, world.roastEnd || 0) - world.audio.now());
        if (world.killedBy === 'nom') unlockAchievement(world, 'herewego', { delay: quiet });
        const kb = world.killedBy;
        if (kb && typeof kb === 'object' && kb.constructor && kb.constructor.name === 'DeltaShot' && kb.dmg >= 10)
          unlockAchievement(world, 'deltahadouken', { delay: quiet });
      }
      if (respawn) {
        world.diedVertical = null;   // read again on the next death
        world.lives -= 1;   // this death still spends a life
        setLives(world.lives);
        world.respawning = true;
        input.endFrame();
        return;
      }
      world._over = true;
      if (world.endless) {   // ENDLESS MODE: its own result screen
        hud.setCenter(''); hud.setPhaseText('');
        showEndlessEnd(world);
        return;
      }
      if (world.speedrun) {   // the run is over: its own result screen
        if (world.speedrun.stopTimer) world.speedrun.stopTimer();
        hud.setCenter('');
        showSpeedrunEnd(world, false);
        return;
      }
      world.lives = Math.max(0, world.lives - 1);   // this death spends a life
      setLives(world.lives);
      recordBestScore(level.id, world.score);   // the hub's per-level best-score card
      hud.setCenter('');
      showGameOver(world);
      return;
    }
    input.endFrame();
  });

  // Run the level. It resolves when the level ends; the player being alive
  // means they cleared it. A cheat-code load jumps straight to its saved
  // phase (see levels/*.js's `run(world, hud, opts)`).
  checkScoreAchievements(world);   // a carried-over or loaded total may already qualify
  world.inLevel = true;   // mobile.js: SAVE / LOAD / V show only while a level runs
  await level.run(world, hud, savedLoad ? { startPhase: savedLoad.phase, startStage: savedLoad.stage || 0 } : undefined);
  if (endless) return;   // ENDLESS MODE only ends in a death (its result screen)
  if (speedrun && !world.player.dead && !world._over) {
    world._over = true;
    hud.setPhaseText(''); hud.setCenter('');
    showSpeedrunEnd(world, true);   // Delta's down: the timer already stopped
    return;
  }
  if (!world.player.dead && !world._over) {
    markCleared(level.id);
    syncCostumeUnlocks();   // a clear can earn a costume — remember it past the fresh-tab wipe
    // Clear-on-difficulty achievements; their banners wait out the
    // stage-clear jingle (STAGE_CLEAR_JINGLE) so the two don't overlap.
    const CLEAR_ACH = {   // level id → [NORMAL achievement, HARD achievement]
      shapelimbo: ['firsttime', 'secondtime'],
      cyberzoo: ['normalday', 'kangaburger'],
      crazycarnival: ['carnivalnormal', 'carnivalhard'],
      occultacresburg: ['slayed', 'executed'],
    };
    if (level.id !== 'outerspace') checkLevelChallenges(world, STAGE_CLEAR_JINGLE);   // OUTER SPACE checks per stage
    if (CLEAR_ACH[level.id]) {
      const d = world.difficulty.id;
      const [onNormal, onHard] = CLEAR_ACH[level.id];
      if (d === 'normal') unlockAchievement(world, onNormal, { delay: STAGE_CLEAR_JINGLE });
      if (d === 'arcade') unlockAchievement(world, onHard, { delay: STAGE_CLEAR_JINGLE });
    }
    recordBestScore(level.id, world.score);   // the hub's per-level best-score card
    if (world.difficulty.refillOnClear) {   // EASY: clearing a stage restores lives
      world.lives = livesCap(world, world.player.skin);
      setLives(world.lives);
    }
    world._over = true;
    hud.setPhaseText('');
    hud.setCenter('');
    // OUTER SPACE ends with THE FINALE's last boss: its own victory screen.
    if (level.id === 'outerspace') {
      autosaveProgress(world.totalScore);
      await playOutro(world);   // the final cutscene, part 1 (Big Bang build-up)
      // Beating the game: "Big Bang" (NORMAL) / "Kablooie!" (HARD), shown
      // on the victory screen once the cutscene is over.
      if (world.difficulty.id === 'normal') unlockAchievement(world, 'bigbang', { delay: 1.5 });
      if (world.difficulty.id === 'arcade') unlockAchievement(world, 'kablooie', { delay: 1.5 });
      showVictory(world);
    }
    else {
      // A cleared hub stage returns to the stage-select hub after the Stage
      // Clear screen's reload, not the title screen -- a one-shot flag read
      // at the next boot, like agbt_retry.
      try { sessionStorage.setItem('agbt_tohub', '1'); } catch (e) {}
      showStageClear(world);
    }
  }
}

main().catch(bootFailed);
