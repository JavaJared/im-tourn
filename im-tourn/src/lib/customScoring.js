/**
 * customScoring.js — pure, framework-free scoring for custom-bracket predictions.
 *
 * A prediction entry stores `picks`: a map of boxId -> predicted winner pid (the
 * predictor's own filled bracket). Scoring compares each pick to the official
 * winner of that box and awards that box's round weight when they match. Nothing
 * is stored back on the entry — the leaderboard is derived live from picks +
 * official results, so it can never go stale.
 */
import { SLOT, locate, slotDisplay, resolveParticipant, matchWinner, setResult } from './customBracket';

/** Escalating default: round 1 = 1pt, round 2 = 2pts, ... final = R. */
export function defaultRoundPoints(roundCount) {
  return Array.from({ length: Math.max(0, roundCount) }, (_, i) => i + 1);
}
const pointsForRound = (roundPoints, r) => (roundPoints && roundPoints[r] != null ? roundPoints[r] : r + 1);

/** Extract a picks map { boxId: winnerPid } from a predictor's filled engine state. */
export function picksFromState(state) {
  const picks = {};
  for (const id of Object.keys(state.boxes)) { const res = state.boxes[id].result; if (res && res.winnerId != null) picks[id] = res.winnerId; }
  return picks;
}

/** Has the predictor decided every two-player matchup? (byes auto-advance, no pick needed) */
export function isEntryComplete(state) {
  if (!state || !state.rounds || !state.boxes) return false;
  const loc = locate(state);
  for (const id of Object.keys(state.boxes)) {
    const aPlayer = slotDisplay(state, loc, id, 'A').type !== SLOT.BYE && resolveParticipant(state, loc, id, 'A') != null;
    const bPlayer = slotDisplay(state, loc, id, 'B').type !== SLOT.BYE && resolveParticipant(state, loc, id, 'B') != null;
    if (aPlayer && bPlayer && !state.boxes[id].result) return false;
  }
  return true;
}

/** Score one entry's picks against the official bracket results. */
export function scoreEntry(bracketState, picks, roundPoints) {
  const loc = locate(bracketState);
  let total = 0, correct = 0; const correctByRound = {};
  for (const id of Object.keys(bracketState.boxes)) {
    const official = matchWinner(bracketState, loc, id);
    if (official == null) continue;          // not officially decided yet
    const pick = picks ? picks[id] : null;
    if (pick == null) continue;              // predictor left this matchup blank (or it's a bye)
    if (pick === official) {
      const r = loc[id].r;
      total += pointsForRound(roundPoints, r); correct += 1;
      correctByRound[r] = (correctByRound[r] || 0) + 1;
    }
  }
  return { total, correct, correctByRound };
}

/**
 * Rank entries by total (then correct, then name) with their scores attached.
 * When `pool` is provided and sleepers are enabled, each entry's sleeper
 * bonus is graded live and folded into the total.
 */
export function buildLeaderboard(bracketState, entries, roundPoints, pool = null) {
  return entries
    .map((e) => {
      const base = scoreEntry(bracketState, e.picks || {}, roundPoints);
      const s = gradeSleepers(bracketState, e, pool);
      return { ...e, ...base, ...s, total: base.total + s.sleeperBonus };
    })
    .sort((a, b) => b.total - a.total || b.correct - a.correct || String(a.displayName || '').localeCompare(String(b.displayName || '')));
}

/**
 * Rebuild a runnable engine state from a stored pool structure + a results map.
 * `structure` is { rounds, boxes, nameMap } as carried in pool.bracketMatchups;
 * `resultsMap` is { boxId: winnerPid } (official results, or a predictor's picks).
 */
