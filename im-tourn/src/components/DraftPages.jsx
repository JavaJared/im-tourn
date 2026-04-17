// src/components/DraftPages.jsx
//
// All React components for the live Drafts feature.
//
// Exported components:
//   <DraftsBrowsePage />   — public list of all drafts
//   <CreateDraftPage />    — create a new draft
//   <DraftLobbyPage />     — waiting room + live draft + results (state-driven)
//   <MyDraftsPage />       — profile view: created / joined tabs

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  createDraft,
  getDraftById,
  getDraftByJoinCode,
  getAllDrafts,
  getUserCreatedDrafts,
  getUserJoinedDrafts,
  joinDraft,
  leaveDraft,
  kickParticipant,
  startDraft,
  submitPick,
  skipPick,
  saveScores,
  computeLeaderboard,
  subscribeToDraft,
  updateDraftDescription,
  deleteDraft,
  TIMER_OPTIONS,
  MAX_PARTICIPANTS,
  MAX_ROUNDS,
} from '../services/draftService';

// ============================================================================
// Shared: card component for browse and profile
// ============================================================================

const DraftCard = ({ draft, onClick }) => {
  const statusLabels = { open: 'Open', drafting: 'Live', completed: 'Completed' };
  const statusClasses = { open: 'status-open', drafting: 'status-live', completed: 'status-completed' };
  return (
    <div className="draft-browse-card" onClick={onClick}>
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

// ============================================================================
// DraftsBrowsePage — public list
// ============================================================================

export const DraftsBrowsePage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => { loadDrafts(); }, []);
  const loadDrafts = async () => {
    try { setDrafts(await getAllDrafts()); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const filtered = drafts
    .filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'popular') {
        const cmp = (b.participantCount || 0) - (a.participantCount || 0);
        if (cmp !== 0) return cmp;
      }
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const handleJoin = async () => {
    if (!joinCode.trim()) { setJoinError('Please enter a join code'); return; }
    setJoining(true); setJoinError('');
    try {
      const draft = await getDraftByJoinCode(joinCode.trim());
      if (!draft) { setJoinError('Invalid join code'); setJoining(false); return; }
      if (currentUser && draft.status === 'open') {
        const alreadyIn = draft.participants?.some(p => p.userId === currentUser.uid);
        if (!alreadyIn) {
          await joinDraft(draft.id, currentUser.uid, currentUser.displayName || 'Anonymous');
        }
      }
      setJoinCode('');
      onNavigate(`draft-${draft.id}`);
    } catch (e) { setJoinError(e.message); }
    setJoining(false);
  };

  return (
    <div className="home-container">
      <div className="hero">
        <h1>LIVE <span>DRAFTS</span></h1>
        <p>Create a draft room, invite friends, pick in real-time — just like the pros.</p>
        {!currentUser && <p className="hero-cta">Sign up to create or join a draft!</p>}
      </div>
      <div className="section-title">BROWSE DRAFTS</div>
      <div className="filter-bar">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input type="text" placeholder="Search drafts..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} className="search-input" />
        </div>
        <div className="ranking-sort-toggle">
          <button className={sortBy === 'newest' ? 'active' : ''} onClick={() => setSortBy('newest')}>Newest</button>
          <button className={sortBy === 'popular' ? 'active' : ''} onClick={() => setSortBy('popular')}>Popular</button>
        </div>
      </div>

      {currentUser && (
        <div className="draft-browse-actions">
          <button className="nav-btn" onClick={() => onNavigate('create-draft')}>+ Create Draft</button>
          <div className="join-pool-form">
            <input type="text" placeholder="Enter join code" value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} className="join-code-input" />
            <button className="join-btn" onClick={handleJoin} disabled={joining}>
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
          {joinError && <p className="error-text">{joinError}</p>}
        </div>
      )}

      {loading ? (
        <div className="loading-state"><div className="spinner"></div><p>Loading drafts...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
          <p>{drafts.length === 0 ? 'No drafts yet. Create one to get started!' : 'No drafts match your search.'}</p>
        </div>
      ) : (
        <div className="draft-browse-grid">
          {filtered.map(d => <DraftCard key={d.id} draft={d} onClick={() => onNavigate(`draft-${d.id}`)} />)}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CreateDraftPage
// ============================================================================

export const CreateDraftPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [rounds, setRounds] = useState(3);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) { setError('Please enter a title'); return; }
    if (rounds < 1 || rounds > MAX_ROUNDS) { setError(`Rounds must be 1–${MAX_ROUNDS}`); return; }
    setCreating(true); setError('');
    try {
      const { id } = await createDraft({
        title: title.trim(), description: description.trim(),
        category: category.trim(), rounds,
        timerSeconds, hostId: currentUser.uid,
        hostDisplayName: currentUser.displayName || 'Anonymous',
      });
      onNavigate(`draft-${id}`);
    } catch (e) { setError(e.message); setCreating(false); }
  };

  return (
    <div className="home-container">
      <div className="page-header"><h1>Create Draft</h1><p>Set up a live snake draft for your group.</p></div>
      <div className="create-pool-form">
        <div className="form-group">
          <label>Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder='e.g. "Oscar 2027 Winners"' maxLength={100} />
        </div>
        <div className="form-group">
          <label>Category (optional)</label>
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Movies, Sports, Music" maxLength={40} />
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Rules, context, or notes for participants..." maxLength={500} rows={3} />
        </div>
        <div className="draft-settings-row">
          <div className="form-group">
            <label>Rounds</label>
            <input type="number" value={rounds} onChange={e => setRounds(parseInt(e.target.value) || 1)}
              min={1} max={MAX_ROUNDS} className="draft-number-input" />
          </div>
          <div className="form-group">
            <label>Pick Timer</label>
            <select value={timerSeconds} onChange={e => setTimerSeconds(parseInt(e.target.value))}
              className="filter-select">
              {TIMER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button className="btn-secondary" onClick={() => onNavigate('drafts')} disabled={creating}>Cancel</button>
          <button className="nav-btn" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DraftLobbyPage — this is the main draft page. It renders the lobby,
// live draft, or results view based on draft.status. Uses onSnapshot
// for real-time updates throughout.
// ============================================================================

export const DraftLobbyPage = ({ draftId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Real-time subscription
  useEffect(() => {
    const unsub = subscribeToDraft(
      draftId,
      (d) => { setDraft(d); setLoading(false); },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [draftId]);

  if (loading) return <div className="home-container"><div className="loading-state"><div className="spinner"></div><p>Loading draft...</p></div></div>;
  if (error && !draft) return <div className="home-container"><div className="empty-state"><p>{error}</p><button className="nav-btn" onClick={() => onNavigate('drafts')}>Back</button></div></div>;
  if (!draft) return <div className="home-container"><div className="empty-state"><p>Draft not found.</p><button className="nav-btn" onClick={() => onNavigate('drafts')}>Back</button></div></div>;

  if (draft.status === 'open') return <LobbyView draft={draft} onNavigate={onNavigate} />;
  if (draft.status === 'drafting') return <LiveDraftView draft={draft} onNavigate={onNavigate} />;
  if (draft.status === 'completed') return <DraftResultsView draft={draft} onNavigate={onNavigate} />;

  return null;
};

// ---------- Lobby View ----------

const LobbyView = ({ draft, onNavigate }) => {
  const { currentUser } = useAuth();
  const [actionError, setActionError] = useState('');
  const isHost = currentUser && draft.hostId === currentUser.uid;
  const isJoined = draft.participants.some(p => p.userId === currentUser?.uid);

  const handleJoin = async () => {
    setActionError('');
    try { await joinDraft(draft.id, currentUser.uid, currentUser.displayName || 'Anonymous'); }
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
          Code: <strong>{draft.joinCode}</strong>
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
          <button className="nav-btn" onClick={handleJoin}>Join Draft</button>
        )}
      </div>
    </div>
  );
};

// ---------- Live Draft View ----------

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
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((draft.currentPickDeadline.getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        // Timer expired — attempt auto-skip (only the current picker's client tries first)
        if (isMyTurn) {
          skipPick(draft.id).catch(() => {}); // errors are fine, another client may beat us
        } else {
          // If picker hasn't skipped after 3s grace, any client skips
          setTimeout(() => {
            skipPick(draft.id).catch(() => {});
          }, 3000);
        }
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [draft.currentPickDeadline, draft.timerSeconds, draft.id, isMyTurn]);

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
      await submitPick(draft.id, currentUser.uid, pickText.trim());
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
      <div className="draft-board">
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

// ---------- Results View ----------

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
        <div className="draft-board">
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

// ============================================================================
// MyDraftsPage — profile view
// ============================================================================

export const MyDraftsPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [created, setCreated] = useState([]);
  const [joined, setJoined] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('created');

  useEffect(() => {
    if (currentUser) loadAll(); else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const loadAll = async () => {
    try {
      const [c, j] = await Promise.all([
        getUserCreatedDrafts(currentUser.uid),
        getUserJoinedDrafts(currentUser.uid),
      ]);
      setCreated(c); setJoined(j);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (!currentUser) return <div className="home-container"><div className="page-header"><h1>My Drafts</h1></div><div className="empty-state"><p>Log in to see your drafts</p></div></div>;
  if (loading) return <div className="home-container"><div className="loading-state"><div className="spinner"></div><p>Loading...</p></div></div>;

  const list = activeTab === 'created' ? created : joined;
  return (
    <div className="home-container">
      <div className="page-header"><h1>My Drafts</h1><p>Drafts you've created and joined</p></div>
      <div className="ranking-detail-tabs">
        <button className={`ranking-tab ${activeTab === 'created' ? 'active' : ''}`} onClick={() => setActiveTab('created')}>Created ({created.length})</button>
        <button className={`ranking-tab ${activeTab === 'joined' ? 'active' : ''}`} onClick={() => setActiveTab('joined')}>Joined ({joined.length})</button>
      </div>
      {list.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
          {activeTab === 'created' ? (
            <><p>You haven't created any drafts yet.</p><button className="nav-btn" onClick={() => onNavigate('create-draft')} style={{ marginTop: '1rem' }}>Create Your First Draft</button></>
          ) : (
            <><p>You haven't joined any drafts yet.</p><button className="nav-btn" onClick={() => onNavigate('drafts')} style={{ marginTop: '1rem' }}>Browse Drafts</button></>
          )}
        </div>
      ) : (
        <div className="draft-browse-grid">
          {list.map(d => <DraftCard key={d.id} draft={d} onClick={() => onNavigate(`draft-${d.id}`)} />)}
        </div>
      )}
    </div>
  );
};
