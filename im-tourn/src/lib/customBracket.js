/**
 * customBracket.js
 *
 * Pure, framework-free engine for building, editing, and validating custom
 * single-elimination brackets of arbitrary (freeform) depth.
 *
 * Design contract (matches the agreed I'm Tourn model):
 *   - A bracket is a converging tree of matches. Each match has two slots.
 *   - A slot is one of: OPEN (editable, empty), NAMED (a participant),
 *     BYE (intentionally empty), or FEED (filled by the winner of an
 *     upstream match — read-only).
 *   - Structure grows two ways only:
 *       before  -> add an earlier match that feeds an OPEN slot
 *       beside  -> pair the current root with a new sibling, creating the
 *                  parent that joins them (a new final). Root-only.
 *     There is intentionally no "after"; pairing handles all forward growth.
 *   - Identity is by id (participantId / matchId), never by position.
 *   - Forbidden combination: FEED opposite BYE (a "pass-through" nobody plays).
 *     Also forbidden at publish: BYE opposite BYE, and any OPEN slot.
 *   - Round = distance from the final (root = tier 0). The deepest branch
 *     sets the number of tiers; that drives headers and host scoring.
 *
 * Every exported mutator is pure: it deep-clones the input state and returns
 * a new state. `_lastCreated` lists ids created by the most recent op.
 */

export const SLOT = Object.freeze({
  OPEN: 'open',
  NAMED: 'named',
  BYE: 'bye',
  FEED: 'feed',
});

export const MAX_PARTICIPANTS = 100;

const clone = (s) =>
  typeof structuredClone === 'function'
    ? structuredClone(s)
    : JSON.parse(JSON.stringify(s));

const slotKey = (slot) => (slot === 'A' ? 'slotA' : 'slotB');
const otherSlot = (slot) => (slot === 'A' ? 'B' : 'A');
const getSlot = (match, slot) => match[slotKey(slot)];
const setSlot = (match, slot, value) => {
  match[slotKey(slot)] = value;
};
const openSlot = () => ({ type: SLOT.OPEN });

function getMatch(state, id) {
  const m = state.matches[id];
  if (!m) throw new Error(`Match not found: ${id}`);
  return m;
}

function newMatchId(state) {
  const id = `m${state._nextMatchId}`;
  state._nextMatchId += 1;
  return id;
}

function blankMatch(id) {
  return {
    id,
    slotA: openSlot(),
    slotB: openSlot(),
    feedsInto: null, // { matchId, slot } | null  (null = root)
    result: null, // { winnerId } | null
    score: null, // { a, b } | null  (host match-score feature; never auto-cleared)
  };
}

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

/** A blank canvas: no matches yet. */
export function createBracket() {
  return { matches: {}, rootId: null, _nextMatchId: 1, _lastCreated: [] };
}

/** The first "Add a Matchup" on an empty canvas. Becomes the root. */
export function addInitialMatch(state) {
  if (Object.keys(state.matches).length > 0) {
    throw new Error('Bracket already has matches; use before/beside');
  }
  const next = clone(state);
  const id = newMatchId(next);
  next.matches[id] = blankMatch(id);
  next.rootId = id;
  next._lastCreated = [id];
  return next;
}

/**
 * Add an earlier-round match that feeds an OPEN slot of `matchId`.
 * If `slot` is omitted, the single open slot is targeted automatically;
 * if both are open, the top slot (A) is chosen.
 */
export function addBefore(state, matchId, slot = null) {
  const next = clone(state);
  const match = getMatch(next, matchId);

  let target = slot;
  if (!target) {
    if (getSlot(match, 'A').type === SLOT.OPEN) target = 'A';
    else if (getSlot(match, 'B').type === SLOT.OPEN) target = 'B';
    else throw new Error('No open slot to add a match before');
  }
  if (getSlot(match, target).type !== SLOT.OPEN) {
    throw new Error(`Slot ${target} of ${matchId} is not open`);
  }
  if (getSlot(match, otherSlot(target)).type === SLOT.BYE) {
    throw new Error('Cannot feed a slot opposite a bye (pass-through)');
  }

  const childId = newMatchId(next);
  const child = blankMatch(childId);
  child.feedsInto = { matchId, slot: target };
  next.matches[childId] = child;
  setSlot(match, target, { type: SLOT.FEED, sourceMatchId: childId });
  match.result = null; // an open slot held no decided result anyway
  next._lastCreated = [childId];
  return next;
}

/**
 * Pair `matchId` (which must be the current root) with a new blank sibling,
 * creating the parent that joins them. The parent becomes the new root /
 * final. The sibling starts as a blank leaf and can be named or expanded
 * with `before`.
 */
