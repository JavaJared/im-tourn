/**
 * customBracket.js
 *
 * Pure, framework-free engine for free-form bracket building with positional
 * advancement. The author places matchups into rounds; winners flow into the
 * next round purely by position. Nothing is enforced until validateForPublish().
 *
 * Model:
 *   - `rounds` is an array of rounds; each round is an ordered array of box ids.
 *     rounds[0] is Round 1 (earliest), the last round is the final.
 *   - A box has two slots. A slot is OPEN / NAMED / BYE when the author fills it,
 *     or FEED (display-only) when a box sits beneath it in the previous round.
 *   - Positional feed: box at round r, position p is fed by round r-1 positions
 *     2p (slot A) and 2p+1 (slot B). A slot is editable iff no feeder sits there.
 *   - Identity is by id; advancement is by position. Byes cover odd counts and
 *     double as the asymmetric-depth tool (a bye enters a round later).
 *
 * Every mutator is pure: it deep-clones and returns new state. `_lastCreated`
 * lists ids made by the most recent op.
 */

export const SLOT = Object.freeze({ OPEN: 'open', NAMED: 'named', BYE: 'bye', FEED: 'feed' });
export const MAX_PARTICIPANTS = 100;

const clone = (s) => (typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s)));
const storedSlot = (box, slot) => (slot === 'A' ? box.slotA : box.slotB);
function newId(s) { const id = `m${s._nextId}`; s._nextId += 1; return id; }
function blankBox(id) { return { id, slotA: { type: SLOT.OPEN }, slotB: { type: SLOT.OPEN }, result: null, score: null }; }

export function createBracket() { return { rounds: [], boxes: {}, _nextId: 1, _lastCreated: [] }; }

/** { boxId: { r, p } } for every box. */
export function locate(state) {
  const map = {};
  state.rounds.forEach((rd, r) => rd.forEach((id, p) => { map[id] = { r, p }; }));
  return map;
}

/** The box (if any) feeding round r, position p, side which (0=A, 1=B). */
export function feederId(state, r, p, which) {
  if (r <= 0) return null;
  const prev = state.rounds[r - 1];
  const idx = 2 * p + which;
  return prev && idx < prev.length ? prev[idx] : null;
}

/** Resolved slot for display: a positional feeder wins; else the stored value. */
export function slotDisplay(state, loc, boxId, slot) {
  const { r, p } = loc[boxId];
  const fid = feederId(state, r, p, slot === 'A' ? 0 : 1);
  if (fid) return { type: SLOT.FEED, sourceBoxId: fid };
  return storedSlot(state.boxes[boxId], slot);
}
export const isEditable = (state, loc, boxId, slot) => slotDisplay(state, loc, boxId, slot).type !== SLOT.FEED;

/* ---------------- building ---------------- */
function addAt(state, r, pos) {
  const next = clone(state);
  if (r > next.rounds.length) throw new Error('Cannot skip a round');
  if (r === next.rounds.length) next.rounds.push([]);
  const id = newId(next); next.boxes[id] = blankBox(id);
  const round = next.rounds[r];
  const at = pos == null ? round.length : Math.max(0, Math.min(pos, round.length));
  round.splice(at, 0, id); next._lastCreated = [id];
  return next;
}
export function addFirst(state) { return addAt(state, 0, null); }
export function beside(state, boxId) { const l = locate(state)[boxId]; return addAt(state, l.r, l.p + 1); }
export function after(state, boxId) { const l = locate(state)[boxId]; return addAt(state, l.r + 1, null); }
export function before(state, boxId) {
  const l = locate(state)[boxId];
  if (l.r === 0) {
    const next = clone(state); next.rounds.unshift([]);
    const id = newId(next); next.boxes[id] = blankBox(id); next.rounds[0].push(id);
    next._lastCreated = [id]; return next;
  }
  return addAt(state, l.r - 1, null);
}
export function removeBox(state, boxId) {
  const next = clone(state); const l = locate(next)[boxId]; if (!l) return next;
  next.rounds[l.r].splice(l.p, 1); delete next.boxes[boxId];
  if (next.rounds[l.r].length === 0) next.rounds.splice(l.r, 1);
  next._lastCreated = []; return next;
}

/* ---------------- slot editing ---------------- */
export function setSlotName(state, boxId, slot, participantId, name) {
  const next = clone(state); const loc = locate(next);
  if (!isEditable(next, loc, boxId, slot)) throw new Error('That slot is filled by a winner');
  const cur = storedSlot(next.boxes[boxId], slot);
  if (cur.type !== SLOT.NAMED && countNamed(next) + 1 > MAX_PARTICIPANTS) throw new Error(`Exceeds the ${MAX_PARTICIPANTS} player cap`);
  const v = { type: SLOT.NAMED, participantId, name };
  if (slot === 'A') next.boxes[boxId].slotA = v; else next.boxes[boxId].slotB = v;
  return next;
}
export function setSlotBye(state, boxId, slot) {
  const next = clone(state); const loc = locate(next);
  if (!isEditable(next, loc, boxId, slot)) throw new Error('That slot is filled by a winner');
  if (slotDisplay(next, loc, boxId, slot === 'A' ? 'B' : 'A').type === SLOT.BYE) throw new Error('A matchup cannot have two byes');
  const v = { type: SLOT.BYE };
  if (slot === 'A') next.boxes[boxId].slotA = v; else next.boxes[boxId].slotB = v;
  return next;
}
export function clearSlot(state, boxId, slot) {
  const next = clone(state); const v = { type: SLOT.OPEN };
  if (slot === 'A') next.boxes[boxId].slotA = v; else next.boxes[boxId].slotB = v;
  return next;
}

