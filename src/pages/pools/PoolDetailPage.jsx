import PoolBracketPanel from './PoolBracketPanel.jsx';
import PoolLeaderboard from './PoolLeaderboard.jsx';
import PoolSleeperModal from './PoolSleeperModal.jsx';
import PoolParticipantAnalysis from './PoolParticipantAnalysis.jsx';
import { useState, useEffect, useRef, lazy, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getPoolById,
  joinBracketPool,
  getPoolEntry,
  submitPoolPredictions,
  lockPool,
  updatePoolDescription,
  startPool,
  updatePoolResults,
  getPoolEntries,
  completePool,
  deletePool,
  recalculatePoolScoresManual,
} from '../../services/bracketService';
import { analyzePool, shouldShowWinningPaths } from '../../lib/elimination';

const CustomPoolDetail = lazy(() => import('../../components/CustomPoolDetail'));

const PoolDetailPage = ({ poolId, onNavigate }) => {
  const [pool, setPool] = useState(null);
  const [entry, setEntry] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('bracket');
  const [predictions, setPredictions] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingEntry, setViewingEntry] = useState(null);

  // Sleeper picks state
  const [showSleeperModal, setShowSleeperModal] = useState(false);
  const [sleeper1, setSleeper1] = useState(null);
  const [sleeper2, setSleeper2] = useState(null);
  const [submittingSleepers, setSubmittingSleepers] = useState(false);

  // Participant analysis state
  const [analyzingParticipant, setAnalyzingParticipant] = useState(null);

  // Description editing state
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  // Match score editing state. Local input value keyed by "r{round}-m{match}-{slot}"
  // for responsive UI display while a save is pending.
  const [scoreDrafts, setScoreDrafts] = useState({});

  // Pending writes accumulator. Maps matchup+slot key to the parsed value
  // that should be persisted. All pending writes are flushed together in a
  // single Firestore update, eliminating the race where two concurrent
  // saves overwrite each other.
  const pendingScoreWrites = useRef({});
  const scoreFlushTimer = useRef(null);
  // Tracks the in-flight flush promise so blur handlers can await it and
  // know exactly when it's safe to clear their drafts.
  const inflightFlush = useRef(null);

  // Helper: parse a raw input value into a valid score or null.
  // Empty/whitespace -> null. Non-integer / negative -> null. Otherwise integer.
  const parseScoreInput = (raw) => {
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  };

  // Flush all accumulated pending score writes in a single Firestore update.
  // Reads pool.results fresh from the database so we don't operate on a
  // stale closure-captured copy, and applies all pending changes at once.
  const flushPendingScores = async () => {
    if (!isHost) {
      pendingScoreWrites.current = {};
      return;
    }
    const pending = pendingScoreWrites.current;
    if (Object.keys(pending).length === 0) return;

    // Snapshot the pending writes and clear the accumulator BEFORE the
    // async work so any new edits arriving during the flush start a new
    // pending batch instead of getting lost on accumulator clear.
    pendingScoreWrites.current = {};

    try {
      // Read fresh from Firestore. Avoids stale-closure issues if the host
      // had React state from before a previous reload.
      const freshPool = await getPoolById(poolId);
      if (!freshPool?.results) return;
      const newResults = JSON.parse(JSON.stringify(freshPool.results));

      // Apply every pending change to the fresh results copy.
      for (const key of Object.keys(pending)) {
        const m = key.match(/^r(\d+)-m(\d+)-([12])$/);
        if (!m) continue;
        const r = Number(m[1]);
        const mi = Number(m[2]);
        const slot = Number(m[3]);
        const match = newResults[r]?.[mi];
        if (!match) continue;
        if (slot === 1) match.score1 = pending[key];
        else match.score2 = pending[key];
      }

      await updatePoolResults(poolId, currentUser.uid, newResults);
      await loadPoolData();
    } catch (error) {
      console.error('Failed to flush score writes:', error);
      // Re-queue the changes on failure so they're not silently dropped.
      for (const key of Object.keys(pending)) {
        if (!(key in pendingScoreWrites.current)) {
          pendingScoreWrites.current[key] = pending[key];
        }
      }
    }
  };

  // Schedule a flush ~300ms in the future, replacing any pending schedule.
  const scheduleFlush = () => {
    if (scoreFlushTimer.current) clearTimeout(scoreFlushTimer.current);
    scoreFlushTimer.current = setTimeout(() => {
      scoreFlushTimer.current = null;
      // Track this flush so blur can await it.
      inflightFlush.current = flushPendingScores().finally(() => {
        inflightFlush.current = null;
      });
    }, 300);
  };

  const handleScoreChange = (roundIndex, matchIndex, slot, rawValue) => {
    const key = `r${roundIndex}-m${matchIndex}-${slot}`;
    // Update the local draft for immediate visual feedback.
    setScoreDrafts((prev) => ({ ...prev, [key]: rawValue }));
    // Queue the parsed value into the pending writes accumulator.
    pendingScoreWrites.current[key] = parseScoreInput(rawValue);
    scheduleFlush();
  };

  const handleScoreBlur = async (roundIndex, matchIndex, slot, rawValue) => {
    const key = `r${roundIndex}-m${matchIndex}-${slot}`;
    // Ensure this blur's value is in the accumulator.
    pendingScoreWrites.current[key] = parseScoreInput(rawValue);
    // Cancel any pending scheduled flush and run one immediately.
    if (scoreFlushTimer.current) {
      clearTimeout(scoreFlushTimer.current);
      scoreFlushTimer.current = null;
    }
    const flushPromise = flushPendingScores();
    inflightFlush.current = flushPromise;
    await flushPromise;
    inflightFlush.current = null;
    // Only clear this input's draft now that the save has completed and
    // the reload has updated pool.results.
    setScoreDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const getScoreInputValue = (roundIndex, matchIndex, slot) => {
    const key = `r${roundIndex}-m${matchIndex}-${slot}`;
    if (key in scoreDrafts) return scoreDrafts[key];
    const match = pool?.results?.[roundIndex]?.[matchIndex];
    if (!match) return '';
    const score = slot === 1 ? match.score1 : match.score2;
    return score == null ? '' : String(score);
  };

  // Cleanup: flush any pending writes on unmount so we don't lose edits
  // when the host navigates away mid-typing.
  useEffect(() => {
    return () => {
      if (scoreFlushTimer.current) {
        clearTimeout(scoreFlushTimer.current);
        scoreFlushTimer.current = null;
      }
      // Best-effort flush. We can't await in cleanup, but the write will
      // still go through if the browser doesn't close immediately.
      if (Object.keys(pendingScoreWrites.current).length > 0) {
        flushPendingScores();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { currentUser } = useAuth();

  const isHost = currentUser && pool?.hostId === currentUser.uid;

  const eliminationAnalysis = useMemo(() => {
    if (!pool || !entries || entries.length === 0) return null;
    if (pool.status === 'open' || pool.status === 'locked') return null;
    const results = pool.results || pool.bracketMatchups;
    const firstRoundDecided = (results?.[0] || []).some((m) => m?.winner);
    if (!firstRoundDecided) return null;
    return analyzePool(pool, entries);
  }, [pool, entries]);

  const showWinningPaths = useMemo(
    () =>
      eliminationAnalysis ? shouldShowWinningPaths(pool, eliminationAnalysis, entries) : false,
    [pool, eliminationAnalysis, entries],
  );

  useEffect(() => {
    loadPoolData();
  }, [poolId, currentUser]);

  const loadPoolData = async () => {
    try {
      const poolData = await getPoolById(poolId);
      setPool(poolData);

      if (currentUser) {
        const entryData = await getPoolEntry(poolId, currentUser.uid);
        setEntry(entryData);

        // Initialize predictions from entry or bracket
        if (entryData?.predictions) {
          setPredictions(entryData.predictions);
        } else if (poolData?.bracketMatchups) {
          setPredictions(JSON.parse(JSON.stringify(poolData.bracketMatchups)));
        }
      }

      // Load all entries for leaderboard
      const entriesData = await getPoolEntries(poolId);
      setEntries(entriesData);
    } catch (error) {
      console.error('Error loading pool:', error);
    }
    setLoading(false);
  };

  const handlePredictionSelect = (roundIndex, matchIndex, winner) => {
    if (pool.status !== 'open' || entry?.submittedAt) return;

    const newPredictions = JSON.parse(JSON.stringify(predictions));
    newPredictions[roundIndex][matchIndex].winner = winner;

    // Propagate winner to next round
    const winnerEntry =
      winner === 1
        ? newPredictions[roundIndex][matchIndex].entry1
        : newPredictions[roundIndex][matchIndex].entry2;

    if (roundIndex < newPredictions.length - 1) {
      const nextMatchIndex = Math.floor(matchIndex / 2);
      const isFirstEntry = matchIndex % 2 === 0;

      if (isFirstEntry) {
        newPredictions[roundIndex + 1][nextMatchIndex].entry1 = winnerEntry;
      } else {
        newPredictions[roundIndex + 1][nextMatchIndex].entry2 = winnerEntry;
      }

      // Clear subsequent picks that depended on this
      clearDependentPicks(newPredictions, roundIndex + 1, nextMatchIndex);
    }

    setPredictions(newPredictions);
  };

  const clearDependentPicks = (matchups, roundIndex, matchIndex) => {
    if (roundIndex >= matchups.length) return;

    matchups[roundIndex][matchIndex].winner = null;

    if (roundIndex < matchups.length - 1) {
      const nextMatchIndex = Math.floor(matchIndex / 2);
      const isFirstEntry = matchIndex % 2 === 0;

      if (isFirstEntry) {
        matchups[roundIndex + 1][nextMatchIndex].entry1 = null;
      } else {
        matchups[roundIndex + 1][nextMatchIndex].entry2 = null;
      }

      clearDependentPicks(matchups, roundIndex + 1, nextMatchIndex);
    }
  };

  const handleSubmitPredictions = async () => {
    // Check all matchups are filled
    const allFilled = predictions.every((round) => round.every((match) => match.winner !== null));

    if (!allFilled) {
      alert('Please complete all matchup predictions');
      return;
    }

    // If sleepers are enabled, show the sleeper modal instead of submitting immediately
    if (pool.enableSleepers) {
      setShowSleeperModal(true);
      return;
    }

    // Otherwise, submit directly
    await submitPredictionsToServer();
  };

  const submitPredictionsToServer = async (sleeperPicks = null) => {
    const finalMatch = predictions[predictions.length - 1][0];
    const champion = finalMatch.winner === 1 ? finalMatch.entry1 : finalMatch.entry2;

    setSubmitting(true);
    try {
      await submitPoolPredictions(poolId, currentUser.uid, predictions, champion, sleeperPicks);
      await loadPoolData();
      setShowSleeperModal(false);
      alert('Predictions submitted!');
    } catch (error) {
      alert(error.message);
    }
    setSubmitting(false);
  };

  // Get losers from a specific round for sleeper pick dropdowns
  const getRoundLosers = (roundIndex) => {
    if (!predictions || !predictions[roundIndex]) return [];

    const losers = [];
    predictions[roundIndex].forEach((match) => {
      if (match.winner && match.entry1 && match.entry2) {
        const loser = match.winner === 1 ? match.entry2 : match.entry1;
        losers.push(loser);
      }
    });
    return losers;
  };

  const handleSubmitSleepers = async () => {
    setSubmittingSleepers(true);
    await submitPredictionsToServer({
      sleeper1: sleeper1,
      sleeper2: sleeper2,
    });
    setSubmittingSleepers(false);
  };

  // Analyze how far each user has a participant going
  const analyzeParticipant = (participant) => {
    if (!participant || !entries.length) return null;

    const analysis = {
      participant,
      champion: [], // Users who have them winning it all
      byRound: {}, // Users grouped by the round they have them losing
      totalPicks: 0,
    };

    const numRounds = pool.bracketMatchups?.length || 0;

    // Initialize byRound
    for (let i = 0; i < numRounds; i++) {
      analysis.byRound[i] = [];
    }

    entries.forEach((participantEntry) => {
      if (!participantEntry.predictions) return;

      // Find how far this user has the participant going
      let lastRoundAppeared = -1;
      let isChampion = false;

      participantEntry.predictions.forEach((round, roundIndex) => {
        round.forEach((match) => {
          // Check if participant appears in this match
          const isEntry1 = match.entry1?.seed === participant.seed;
          const isEntry2 = match.entry2?.seed === participant.seed;

          if (isEntry1 || isEntry2) {
            lastRoundAppeared = roundIndex;

            // Check if they won this match
            if ((isEntry1 && match.winner === 1) || (isEntry2 && match.winner === 2)) {
              // They won, check if this is the final
              if (roundIndex === participantEntry.predictions.length - 1) {
                isChampion = true;
              }
            }
          }
        });
      });

      if (lastRoundAppeared >= 0) {
        analysis.totalPicks++;

        if (isChampion) {
          analysis.champion.push(participantEntry.userDisplayName);
        } else {
          // They lost in the round after they last appeared
          // (or in their last appeared round if they didn't win)
          const lostInRound = lastRoundAppeared;
          if (analysis.byRound[lostInRound]) {
            analysis.byRound[lostInRound].push(participantEntry.userDisplayName);
          }
        }
      }
    });

    return analysis;
  };

  const handleParticipantClick = (participant, e) => {
    // Don't open analysis if user is making selections
    if (pool.status === 'open' && !entry?.submittedAt && entry) return;
    if (activeTab === 'results' && isHost) return;

    e.stopPropagation();
    if (participant) {
      setAnalyzingParticipant(participant);
    }
  };

  const handleHostAction = async (action) => {
    try {
      switch (action) {
        case 'lock':
          await lockPool(poolId, currentUser.uid);
          break;
        case 'start':
          await startPool(poolId, currentUser.uid);
          break;
        case 'recalculate':
          await recalculatePoolScoresManual(poolId, currentUser.uid);
          alert('Scores recalculated!');
          break;
        case 'complete':
          await completePool(poolId, currentUser.uid);
          break;
        case 'delete':
          if (window.confirm('Are you sure you want to delete this pool?')) {
            await deletePool(poolId, currentUser.uid);
            onNavigate('pools');
            return;
          }
          break;
      }
      await loadPoolData();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleResultSelect = async (roundIndex, matchIndex, winner) => {
    if (!isHost || pool.status !== 'in_progress') return;

    const newResults = JSON.parse(JSON.stringify(pool.results));
    const currentWinner = newResults[roundIndex][matchIndex].winner;

    // If the host is clicking the team that's already marked as winner,
    // un-select it. Otherwise, set the clicked team as the new winner.
    if (currentWinner === winner) {
      // UN-SELECT path: clear this winner and cascade through any
      // downstream matches whose entries depended on it.
      cascadeClear(newResults, roundIndex, matchIndex);
    } else {
      // SET path: same as before — set the winner and propagate to the
      // next round. But also cascade-clear first if there was a previous
      // *different* winner, because flipping the winner means the team
      // that previously advanced is no longer advancing and any
      // downstream winners using them must also be cleared.
      if (currentWinner != null && currentWinner !== winner) {
        cascadeClear(newResults, roundIndex, matchIndex);
      }
      newResults[roundIndex][matchIndex].winner = winner;

      // Propagate winner to next round.
      const winnerEntry =
        winner === 1
          ? newResults[roundIndex][matchIndex].entry1
          : newResults[roundIndex][matchIndex].entry2;

      if (roundIndex < newResults.length - 1) {
        const nextMatchIndex = Math.floor(matchIndex / 2);
        const isFirstEntry = matchIndex % 2 === 0;
        if (isFirstEntry) {
          newResults[roundIndex + 1][nextMatchIndex].entry1 = winnerEntry;
        } else {
          newResults[roundIndex + 1][nextMatchIndex].entry2 = winnerEntry;
        }
      }
    }

    try {
      await updatePoolResults(poolId, currentUser.uid, newResults);
      await loadPoolData();
    } catch (error) {
      alert(error.message);
    }
  };

  // Recursively clear a match's winner and every downstream match whose
  // entries depended on this one. Walks forward through the bracket tree
  // from the cleared match: round+1 always gets its corresponding slot
  // nulled out, and if that round+1 match also had a winner set, the
  // function recurses to clear that too.
  const cascadeClear = (results, roundIndex, matchIndex) => {
    // Clear this match's winner.
    results[roundIndex][matchIndex].winner = null;

    // If there's no next round, we're done (this was the final).
    if (roundIndex >= results.length - 1) return;

    const nextRoundIndex = roundIndex + 1;
    const nextMatchIndex = Math.floor(matchIndex / 2);
    const isFirstEntry = matchIndex % 2 === 0;
    const nextMatch = results[nextRoundIndex][nextMatchIndex];

    // Whether the next round's match had a winner set BEFORE we touch
    // it — we need to know this before nulling the slot, so we can
    // decide whether to recurse.
    const nextHadWinner = nextMatch.winner != null;

    // Null out the slot in the next round that this match was feeding.
    if (isFirstEntry) {
      nextMatch.entry1 = null;
    } else {
      nextMatch.entry2 = null;
    }

    // If the next round's match had a determined winner, that winner
    // depended on these entries — cascade clear it too. (We always
    // recurse if there was a winner, even if it was the *other* team
    // in the matchup. Reason: with one entry now null, the "winner"
    // is no longer a real comparison, so the bracket is inconsistent
    // until we clear it. The host can re-set winners as needed.)
    if (nextHadWinner) {
      cascadeClear(results, nextRoundIndex, nextMatchIndex);
    }
  };

  const getRoundName = (roundIndex, totalRounds) => {
    const remaining = totalRounds - roundIndex;
    if (remaining === 1) return 'Finals';
    if (remaining === 2) return 'Semi-Finals';
    if (remaining === 3) return 'Quarter-Finals';
    return `Round ${roundIndex + 1}`;
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}?pool=${pool.joinCode}`;
    navigator.clipboard.writeText(link);
    alert('Join link copied!');
  };

  // Determine if a prediction is correct, incorrect, or pending
  // Determine if a prediction is correct, incorrect, or pending
  const getMatchStatus = (predictionMatchups, roundIndex, matchIndex) => {
    if (!pool.results || pool.status === 'open' || pool.status === 'locked') return 'pending';

    const resultMatch = pool.results[roundIndex]?.[matchIndex];
    const predictionMatch = predictionMatchups?.[roundIndex]?.[matchIndex];

    if (!resultMatch?.winner) return 'pending';
    if (!predictionMatch?.winner) return 'pending';

    // Get the actual winner participants from both matches
    const actualWinner = resultMatch.winner === 1 ? resultMatch.entry1 : resultMatch.entry2;
    const predictedWinner =
      predictionMatch.winner === 1 ? predictionMatch.entry1 : predictionMatch.entry2;

    // Compare by seed to determine if the same participant was predicted
    if (!actualWinner || !predictedWinner) return 'pending';

    return actualWinner.seed === predictedWinner.seed ? 'correct' : 'incorrect';
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading pool...</p>
        </div>
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <p>Pool not found</p>
          <button className="back-btn" onClick={() => onNavigate('pools')}>
            Back to Pools
          </button>
        </div>
      </div>
    );
  }

  // Determine which matchups to display
  const getDisplayMatchups = () => {
    // If viewing another participant's bracket
    if (viewingEntry) {
      return viewingEntry.predictions;
    }
    // If host is setting results
    if (
      (pool.status === 'in_progress' || pool.status === 'completed') &&
      isHost &&
      activeTab === 'results'
    ) {
      return pool.results;
    }
    // If viewing own predictions after submission
    if (entry?.submittedAt && (pool.status !== 'open' || activeTab === 'bracket')) {
      return entry.predictions;
    }
    // If still making predictions
    if (pool.status === 'open' && !entry?.submittedAt) {
      return predictions;
    }
    // Default to own predictions
    return entry?.predictions || predictions;
  };

  const displayMatchups = getDisplayMatchups();
  const showingPredictions = viewingEntry || (entry?.submittedAt && activeTab === 'bracket');
  const viewingOwnBracket = !viewingEntry || viewingEntry.userId === currentUser?.uid;

  const handleSaveDescription = async () => {
    try {
      await updatePoolDescription(poolId, currentUser.uid, descriptionDraft);
      setEditingDescription(false);
      await loadPoolData();
    } catch (error) {
      alert(error.message);
    }
  };

  const startEditingDescription = () => {
    setDescriptionDraft(pool.description || '');
    setEditingDescription(true);
  };

  if (pool.bracketType === 'custom' || Array.isArray(pool.bracketMatchups)) {
    return (
      <CustomPoolDetail
        poolId={poolId}
        currentUserId={currentUser?.uid}
        currentUserName={currentUser?.displayName}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <div className="home-container">
      <div className="pool-header">
        <div className="pool-header-info">
          <button className="back-link" onClick={() => onNavigate('pools')}>
            ← Back to Pools
          </button>
          <h1>{pool.name}</h1>
          <p>
            {pool.bracketTitle} • {pool.bracketCategory}
          </p>
        </div>

        <div className="pool-header-actions">
          {isHost && pool.joinCode && <div className="pool-code-display">
            <span>Join Code:</span>
            <strong>{pool.joinCode}</strong>
            <button className="copy-btn" onClick={copyJoinLink}>
              Copy Link
            </button>
          </div>}

          {isHost && (
            <div className="host-actions">
              {pool.status === 'open' && (
                <button className="action-btn" onClick={() => handleHostAction('lock')}>
                  Lock Entries
                </button>
              )}
              {pool.status === 'locked' && (
                <button className="action-btn" onClick={() => handleHostAction('start')}>
                  Start Pool
                </button>
              )}
              {pool.status === 'in_progress' && (
                <>
                  <button className="action-btn" onClick={() => handleHostAction('recalculate')}>
                    Recalculate Scores
                  </button>
                  <button
                    className="action-btn complete"
                    onClick={() => handleHostAction('complete')}
                  >
                    Complete Pool
                  </button>
                </>
              )}
              <button className="action-btn delete" onClick={() => handleHostAction('delete')}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pool Description */}
      {(pool.description || isHost) && (
        <div className="pool-description-section">
          {editingDescription ? (
            <div className="description-edit">
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                className="form-textarea"
                rows={3}
                placeholder="Add rules, prizes, or any other info for participants..."
              />
              <div className="description-edit-actions">
                <button className="cancel-btn" onClick={() => setEditingDescription(false)}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSaveDescription}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="description-display">
              {pool.description ? (
                <p className="pool-description">{pool.description}</p>
              ) : (
                <p className="pool-description empty">No description added</p>
              )}
              {isHost && (
                <button className="edit-description-btn" onClick={startEditingDescription}>
                  {pool.description ? 'Edit' : 'Add Description'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="pool-tabs">
        <button
          className={`pool-tab ${activeTab === 'bracket' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('bracket');
            setViewingEntry(null);
          }}
        >
          {pool.status === 'open' && !entry?.submittedAt ? 'My Predictions' : 'My Bracket'}
        </button>
        {isHost && (pool.status === 'in_progress' || pool.status === 'completed') && (
          <button
            className={`pool-tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('results');
              setViewingEntry(null);
            }}
          >
            Set Results
          </button>
        )}
        <button
          className={`pool-tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('leaderboard');
            setViewingEntry(null);
          }}
        >
          Leaderboard ({entries.length})
        </button>
      </div>

      {/* Viewing another participant's bracket */}
      {viewingEntry && (
        <div className="viewing-participant-header">
          <button className="back-link" onClick={() => setViewingEntry(null)}>
            ← Back to Leaderboard
          </button>
          <h3>Viewing {viewingEntry.userDisplayName}'s Bracket</h3>
          <span className="participant-score">Score: {viewingEntry.score} pts</span>
        </div>
      )}

      {(activeTab === 'bracket' || activeTab === 'results' || viewingEntry) && displayMatchups && (
        <PoolBracketPanel
          pool={pool}
          entry={entry}
          currentUser={currentUser}
          viewingEntry={viewingEntry}
          handleSubmitPredictions={handleSubmitPredictions}
          submitting={submitting}
          activeTab={activeTab}
          isHost={isHost}
          entries={entries}
          displayMatchups={displayMatchups}
          getRoundName={getRoundName}
          showingPredictions={showingPredictions}
          getMatchStatus={getMatchStatus}
          handlePredictionSelect={handlePredictionSelect}
          handleResultSelect={handleResultSelect}
          handleParticipantClick={handleParticipantClick}
          getScoreInputValue={getScoreInputValue}
          handleScoreChange={handleScoreChange}
          handleScoreBlur={handleScoreBlur}
        />
      )}

      {activeTab === 'leaderboard' && !viewingEntry && (
        <PoolLeaderboard
          pool={pool}
          entries={entries}
          eliminationAnalysis={eliminationAnalysis}
          currentUser={currentUser}
          setViewingEntry={setViewingEntry}
          showWinningPaths={showWinningPaths}
        />
      )}

      {/* Sleeper Picks Modal */}
      {showSleeperModal && (
        <PoolSleeperModal
          setShowSleeperModal={setShowSleeperModal}
          pool={pool}
          sleeper1={sleeper1}
          setSleeper1={setSleeper1}
          getRoundLosers={getRoundLosers}
          sleeper2={sleeper2}
          setSleeper2={setSleeper2}
          submitPredictionsToServer={submitPredictionsToServer}
          submitting={submitting}
          submittingSleepers={submittingSleepers}
          handleSubmitSleepers={handleSubmitSleepers}
        />
      )}

      {/* Participant Analysis Modal */}
      {analyzingParticipant && (
        <PoolParticipantAnalysis
          setAnalyzingParticipant={setAnalyzingParticipant}
          analyzingParticipant={analyzingParticipant}
          analyzeParticipant={analyzeParticipant}
          pool={pool}
          getRoundName={getRoundName}
        />
      )}

      {!currentUser && (
        <div className="login-prompt">
          <p>Log in to join this pool and make predictions!</p>
        </div>
      )}

      {currentUser && !entry && pool.status === 'open' && (
        <div className="join-pool-prompt">
          <button
            className="nav-btn"
            onClick={async () => {
              try {
                await joinBracketPool(
                  poolId,
                  currentUser.uid,
                  currentUser.displayName || 'Anonymous',
                );
                await loadPoolData();
              } catch (error) {
                alert(error.message);
              }
            }}
          >
            Join This Pool
          </button>
        </div>
      )}
    </div>
  );
};

export default PoolDetailPage;
