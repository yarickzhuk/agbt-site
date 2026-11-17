// trailer.js — the website's opening: the author's trailer, then the intro.
// Only on the website (index.html?site=1, loaded in the site's PLAY frame);
// itch and a plain visit boot as before.
//
// The trailer plays inside the game's own screen (the canvas's box, so the
// screen border is there all along) while the game loads underneath; the
// loading text is hidden meanwhile. It ends on the title
// logo held on black; over its last FADE seconds the picture and sound fade
// to black, and main.js starts the intro cutscene, which itself opens on
// black before the crystal forms out of dust. [X], Esc or SKIP jump straight
// to the fade.
//
// The site's PLAY click lets the frame start sound (allow="autoplay"). If a
// browser still blocks it, a PLAY card inside the frame takes the click.
import { input } from './input.js';
import { Audio } from './audio.js';

export const TRAILER_URL = 'site/media/trailer.mp4';
const FADE = 1.0;          // s: the logo fades to black
const TAIL_SILENCE = 1.2;  // s of silence the trailer ends on; the fade starts there

// The site can point at its own copy (GitHub Pages: ?trailer=../media/trailer.mp4).
function trailerUrl() {
  try { return new URLSearchParams(location.search).get('trailer') || TRAILER_URL; } catch (e) { return TRAILER_URL; }
}

export function isSiteMode() {
  try { return new URLSearchParams(location.search).has('site'); } catch (e) { return false; }
}

// Starts the trailer now; resolves once it has faded to black (or failed).
export function playTrailer(url = trailerUrl()) {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.id = 'trailer';
    box.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:50;background:#000;display:flex;align-items:center;justify-content:center;transition:opacity ' + FADE + 's linear';
    const v = document.createElement('video');
    v.src = url; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
    const skip = document.createElement('button');
    skip.textContent = 'X  SKIP TRAILER';
    skip.style.cssText = 'position:absolute;right:12px;top:10px;background:none;border:0;color:#8a8a9a;font:14px Tektur,monospace;letter-spacing:3px;cursor:pointer;-webkit-text-stroke:0';
    const card = document.createElement('button');
    card.textContent = 'PLAY';
    card.style.cssText = 'position:absolute;inset:0;margin:auto;width:220px;height:84px;background:#000;border:2px solid #00e6ff;color:#00e6ff;font:700 34px Tektur,monospace;letter-spacing:6px;cursor:pointer;display:none';
    let ending = false, done = false;
    box.append(v, skip, card);
    document.body.appendChild(box);
    const hideBoot = document.createElement('style');
    hideBoot.textContent = '#boot-status{visibility:hidden}';
    document.head.appendChild(hideBoot);
    // follow the game canvas's on-screen box (it's fitted once Pixi starts)
    const track = () => {
      if (done) return;
      const c = document.getElementById('game'), r = c && c.getBoundingClientRect();
      if (r && r.width > 50) Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      requestAnimationFrame(track);
    };
    track();

    const finish = () => {
      if (done) return; done = true;
      window.removeEventListener('keydown', onKey, true);
      box.remove(); hideBoot.remove();
      input.endFrame();   // the skip key mustn't also skip the intro
      resolve();
    };
    const fadeOut = () => {
      if (ending) return; ending = true;
      box.style.opacity = '0';
      const v0 = v.volume, t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (FADE * 1000));
        v.volume = v0 * (1 - k);
        if (k < 1 && !done) requestAnimationFrame(step); else { v.pause(); finish(); }
      };
      requestAnimationFrame(step);
    };
    const onKey = e => {
      if (e.key === 'x' || e.key === 'X' || e.key === 'Escape') { e.stopPropagation(); fadeOut(); }
    };
    window.addEventListener('keydown', onKey, true);
    skip.onclick = fadeOut;
    v.addEventListener('timeupdate', () => {
      if (v.duration && v.currentTime >= v.duration - TAIL_SILENCE) fadeOut();
    });
    v.addEventListener('ended', fadeOut);
    v.addEventListener('error', finish);   // no trailer file: straight to the intro

    const start = () => {
      Audio.unlock();
      v.play().then(() => { card.style.display = 'none'; })
        .catch(() => { card.style.display = 'block'; });
    };
    card.onclick = () => { card.style.display = 'none'; start(); };
    start();
  });
}
