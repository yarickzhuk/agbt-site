// Every PIXI.Text in the game is drawn as an outline: the glyphs are stroked
// in their fill colour and left hollow, matching the game's stroke-only
// vector look (per direct request: "make all text outlined").
// Patched once, at render time: the style's own fill/stroke are swapped only
// while Pixi draws the text and put back straight after, so code that reads
// or changes `style.fill` keeps working and nothing is redrawn every frame.
const HOLLOW = 'rgba(0,0,0,0)';
const TEXT_RES = 3;

// On a phone the game is drawn at about half size, so the smallest text
// (hints, the weapon line, the stage stats, achievement tags) came out 7-9
// pixels tall and its hollow letters went faint. There, text under
// SMALL_MIN is drawn SMALL_GROW bigger, capped at SMALL_MIN, per direct
// request ("do all four phone fixes"). Desktop is unchanged.
const SMALL_MIN = 22, SMALL_GROW = 1.35;
const PHONE = (() => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) { return false; } })();
export function phoneFontSize(size) {
  return PHONE && size < SMALL_MIN ? Math.min(SMALL_MIN, Math.round(size * SMALL_GROW)) : size;
}

export function outlineWidth(fontSize) {
  return Math.min(2.6, Math.max(0.9, fontSize / 30));
}

(function install() {
  if (typeof PIXI === 'undefined' || !PIXI.Text) return;
  const proto = PIXI.Text.prototype;
  if (proto._outlinePatched) return;
  proto._outlinePatched = true;
  const updateText = proto.updateText;
  proto.updateText = function (respectDirty) {
    const s = this._style;
    if (!s || this.solidText) return updateText.call(this, respectDirty);
    // Drawn at 3x so the hollow middle of small letters stays open once the
    // canvas is scaled up to the window.
    if (this._resolution !== TEXT_RES) { this._autoResolution = false; this._resolution = TEXT_RES; this.dirty = true; }
    const fill = s._fill, stroke = s._stroke, thick = s._strokeThickness, fontSize = s._fontSize;
    const colour = Array.isArray(fill) ? fill[0] : fill;
    const size = phoneFontSize(typeof fontSize === 'number' ? fontSize : parseFloat(fontSize) || 26);
    if (typeof fontSize === 'number') s._fontSize = size;
    // `outlineFill` (optional, per Text) fills the inside instead of leaving it hollow.
    s._fill = this.outlineFill != null ? '#' + this.outlineFill.toString(16).padStart(6, '0') : HOLLOW;
    s._stroke = colour;
    s._strokeThickness = outlineWidth(size);
    try { return updateText.call(this, respectDirty); }
    finally { s._fill = fill; s._stroke = stroke; s._strokeThickness = thick; s._fontSize = fontSize; }
  };
})();
