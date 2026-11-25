// ghost.js — OCCÜLTACRESBURG's phase-2 hazard: a new enemy built entirely
// from the brief (no Scratch source this time, only a single uploaded
// ambient sound — Ghost_presence.wav — which turned out to be a genuine
// ~64s continuous hiss, not the export-tool loop-artifact bug this session
// has run into a few times with other uploads; it's used here exactly as
// given, looped quietly the whole time the Ghost is disguised).
//
// Two states:
//  - 'disguised': drifts in from a random edge at DISGUISE_SPEED (slow) and
//    is almost invisible (DISGUISE_ALPHA), quietly hissing
//    (`world.audio.loop('ghostPresence', ...)`). Not shootable yet
//    (canBeDestroyedBy returns false) — same "not really there" pattern
//    lollypop.js/dart.js already use before they arm/stick. Touching it
//    does no damage; touching it is what breaks its disguise.
//  - 'revealed': the instant the player touches it, it snaps to full
//    opacity, becomes a plain CYAN Hittable (any shot kills it in one hit),
//    and starts a repeating "divebomb" cycle: a brief AIM wind-up (hovering,
//    pulsing alpha) where it locks onto wherever the player currently is,
//    then a fast straight-line DIVE through that point and on off the
//    screen, touch-hurting the whole way — then it swoops back in from a
//    fresh edge and aims again. Repeats until it's actually killed.
import { buildSprite } from './retro.js';
import { Hittable, CYAN, toScreen, HALF_W, HALF_H, edgeSpawn, dist } from './core.js';
import { useSilhouette } from './silhouette.js';

const RADIUS = 0.4;
const DISGUISE_SPEED = 0.6;     // world units/s while sneaking up
const DISGUISE_ALPHA = 0.12;    // "almost unnoticeable"
const AIM_TIME = 0.4;           // seconds hovering/locking on before each dive
const DIVE_SPEED = 9;           // world units/s while diving
const TOUCH_DAMAGE = 1;
const EDGE_MARGIN = 1.5;        // how far past the edge it flies before looping back
// The disguised hiss grows with closeness: HISS_FAR at HISS_FAR_D and beyond,
// HISS_NEAR at HISS_NEAR_D and closer. Loud enough to stand out over the
// Flames' own idle loop (0.3) as it closes in.
const HISS_FAR = 0.55, HISS_NEAR = 1.0;
const HISS_FAR_D = 7, HISS_NEAR_D = 1.2;

export class Ghost extends Hittable {
  constructor(world, x, y) {
    super(world, {
      x, y, color: CYAN, radius: RADIUS, damage: TOUCH_DAMAGE, countsAsProgress: true,
      destroySound: 'destroyCyan',   // matches every other plain-cyan Hittable's own death sound
    });
    this.world = world;
    this.state = 'disguised';
    this.diving = false;
    this.aimT = 0;
    this.diveDir = { x: 0, y: 0 };

    this.container = buildSprite('Ghost', { lineWidth: 2 });
    useSilhouette(this);   // hits/touches follow the drawn outline (silhouette.js)
    this.container.alpha = DISGUISE_ALPHA;
    world.stage.addChild(this.container);
    this.place();
    // `ghostPresence` is one shared named loop (Audio.loop no-ops on a name
    // already playing), but up to GHOST_CAP (2) Ghosts can be disguised at
    // once -- without this counter, revealing (or destroying) *one* of them
    // called stopLoop() unconditionally and silenced the hiss for whichever
    // other Ghost was still sneaking up, even though it should keep hissing
    // until *it* reveals too. Tracked on `world` since the loop itself is
    // shared at that scope, not per-instance.
    world._ghostDisguisedCount = (world._ghostDisguisedCount || 0) + 1;
    world.audio.loop('ghostPresence', HISS_FAR);
  }

  // Only actually stops the shared loop once the last disguised Ghost is
  // gone (revealed or destroyed) -- see the constructor's own note.
  stopDisguiseLoop() {
    if (this.state !== 'disguised') return;   // already accounted for
    this.world._ghostDisguisedCount = Math.max(0, (this.world._ghostDisguisedCount || 1) - 1);
    if (this.world._ghostDisguisedCount === 0) this.world.audio.stopLoop('ghostPresence');
  }

  // The loop is shared, so the closest disguised Ghost sets its volume.
  hissVolume(d) {
    const w = this.world;
    const k = Math.max(0, Math.min(1, (HISS_FAR_D - d) / (HISS_FAR_D - HISS_NEAR_D)));
    const v = HISS_FAR + (HISS_NEAR - HISS_FAR) * k;
    if (w._ghostHissT !== w.time) { w._ghostHissT = w.time; w._ghostHiss = v; }
    else w._ghostHiss = Math.max(w._ghostHiss, v);
    w.audio.setLoopVolume('ghostPresence', w._ghostHiss);
  }

