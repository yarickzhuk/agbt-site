// leaderboard.js — post a score and read the top 10, kept on THIS DEVICE
// only (localStorage). There used to be a global board (dreamlo); it was
// removed per direct request ("Remove global one, keep offline that can be
// seen on your device only"), since its write key had to sit in the page
// source where anyone could wipe or spam the board.
//
// One entry per name, and names can be secured with a PIN: the first time a
// name is submitted, its (optional) PIN is remembered; submitting under that
// name again requires the same PIN, regardless of score. Getting the PIN
// right but not beating your own score is still a success (you own the name,
// you just didn't set a new record) — `{ ok: true, updated: false }`. A wrong
// PIN is `{ ok: false, reason: 'wrong-pin' }`; an unclaimed name with no PIN
// falls back to "only a higher score can take it". scoreui.js drives the
// prompts. PINs are a lightweight non-cryptographic hash (`hashPin`) — a fun
// arcade-name lock, not real security.
const LKEY = 'agbt_scores';
const RETAIN = 200;   // keep well beyond the visible top 10 so a name's PIN
                       // claim survives being pushed off the displayed board

// Reserved names: pre-secured with a PIN baked in as a hash (never the PIN
// itself — it's not recoverable from the hash, only replaceable by editing
// this map) so they read as claimed and PIN-protected on any device, even
// before anyone has ever actually submitted a score under them — unlike a
// normal name, which only gets a PIN the first time someone sets one. Same
// non-cryptographic "fun arcade lock" as every other PIN here (see the
// module note above), just pre-claimed instead of first-come-first-served.
const RESERVED = {
  OXY: '1a1327l',
};

function hashPin(pin) {
  let h = 2166136261;
  const s = String(pin || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function dedupe(list) {
  // Self-healing: collapses any duplicate-name rows left over from before
  // per-name dedup existed, keeping each name's highest score and its PIN.
  const byName = new Map();
  for (const e of list) {
    const cur = byName.get(e.name);
    if (!cur || e.score > cur.score) byName.set(e.name, { ...e, pinHash: e.pinHash || (cur && cur.pinHash) || null });
    else if (!cur.pinHash && e.pinHash) cur.pinHash = e.pinHash;
  }
  return [...byName.values()].sort((a, b) => b.score - a.score);
}

function localTop() {
  let list;
  try { list = JSON.parse(localStorage.getItem(LKEY)) || []; }
  catch (e) { list = []; }
  const cleaned = dedupe(list);
  if (cleaned.length !== list.length) localSave(cleaned);   // heal old duplicate rows, once
  return cleaned;
}
function localSave(list) {
  try { localStorage.setItem(LKEY, JSON.stringify(list.slice(0, RETAIN))); } catch (e) {}
}

function localSubmit(name, score, pin) {
  const list = localTop();
  const existing = list.find(e => e.name === name);
  const reservedHash = RESERVED[name];
  if (existing) {
    // A reserved name's hash always wins, even over a stray entry missing
    // its own pinHash (shouldn't happen, but closes the gap if it ever did).
    const requiredHash = existing.pinHash || reservedHash;
    if (requiredHash) {
      if (requiredHash !== hashPin(pin)) return { ok: false, reason: 'wrong-pin' };
    } else if (score <= existing.score) {
      return { ok: false, reason: 'taken' };   // legacy unsecured entry: score must still improve
    }
    if (!existing.pinHash && requiredHash) existing.pinHash = requiredHash;   // let an old entry be secured now
    if (score > existing.score) { existing.score = score; localSave(list); return { ok: true, updated: true }; }
    return { ok: true, updated: false };
  }
  if (reservedHash && reservedHash !== hashPin(pin)) return { ok: false, reason: 'wrong-pin' };
  list.push({ name, score, pinHash: reservedHash || (pin ? hashPin(pin) : null) });
  list.sort((a, b) => b.score - a.score);
  localSave(list);
  return { ok: true, updated: true };
}

// Whether `name` is already claimed — scoreui.js uses this to ask for a new
// PIN (unclaimed) or the existing one (claimed) before ever submitting.
export async function isNameClaimed(name) {
  name = normalizeName(name);
  if (RESERVED[name]) return true;   // pre-claimed regardless of board/device
  return localTop().some(e => e.name === name);
}

function normalizeName(name) {
  return (name || '---').toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, '-').slice(0, 3);
}

// name is clamped to 3 uppercase letters; score is a non-negative integer;
// pin is an optional short string. Resolves { ok: true, updated } on
// success, or { ok: false, reason: 'wrong-pin' | 'taken' }.
export async function submitScore(name, score, pin) {
  name = normalizeName(name);
  score = Math.max(0, Math.floor(score));

  return localSubmit(name, score, pin);
}

export async function topScores(n = 10) {
  return localTop().slice(0, n);
}
