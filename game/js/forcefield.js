// forcefield.js — the shrinking hazard border in Showman's boss fight
// (showman.js/levels/level3.js's phase5). Ported from the author's own
// Scratch prototype (Boss — Cruel Clownhouse.sb3): the "Force field" sprite
// starts at full size and shrinks continuously (`changesizeby -0.1` x1000)
// once the fight starts, until it's gone.
//
// It's a rectangular frame (the source SVG is literally just a big
// rectangle outline) that shrinks in from the arena's edges toward the
// centre over FIELD_DURATION, then disappears for good. Touching it is a
// real punishment, not just an inconvenience: it costs 1 HP and sends the
// whole encounter back to the maze intro (level3.js's phase5 re-runs it from
// a fresh timer/targets/walls) rather than just refilling Showman's HP —
// shooting him with no regard for the field used to cost nothing worse than
// a HP-reset-on-the-boss, which made it possible to just tank through the
// duel with no real punishment. `onReset` is how it tells phase5 to do that;
// this class only owns the field itself, not what "reset" means to the level.
import { toScreen, HALF_W, HALF_H } from './core.js';
import { paletteColor } from './retro.js';

const FIELD_DURATION = 30;   // seconds to fully close, matching the intro maze's own timer
const THICKNESS = 0.35;      // world units — how wide the touchable border band is
const RESET_COOLDOWN = 1.5;  // seconds of grace after a reset before it can fire again
const RESET_DAMAGE = 1;

export class ForceField {
  constructor(world) {
    this.world = world;
    this.onReset = null;   // set by level3.js's phase5; called once per touch
    this.t = 0;
    this.resetT = 0;
    this.msgT = 0;
    this.alive = true;
    this.dead = false;

    this.startHX = HALF_W - 0.3;
    this.startHY = HALF_H - 0.3;
    this.hx = this.startHX;
    this.hy = this.startHY;

    this.container = new PIXI.Graphics();
    this.container.zIndex = 5;
    world.stage.addChild(this.container);
    this.redraw();
  }

  redraw() {
    const g = this.container;
    g.clear();
    if (this.hx <= 0.01 || this.hy <= 0.01) return;
    const [sx0, sy0] = toScreen(-this.hx, -this.hy);
    const [sx1, sy1] = toScreen(this.hx, this.hy);
    g.lineStyle({ width: 4, color: paletteColor('core'), alpha: 0.85 });
    g.drawRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.resetT > 0) this.resetT -= dt;
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0 && this.world.hud) this.world.hud.setCenter('');
    }

    const k = Math.max(0, 1 - this.t / FIELD_DURATION);
    this.hx = this.startHX * k;
    this.hy = this.startHY * k;
    this.redraw();

    if (k <= 0) { this.destroy(); return; }

    const p = this.world.player;
    // the ship's triangle against the border band (hitbox()'s four rects)
    if (p && !p.dead && !p.invulnerable && this.resetT <= 0 && this.hitbox().shapes.some(s => p.touchesRect(...s.rect))) {
      this.resetT = RESET_COOLDOWN;
      this.msgT = 1.2;
      p.takeDamage(RESET_DAMAGE);
      this.world.audio.play('bossHurt', 0.7);
      if (this.world.hud) this.world.hud.setCenter('FORCE FIELD! RESET!');
      if (this.onReset) this.onReset();
    }
  }

  // "show hitbox on death" (deathreveal.js): what this actually tests the player against.
  hitbox() {   // the border band, THICKNESS either side of the frame
    const T = THICKNESS, X = this.hx, Y = this.hy;
    return { shapes: [
      { rect: [-X - T, -Y - T, X + T, -Y + T] }, { rect: [-X - T, Y - T, X + T, Y + T] },
      { rect: [-X - T, -Y + T, -X + T, Y - T] }, { rect: [X - T, -Y + T, X + T, Y - T] },
    ] };
  }
  destroy() {
    this.alive = false;
    this.dead = true;
    // A reset's own "FORCE FIELD! RESET!" message holds for msgT seconds
    // (see update()), but level3.js's phase5 tears the whole encounter down
    // (clearEntities(), which destroy()s this) the instant onReset() fires
    // -- long before that countdown would ever finish on its own. Without
    // this, the message stuck around on screen through the entire next maze
    // attempt, since nothing else ever clears it. Only touches the HUD if
    // this field's own message is still actually showing, so a normal
    // teardown (Showman defeated, player dead) doesn't blank an unrelated
    // one (e.g. the WARNING flash) that happens to be up at the same time.
    if (this.msgT > 0 && this.world.hud) this.world.hud.setCenter('');
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
