// weapon.js — the player's selectable weapons.
//
//   default  — the CHARGE CANNON: tap fires a bullet, hold charges a torpedo.
//   shotgun  — the CYBER SHOTGUN: fires a spread of fast pellets (each still
//              kills dark blue like a charged torpedo would), no charging
//              needed. Nerfed since (bullet.js's `pellet: true`): each
//              pellet only deals 2 damage (down from 3) and no longer
//              pierces purple — it breaks on one like an ordinary bullet.
//              A `cooldown` between volleys (player.js) keeps it a burst
//              tool you fire in bursts, not a minigun you tap-spam — it was
//              a straight upgrade over the standard gun without one. Move
//              speed also drops (`moveScale`) as a tradeoff.
//   bouncy   — BOUNCY BALL (see bouncyball.js): hold to charge, release to
//              launch — speed scales with charge, like the standard gun's
//              torpedo. Never breaks on contact like a normal shot; it
//              bounces, damaging anything it can destroy along the way.
//   lineslasher — LINE SLASHER (see lineslasher.js): a melee weapon. Tap
//              fires an instant close-range SLASH (kills anything a charged
//              shot could, arc-shaped in front of the player); hold to full
//              charge and release for a DASH instead — a fast melee burst
//              through anything in its path, trailing after-image ghosts.
//
// A brand-new player starts on the CHARGE CANNON (so the tutorial can teach
// charging, and so there's *something* to play SHAPE LIMBO/CYBER ZOO/etc.
// with before anything is earned); after clearing a stage they can switch
// weapons on the stage-select hub with [V]. `spread` non-null marks a
// weapon as the always-piercing shotgun; `null` means a charge-and-release
// weapon (`bouncy`/`melee` flag which of those charge-release weapons it
// actually is, rather than the standard gun's plain bullet/torpedo).
export const WEAPONS = {
  shotgun: {
    id: 'shotgun', name: 'CYBER SHOTGUN', moveScale: 0.5,
    spread: { pellets: 3, arc: 0.18, cooldown: 0.6, pelletSpeed: 20 },
  },
  bouncy: {
    id: 'bouncy', name: 'BOUNCY BALL', moveScale: 1.0, spread: null, bouncy: true,
  },
  lineslasher: {
    id: 'lineslasher', name: 'LINE SLASHER', moveScale: 1.0, spread: null, melee: true,
  },
  default: { id: 'default', name: 'CHARGE CANNON', moveScale: 1.0, spread: null },
};

export const WEAPON_ORDER = ['default', 'shotgun', 'bouncy', 'lineslasher'];
export const DEFAULT_WEAPON = 'default';   // first-run weapon (the Charge Cannon)

export function weaponById(id) {
  return WEAPONS[id] || WEAPONS[DEFAULT_WEAPON];
}

// The [V] cycle order, filtered to whichever weapons are actually unlocked
// right now. `unlocked` maps a weapon id to a bool, plus a `chargecannon`
// flag (SHAPE LIMBO cleared) gating the CHARGE CANNON the same way the other
// three are gated by their own level. Used instead of the raw WEAPON_ORDER
// constant everywhere the cycle actually advances (main.js's mid-level
// switch, stageselect.js's hub switch) so a not-yet-earned weapon (e.g.
// BOUNCY BALL before CRAZY CARNIVAL is cleared) can never be cycled into —
// the same shape of gate that already kept the shotgun out of the cycle
// before CYBER ZOO was cleared, just generalized to more than one gate.
//
// CHARGE CANNON is special-cased rather than gated exactly like the other
// three: it's the bootstrap weapon everyone starts with, so it stays in the
// cycle for free as long as *nothing else* has been earned yet (there'd be
// nothing else to offer). The moment a real weapon (shotgun/bouncy/
// lineslasher) is earned, CHARGE CANNON drops out of the cycle until SHAPE
// LIMBO is cleared too — added per direct request: once the other three
// trivialize SHAPE LIMBO's own hazards (Line Slasher dashing through the
// laser walls, the shotgun one-shotting the TrapWheel, a charged Bouncy
// Ball clearing the crystal escape instantly), there was never a reason to
// pick the Charge Cannon there again, so it needed its own gate the same
// way the other three do.
export function availableWeaponOrder(unlocked) {
  const anyOtherUnlocked = WEAPON_ORDER.some(id => id !== DEFAULT_WEAPON && unlocked[id]);
  return WEAPON_ORDER.filter(id => {
    if (id === DEFAULT_WEAPON) return !anyOtherUnlocked || unlocked.chargecannon;
    return !!unlocked[id];
  });
}

// `id` if it's currently selectable under `unlocked`, otherwise the first
// weapon actually available right now. Catches a persisted/equipped weapon
// choice that isn't earned (or isn't earned *any more* — e.g. the Charge
// Cannon, once some other weapon has been earned but SHAPE LIMBO hasn't been
// cleared yet) rather than silently honoring it. `availableWeaponOrder`
// always includes at least one id (see its own doc comment), so this never
// returns undefined.
export function sanitizeWeaponId(id, unlocked) {
  const order = availableWeaponOrder(unlocked);
  return order.includes(id) ? id : order[0];
}
