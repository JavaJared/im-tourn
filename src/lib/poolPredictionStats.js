import { hydrateState } from './customScoring';
import { SLOT, locate, slotDisplay, resolveParticipant, matchWinner, validateForPublish } from './customBracket';
import { validateStructure } from './recordValidation';

// Round numbers describe the bracket, including byes and later-round entrants.
// Champions receive R + 1 so winning the final ranks above losing the final.
function finishesFor(structure, predictions, locations, participants) {
  if (!predictions || typeof predictions !== 'object' || Array.isArray(predictions) ||
      Object.keys(predictions).some(id => !Object.hasOwn(structure.boxes, id))) return null;
  const state = hydrateState(structure, predictions), finishes = new Map();
  for (let r = 0; r < state.rounds.length; r++) for (const id of state.rounds[r]) {
    const a = resolveParticipant(state, locations, id, 'A');
    const b = resolveParticipant(state, locations, id, 'B');
    const winner = matchWinner(state, locations, id);
    if (a === undefined || b === undefined || winner == null ||
        (winner !== a && winner !== b) ||
        (a != null && !participants.has(a)) || (b != null && !participants.has(b))) return null;
    if (a != null && b != null) {
      const loser = winner === a ? b : a;
      if (a === b || finishes.has(loser)) return null;
      finishes.set(loser, r + 1);
    }
    if (r === state.rounds.length - 1) {
      if (finishes.has(winner)) return null;
      finishes.set(winner, state.rounds.length + 1);
    }
  }
  return finishes.size === participants.size ? finishes : null;
}

export function buildPredictionStats(structure, entries) {
  // Never infer pool-wide trends from the viewer's own picks during privacy.
  if (entries.predictionsHidden || entries.some(entry => entry.predictionsHidden)) return { hidden: true, rows: [] };
  try {
    validateStructure(structure);
    const base = hydrateState(structure), locations = locate(base), participants = new Map();
    if (!validateForPublish(base).valid) throw Error('Invalid bracket');
    for (const id of Object.keys(base.boxes)) for (const side of ['A', 'B']) {
      const slot = slotDisplay(base, locations, id, side);
      if (slot.type !== SLOT.NAMED) continue;
      if (typeof slot.participantId !== 'string' || participants.has(slot.participantId)) throw Error('Invalid participant');
      participants.set(slot.participantId, structure.nameMap?.[slot.participantId] || slot.name || slot.participantId);
    }
    const roundCount = base.rounds.length;
    const totals = new Map([...participants].map(([pid, name]) => [pid, { pid, name, total: 0, finalPicks: 0, championPicks: 0 }]));
    let submitted = 0, excluded = 0, notSubmitted = 0;
    for (const entry of entries) {
      if (!entry.dataError && entry.predictions == null && !entry.submittedAt) { notSubmitted++; continue; }
      const finishes = entry.dataError ? null : finishesFor(structure, entry.predictions, locations, participants);
      if (!finishes) { excluded++; continue; }
      submitted++;
      for (const [pid, finish] of finishes) {
        const row = totals.get(pid);
        row.total += finish;
        if (finish >= roundCount) row.finalPicks++;
        if (finish > roundCount) row.championPicks++;
      }
    }
    const rows = submitted ? [...totals.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name) || a.pid.localeCompare(b.pid)) : [];
    let rank = 0;
    return { roundCount, submitted, excluded, notSubmitted, rows: rows.map((row, index) => {
      if (!index || row.total !== rows[index - 1].total) rank = index + 1;
      return { ...row, rank, averageFinish: row.total / submitted };
    }) };
  } catch {
    return { unavailable: true, rows: [] };
  }
}