export function addBeside(state, matchId) {
  const next = clone(state);
  const match = getMatch(next, matchId);
  if (match.feedsInto !== null) {
    throw new Error('Beside is only available on the root (the current final)');
  }
  const sibId = newMatchId(next);
  const parentId = newMatchId(next);

  const sib = blankMatch(sibId);
  sib.feedsInto = { matchId: parentId, slot: 'B' };

  const parent = blankMatch(parentId);
  parent.slotA = { type: SLOT.FEED, sourceMatchId: matchId };
  parent.slotB = { type: SLOT.FEED, sourceMatchId: sibId };

  match.feedsInto = { matchId: parentId, slot: 'A' };

  next.matches[sibId] = sib;
  next.matches[parentId] = parent;
  next.rootId = parentId;
  next._lastCreated = [parentId, sibId];
  return next;
}

/** Remove a match and its entire upstream subtree; reopen the slot it fed. */
export function removeMatch(state, matchId) {
  const next = clone(state);
  const match = getMatch(next, matchId);

  const toDelete = [];
  (function collect(id) {
    const m = next.matches[id];
    toDelete.push(id);
    for (const s of ['A', 'B']) {
      const slotVal = getSlot(m, s);
      if (slotVal.type === SLOT.FEED) collect(slotVal.sourceMatchId);
    }
  })(matchId);

  if (match.feedsInto) {
    const parent = next.matches[match.feedsInto.matchId];
    setSlot(parent, match.feedsInto.slot, openSlot());
    parent.result = null;
    clearResultsDownstream(next, parent.id, false);
  } else {
    next.rootId = null;
  }

  for (const id of toDelete) delete next.matches[id];
  if (Object.keys(next.matches).length === 0) next.rootId = null;
  next._lastCreated = [];
  return next;
}

/* ------------------------------------------------------------------ *
 * Slot editing
 * ------------------------------------------------------------------ */

export function setSlotName(state, matchId, slot, participantId, name) {
  const next = clone(state);
  const match = getMatch(next, matchId);
  const cur = getSlot(match, slot);
  if (cur.type === SLOT.FEED) {
    throw new Error('Cannot name a slot fed by another match');
  }
  if (cur.type !== SLOT.NAMED && countNamed(next) + 1 > MAX_PARTICIPANTS) {
    throw new Error(`Exceeds the ${MAX_PARTICIPANTS} participant cap`);
  }
  setSlot(match, slot, { type: SLOT.NAMED, participantId, name });
  match.result = null;
  clearResultsDownstream(next, matchId, false);
  return next;
}

export function setSlotBye(state, matchId, slot) {
  const next = clone(state);
  const match = getMatch(next, matchId);
  if (getSlot(match, slot).type === SLOT.FEED) {
    throw new Error('A fed slot cannot become a bye');
  }
  const sib = getSlot(match, otherSlot(slot));
  if (sib.type === SLOT.FEED) {
    throw new Error('A bye cannot sit opposite a fed slot (pass-through)');
  }
  if (sib.type === SLOT.BYE) {
    throw new Error('A match cannot have two byes');
  }
  setSlot(match, slot, { type: SLOT.BYE });
  match.result = null;
  clearResultsDownstream(next, matchId, false);
  return next;
}

export function clearSlot(state, matchId, slot) {
  const next = clone(state);
  const match = getMatch(next, matchId);
  if (getSlot(match, slot).type === SLOT.FEED) {
    throw new Error('Remove the upstream match instead of clearing a fed slot');
  }
  setSlot(match, slot, openSlot());
  match.result = null;
  clearResultsDownstream(next, matchId, false);
  return next;
}

/* ------------------------------------------------------------------ *
 * Results + cascade-clear (scores are always preserved)
 * ------------------------------------------------------------------ */

/** Resolve who occupies a slot: participantId | null (bye) | undefined (undecided). */
export function resolveParticipant(state, match, slot) {
  const s = getSlot(match, slot);
  if (s.type === SLOT.NAMED) return s.participantId;
  if (s.type === SLOT.BYE) return null;
  if (s.type === SLOT.OPEN) return undefined;
  const src = state.matches[s.sourceMatchId];
  return src ? matchWinner(state, src) : undefined;
}

/** The decided winner of a match: explicit result, or auto-advance past a bye. */
export function matchWinner(state, match) {
  if (match.result) return match.result.winnerId;
  const a = resolveParticipant(state, match, 'A');
  const b = resolveParticipant(state, match, 'B');
  const aBye = getSlot(match, 'A').type === SLOT.BYE;
  const bBye = getSlot(match, 'B').type === SLOT.BYE;
  if (aBye && b != null) return b;
  if (bBye && a != null) return a;
  return undefined;
}

/** Clear every result strictly downstream of `matchId` (to the root). Scores kept. */
function clearResultsDownstream(state, matchId, inclusive) {
  let id = inclusive
    ? matchId
    : state.matches[matchId].feedsInto?.matchId ?? null;
  while (id) {
    const m = state.matches[id];
    m.result = null; // m.score intentionally preserved
    id = m.feedsInto ? m.feedsInto.matchId : null;
  }
}

