import UserLink from '../layout/UserLink';
import { S } from './poolStyles';

const statusText = { clinched: 'Clinched', eliminated: 'Eliminated', alive: 'Alive', unknown: 'Undetermined' };
export default function PoolStandings({ entries, currentUserId, nameMap, analysis, analysisNotice, partial, stale, onView }) {
  let rank = 0;
  const scoreCounts = new Map();
  for (const entry of entries) if (entry.total != null) scoreCounts.set(entry.total, (scoreCounts.get(entry.total) || 0) + 1);
  return <section className="pool-standings" style={S.lb} aria-label="Standings">
    <h2>Standings</h2>
    <p role="status">{analysisNotice}</p>
    <p className="standings-help">Points come from correct picks. Equal scores share a rank and are ordered by remaining possible points, highest first. Remaining points are an upper bound, not a win probability. Entries with private or unavailable remaining points follow those with known values.</p>
    {partial && <p>Ranks below compare only loaded entries, including your own entry.</p>}
    {!entries.length && <p>No participants to display.</p>}
    {entries.map((e, index) => {
      if (index === 0 || e.total !== entries[index - 1].total) rank = index + 1;
      const tied = e.total != null && scoreCounts.get(e.total) > 1;
      const status = analysis?.byUserId?.[e.userId];
      const canView = !!e.predictions && !e.predictionsHidden && !e.dataError;
      return <article className="standings-entry" key={e.id || e.userId} style={e.userId === currentUserId ? S.rowMe : undefined}>
        <div className="standings-entry-heading">
          <span className="standings-rank">{e.total == null ? 'Unranked' : `${partial ? 'Loaded rank ' : '#'}${rank}${tied ? ' (tie)' : ''}`}</span>
          <h3><UserLink userId={e.userId} name={e.userDisplayName || e.displayName || 'Anonymous'} />{e.userId === currentUserId ? ' (you)' : ''}</h3>
          <strong>{e.total ?? '—'} pts{stale ? ' · may be stale' : e.breakdownUnavailable && e.total != null ? ' · saved score' : ''}</strong>
        </div>
        {e.breakdownUnavailable ? <p>{e.breakdownUnavailable}</p> : <>
          <dl className="standings-breakdown">
            <div><dt>Base points</dt><dd>{e.basePoints}</dd></div>
            <div><dt>Remaining possible</dt><dd>{e.remainingPossible === 0 ? '0' : `Up to ${e.remainingPossible}`}</dd></div>
            <div><dt>Final total ceiling</dt><dd>{e.maxPossibleScore}</dd></div>
          </dl>
          <p className="standings-help">{e.correct} correct picks · Remaining: up to {e.remainingPossible} points.</p>
        </>}
        <div className="standings-entry-footer">
          {status && <span>{statusText[status.status] || 'Undetermined'}{status.scenariosTruncated ? ' · winning paths incomplete' : ''}</span>}
          {canView && e.champion != null && <span>Champion pick: {nameMap[e.champion] || e.champion}</span>}
          {canView && <button style={S.ghost} onClick={() => onView(e)}>View picks<span className="standings-sr-only"> for {e.userDisplayName || e.displayName || 'Anonymous'}</span></button>}
        </div>
      </article>;
    })}
  </section>;
}
