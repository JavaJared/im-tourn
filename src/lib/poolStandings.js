import { SLOT, locate, slotDisplay, matchWinner } from './customBracket';
import { scoreEntry, gradeSleepers } from './customScoring';

// Compute reachability once per result snapshot, shared by all loaded entries.
// A bound sums individually reachable awards; conflicting sleeper/pick outcomes
// need not be jointly achievable. It is deliberately not an exact projection.
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

export function explainEntry(state, entry, roundPoints, pool, context = remainingContext(state)) {
  if (entry.dataError) return { total: null, breakdownUnavailable: 'Picks unavailable — score breakdown cannot be verified.' };
  if (entry.predictionsHidden) return { total: Number.isFinite(entry.score) ? entry.score : null, breakdownUnavailable: 'Picks private — breakdown and remaining points available after predictions close.' };
  if (!entry.predictions) return { total: null, breakdownUnavailable: entry.submittedAt ? 'Submitted picks unavailable.' : 'Not submitted' };
  const base = scoreEntry(state, entry.predictions, roundPoints);
  const sleeper = gradeSleepers(state, entry, pool);
  let remainingBase = 0, remainingSleepers = 0;
  for (const [id, candidates] of Object.entries(context.winners)) {
    if (context.decided[id] == null && candidates.has(entry.predictions[id])) {
      remainingBase += roundPoints?.[context.loc[id].r] ?? context.loc[id].r + 1;
    }
  }
  if (pool?.enableSleepers) for (const n of [1, 2]) {
    const pid = entry[`sleeper${n}`], target = n + 1;
    if (!pid || sleeper[`sleeper${n}Hit`] || !state.rounds[target]) continue;
    if (state.rounds[target].some(id => context.slots[id].some(candidates => candidates.has(pid)))) {
      remainingSleepers += Math.max(0, Number(pool[`sleeper${n}Points`]) || 0);
    }
  }
  const total = base.total + sleeper.sleeperBonus;
  return { total, basePoints: base.total, correct: base.correct, sleeperBonus: sleeper.sleeperBonus,
    remainingBase, remainingSleepers, remainingPossible: remainingBase + remainingSleepers,
    maxPossibleScore: total + remainingBase + remainingSleepers };
}

export function analysisBlockReason({ entries, loaded = true, entriesError, status }) {
  if (!loaded) return 'Loading participants — analysis is not ready.';
  if (entriesError) return 'Participant refresh failed — standings may be stale and winning-path analysis is unavailable.';
  if (entries.nextCursor) return 'Partial standings — ranks cover loaded participants only. Load all participants to analyze winning paths.';
  if (entries.predictionsHidden || entries.some(e => e.predictionsHidden)) return 'Picks are private — winning-path analysis is unavailable until predictions close.';
  if (entries.some(e => e.dataError || (e.submittedAt && !e.predictions))) return 'Some submitted picks are unavailable — winning-path analysis cannot include everyone.';
  if (status !== 'in_progress' && status !== 'completed') return 'Winning-path analysis starts when the host starts the pool.';
  if (!entries.some(e => e.predictions)) return 'No submitted predictions to analyze.';
  return '';
}

export function analysisMessage({ blocked, analysis, loading, error }) {
  if (blocked) return blocked;
  if (error) return error;
  if (loading) return 'Calculating winning paths — statuses are not ready.';
  if (!analysis) return 'Winning-path analysis is unavailable.';
  if (!analysis.analysisComplete) return analysis.incompleteReason === 'matchup_limit'
    ? 'Incomplete analysis — too many undecided matchups for a full search. Only proven eliminations are shown; other entries are undetermined.'
    : 'Incomplete analysis — the search time limit was reached. A found winning path proves an entry is alive; unproven outcomes remain undetermined.';
  if (Object.values(analysis.byUserId || {}).some(e => e.scenariosTruncated))
    return 'Entry statuses are verified, but saved winning paths are incomplete. Detailed requirements are unavailable for affected entries.';
  return 'Analysis complete for all loaded participants and recorded results. Alive means at least one path to a share of first; clinched means a guaranteed share.';
}
