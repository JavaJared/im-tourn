import { locate, resolveParticipant, setResult, clearResult } from './customBracket';

// Apply a score batch against the latest official state, in round order.
export function applyPoolScores(initial, previousScores, fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Object.keys(fields).length || Object.keys(fields).length > 2048) throw Error('Invalid scores');
  const scores = Object.fromEntries(Object.entries(previousScores || {}).map(([id, value]) => [id, {...value}]));
  const touched = new Set();
  for (const [key, value] of Object.entries(fields)) {
    const match = /^(m[0-9]+):(a|b)$/.exec(key);
    if (!match || !initial.boxes[match[1]] || (value !== null && (!Number.isFinite(value) || value < 0))) throw Error('Invalid score');
    const [, id, side] = match;
    scores[id] = {...scores[id]};
    if (value === null) delete scores[id][side]; else scores[id][side] = value;
    touched.add(id);
  }
  let state = initial;
  const loc = locate(initial);
  for (const id of initial.rounds.flat()) {
    const a = resolveParticipant(state, loc, id, 'A'), b = resolveParticipant(state, loc, id, 'B');
    // A corrected earlier winner changes the matchup: its old scores no longer apply.
    if (a !== resolveParticipant(initial, loc, id, 'A') || b !== resolveParticipant(initial, loc, id, 'B')) {
      delete scores[id];
      continue;
    }
    if (!touched.has(id)) continue;
    const score = scores[id];
    if (a == null || b == null) continue; // Byes and unresolved feeders have no scored winner.
    const winner = Number.isFinite(score.a) && Number.isFinite(score.b) && score.a !== score.b
      ? (score.a > score.b ? a : b) : null;
    if ((state.boxes[id].result?.winnerId ?? null) !== winner) state = winner == null ? clearResult(state, id) : setResult(state, id, winner);
  }
  return {state, scores};
}
