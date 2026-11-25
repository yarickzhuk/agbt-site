// achievements.js — the achievement list, unlocking, the unlock banner and
// the ACHIEVEMENTS screen (title menu). Per direct request ("we will be
// adding achievements, cuz that's the main stuff that will keep people
// playing the game"); the list arrives one level at a time with the
// author's own icons (assets/sprites/achievements/<id>.png).
//
// Rarity sets the icon's border colour, the banner colour and the jingle,
// per the author: common (yellow, likely on a first run), rare (green,
// usually not on a first run but little effort), legendary (cyan, effort
// required, can't be had on a first run), mythical (purple, 100%-ing).
//
// Earned achievements live in settings.js (agbt_settings.achievements), so
// they outlive the fresh-tab progress wipe like costumes do.
import { SCREEN_W, SCREEN_H } from './core.js';
import { paletteColor } from './retro.js';
import { input } from './input.js';
import { tappedAnywhere } from './tap.js';
import { getAchievementIds, addAchievementId, getLifetimeScore,
         getLifetimeDamage, addLifetimeDamage, getLifetimeDeaths, addLifetimeDeath } from './settings.js';

export const RARITY = {
  common:    { label: 'COMMON',    color: 'hull',  sound: 'achievementCommon' },
  rare:      { label: 'RARE',      color: 'heal',  sound: 'achievementRare' },
  legendary: { label: 'LEGENDARY', color: 'ring',  sound: 'achievementLegendary' },
  mythical:  { label: 'MYTHICAL',  color: 'grape', sound: 'achievementMythical' },
};

// Level ids → the page title on the ACHIEVEMENTS screen, in page order.
// (Names written out here rather than read from levels/registry.js, which
// imports every level and so every hazard file that calls unlock().)
export const GROUPS = [
  { id: 'shapelimbo', name: 'SHAPE LIMBO' },
  { id: 'cyberzoo', name: 'CYBER ZOO' },
  { id: 'crazycarnival', name: 'CRAZY CARNIVAL' },
  { id: 'occultacresburg', name: 'OCCÜLTACRESBURG' },
  { id: 'outerspace', name: 'OUTER SPACE' },
  { id: 'score', name: 'SCORE' },
  { id: 'challenges', name: 'CHALLENGES' },
  { id: 'milestones', name: 'MILESTONES' },
];