  place() { const [sx, sy] = toScreen(this.x, this.y); this.container.position.set(sx, sy); }

  // Ghost.json's own eyes/"view" sit at the top of the shape (small local
  // y, the rounded end) with the three-pronged hem hanging below -- that
  // top is the shape's default "face," pointing up (screen-space -Y) at
  // rotation 0. Rotating by atan2(dy,dx) alone would point the *side* of
  // the shape at the target, so this adds the quarter-turn that default
  // orientation is offset by, the same "rest pose isn't already +X" case
  // dart.js's own comment calls out not needing for its own art.
  faceDir(dx, dy) {
    if (dx === 0 && dy === 0) return;
    this.container.rotation = Math.atan2(dy, dx) + Math.PI / 2;
  }

  // Not really "there" until it reveals itself — matches lollypop.js/
  // dart.js's own "not shootable until armed/stuck" rule.
  canBeDestroyedBy(charged) { return this.state === 'revealed' && super.canBeDestroyedBy(charged); }

  update(dt) {
    if (this.dead) return;
    const p = this.world.player;
    if (this.state === 'disguised') {
      if (p && !p.dead) {
        const dx = p.x - this.x, dy = p.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.x += (dx / d) * DISGUISE_SPEED * dt;
        this.y += (dy / d) * DISGUISE_SPEED * dt;
        this.faceDir(dx, dy);
        // Touching it (not shooting it) is what breaks the disguise — no
        // damage here, just the reveal.
        this.hissVolume(d);
        if (this.touches(p)) this.reveal();
      }
      this.place();
      return;
    }

    // 'revealed': alternate AIM (hover, lock on) and DIVE (fast straight
    // line through the locked-on point and off the screen), forever, until
    // something actually kills it.
    if (this.diving) {
      this.x += this.diveDir.x * DIVE_SPEED * dt;
      this.y += this.diveDir.y * DIVE_SPEED * dt;
      this.place();
      this.touchPlayer();
      if (this.x < -HALF_W - EDGE_MARGIN || this.x > HALF_W + EDGE_MARGIN ||
          this.y < -HALF_H - EDGE_MARGIN || this.y > HALF_H + EDGE_MARGIN) {
        this.swoopBackIn();
      }
      return;
    }

    // AIM: hover in place, a subtle pulse telegraphing the incoming dive,
    // facing wherever it's currently locking onto (same as startDive()'s
    // own lock-on target).
    this.aimT += dt;
    this.container.alpha = 0.7 + 0.3 * Math.sin(this.aimT * 18);
    if (p && !p.dead) this.faceDir(p.x - this.x, p.y - this.y);
    this.touchPlayer();
    if (this.aimT >= AIM_TIME) this.startDive();
  }

  reveal() {
    // stopDisguiseLoop()'s own guard checks this.state === 'disguised', so
    // it has to run before the state flips below, not after.
    this.stopDisguiseLoop();
    this.state = 'revealed';
    this.diving = false;
    this.aimT = 0;
    this.container.alpha = 1;
    // The hiss is only the sneaking tell: it stops on the reveal, no cue here.
  }

  startDive() {
    const p = this.world.player;
    const dx = p ? p.x - this.x : 1, dy = p ? p.y - this.y : 0;
    const d = Math.hypot(dx, dy) || 1;
    this.diveDir = { x: dx / d, y: dy / d };
    this.faceDir(this.diveDir.x, this.diveDir.y);
    this.diving = true;
    this.container.alpha = 1;
  }

  // Clears the far edge, then swoops back in from a fresh random edge to
  // aim again — reads as looping around for another pass rather than
  // vanishing.
  swoopBackIn() {
    const spot = edgeSpawn();
    this.x = spot.x; this.y = spot.y;
    this.place();
    this.diving = false;
    this.aimT = 0;
  }

  touchPlayer() {
    const p = this.world.player;
    if (p && !p.invulnerable && !p.dead && this.touches(p)) {
      p.takeDamage(this.damage);
    }
  }

  destroy() {
    this.alive = false;
    this.dead = true;
    this.stopDisguiseLoop();
    const i = this.world.hittables.indexOf(this);
    if (i >= 0) this.world.hittables.splice(i, 1);
    if (this.container && !this.container.destroyed) this.container.destroy({ children: true });
  }
}
