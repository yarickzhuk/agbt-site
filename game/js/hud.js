// hud.js — terse uppercase status text, phosphor cyan on black.
import { SCREEN_W, SCREEN_H, formatScore } from './core.js';

const STYLE = {
  fontFamily: 'Tektur, monospace',
  fontSize: 22,
  fill: 0xffffff,
  letterSpacing: 2,
};

export class HUD {
  constructor(world) {
    this.world = world;
    this.hp = new PIXI.Text('', STYLE);
    this.hp.position.set(16, 12);

    // A short warning shown directly under the HP readout — currently only
    // used by Plasmadrache's own chomp cutscene (plasmadrache.js) to read
    // "YOU SCREWED" right next to the HP number it's about to zero out,
    // since the boss's own taunt line already owns hud.center.
    this.nearHp = new PIXI.Text('', { ...STYLE, fontSize: 16, fill: 0xFF4040 });
    this.nearHp.position.set(16, 36);

    // Extra lives, arcade style: `lives - 1` yellow triangles (the life being
    // played isn't drawn). Sits just right of the HP readout.
    this.lives = new PIXI.Text('', { ...STYLE, fill: 0xFFD500, letterSpacing: 4 });
    this.lives.position.set(16, 12);

    this.score = new PIXI.Text('', { ...STYLE, fontSize: 20 });
    this.score.anchor.set(0.5, 0);
    this.score.position.set(SCREEN_W / 2, 12);

    this.phase = new PIXI.Text('', { ...STYLE, fontSize: 18 });
    this.phase.anchor.set(1, 0);
    this.phase.position.set(SCREEN_W - 16, 14);

    this.center = new PIXI.Text('', { ...STYLE, fontSize: 46, align: 'center' });
    this.center.anchor.set(0.5);
    this.center.position.set(SCREEN_W / 2, 260);

    // Weapon readout: on an uncleared CYBER ZOO/CRAZY CARNIVAL run that
    // level's weapon is forced (see main.js's world.weaponForced) and this
    // explains why there's no [V] choice; once there's actually more than
    // one weapon unlocked (world.canSwitchAtAll) it instead shows the
    // current weapon and the [V] SWITCH hint, since main.js now lets [V]
    // swap mid-level too, not just on the stage-select hub. Blank before
    // either applies (nothing to switch to yet).
    this.weapon = new PIXI.Text('', { ...STYLE, fontSize: 16 });
    this.weapon.anchor.set(0.5, 1);
    this.weapon.alpha = 0.8;
    this.weapon.position.set(SCREEN_W / 2, SCREEN_H - 12);

    // Live readout of the hidden save-state cheat's Konami-style entry
    // (cheat.js) — only shown while [Ctrl] is held and something's been
    // typed, so a player attempting it can see each press register instead
    // of guessing whether it landed.
    this.cheat = new PIXI.Text('', { ...STYLE, fontSize: 18, letterSpacing: 6 });
    this.cheat.anchor.set(0, 1);
    this.cheat.position.set(16, SCREEN_H - 12);

    this.layer = new PIXI.Container();
    this.layer.zIndex = 100;
    this.layer.addChild(this.hp, this.nearHp, this.lives, this.score, this.phase, this.center, this.weapon, this.cheat);
    world.stage.addChild(this.layer);
  }

  setPhaseText(t) { this.phase.text = t; }
  setCenter(t) { this.center.text = t; }
  setNearHp(t) { this.nearHp.text = t; }
  setCheatEntry(t, color = 0xffffff) { this.cheat.text = t; this.cheat.style.fill = color; }

  update() {
    const p = this.world.player;
    if (p) this.hp.text = 'HP ' + p.hp + '/' + p.maxHP;
    const extra = Math.max(0, (this.world.lives || 0) - 1);
    this.lives.text = '▲'.repeat(extra);
    this.lives.x = this.hp.x + this.hp.width + 14;
    this.score.text = 'SCORE ' + formatScore(this.world.totalScore);
    const b = this.world.boss;
    if (b) this.phase.text = 'BOSS ' + b.hp;
    this.weapon.text = !this.world.weapon ? ''
      : this.world.weaponForced ? 'WEAPON: ' + this.world.weapon.name + ' (REQUIRED)'
      : this.world.canSwitchAtAll ? 'WEAPON: ' + this.world.weapon.name + '   [V] SWITCH'
      : '';
  }
}
