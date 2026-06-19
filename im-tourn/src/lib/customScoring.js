/**
 * customScoring.js — pure, framework-free scoring for custom-bracket predictions.
 *
 * A prediction entry stores `picks`: a map of boxId -> predicted winner pid (the
 * predictor's own filled bracket). Scoring compares each pick to the official
 * winner of that box and awards that box's round weight when they match. Nothing
 * is stored back on the entry — the leaderboard is derived live from picks +
 * official results, so it can never go stale.
 */
import { SLOT, locate, slotDisplay, resolveParticipant, matchWinner } from './customBracket';

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

/** Rank entries by total (then correct, then name) with their scores attached. */
export function buildLeaderboard(bracketState, entries, roundPoints) {
  return entries
    .map((e) => ({ ...e, ...scoreEntry(bracketState, e.picks || {}, roundPoints) }))
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