export const ACHIEVEMENTS = [
  { id: 'kaboom', group: 'shapelimbo', rarity: 'common',
    name: 'Kaboom', desc: 'Blow up the bomb in the first phase' },
  { id: 'hadoukened', group: 'shapelimbo', rarity: 'rare',
    name: 'Hadoukened', desc: 'Defeat the boss in one hit' },
  { id: 'firsttime', group: 'shapelimbo', rarity: 'common',
    name: 'First time?', desc: 'Clear the stage on NORMAL' },
  { id: 'secondtime', group: 'shapelimbo', rarity: 'rare',
    name: "It's even funnier the SECOND time", desc: 'Clear the stage on HARD' },
  { id: 'sawhilarious', group: 'cyberzoo', rarity: 'rare',
    name: 'I saw it hilarious', desc: 'Die in the SAW phase' },
  { id: 'crockbully', group: 'cyberzoo', rarity: 'legendary',
    name: 'Crockodile Bully', desc: "Don't let C.R.O.C.K spit a single jellyfish" },
  { id: 'kangaburger', group: 'cyberzoo', rarity: 'rare',
    name: 'Kanga Burger Deluxe', desc: 'Clear the stage on HARD' },
  { id: 'normalday', group: 'cyberzoo', rarity: 'common',
    name: 'Normal day in Australia', desc: 'Clear the stage on NORMAL' },
  { id: 'twoforone', group: 'crazycarnival', rarity: 'rare',
    name: '2 for 1 price', desc: 'Get both green peanuts in the DARTS phase' },
  { id: 'diabetus', group: 'crazycarnival', rarity: 'rare',
    name: 'Diabetus', desc: 'Die to a lollipop' },
  { id: 'leeroy', group: 'crazycarnival', rarity: 'common',
    name: 'LEEROY JENKINS', desc: 'Pop every clown in the Cruel Clownhouse on the first try' },
  { id: 'carnivalhard', group: 'crazycarnival', rarity: 'rare',
    name: 'Big Top', desc: 'Clear the stage on HARD' },
  { id: 'carnivalnormal', group: 'crazycarnival', rarity: 'common',
    name: 'The show must go on', desc: 'Clear the stage on NORMAL' },
  { id: 'moai', group: 'occultacresburg', rarity: 'rare',
    name: 'Moai', desc: 'Get through THE WHEEL without moving' },
  { id: 'ded', group: 'occultacresburg', rarity: 'rare',
    name: 'DED', desc: 'Get chomped by Plasmadrache' },
  { id: 'slayed', group: 'occultacresburg', rarity: 'common',
    name: 'Slayed', desc: 'Clear the stage on NORMAL' },
  { id: 'executed', group: 'occultacresburg', rarity: 'rare',
    name: 'Executed', desc: 'Clear the stage on HARD' },
  { id: 'coincidence', group: 'outerspace', rarity: 'legendary',
    name: 'Coincidence? I THINK NOT!', desc: 'Destroy every asteroid wearing THE OG' },
  { id: 'herewego', group: 'outerspace', rarity: 'common',
    name: 'Here we go again...', desc: "Get nommed by Plasmadrache Delta's head" },
  { id: 'deltahadouken', group: 'outerspace', rarity: 'common',
    name: 'YOU JUST GOT... Hadoukened!', desc: "Get killed by Delta's supercharge" },
  { id: 'bigbang', group: 'outerspace', rarity: 'common',
    name: 'Big Bang', desc: 'Beat the game on NORMAL' },
  { id: 'kablooie', group: 'outerspace', rarity: 'rare',
    name: 'Kablooie!', desc: 'Beat the game on HARD' },
  { id: 'over9000', group: 'score', rarity: 'rare', count: 'score', need: 10000,
    name: "IT'S OVER 9000!", desc: 'Score 10,000 points' },
  { id: 'jawdrop', group: 'score', rarity: 'legendary', count: 'score', need: 50000,
    name: 'Jaw drop', desc: 'Score 50,000 points' },
  { id: 'atomic', group: 'score', rarity: 'mythical', count: 'score', need: 100000,
    name: 'Atomic', desc: 'Score 100,000 points' },
  { id: 'timetostop', group: 'score', rarity: 'mythical', count: 'score', need: 500000,
    name: "It's time to STOP!", desc: 'Score 500,000 points' },
  { id: 'beyondhuman', group: 'score', rarity: 'mythical', count: 'score', need: 1000000,
    name: 'Beyond human understanding', desc: 'Score 1,000,000 points' },
  { id: 'energised', group: 'challenges', rarity: 'legendary',
    name: 'Energised', desc: 'Clear a level using only charged attacks' },
  { id: 'hedgehog', group: 'challenges', rarity: 'legendary',
    name: 'Ya do it hedgehog style', desc: 'Set a new SPEEDRUN MODE record' },
  { id: 'nohealth', group: 'challenges', rarity: 'legendary',
    name: 'No health wasted', desc: 'Clear a level without picking up any healing' },
  { id: 'notmissed', group: 'challenges', rarity: 'mythical',
    name: 'You will not be missed...', desc: 'Hear every TOXIC MODE roast' },
  { id: 'lottadamage', group: 'milestones', rarity: 'common',
    name: "That's a lotta damage", desc: 'Deal 1,000 damage', count: 'damage', need: 1000 },
  { id: 'nowlottadamage', group: 'milestones', rarity: 'legendary',
    name: "NOW THAT'S a lotta damage", desc: 'Deal 10,000 damage', count: 'damage', need: 10000 },
  { id: 'o7', group: 'milestones', rarity: 'rare',
    name: 'O7', desc: 'Die 100 times', count: 'deaths', need: 100 },
  { id: 'bro', group: 'milestones', rarity: 'legendary',
    name: 'Bro...', desc: 'Die 1,000 times', count: 'deaths', need: 1000 },
];
export const ACHIEVEMENT_PNGS = ACHIEVEMENTS.map(a => iconUrl(a.id));
function iconUrl(id) { return `assets/sprites/achievements/${id}.png`; }
const byId = id => ACHIEVEMENTS.find(a => a.id === id);

export function isUnlocked(id) { return getAchievementIds().includes(id); }

// Banners not shown yet survive a page reload (Stage Clear's CONTINUE can
// reload before a delayed banner gets its turn): sessionStorage, per tab.
const PENDING_KEY = 'agbt_ach_pending';
function readPending() {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY)) || []; } catch (e) { return []; }
}
function writePending(list) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (e) {}
}

// Unlock an achievement (no-op if already earned). `opts.delay` holds the
// banner back that many seconds — the Stage Clear ones wait out the
// stage-clear jingle so the two don't play over each other.
export function unlockAchievement(world, id, opts = {}) {
  if (!byId(id) || isUnlocked(id)) return false;
  addAchievementId(id);
  writePending([...readPending(), id]);
  queueBanner(world, id, opts.delay || 0);
  return true;
}

// Score achievements: TOTAL SCORE EVER (settings.js's lifetimeScore, every
// point scored on this device) reaching each threshold. main.js calls this
// whenever points are scored and at boot.
export function checkScoreAchievements(world) {
  checkMilestones(world, 'score', getLifetimeScore());
}