export function setResult(state, matchId, winnerId) {
  const next = clone(state);
  const match = getMatch(next, matchId);

  if (getSlot(match, 'A').type === SLOT.BYE || getSlot(match, 'B').type === SLOT.BYE) {
    throw new Error('This match auto-advances past a bye; no winner to set');
  }
  const a = resolveParticipant(next, match, 'A');
  const b = resolveParticipant(next, match, 'B');
  if (a === undefined || b === undefined) {
    throw new Error('Both participants must be decided before setting a winner');
  }
  if (winnerId !== a && winnerId !== b) {
    throw new Error('Winner must be one of the two participants');
  }

  // Clicking the current winner again clears it (un-select).
  if (match.result && match.result.winnerId === winnerId) {
    match.result = null;
  } else {
    match.result = { winnerId };
  }
  clearResultsDownstream(next, matchId, false);
  return next;
}

export function clearResult(state, matchId) {
  const next = clone(state);
  getMatch(next, matchId).result = null;
  clearResultsDownstream(next, matchId, false);
  return next;
}

export function setScore(state, matchId, a, b) {
  const next = clone(state);
  getMatch(next, matchId).score = { a, b };
  return next;
}

/* ------------------------------------------------------------------ *
 * Derivation, queries, validation
 * ------------------------------------------------------------------ */

/** Distance-from-final tier for every match (root = 0). */
export function deriveTiers(state) {
  const tiers = {};
  if (!state.rootId) return { tiers, maxTier: -1 };
  const queue = [[state.rootId, 0]];
  let maxTier = 0;
  while (queue.length) {
    const [id, t] = queue.shift();
    tiers[id] = t;
    if (t > maxTier) maxTier = t;
    const m = state.matches[id];
    for (const s of ['A', 'B']) {
      const slotVal = getSlot(m, s);
      if (slotVal.type === SLOT.FEED) queue.push([slotVal.sourceMatchId, t + 1]);
    }
  }
  return { tiers, maxTier };
}

export function countNamed(state) {
  let n = 0;
  for (const id in state.matches) {
    const m = state.matches[id];
    for (const s of ['A', 'B']) if (getSlot(m, s).type === SLOT.NAMED) n += 1;
  }
  return n;
}

export const getRoot = (state) => (state.rootId ? state.matches[state.rootId] : null);

export function isLeaf(state, matchId) {
  const m = state.matches[matchId];
  return !!m && getSlot(m, 'A').type !== SLOT.FEED && getSlot(m, 'B').type !== SLOT.FEED;
}

export function canAddBefore(state, matchId) {
  const m = state.matches[matchId];
  if (!m) return false;
  for (const s of ['A', 'B']) {
    if (getSlot(m, s).type === SLOT.OPEN && getSlot(m, otherSlot(s)).type !== SLOT.BYE) {
      return true;
    }
  }
  return false;
}

export function canAddBeside(state, matchId) {
  const m = state.matches[matchId];
  return !!m && m.feedsInto === null;
}

/** Returns { valid, errors[] } against publish rules. */
export function validateForPublish(state) {
  const errors = [];
  const ids = Object.keys(state.matches);
  if (ids.length === 0) return { valid: false, errors: ['Bracket is empty'] };

  const roots = ids.filter((id) => state.matches[id].feedsInto === null);
  if (roots.length !== 1) errors.push(`Expected exactly one final, found ${roots.length}`);

  if (state.rootId) {
    const seen = new Set();
    (function walk(id) {
      if (seen.has(id)) return;
      seen.add(id);
      const m = state.matches[id];
      for (const s of ['A', 'B']) {
        const slotVal = getSlot(m, s);
        if (slotVal.type === SLOT.FEED) walk(slotVal.sourceMatchId);
      }
    })(state.rootId);
    if (seen.size !== ids.length) errors.push('Some matches are disconnected from the final');
  }

  for (const id of ids) {
    const m = state.matches[id];
    for (const s of ['A', 'B']) {
      const slotVal = getSlot(m, s);
      if (slotVal.type === SLOT.OPEN) errors.push(`Match ${id} has an empty slot`);
      if (slotVal.type === SLOT.FEED) {
        const src = state.matches[slotVal.sourceMatchId];
        if (!src) errors.push(`Match ${id} feeds from a missing match`);
        else if (!(src.feedsInto && src.feedsInto.matchId === id && src.feedsInto.slot === s)) {
          errors.push(`Broken feed link between ${id} and ${slotVal.sourceMatchId}`);
        }
      }
    }
    const aBye = getSlot(m, 'A').type === SLOT.BYE;
    const bBye = getSlot(m, 'B').type === SLOT.BYE;
    if (aBye && bBye) errors.push(`Match ${id} has two byes`);
    if ((aBye && getSlot(m, 'B').type === SLOT.FEED) || (bBye && getSlot(m, 'A').type === SLOT.FEED)) {
      errors.push(`Match ${id} is a pass-through (bye vs feed)`);
    }
  }

  const n = countNamed(state);
  if (n < 2) errors.push('Need at least 2 named participants');
  if (n > MAX_PARTICIPANTS) errors.push(`Exceeds the ${MAX_PARTICIPANTS} participant cap`);

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
