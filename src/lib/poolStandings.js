import { scoreEntry } from './customScoring';
import { remainingContext, remainingPoints } from './remainingPoints';
export { remainingContext, compareStandings } from './remainingPoints';

export function explainEntry(state, entry, roundPoints, pool, context = remainingContext(state)) {
  if (entry.dataError) return { total: null, breakdownUnavailable: 'Picks unavailable — score breakdown cannot be verified.' };
  if (entry.predictionsHidden) return { total: Number.isFinite(entry.score) ? entry.score : null, breakdownUnavailable: 'Picks private — breakdown and remaining points available after predictions close.' };
  if (!entry.predictions) return { total: null, breakdownUnavailable: entry.submittedAt ? 'Submitted picks unavailable.' : 'Not submitted' };
  const base = scoreEntry(state, entry.predictions, roundPoints);
  const remainingBase = remainingPoints(entry, roundPoints, context);
  return { total: base.total, basePoints: base.total, correct: base.correct,
    sleeperBonus: 0, remainingBase, remainingSleepers: 0,
    remainingPossible: remainingBase, maxPossibleScore: base.total + remainingBase };
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