// Per-level challenges, "Energised" and "No health wasted". The flags are
// set by player.js (a normal, uncharged attack) and heal.js/peanut.js (a
// heal picked up); they're cleared wherever a level or OUTER SPACE stage
// starts fresh (main.js's boot, the end of a weapon tutorial, each OUTER
// SPACE stage clear or respawn, each speedrun level) and kept in a save.
export function resetLevelChallenges(world) {
  world.usedNormalAttack = false;
  world.healPicked = false;
}
export function checkLevelChallenges(world, delay = 0) {
  if (!world.usedNormalAttack) unlockAchievement(world, 'energised', { delay });
  if (!world.healPicked) unlockAchievement(world, 'nohealth', { delay });
}

// MILESTONES: lifetime damage dealt (every HP the player's weapons take off
// anything, all difficulties) and lifetime deaths, both in settings.js.
const COUNTERS = { damage: getLifetimeDamage, deaths: getLifetimeDeaths, score: getLifetimeScore };
function checkMilestones(world, kind, total, delay = 0) {
  for (const a of ACHIEVEMENTS)
    if (a.count === kind && total >= a.need) unlockAchievement(world, a.id, { delay });
}
export function recordDamage(world, n) {
  if (n > 0) checkMilestones(world, 'damage', addLifetimeDamage(n));
}
export function recordDeath(world, delay = 0) {
  checkMilestones(world, 'deaths', addLifetimeDeath(), delay);
}

// At boot: show whatever was unlocked but not shown before a reload, then
// unlock any counter achievement (score, damage, deaths) whose lifetime total
// already qualifies — e.g. one earned before it counted the lifetime total.
export function showPendingAchievements(world) {
  for (const id of readPending()) queueBanner(world, id, 0);
  for (const kind in COUNTERS) checkMilestones(world, kind, COUNTERS[kind]());
}

// ---- the unlock banner ----
const BANNER_W = 460, BANNER_H = 92, ICON = 68;
const SLIDE = 0.3, HOLD = 3.6;
const queue = [];
let showing = false;

function queueBanner(world, id, delay) {
  if (queue.some(q => q.id === id)) return;
  queue.push({ id, at: performance.now() / 1000 + delay });
  if (!showing) runQueue(world);
}

function runQueue(world) {
  if (!queue.length) { showing = false; return; }
  showing = true;
  const wait = () => {
    const next = queue[0];
    if (performance.now() / 1000 < next.at) return;
    world.app.ticker.remove(wait);
    queue.shift();
    showBanner(world, next.id, () => runQueue(world));
  };
  world.app.ticker.add(wait);
}

function showBanner(world, id, done) {
  const a = byId(id);
  const r = RARITY[a.rarity];
  const col = paletteColor(r.color);
  writePending(readPending().filter(p => p !== id));
  world.audio.play(r.sound, 0.9);

  const c = new PIXI.Container();
  c.zIndex = 1000;   // above end screens (200) and the outro (150)
  const box = new PIXI.Graphics();
  box.lineStyle({ width: 3, color: col });
  box.beginFill(0x000000, 0.92);
  box.drawRect(-BANNER_W / 2, 0, BANNER_W, BANNER_H);
  box.endFill();
  const icon = PIXI.Sprite.from(iconUrl(id));
  icon.width = icon.height = ICON;
  icon.position.set(-BANNER_W / 2 + 12, (BANNER_H - ICON) / 2);
  const head = new PIXI.Text('ACHIEVEMENT UNLOCKED  ·  ' + r.label,
    { fontFamily: 'Tektur', fontSize: 14, letterSpacing: 2, fill: col });
  head.position.set(-BANNER_W / 2 + ICON + 26, 16);
  const name = new PIXI.Text(a.name, {
    fontFamily: 'Tektur', fontSize: 22, fill: 0xffffff,
    wordWrap: true, wordWrapWidth: BANNER_W - ICON - 44,
  });
  name.position.set(-BANNER_W / 2 + ICON + 26, 38);
  if (name.height > 48) name.scale.set(48 / name.height);
  c.addChild(box, icon, head, name);
  c.position.set(SCREEN_W / 2, -BANNER_H - 4);
  world.app.stage.addChild(c);

  // Real time, so it keeps moving while the game is paused or frozen.
  let t = 0;
  const step = () => {
    t += Math.min(world.app.ticker.deltaMS / 1000, 0.1);
    const inK = Math.min(1, t / SLIDE);
    const outK = Math.max(0, Math.min(1, (t - SLIDE - HOLD) / SLIDE));
    const k = inK - outK;
    c.y = -BANNER_H - 4 + (BANNER_H + 16) * (1 - Math.pow(1 - k, 3));
    if (t >= SLIDE * 2 + HOLD) {
      world.app.ticker.remove(step);
      if (!c.destroyed) c.destroy({ children: true });
      done();
    }
  };
  world.app.ticker.add(step);
}