/* ---------------- results (play) + cascade ---------------- */
export function resolveParticipant(state, loc, boxId, slot) {
  const d = slotDisplay(state, loc, boxId, slot);
  if (d.type === SLOT.NAMED) return d.participantId;
  if (d.type === SLOT.BYE) return null;
  if (d.type === SLOT.OPEN) return undefined;
  return matchWinner(state, loc, d.sourceBoxId);
}
export function matchWinner(state, loc, boxId) {
  const box = state.boxes[boxId];
  if (box.result) return box.result.winnerId;
  const a = resolveParticipant(state, loc, boxId, 'A');
  const b = resolveParticipant(state, loc, boxId, 'B');
  if (slotDisplay(state, loc, boxId, 'A').type === SLOT.BYE && b != null) return b;
  if (slotDisplay(state, loc, boxId, 'B').type === SLOT.BYE && a != null) return a;
  return undefined;
}
function parentId(state, loc, boxId) {
  const { r, p } = loc[boxId]; const round = state.rounds[r + 1]; const pp = Math.floor(p / 2);
  return round && pp < round.length ? round[pp] : null;
}
function clearResultsDownstream(state, loc, boxId) {
  let cur = parentId(state, loc, boxId);
  while (cur) { state.boxes[cur].result = null; cur = parentId(state, loc, cur); }
}
export function setResult(state, boxId, winnerId) {
  const next = clone(state); const loc = locate(next);
  if (slotDisplay(next, loc, boxId, 'A').type === SLOT.BYE || slotDisplay(next, loc, boxId, 'B').type === SLOT.BYE) throw new Error('This matchup auto-advances past a bye');
  const a = resolveParticipant(next, loc, boxId, 'A');
  const b = resolveParticipant(next, loc, boxId, 'B');
  if (a === undefined || b === undefined) throw new Error('Both participants must be decided first');
  if (winnerId !== a && winnerId !== b) throw new Error('Winner must be one of the two participants');
  const box = next.boxes[boxId];
  if (box.result && box.result.winnerId === winnerId) box.result = null; else box.result = { winnerId };
  clearResultsDownstream(next, loc, boxId);
  return next;
}
export function clearResult(state, boxId) {
  const next = clone(state); const loc = locate(next);
  next.boxes[boxId].result = null; clearResultsDownstream(next, loc, boxId); return next;
}
export function setScore(state, boxId, a, b) { const next = clone(state); next.boxes[boxId].score = { a, b }; return next; }

/* ---------------- queries + validation ---------------- */
export function countNamed(state) {
  const loc = locate(state); let n = 0;
  for (const id of Object.keys(state.boxes)) for (const slot of ['A', 'B']) if (slotDisplay(state, loc, id, slot).type === SLOT.NAMED) n += 1;
  return n;
}
export function validateForPublish(state) {
  const errors = []; const rounds = state.rounds;
  if (!rounds.length || !Object.keys(state.boxes).length) return { valid: false, errors: ['Add at least one matchup to get started'] };
  const last = rounds.length - 1;
  if (rounds[last].length !== 1) errors.push('The final round must have exactly one matchup');
  for (let r = 1; r < rounds.length; r += 1) {
    const need = Math.ceil(rounds[r - 1].length / 2);
    if (rounds[r].length < need) errors.push(`Round ${r + 1} needs at least ${need} matchup${need > 1 ? 's' : ''} to fit everything advancing from Round ${r}`);
  }
  const loc = locate(state);
  for (const id of Object.keys(state.boxes)) for (const slot of ['A', 'B']) {
    if (slotDisplay(state, loc, id, slot).type === SLOT.OPEN) errors.push(`A matchup in Round ${loc[id].r + 1} has an empty slot`);
  }
  const n = countNamed(state);
  if (n < 2) errors.push('Add at least 2 players');
  if (n > MAX_PARTICIPANTS) errors.push(`Exceeds the ${MAX_PARTICIPANTS} player cap`);
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

/** The decided champion (winner of the single final box), or null. */
export function getChampion(state) {
  if (!state.rounds.length) return null;
  const finalRound = state.rounds[state.rounds.length - 1];
  if (finalRound.length !== 1) return null;
  return matchWinner(state, locate(state), finalRound[0]) ?? null;
}
