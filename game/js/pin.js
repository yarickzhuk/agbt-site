// pin.js — the arcade "save code". Encodes the career score AND which stages
// are cleared into a fixed 7-symbol code the player can jot down on an end
// screen (NES/SNES password style) and type back in later (ENTER SAVECODE)
// to restore that progress — the fresh-tab progress wipe (progress.js) means
// this code is the only way to pick a long run back up.
//
// Fixed width: 6 body symbols + 1 trailing checksum symbol = 7 symbols. The
// body holds `flags * 1,000,000 + score`, where `flags` is one bit per entry
// in SAVE_LEVELS (8 bits -> at most 255,999,999 < 32^6 = 1,073,741,824).
// The checksum catches typos: decode returns null for a code that doesn't
// check out, so a mistyped code can't restore bogus progress.
//
// Old 6-symbol codes (score only, from before stage progress was encoded)
// still decode, with no stages cleared.

// 32 unambiguous characters — no I/O/0/1, so a hand-written code can never be
// mis-read as its look-alike (I↔1, O↔0). The WHOLE code uses this alphabet.
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_SCORE = 999999;    // scores are 6 decimal digits, zero-padded
const SCORE_SPAN = MAX_SCORE + 1;

// Order is part of the code format — append only, never reorder.
export const SAVE_LEVELS = [
  'shapelimbo', 'cyberzoo', 'crazycarnival', 'occultacresburg',
  'outerspace1', 'outerspace2', 'outerspace3', 'finale',
];

const BODY_LEN = 6;
const LEGACY_BODY_LEN = 5;
export const CODE_LEN = BODY_LEN + 1;
const LEGACY_CODE_LEN = LEGACY_BODY_LEN + 1;

function checksum(body) {
  let sum = 0;
  for (const c of body) sum = (sum * 31 + ALPH.indexOf(c)) % ALPH.length;
  return ALPH[sum];
}

function toBody(n, len) {
  let body = '';
  for (let i = 0; i < len; i++) { body = ALPH[n % ALPH.length] + body; n = Math.floor(n / ALPH.length); }
  return body;
}

// score + cleared level ids -> 7 symbols.
export function encodePin(score, clearedIds = []) {
  const s = Math.max(0, Math.min(MAX_SCORE, Math.floor(score || 0)));
  let flags = 0;
  SAVE_LEVELS.forEach((id, i) => { if (clearedIds.includes(id)) flags |= 1 << i; });
  const body = toBody(flags * SCORE_SPAN + s, BODY_LEN);
  return body + checksum(body);
}

// 7 (or legacy 6) symbols -> { score, cleared: [ids] }, or null if the
// length / alphabet / checksum is wrong.
export function decodePin(code) {
  if (!code) return null;
  code = code.trim().toUpperCase();
  if (code.length !== CODE_LEN && code.length !== LEGACY_CODE_LEN) return null;
  for (const c of code) if (!ALPH.includes(c)) return null;
  const bodyLen = code.length - 1;
  const body = code.slice(0, bodyLen), chk = code.slice(bodyLen);
  if (checksum(body) !== chk) return null;
  let n = 0;
  for (const c of body) n = n * ALPH.length + ALPH.indexOf(c);
  const score = n % SCORE_SPAN, flags = Math.floor(n / SCORE_SPAN);
  if (flags >= 1 << SAVE_LEVELS.length) return null;
  if (bodyLen === LEGACY_BODY_LEN && flags) return null;   // legacy codes were score-only
  return { score, cleared: SAVE_LEVELS.filter((_, i) => flags & (1 << i)) };
}