// ---- the ACHIEVEMENTS screen ----
// One page per level (more than PER_PAGE achievements → several pages),
// ← → turn pages, [X] backs out. Locked ones show their icon dimmed with
// LOCKED, but their name and how to get them are always visible.
const PER_PAGE = 5;
function pages() {
  const out = [];
  for (const g of GROUPS) {
    const list = ACHIEVEMENTS.filter(a => a.group === g.id);
    for (let i = 0; i < list.length; i += PER_PAGE) out.push({ name: g.name, list: list.slice(i, i + PER_PAGE) });
  }
  return out;
}

export function showAchievements(world) {
  return new Promise(resolve => {
    const layer = new PIXI.Container();
    layer.zIndex = 200;
    world.stage.addChild(layer);
    const PAGES = pages();
    let page = 0;

    const style = (size, fill = paletteColor('ring')) => ({ fontFamily: 'Tektur', fontSize: size, fill });
    const title = new PIXI.Text('ACHIEVEMENTS', { ...style(40), letterSpacing: 6 });
    title.anchor.set(0.5);
    title.position.set(SCREEN_W / 2, 70);
    const got = ACHIEVEMENTS.filter(a => isUnlocked(a.id)).length;
    const count = new PIXI.Text(got + ' / ' + ACHIEVEMENTS.length + '  UNLOCKED', style(18));
    count.anchor.set(0.5);
    count.position.set(SCREEN_W / 2, 104);
    count.alpha = 0.8;
    const lifetime = new PIXI.Text('TOTAL SCORE EVER  ' + getLifetimeScore().toLocaleString('en-US'), style(16, paletteColor('hull')));
    lifetime.anchor.set(0.5);
    lifetime.position.set(SCREEN_W / 2, 128);
    const header = new PIXI.Text('', { ...style(24), letterSpacing: 3 });
    header.anchor.set(0.5);
    header.position.set(SCREEN_W / 2, 158);
    const hint = new PIXI.Text(
      (PAGES.length > 1 ? (world.isMobile ? 'TAP  NEXT PAGE      ' : '← →  PAGE      ') : '') + 'X  BACK', style(15));
    hint.anchor.set(0.5);
    hint.position.set(SCREEN_W / 2, SCREEN_H - 30);
    hint.alpha = 0.7;
    const rows = new PIXI.Container();
    layer.addChild(title, count, lifetime, header, hint, rows);

    const ROW_TOP = 200, ROW_H = 92, LEFT = SCREEN_W / 2 - 330;
    const draw = () => {
      rows.removeChildren().forEach(ch => ch.destroy({ children: true }));
      const pg = PAGES[page];
      header.text = PAGES.length > 1 ? '◄  ' + pg.name + '  ►' : pg.name;
      pg.list.forEach((a, i) => {
        const y = ROW_TOP + i * ROW_H;
        const on = isUnlocked(a.id);
        const r = RARITY[a.rarity];
        const icon = PIXI.Sprite.from(iconUrl(a.id));
        icon.width = icon.height = 74;
        icon.position.set(LEFT, y);
        icon.alpha = on ? 1 : 0.2;
        const name = new PIXI.Text(a.name, style(22, on ? paletteColor(r.color) : 0x777777));
        name.position.set(LEFT + 92, y + 6);
        const prog = a.count && !on ? '   (' + Math.min(a.need, COUNTERS[a.count]()).toLocaleString('en-US') + ' / ' + a.need.toLocaleString('en-US') + ')' : '';
        const desc = new PIXI.Text(a.desc + prog, style(16, on ? 0xffffff : 0x777777));
        desc.position.set(LEFT + 92, y + 38);
        const tag = new PIXI.Text(on ? r.label : 'LOCKED  ·  ' + r.label, style(13, paletteColor(r.color)));
        tag.position.set(LEFT + 92, y + 60);
        tag.alpha = on ? 0.9 : 0.45;
        rows.addChild(icon, name, desc, tag);
      });
    };
    draw();

    const step = () => {
      if (PAGES.length > 1 && input.wasPressed('left'))  { page = (page + PAGES.length - 1) % PAGES.length; draw(); world.audio.play('levelSelectPress', 0.5); }
      if (PAGES.length > 1 && input.wasPressed('right')) { page = (page + 1) % PAGES.length; draw(); world.audio.play('levelSelectPress', 0.5); }
      const side = PAGES.length > 1 && tappedAnywhere() ? 1 : 0;   // a phone: tap for the next page (wraps round)
      if (side) { page = (page + side + PAGES.length) % PAGES.length; draw(); world.audio.play('levelSelectPress', 0.5); }
      if (input.backPressed()) {
        world.app.ticker.remove(step);
        world.stage.removeChild(layer);
        layer.destroy({ children: true });
        input.endFrame();
        resolve();
        return;
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}