export function hydrateState(structure, resultsMap = {}) {
  const src = structure || {};
  const boxes = {};
  for (const id of Object.keys(src.boxes || {})) {
    const b = src.boxes[id];
    boxes[id] = { id, slotA: b.slotA, slotB: b.slotB, result: resultsMap && resultsMap[id] != null ? { winnerId: resultsMap[id] } : null, score: null };
  }
  return { rounds: (src.rounds || []).map((r) => [...r]), boxes, _nextId: 1, _lastCreated: [] };
}

/* ------------------------------------------------------------------ *
 * Sleeper picks
 *
 * Legacy semantics, preserved exactly: a sleeper is a participant the
 * ENTRANT predicted to lose in a given round, who then APPEARS in the
 * official bracket at a later round. Sleeper 1 = predicted round-1 loser
 * (round index 0) who makes round 3 (index 2); sleeper 2 = predicted
 * round-2 loser (index 1) who makes round 4 (index 3). "Makes" a round
 * means resolving into any slot of that round — winning it isn't required.
 * ------------------------------------------------------------------ */

/** Set of participant ids that resolve into any slot of the given round. */
export function participantsInRound(state, roundIndex) {
  const loc = locate(state); const set = new Set();
  for (const boxId of state.rounds[roundIndex] || []) {
    for (const slot of ['A', 'B']) {
      const pid = resolveParticipant(state, loc, boxId, slot);
      if (pid != null) set.add(pid);
    }
  }
  return set;
}

/**
 * Participants the entrant predicted to LOSE in `roundIndex`, per their own
 * picks. Only fully decided matchups count (both sides resolved + a pick),
 * mirroring the legacy getRoundLosers behavior.
 */
export function predictedLosers(structure, picks, roundIndex) {
  const st = hydrateState(structure, picks || {});
  const loc = locate(st); const losers = [];
  for (const boxId of st.rounds[roundIndex] || []) {
    const a = resolveParticipant(st, loc, boxId, 'A');
    const b = resolveParticipant(st, loc, boxId, 'B');
    const w = st.boxes[boxId].result?.winnerId;
    if (a != null && b != null && w != null) losers.push(w === a ? b : a);
  }
  return losers;
}

/**
 * Grade an entry's sleeper picks (participant-id strings on entry.sleeper1/2)
 * against official results. Rounds that don't exist in the bracket can't hit
 * — same as the legacy results[target] === undefined behavior.
 */
export function gradeSleepers(officialState, entry, pool) {
  const none = { sleeper1Hit: false, sleeper2Hit: false, sleeperBonus: 0 };
  if (!pool || !pool.enableSleepers || !entry) return none;
  const check = (pid, targetRound, points) => {
    if (!pid || targetRound >= officialState.rounds.length) return [false, 0];
    const made = participantsInRound(officialState, targetRound).has(pid);
    return [made, made ? (Number(points) || 0) : 0];
  };
  const [sleeper1Hit, b1] = check(entry.sleeper1, 2, pool.sleeper1Points);
  const [sleeper2Hit, b2] = check(entry.sleeper2, 3, pool.sleeper2Points);
  return { sleeper1Hit, sleeper2Hit, sleeperBonus: b1 + b2 };
}

/* ------------------------------------------------------------------ *
 * Fill/prediction state helpers (shared by the fill and predict flows)
 * ------------------------------------------------------------------ */

/** A results-free copy of a bracket state, ready to collect picks. */
export function blankPrediction(bracketState) {
  const boxes = {};
  for (const id of Object.keys(bracketState.boxes)) { const b = bracketState.boxes[id]; boxes[id] = { id, slotA: b.slotA, slotB: b.slotB, result: null, score: null }; }
  return { rounds: bracketState.rounds.map((r) => [...r]), boxes, _nextId: bracketState._nextId || 1, _lastCreated: [] };
}

/** Apply a { boxId: winnerPid } picks map onto a state, skipping stale picks. */
export function applyPicks(state, picks) {
  let next = state;
  for (const [boxId, winnerId] of Object.entries(picks || {})) { try { next = setResult(next, boxId, winnerId); } catch { /* stale pick, skip */ } }
  return next;
}
