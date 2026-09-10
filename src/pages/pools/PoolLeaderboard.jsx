import { StatusBadge, WhatNeedsToHappen } from '../../components/EliminationStatus';

export default function PoolLeaderboard({
  pool,
  entries,
  eliminationAnalysis,
  currentUser,
  setViewingEntry,
  showWinningPaths,
}) {
  return (
    <div className="pool-leaderboard">
      {entries.predictionsHidden && <p>Picks stay private until predictions close, including from the host.</p>}
      {pool.status === 'completed' && pool.winnerId && (
        <div className="pool-winner-banner">
          <span className="trophy">🏆</span>
          <span className="winner-text">
            {pool.winnerName} wins with {pool.winnerScore} points!
          </span>
        </div>
      )}

      <div className={`leaderboard-table ${pool.enableSleepers ? 'with-sleepers' : ''}`}>
        <div className="leaderboard-header">
          <span className="lb-rank">Rank</span>
          <span className="lb-name">Player</span>
          <span className="lb-champion">Champion Pick</span>
          {pool.enableSleepers && <span className="lb-sleepers">Sleeper Picks</span>}
          <span className="lb-score">Score</span>
          <span className="lb-action"></span>
        </div>
        {entries.map((participantEntry, index) => {
          const entryStatus = eliminationAnalysis?.byUserId[participantEntry.userId];
          return (
            <div
              key={participantEntry.id}
              className={`leaderboard-row ${participantEntry.userId === currentUser?.uid ? 'current-user' : ''}`}
            >
              <span className="lb-rank">
                {index === 0 && entries.length > 1 ? '👑' : `#${index + 1}`}
              </span>
              <span className="lb-name">
                {participantEntry.userDisplayName}
                {entryStatus && (
                  <>
                    {' '}
                    <StatusBadge status={entryStatus} />
                  </>
                )}
              </span>
              <span className="lb-champion">
                {(participantEntry.predictionsHidden ? 'Private until lock' : participantEntry.dataError ? 'Unavailable' : participantEntry.champion?.name) ||
                  (participantEntry.submittedAt ? 'N/A' : 'Not submitted')}
              </span>
              {pool.enableSleepers && (
                <span className="lb-sleepers">
                  {participantEntry.sleeper1 || participantEntry.sleeper2 ? (
                    <div className="sleeper-picks-display">
                      {participantEntry.sleeper1 && (
                        <span
                          className={`sleeper-pick-tag ${participantEntry.sleeper1Hit ? 'hit' : ''}`}
                          title="Sleeper 1"
                        >
                          {participantEntry.sleeper1.name}
                          {participantEntry.sleeper1Hit && ' ✓'}
                        </span>
                      )}
                      {participantEntry.sleeper2 && (
                        <span
                          className={`sleeper-pick-tag ${participantEntry.sleeper2Hit ? 'hit' : ''}`}
                          title="Sleeper 2"
                        >
                          {participantEntry.sleeper2.name}
                          {participantEntry.sleeper2Hit && ' ✓'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="no-sleepers">None</span>
                  )}
                </span>
              )}
              <span className="lb-score">{participantEntry.score}</span>
              <span className="lb-action">
                {participantEntry.predictions && !participantEntry.dataError && (
                  <button
                    className="view-bracket-btn"
                    onClick={() => setViewingEntry(participantEntry)}
                  >
                    View
                  </button>
                )}
              </span>
              {showWinningPaths && entryStatus?.status === 'alive' && (
                <div className="leaderboard-row-expansion">
                  <WhatNeedsToHappen status={entryStatus} pool={pool} />
                </div>
              )}
            </div>
          );
        })}
        {entries.length === 0 && <div className="leaderboard-empty">No participants yet</div>}
      </div>

      <div className="scoring-info">
        <h4>Scoring</h4>
        <p>
          {pool.roundPoints
            ?.map((pts, i) => `Round ${i + 1}: ${pts} pt${pts !== 1 ? 's' : ''}`)
            .join(' • ') ||
            'Round 1: 1 pt • Round 2: 2 pts • Round 3: 4 pts • Round 4: 8 pts • Finals: 16 pts'}
        </p>
        {pool.enableSleepers && (
          <p className="sleeper-scoring">
            Sleeper 1 (R1 loser → R3): {pool.sleeper1Points} pts • Sleeper 2 (R2 loser → R4):{' '}
            {pool.sleeper2Points} pts
          </p>
        )}
      </div>
    </div>
  );
}
