// Every PIXI.Text in the game is drawn as an outline: the glyphs are stroked
// in their fill colour and left hollow, matching the game's stroke-only
// vector look (per direct request: "make all text outlined").
// Patched once, at render time: the style's own fill/stroke are swapped only
// while Pixi draws the text and put back straight after, so code that reads
// or changes `style.fill` keeps working and nothing is redrawn every frame.
const HOLLOW = 'rgba(0,0,0,0)';
const TEXT_RES = 3;

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
    const fill = s._fill, stroke = s._stroke, thick = s._strokeThickness;
    const colour = Array.isArray(fill) ? fill[0] : fill;
    const size = typeof s._fontSize === 'number' ? s._fontSize : parseFloat(s._fontSize) || 26;
    // `outlineFill` (optional, per Text) fills the inside instead of leaving it hollow.
    s._fill = this.outlineFill != null ? '#' + this.outlineFill.toString(16).padStart(6, '0') : HOLLOW;
    s._stroke = colour;
    s._strokeThickness = outlineWidth(size);
    try { return updateText.call(this, respectDirty); }
    finally { s._fill = fill; s._stroke = stroke; s._strokeThickness = thick; }
  };
})();
