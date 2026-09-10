import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { joinDraft, leaveDraft, kickParticipant, startDraft, submitPick, skipPick, saveScores, computeLeaderboard, deleteDraft, MAX_PARTICIPANTS } from '../../services/draftService';

const DraftCard = ({ draft, onClick }) => {
  const statusLabels = { open: 'Open', drafting: 'Live', completed: 'Completed' };
  const statusClasses = { open: 'status-open', drafting: 'status-live', completed: 'status-completed' };
  return (
    <div className="draft-browse-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick(); } }}>
      <span className={`draft-status-badge ${statusClasses[draft.status] || ''}`}>
        {statusLabels[draft.status] || draft.status}
      </span>
      {draft.category && <span className="draft-card-category">{draft.category}</span>}
      <h3 className="draft-card-title">{draft.title}</h3>
      {draft.description && <p className="draft-card-description">{draft.description}</p>}
      <div className="draft-card-meta">
        <span>{draft.participantCount || 0} participants · {draft.rounds} rounds</span>
        <span className="draft-card-host">by {draft.hostDisplayName}</span>
      </div>
    </div>
  );
};

const LobbyView = ({ draft, onNavigate }) => {
  const { currentUser } = useAuth();
  const [actionError, setActionError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const isHost = currentUser && draft.hostId === currentUser.uid;
  const isJoined = draft.participants.some(p => p.userId === currentUser?.uid);

  const handleJoin = async () => {
    setActionError('');
    try { await joinDraft(draft.id, currentUser.uid, currentUser.displayName || 'Anonymous', joinCode); }
    catch (e) { setActionError(e.message); }
  };
  const handleLeave = async () => {
    try { await leaveDraft(draft.id, currentUser.uid); } catch (e) { setActionError(e.message); }
  };
  const handleKick = async (userId) => {
    try { await kickParticipant(draft.id, currentUser.uid, userId); } catch (e) { setActionError(e.message); }
  };
  const handleStart = async () => {
    setActionError('');
    try { await startDraft(draft.id, currentUser.uid); } catch (e) { setActionError(e.message); }
  };
  const handleDelete = async () => {
    if (!window.confirm('Delete this draft?')) return;
    try { await deleteDraft(draft.id, currentUser.uid); onNavigate('drafts'); } catch (e) { setActionError(e.message); }
  };

  return (
    <div className="home-container">
      <div className="pool-detail-header">
        <div className="pool-detail-title-row">
          <h1>{draft.title}</h1>
          <span className="pool-status status-open">Open</span>
        </div>
        <p className="pool-detail-meta">
          by {draft.hostDisplayName} · {draft.rounds} rounds ·
          {draft.timerSeconds > 0 ? ` ${draft.timerSeconds}s timer` : ' No timer'} ·
          {isHost && draft.joinCode && <>Code: <strong>{draft.joinCode}</strong></>}
        </p>
        {draft.description && <p className="pool-description">{draft.description}</p>}
      </div>

      <div className="draft-lobby-section">
        <h2>Participants ({draft.participants.length}/{MAX_PARTICIPANTS})</h2>
        {draft.participants.length === 0 ? (
          <p className="draft-lobby-empty">No one has joined yet. Share the code!</p>
        ) : (
          <div className="draft-participant-list">
            {draft.participants.map(p => (
              <div key={p.userId} className="draft-participant">
                <span className="draft-participant-avatar">
                  {p.displayName?.[0]?.toUpperCase() || '?'}
                </span>
                <span className="draft-participant-name">
                  {p.displayName} {p.userId === draft.hostId && <span className="draft-host-tag">Host</span>}
                </span>
                {isHost && p.userId !== draft.hostId && (
                  <button className="draft-kick-btn" onClick={() => handleKick(p.userId)}>Remove</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {actionError && <p className="error-text">{actionError}</p>}

      <div className="draft-lobby-actions">
        {!currentUser ? (
          <p>Log in to join this draft.</p>
        ) : isHost ? (
          <>
            <button className="nav-btn" onClick={handleStart} disabled={draft.participants.length < 2}>
              Start Draft{draft.participants.length < 2 ? ' (need 2+)' : ''}
            </button>
            <button className="btn-danger" onClick={handleDelete}>Delete Draft</button>
          </>
        ) : isJoined ? (
          <button className="btn-secondary" onClick={handleLeave}>Leave Draft</button>
        ) : (
          <><input aria-label="Draft invitation code" placeholder="Invitation code" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} maxLength={8} autoCapitalize="characters" /><button className="nav-btn" onClick={handleJoin}>Join Draft</button></>
        )}
      </div>
    </div>
  );
};

const LiveDraftView = ({ draft, onNavigate }) => {
  const { currentUser } = useAuth();
  const [pickText, setPickText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(null);
  const pickInputRef = useRef(null);

  const currentPick = draft.draftOrder[draft.currentPickIndex];
  const isMyTurn = currentUser && currentPick?.userId === currentUser.uid;
  const totalPicks = draft.draftOrder.length;
  const progress = Math.round((draft.currentPickIndex / totalPicks) * 100);

  // Countdown timer
  useEffect(() => {
    if (!draft.timerSeconds || !draft.currentPickDeadline) {
      setCountdown(null);
      return;
    }
    let pending = false, stopped = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((draft.currentPickDeadline.getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (!stopped && !pending && remaining <= 0 && draft.participants.some(p => p.userId === currentUser?.uid)) {
        pending = true;
        skipPick(draft.id, draft.currentPickIndex).catch(error => {
          if (!stopped && !error.code?.includes('failed-precondition')) setError('Could not advance the expired turn. Retrying…');
        }).finally(() => { pending = false; });
      }
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => { stopped = true; clearInterval(interval); };
  }, [draft.currentPickDeadline, draft.timerSeconds, draft.id, draft.currentPickIndex, currentUser?.uid]);

  // Auto-focus pick input when it's my turn
  useEffect(() => {
    if (isMyTurn && pickInputRef.current) {
      pickInputRef.current.focus();
    }
  }, [isMyTurn, draft.currentPickIndex]);

  const handleSubmitPick = async () => {
    if (!pickText.trim()) { setError('Type your pick'); return; }
    setSubmitting(true); setError('');
    try {
      await submitPick(draft.id, currentUser.uid, pickText.trim(), draft.currentPickIndex);
      setPickText('');
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !submitting) {
      e.preventDefault();
      handleSubmitPick();
    }
  };

  // Build the draft board: organized by participant
  const participantPicks = {};
  draft.participants.forEach(p => { participantPicks[p.userId] = { ...p, picks: [] }; });
  draft.picks.forEach(pick => {
    if (participantPicks[pick.userId]) {
      participantPicks[pick.userId].picks.push(pick);
    }
  });
  const sortedParticipants = [...draft.participants].sort((a, b) => a.order - b.order);

  return (
    <div className="home-container draft-live-container">
      <div className="draft-live-header">
        <h1>{draft.title}</h1>
        <div className="ranking-progress">
          <div className="ranking-progress-bar">
            <div className="ranking-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="ranking-progress-text">
            Pick {draft.currentPickIndex + 1} of {totalPicks} · Round {currentPick?.round}
          </span>
        </div>
      </div>

      {/* Current pick indicator */}
      <div className={`draft-current-pick ${isMyTurn ? 'draft-my-turn' : ''}`}>
        <div className="draft-pick-info">
          <span className="draft-pick-label">
            {isMyTurn ? "It's your turn!" : `${currentPick?.userDisplayName}'s pick`}
          </span>
          <span className="draft-pick-round">Round {currentPick?.round}, Pick {currentPick?.pickInRound}</span>
        </div>
        {countdown !== null && (
          <div className={`draft-timer ${countdown <= 10 ? 'draft-timer-urgent' : ''}`}>
            {countdown}s
          </div>
        )}
      </div>

      {/* Pick input (only shown to the current picker) */}
      {isMyTurn && (
        <div className="draft-pick-input-row">
          <input
            ref={pickInputRef}
            type="text"
            value={pickText}
            onChange={e => setPickText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your pick..."
            maxLength={100}
            disabled={submitting}
            className="draft-pick-input"
          />
          <button className="nav-btn" onClick={handleSubmitPick} disabled={submitting || !pickText.trim()}>
            {submitting ? 'Submitting...' : 'Submit Pick'}
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {/* Draft board */}
      <div className="draft-board" tabIndex={0} role="region" aria-label="Draft board, scroll horizontally to see all participants">
        <h2>Draft Board</h2>
        <div className="draft-board-grid" style={{ gridTemplateColumns: `repeat(${sortedParticipants.length}, minmax(140px, 1fr))` }}>
          {/* Header row */}
          {sortedParticipants.map(p => (
            <div key={p.userId} className={`draft-board-header ${currentPick?.userId === p.userId ? 'draft-board-active' : ''}`}>
              {p.displayName}
              <span className="draft-board-order">#{p.order + 1}</span>
            </div>
          ))}
          {/* Pick rows — transpose: iterate by round, then by participant column */}
          {Array.from({ length: draft.rounds }, (_, roundIdx) => {
            const round = roundIdx + 1;
            return sortedParticipants.map(p => {
              const pick = participantPicks[p.userId]?.picks.find(pk => pk.round === round);
              return (
                <div key={`${p.userId}-${round}`} className={`draft-board-cell ${pick?.skipped ? 'draft-board-skipped' : ''}`}>
                  {pick ? (pick.skipped ? 'Skipped' : pick.selection) : (
                    // Show "..." for future picks in current round or empty cell
                    <span className="draft-board-pending">—</span>
                  )}
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
};

const DraftResultsView = ({ draft, onNavigate }) => {
  const { currentUser } = useAuth();
  const [scores, setScores] = useState(draft.scores || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('board'); // board | scoring | leaderboard
  const isHost = currentUser && draft.hostId === currentUser.uid;

  // Update local scores when draft updates from Firestore
  useEffect(() => {
    if (draft.scores) setScores(draft.scores);
  }, [draft.scores]);

  const handleScoreChange = (pickIndex, value) => {
    setScores(prev => ({ ...prev, [pickIndex]: parseFloat(value) || 0 }));
  };

  const handleSaveScores = async () => {
    setSaving(true); setError('');
    try { await saveScores(draft.id, currentUser.uid, scores); }
    catch (e) { setError(e.message); }
    setSaving(false);
  };

  const leaderboard = computeLeaderboard({ ...draft, scores });
  const sortedParticipants = [...draft.participants].sort((a, b) => a.order - b.order);
  const participantPicks = {};
  draft.participants.forEach(p => { participantPicks[p.userId] = { ...p, picks: [] }; });
  draft.picks.forEach(pick => {
    if (participantPicks[pick.userId]) participantPicks[pick.userId].picks.push(pick);
  });

  return (
    <div className="home-container">
      <div className="pool-detail-header">
        <div className="pool-detail-title-row">
          <h1>{draft.title}</h1>
          <span className="pool-status status-completed">Completed</span>
        </div>
        <p className="pool-detail-meta">
          {draft.participants.length} participants · {draft.rounds} rounds · {draft.picks.length} picks
        </p>
      </div>

      <div className="ranking-detail-tabs">
        <button className={`ranking-tab ${activeTab === 'board' ? 'active' : ''}`}
          onClick={() => setActiveTab('board')}>Draft Board</button>
        {isHost && (
          <button className={`ranking-tab ${activeTab === 'scoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('scoring')}>Scoring</button>
        )}
        <button className={`ranking-tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}>Leaderboard</button>
      </div>

      {activeTab === 'board' && (
        <div className="draft-board" tabIndex={0} role="region" aria-label="Draft board, scroll horizontally to see all participants">
          <div className="draft-board-grid" style={{ gridTemplateColumns: `repeat(${sortedParticipants.length}, minmax(140px, 1fr))` }}>
            {sortedParticipants.map(p => (
              <div key={p.userId} className="draft-board-header">
                {p.displayName}<span className="draft-board-order">#{p.order + 1}</span>
              </div>
            ))}
            {Array.from({ length: draft.rounds }, (_, roundIdx) => {
              const round = roundIdx + 1;
              return sortedParticipants.map(p => {
                const pick = participantPicks[p.userId]?.picks.find(pk => pk.round === round);
                return (
                  <div key={`${p.userId}-${round}`} className={`draft-board-cell ${pick?.skipped ? 'draft-board-skipped' : ''}`}>
                    {pick ? (pick.skipped ? 'Skipped' : pick.selection) : '—'}
                  </div>
                );
              });
            })}
          </div>
        </div>
      )}

      {activeTab === 'scoring' && isHost && (
        <div className="draft-scoring">
          <h2>Score Each Pick</h2>
          <p className="ranking-results-sub">Assign a value to each pick. Totals auto-sum for the leaderboard.</p>
          {sortedParticipants.map(p => (
            <div key={p.userId} className="draft-scoring-participant">
              <h3>{p.displayName}</h3>
              <div className="draft-scoring-picks">
                {participantPicks[p.userId]?.picks.map(pick => (
                  <div key={pick.pickIndex} className="draft-scoring-row">
                    <span className="draft-scoring-round">R{pick.round}</span>
                    <span className="draft-scoring-selection">
                      {pick.skipped ? <em>Skipped</em> : pick.selection}
                    </span>
                    <input
                      type="number"
                      value={scores[pick.pickIndex] ?? ''}
                      onChange={e => handleScoreChange(pick.pickIndex, e.target.value)}
                      placeholder="0"
                      className="draft-score-input"
                      disabled={pick.skipped}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error && <p className="error-text">{error}</p>}
          <div className="form-actions">
            <button className="nav-btn" onClick={handleSaveScores} disabled={saving}>
              {saving ? 'Saving...' : 'Save Scores'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className="ranking-results">
          <h2>Leaderboard</h2>
          {leaderboard.length === 0 || !draft.scores ? (
            <p className="ranking-results-sub">
              {isHost ? 'Score the picks to see the leaderboard.' : 'The host hasn\'t scored the picks yet.'}
            </p>
          ) : (
            <ol className="ranking-results-list">
              {leaderboard.map((entry, idx) => (
                <li key={entry.userId} className="ranking-result-item">
                  <span className="ranking-result-rank">{idx + 1}</span>
                  <span className="ranking-result-text">{entry.displayName}</span>
                  <span className="ranking-result-score">{entry.total} pts</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
};

export { DraftCard, LobbyView, LiveDraftView, DraftResultsView };
