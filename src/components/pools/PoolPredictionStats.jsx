import { useMemo } from 'react';
import BracketLoader from '../BracketLoader';
import { buildPredictionStats } from '../../lib/poolPredictionStats';
import './poolPredictionStats.css';

export default function PoolPredictionStats({ structure, entries, loaded, error, predictionsOpen, onInspect }) {
  const stats = useMemo(() => loaded && !error && !predictionsOpen ? buildPredictionStats(structure, entries) : null,
    [structure, entries, loaded, error, predictionsOpen]);
  const percent = count => `${(100 * count / stats.submitted).toFixed(1)}%`;
  return <section className="pool-prediction-stats">
    <h2>Predicted finishes</h2>
    <p>See which entries the pool expects to go farthest, ranked by average predicted finish round.</p>
    {predictionsOpen || stats?.hidden ? <p role="status">Entry stats unlock after predictions close, when the pool’s submitted picks are available to you.</p>
      : error ? <p role="status">Participant refresh failed. Entry stats are unavailable until participants reload successfully. Use Retry participants below.</p>
      : !loaded ? <BracketLoader label="Loading predictions…" />
      : stats?.unavailable ? <p role="status">This bracket could not be analyzed.</p>
      : <>
        {entries.nextCursor && <p className="prediction-stats-notice" role="status">Partial analysis — only {entries.length} loaded participants are included. Use Load more participants below for pool-wide rankings.</p>}
        <p className="prediction-stats-sample">Based on <strong>{stats.submitted}</strong> complete submitted {stats.submitted === 1 ? 'bracket' : 'brackets'}.
          {stats.notSubmitted > 0 && ` ${stats.notSubmitted} ${stats.notSubmitted === 1 ? 'participant has' : 'participants have'} not submitted.`}
          {stats.excluded > 0 && ` ${stats.excluded} ${stats.excluded === 1 ? 'bracket was' : 'brackets were'} excluded because picks are incomplete or unavailable.`}</p>
        {!stats.submitted ? <p>No complete submitted predictions to analyze yet.</p> : <>
          <p id="prediction-stats-method">Higher averages mean later predicted finishes. A Round 1 loss counts as 1; a final-round loss as {stats.roundCount}; and a championship as {stats.roundCount + 1}. Byes use the bracket’s round numbers. Pool points and official results do not affect this ranking. Equal averages share a rank.</p>
          <p>Select an entry to see each member’s predicted finish.</p>
          <div className="prediction-stats-table" role="region" aria-label="Predicted finish rankings" tabIndex={0}>
            <table aria-describedby="prediction-stats-method">
              <caption>{entries.nextCursor ? 'Predictions from loaded participants' : 'Pool prediction rankings'}</caption>
              <thead><tr><th scope="col">Rank</th><th scope="col">Entry</th><th scope="col">Avg. finish round</th><th scope="col">Final picks</th><th scope="col">Champion picks</th></tr></thead>
              <tbody>{stats.rows.map(row => <tr key={row.pid}>
                <td>{row.rank}</td>
                <th scope="row"><button type="button" className="prediction-stats-entry" onClick={() => onInspect({ pid: row.pid, name: row.name })}>{row.name}</button></th>
                <td className="prediction-stats-average">{row.averageFinish.toFixed(2)}</td>
                <td><span>{percent(row.finalPicks)}</span><small>{row.finalPicks} of {stats.submitted}</small></td>
                <td><span>{percent(row.championPicks)}</span><small>{row.championPicks} of {stats.submitted}</small></td>
              </tr>)}</tbody>
            </table>
          </div>
          <p>Final picks include both runners-up and champions. These percentages describe submitted predictions, not calculated winning odds.</p>
        </>}
      </>}
  </section>;
}
