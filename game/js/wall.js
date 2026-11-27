// wall.js — a solid, static obstacle that blocks player movement (see
// core.js's blockedByWalls, called from player.js) and, by default, every
// shot too (grape, the original Showman-maze look — `canBeDestroyedBy`
// always false, exactly like a plain PURPLE Hittable that never lets even a
// charged shot through). Not a real Hittable (it's terrain, not an enemy —
// no score, no `world.hittables` entry) and, unlike a real Hittable, has no
// `stopsBullet` of its own to call — every caller (bullet.js/bouncyball.js/
// lineslasher.js) just checks `canBeDestroyedBy` and otherwise treats a
// wall as unconditionally solid, since a wall (unlike PURPLE) never lets a
// charged shot pass through without actually destroying it first. `ring`/
// `cobalt` walls follow the game's own established CYAN/DARKBLUE colour
// rules for whether a shot gets past that way.
//
// Built for K.A.N.G's Boss "Cruel Clownhouse" (Showman) intro maze
// (levels/level3.js's phase5, showman.js's MAZE_WALLS): the source Scratch
// backdrop draws a labyrinth of solid purple partitions, but a Scratch
// backdrop is just a picture — nothing there ever stopped a sprite from
// walking through it. Rendered here as an actual filled rectangle (this
// game's usual "stroke-only, no fill" rule is for hazards; a wall reads as
// solid ground, the same reasoning `arena_bg.png`/K.A.N.G's own backdrop get
// a pass on the no-glow rule) in `grape` — the exact fill color
// (`#b300ff`) the source SVG's own wall rectangles already use.
import { toScreen, CYAN, DARKBLUE } from './core.js';
import { paletteColor } from './retro.js';

// Which `role` strings actually carry a shootable colour rule — only
// plasmadrache.js's own spawnPlasmaWall ever passes `ring`/`cobalt` (its own
// eye-colour tell for that wall batch); every other caller's walls stay
// `grape` (the default), which has no entry here and so stays plain solid
// terrain — a real bug fix, not a new mechanic invented for its own sake:
// tinting a wall cyan/dark-blue while it behaved identically to a purple one
// (always blocking, no way to get a charged shot through) broke this game's
// own established colour language everywhere else a Hittable uses it.
const ROLE_COLOR = { ring: CYAN, cobalt: DARKBLUE };

export class Wall {
  // `role` picks the fill's palette colour (defaults to `grape`, the
  // original Showman-maze look, and stays permanently solid); plasmadrache.js's
  // own spawnPlasmaWall passes a random one of grape/cobalt/ring to match
  // Plasmadrache's own eye-colour tell for that batch, and `ring`/`cobalt`
  // are also actually shootable (see the file header).
  //
  // `opts.pierceable`: a charged shot (not a shotgun pellet), a SLASH and a
  // LINE SLASHER dash pass straight through this wall instead of stopping
  // on it -- the PURPLE rule ("torpedoes pass through") for terrain.
  // Plasmadrache's own walls use it ("remove penetration immunity from
  // walls of HIS bossfight"); every maze wall leaves it off and stays fully
  // solid. Ordinary movement is still blocked either way.
  constructor(world, x0, x1, y0, y1, role = 'grape', opts = {}) {
    this.world = world;
    this.pierceable = !!opts.pierceable;
    this.x0 = x0; this.x1 = x1; this.y0 = y0; this.y1 = y1;
    this.role = role;
    this.color = ROLE_COLOR[role] || null;
    this.alive = true;

    const [sx0, sy0] = toScreen(x0, y0);
    const [sx1, sy1] = toScreen(x1, y1);
    this.container = new PIXI.Graphics();
    this.container.beginFill(paletteColor(role));
    this.container.drawRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    this.container.endFill();
    this.container.zIndex = -1;   // under hazards/player, same layer as arena backdrops
    world.stage.addChild(this.container);

    world.walls.push(this);
  }

  // Same colour-rule shape Hittable itself uses (core.js), just duck-typed
  // here rather than sharing the base class — a wall lives in world.walls
  // for movement-blocking, not world.hittables, and has no HP/score/death
  // sound of its own to inherit.
  canBeDestroyedBy(charged) {
    if (this.color === CYAN) return true;
    if (this.color === DARKBLUE) return charged;
    return false;
  }

  // Static — nothing to do per frame, but world.updatables/clearEntities
  // expect update()/destroy() on anything they hold.
  update() {}

  destroy() {
    this.alive = false;
    const i = this.world.walls.indexOf(this);
    if (i >= 0) this.world.walls.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}

// Spawns the full maze from a list of {x0,x1,y0,y1} world-space rects (see
// showman.js's MAZE_WALLS), registering each with world.add so clearEntities
// tears them down like any other entity.
export function spawnMaze(world, rects) {
  const walls = [];
  for (const r of rects) walls.push(world.add(new Wall(world, r.x0, r.x1, r.y0, r.y1)));
  return walls;
}
