// The shared level intro: a blinking "READY" card, no prompt. The ship waits below the screen; only once a
// fresh key is pressed does the card go and the ship fly in, and then the
// level starts. Used by every level and every OUTER SPACE stage.
import { input } from '../input.js';
import { HALF_H, SCREEN_W, SCREEN_H } from '../core.js';

const FLY_DUR = 1.2;
// READY blinks on and off (Mega Man style) so the card reads as "waiting",
// not as a frozen frame. One full on+off cycle.
const BLINK_PERIOD = 0.3;

export function readyIntro(world, hud) {
  return new Promise(resolve => {
    const w = world, p = w.player;
    p.frozen = true;
    p.x = 0; p.facing = { x: 0, y: -1 };
    const startY = HALF_H + 1.5, endY = 2.5;
    p.y = startY; p.render();
    hud.setPhaseText('');

    const layer = new PIXI.Container();
    layer.zIndex = 150;
    const mk = (s, size, y) => {
      const t = new PIXI.Text(s, { fontFamily: 'Tektur, monospace', fontSize: size, fill: 0xffffff, letterSpacing: 4, align: 'center' });
      t.anchor.set(0.5); t.position.set(SCREEN_W / 2, y); layer.addChild(t); return t;
    };
    const ready = mk('READY', 60, SCREEN_H / 2);
    w.stage.addChild(layer);

    const anyKeyDown = () => (input.touching() || ['left', 'right', 'up', 'down', 'fire', 'lock'].some(k => input.isDown(k)));
    let t = 0, armed = false, flyT = -1;
    const finish = () => {
      w.app.ticker.remove(step);
      if (!layer.destroyed) { w.stage.removeChild(layer); layer.destroy({ children: true }); }
      p.facing = { x: 1, y: 0 }; p.frozen = false;
      resolve();
    };
    const step = () => {
      const dt = Math.min(w.app.ticker.deltaMS / 1000, 0.05);
      t += dt;
      if (p.dead) { finish(); return; }
      if (flyT < 0) {
        ready.visible = (t % BLINK_PERIOD) < BLINK_PERIOD / 2;
        if (!armed && !anyKeyDown()) armed = true;    // require a fresh press
        if (armed && anyKeyDown()) {
          flyT = 0;
          w.stage.removeChild(layer); layer.destroy({ children: true });
        }
        return;
      }
      flyT += dt;
      const k = Math.min(1, flyT / FLY_DUR);
      const e = 1 - Math.pow(1 - k, 3);          // ease-out fly-in
      p.y = startY + (endY - startY) * e; p.render();
      if (k >= 1) finish();
    };
    w.app.ticker.add(step);
  });
}
