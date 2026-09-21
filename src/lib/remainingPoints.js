import { SLOT, locate, slotDisplay, matchWinner } from './customBracket';

// Compute reachability once per result snapshot, shared by all loaded entries.
export function remainingContext(state) {
  const loc = locate(state), winners = {}, slots = {}, decided = {};
  for (const round of state.rounds) for (const id of round) {
    slots[id] = ['A', 'B'].map(side => {
      const slot = slotDisplay(state, loc, id, side);
      if (slot.type === SLOT.NAMED) return new Set([slot.participantId]);
      if (slot.type === SLOT.FEED) return winners[slot.sourceBoxId] || new Set();
      return new Set();
    });
    const winner = matchWinner(state, loc, id);
    decided[id] = winner;
    winners[id] = winner != null ? new Set([winner]) : new Set([...slots[id][0], ...slots[id][1]]);
  }
  return { loc, winners, slots, decided };
}

export function remainingPoints(entry, roundPoints, context) {
  let remaining = 0;
  for (const [id, candidates] of Object.entries(context.winners)) {
    if (context.decided[id] == null && candidates.has(entry.predictions?.[id])) {
      remaining += roundPoints?.[context.loc[id].r] ?? context.loc[id].r + 1;
    }
  }
  return remaining;
}

// Unknown potentials follow known values without being treated as zero.
export function compareStandings(a, b) {
  const scoreA = Number.isFinite(a.total) ? a.total : -Infinity;
  const scoreB = Number.isFinite(b.total) ? b.total : -Infinity;
  if (scoreA !== scoreB) return scoreB - scoreA;
  if (Number.isFinite(a.remainingPossible) && Number.isFinite(b.remainingPossible)) {
    return b.remainingPossible - a.remainingPossible;
  }
  return Number(Number.isFinite(b.remainingPossible)) - Number(Number.isFinite(a.remainingPossible));
}
