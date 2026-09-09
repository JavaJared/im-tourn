export default function PoolBracketPanel({
  pool,
  entry,
  currentUser,
  viewingEntry,
  handleSubmitPredictions,
  submitting,
  activeTab,
  isHost,
  entries,
  displayMatchups,
  getRoundName,
  showingPredictions,
  getMatchStatus,
  handlePredictionSelect,
  handleResultSelect,
  handleParticipantClick,
  getScoreInputValue,
  handleScoreChange,
  handleScoreBlur,
}) {
  return (
    <div className="pool-bracket-container">
      {pool.status === 'open' && !entry?.submittedAt && currentUser && entry && !viewingEntry && (
        <div className="prediction-instructions">
          <p>Click on entries to make your predictions. Submit before the pool locks!</p>
          <button
            className="submit-predictions-btn"
            onClick={handleSubmitPredictions}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Predictions'}
          </button>
        </div>
      )}

      {pool.status === 'open' && entry?.submittedAt && !viewingEntry && (
        <div className="prediction-submitted">
          <p>✓ Your predictions have been submitted!</p>
        </div>
      )}

      {activeTab === 'results' && isHost && !viewingEntry && (
        <div className="host-instructions">
          <p>Click on entries to set the actual results as games are played.</p>
        </div>
      )}

      {(pool.status === 'in_progress' || pool.status === 'completed') &&
        activeTab === 'bracket' &&
        !viewingEntry &&
        entry?.predictions && (
          <div className="bracket-legend">
            <span className="legend-item correct">✓ Correct</span>
            <span className="legend-item incorrect">✗ Incorrect</span>
            <span className="legend-item pending">○ Pending</span>
          </div>
        )}

      {/* Hint for participant analysis */}
      {(pool.status !== 'open' || entry?.submittedAt) &&
        activeTab !== 'results' &&
        entries.length > 1 && (
          <div className="analysis-hint">
            <span>💡 Click on any participant to see how others picked them</span>
          </div>
        )}

      <div className="pool-bracket">
        {displayMatchups.map((round, roundIndex) => (
          <div key={roundIndex} className="pool-round">
            <div className="pool-round-title">
              {getRoundName(roundIndex, displayMatchups.length)}
            </div>
            <div className="pool-matchups">
              {round.map((match, matchIndex) => {
                const canSelect =
                  (pool.status === 'open' && !entry?.submittedAt && entry && !viewingEntry) ||
                  (activeTab === 'results' && isHost && !viewingEntry);

                // Determine match status for coloring
                const matchStatus = showingPredictions
                  ? getMatchStatus(displayMatchups, roundIndex, matchIndex)
                  : 'pending';

                // Can analyze when not in selection mode
                const canAnalyze = !canSelect && entries.length > 1;

                return (
                  <div
                    key={`${roundIndex}-${matchIndex}`}
                    className={`pool-matchup ${matchStatus}`}
                  >
                    {[1, 2].map((slot) => {
                      // entryData is the team in this slot of the bracket
                      // currently being displayed (which is the user's
                      // predictions, the host's results, or another
                      // participant's predictions depending on context).
                      const entryData = slot === 1 ? match.entry1 : match.entry2;
                      const isWinner = match.winner === slot;
                      const showScoreInput =
                        activeTab === 'results' && isHost && !viewingEntry && entryData;

                      // Look up what ACTUALLY happened in this matchup.
                      // Sourced from pool.results (the actual played
                      // outcome). Note: this is independent of which
                      // bracket the user is viewing — we always want to
                      // compare against the real results.
                      const actualMatch = pool?.results?.[roundIndex]?.[matchIndex];
                      const actualEntry = actualMatch
                        ? slot === 1
                          ? actualMatch.entry1
                          : actualMatch.entry2
                        : null;
                      const actualScore = actualMatch
                        ? ((slot === 1 ? actualMatch.score1 : actualMatch.score2) ?? null)
                        : null;

                      // Determine if the user's prediction for this slot
                      // differs from what actually played. Only meaningful
                      // when:
                      //   - we're showing the user's predictions (not results)
                      //   - the matchup actually has a real team in this
                      //     slot (i.e. previous round was decided)
                      //   - the predicted team and actual team have
                      //     different seeds.
                      // We're "showing predictions" if either we're
                      // viewing another participant's bracket OR the
                      // user is looking at their own bracket tab after
                      // having submitted.
                      const isShowingPredictions =
                        viewingEntry || (entry?.submittedAt && activeTab === 'bracket');
                      const hasMismatch =
                        isShowingPredictions &&
                        entryData &&
                        actualEntry &&
                        entryData.seed !== actualEntry.seed;

                      // When there's a mismatch, the primary line shows
                      // the team that ACTUALLY played; the secondary line
                      // shows what the user predicted.
                      const displayEntry = hasMismatch ? actualEntry : entryData;
                      const displayScore = hasMismatch
                        ? actualScore
                        : actualEntry && entryData.seed === actualEntry.seed
                          ? actualScore
                          : null;

                      // Compute the winner flag against the displayed
                      // team. Important: when a mismatch shows the
                      // actual team, "isWinner" still maps to whether
                      // that team won in the matchup.
                      const displayIsWinner = hasMismatch ? actualMatch?.winner === slot : isWinner;

                      const showScoreDisplay =
                        !showScoreInput && displayEntry && displayScore != null;

                      return (
                        <div
                          key={slot}
                          className={`pool-entry ${displayIsWinner ? 'winner' : ''} ${canSelect ? 'selectable' : ''} ${canAnalyze && entryData ? 'analyzable' : ''} ${showScoreInput ? 'host-mode' : ''} ${hasMismatch ? 'has-mismatch' : ''}`}
                          onClick={(e) => {
                            if (e.target.classList.contains('pool-score-input')) return;
                            if (canSelect) {
                              if (pool.status === 'open' && !entry?.submittedAt) {
                                handlePredictionSelect(roundIndex, matchIndex, slot);
                              } else if (activeTab === 'results' && isHost) {
                                handleResultSelect(roundIndex, matchIndex, slot);
                              }
                            } else if (canAnalyze && displayEntry) {
                              handleParticipantClick(displayEntry, e);
                            }
                          }}
                        >
                          {displayEntry ? (
                            <>
                              <span className="pool-seed">{displayEntry.seed}</span>
                              {hasMismatch ? (
                                <>
                                  <span className="actual-row">
                                    <span className="pool-entry-name">{displayEntry.name}</span>
                                  </span>
                                  {showScoreInput && (
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min="0"
                                      step="1"
                                      className="pool-score-input"
                                      placeholder="—"
                                      value={getScoreInputValue(roundIndex, matchIndex, slot)}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        handleScoreChange(
                                          roundIndex,
                                          matchIndex,
                                          slot,
                                          e.target.value,
                                        )
                                      }
                                      onBlur={(e) =>
                                        handleScoreBlur(
                                          roundIndex,
                                          matchIndex,
                                          slot,
                                          e.target.value,
                                        )
                                      }
                                      aria-label={`${displayEntry.name} score`}
                                    />
                                  )}
                                  {showScoreDisplay && (
                                    <span className="pool-score">{displayScore}</span>
                                  )}
                                  <span className="predicted-row">
                                    <span className="predicted-label">You picked:</span>
                                    <span className="predicted-name you-got-it">
                                      {entryData.name}
                                    </span>
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="pool-entry-name">{displayEntry.name}</span>
                                  {showScoreInput && (
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min="0"
                                      step="1"
                                      className="pool-score-input"
                                      placeholder="—"
                                      value={getScoreInputValue(roundIndex, matchIndex, slot)}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        handleScoreChange(
                                          roundIndex,
                                          matchIndex,
                                          slot,
                                          e.target.value,
                                        )
                                      }
                                      onBlur={(e) =>
                                        handleScoreBlur(
                                          roundIndex,
                                          matchIndex,
                                          slot,
                                          e.target.value,
                                        )
                                      }
                                      aria-label={`${displayEntry.name} score`}
                                    />
                                  )}
                                  {showScoreDisplay && (
                                    <span className="pool-score">{displayScore}</span>
                                  )}
                                </>
                              )}
                            </>
                          ) : (
                            <span className="pool-entry-name tbd">TBD</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
