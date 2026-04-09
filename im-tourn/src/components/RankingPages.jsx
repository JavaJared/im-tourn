// src/components/RankingPages.jsx
//
// All the React components for the Rankings feature. This is kept as a
// separate file rather than inlined into App.jsx to keep App.jsx from
// growing further. App.jsx only needs to import the four exported pages
// and wire them into its view router.
//
// Exported components:
//   <RankingPoolsPage />       — list view, create/join entry point
//   <CreateRankingPoolPage />  — build a new ranking pool
//   <RankingPoolDetailPage />  — view a pool, start voting, see results
//   <RankingVotePage />        — head-to-head voting screen

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  createRankingPool,
  getRankingPoolById,
  getRankingPoolByJoinCode,
  getUserHostedRankingPools,
  getUserVotedRankingPools,
  getUserRankingVote,
  submitRankingVote,
  updateRankingPoolDescription,
  lockRankingPool,
  reopenRankingPool,
  deleteRankingPool,
  getRankingPoolVotes,
  parseConsensus,
  compressImageToBase64,
  MAX_RANKING_ENTRIES,
  MIN_RANKING_ENTRIES,
} from '../services/rankingService';
import {
  initSort,
  getCurrentMatchup,
  recordChoice,
  undoLastChoice,
  isComplete,
  getProgress,
  serializeState,
  deserializeState,
} from '../services/interactiveSort';

// ============================================================================
// RankingPoolsPage — list view
// ============================================================================

export const RankingPoolsPage = ({ onNavigate }) => {
  const [hostedPools, setHostedPools] = useState([]);
  const [votedPools, setVotedPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      loadPools();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const loadPools = async () => {
    try {
      const [hosted, voted] = await Promise.all([
        getUserHostedRankingPools(currentUser.uid),
        getUserVotedRankingPools(currentUser.uid),
      ]);
      setHostedPools(hosted);
      // Exclude pools the user also hosts (to avoid duplicates in the "voted" section)
      setVotedPools(voted.filter(p => p.hostId !== currentUser.uid));
    } catch (error) {
      console.error('Error loading ranking pools:', error);
    }
    setLoading(false);
  };

  const handleJoinPool = async () => {
    if (!joinCode.trim()) {
      setJoinError('Please enter a join code');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const pool = await getRankingPoolByJoinCode(joinCode.trim());
      if (!pool) {
        setJoinError('Invalid join code');
        setJoining(false);
        return;
      }
      setJoinCode('');
      onNavigate(`ranking-pool-${pool.id}`);
    } catch (error) {
      setJoinError(error.message);
    }
    setJoining(false);
  };

  const getStatusBadge = (status) => {
    const badges = {
      open: { text: 'Open', class: 'status-open' },
      locked: { text: 'Locked', class: 'status-locked' },
    };
    return badges[status] || { text: status, class: '' };
  };

  if (!currentUser) {
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>Ranking Pools</h1>
          <p>Create head-to-head rankings and discover the consensus</p>
        </div>
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p>Log in to create or join ranking pools</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading pools...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Ranking Pools</h1>
        <p>Rank anything — and see what the crowd really thinks</p>
      </div>

      <div className="pools-actions">
        <button className="nav-btn" onClick={() => onNavigate('create-ranking-pool')}>
          + Create Ranking
        </button>

        <div className="join-pool-form">
          <input
            type="text"
            placeholder="Enter join code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="join-code-input"
          />
          <button
            className="join-btn"
            onClick={handleJoinPool}
            disabled={joining}
          >
            {joining ? 'Joining...' : 'Join'}
          </button>
        </div>
        {joinError && <p className="error-text">{joinError}</p>}
      </div>

      {hostedPools.length > 0 && (
        <div className="pools-section">
          <h2>Rankings You Host</h2>
          <div className="pools-grid">
            {hostedPools.map(pool => {
              const badge = getStatusBadge(pool.status);
              return (
                <div
                  key={pool.id}
                  className="pool-card ranking-pool-card"
                  onClick={() => onNavigate(`ranking-pool-${pool.id}`)}
                >
                  <span className={`pool-status ${badge.class}`}>{badge.text}</span>
                  <h3 className="pool-title">{pool.title}</h3>
                  <p className="pool-bracket">{pool.entryCount} entries · {pool.voteCount || 0} {(pool.voteCount === 1) ? 'vote' : 'votes'}</p>
                  <div className="pool-meta">
                    <span className="pool-code">Code: {pool.joinCode}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {votedPools.length > 0 && (
        <div className="pools-section">
          <h2>Rankings You've Voted In</h2>
          <div className="pools-grid">
            {votedPools.map(pool => {
              const badge = getStatusBadge(pool.status);
              return (
                <div
                  key={pool.id}
                  className="pool-card ranking-pool-card"
                  onClick={() => onNavigate(`ranking-pool-${pool.id}`)}
                >
                  <span className={`pool-status ${badge.class}`}>{badge.text}</span>
                  <h3 className="pool-title">{pool.title}</h3>
                  <p className="pool-bracket">{pool.entryCount} entries · {pool.voteCount || 0} {(pool.voteCount === 1) ? 'vote' : 'votes'}</p>
                  <div className="pool-meta">
                    <span className="pool-host">Hosted by {pool.hostDisplayName}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hostedPools.length === 0 && votedPools.length === 0 && (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          <p>No rankings yet. Create one to get started!</p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CreateRankingPoolPage — build a new ranking pool
// ============================================================================

export const CreateRankingPoolPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [entries, setEntries] = useState([
    { id: 'new-0', text: '', imageUrl: null },
    { id: 'new-1', text: '', imageUrl: null },
    { id: 'new-2', text: '', imageUrl: null },
  ]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const fileInputRefs = useRef({});

  const addEntry = () => {
    if (entries.length >= MAX_RANKING_ENTRIES) {
      setError(`Maximum of ${MAX_RANKING_ENTRIES} entries`);
      return;
    }
    setEntries([...entries, { id: `new-${Date.now()}`, text: '', imageUrl: null }]);
  };

  const removeEntry = (index) => {
    if (entries.length <= MIN_RANKING_ENTRIES) {
      setError(`You need at least ${MIN_RANKING_ENTRIES} entries`);
      return;
    }
    setEntries(entries.filter((_, i) => i !== index));
    setError('');
  };

  const updateEntryText = (index, text) => {
    const next = [...entries];
    next[index] = { ...next[index], text };
    setEntries(next);
  };

  const handleImageSelect = async (index, file) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageToBase64(file);
      const next = [...entries];
      next[index] = { ...next[index], imageUrl: dataUrl };
      setEntries(next);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to process image');
    }
  };

  const removeImage = (index) => {
    const next = [...entries];
    next[index] = { ...next[index], imageUrl: null };
    setEntries(next);
  };

  const handleCreate = async () => {
    setError('');
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    const filled = entries.filter(e => e.text.trim());
    if (filled.length < MIN_RANKING_ENTRIES) {
      setError(`Please fill in at least ${MIN_RANKING_ENTRIES} entries`);
      return;
    }

    setCreating(true);
    try {
      const { id } = await createRankingPool(
        {
          title: title.trim(),
          description: description.trim(),
          hostId: currentUser.uid,
          hostDisplayName: currentUser.displayName || 'Anonymous',
        },
        filled
      );
      onNavigate(`ranking-pool-${id}`);
    } catch (err) {
      setError(err.message || 'Failed to create ranking pool');
      setCreating(false);
    }
  };

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Create Ranking</h1>
        <p>Add 3–{MAX_RANKING_ENTRIES} entries. Voters will sort them head-to-head.</p>
      </div>

      <div className="create-pool-form">
        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Best Pixar Movies of All Time"
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add context for voters..."
            maxLength={500}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Entries ({entries.length}/{MAX_RANKING_ENTRIES})</label>
          <div className="ranking-entries-list">
            {entries.map((entry, index) => (
              <div key={entry.id} className="ranking-entry-row">
                <span className="ranking-entry-number">{index + 1}</span>

                <div className="ranking-entry-image-slot">
                  {entry.imageUrl ? (
                    <div className="ranking-entry-thumb-wrap">
                      <img src={entry.imageUrl} alt="" className="ranking-entry-thumb" />
                      <button
                        type="button"
                        className="ranking-entry-remove-img"
                        onClick={() => removeImage(index)}
                        title="Remove image"
                      >×</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ranking-entry-add-img"
                      onClick={() => fileInputRefs.current[index]?.click()}
                      title="Add image"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </button>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    ref={el => (fileInputRefs.current[index] = el)}
                    onChange={e => {
                      handleImageSelect(index, e.target.files?.[0]);
                      e.target.value = ''; // allow same file re-selection
                    }}
                    style={{ display: 'none' }}
                  />
                </div>

                <input
                  type="text"
                  value={entry.text}
                  onChange={e => updateEntryText(index, e.target.value)}
                  placeholder={`Entry ${index + 1}`}
                  maxLength={80}
                  className="ranking-entry-text"
                />

                <button
                  type="button"
                  className="ranking-entry-delete"
                  onClick={() => removeEntry(index)}
                  title="Remove entry"
                  disabled={entries.length <= MIN_RANKING_ENTRIES}
                >×</button>
              </div>
            ))}
          </div>

          {entries.length < MAX_RANKING_ENTRIES && (
            <button type="button" className="ranking-add-entry-btn" onClick={addEntry}>
              + Add Entry
            </button>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate('ranking-pools')}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nav-btn"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Ranking'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// RankingPoolDetailPage — view a pool, start voting, see results
// ============================================================================

export const RankingPoolDetailPage = ({ poolId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [pool, setPool] = useState(null);
  const [userVote, setUserVote] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // info | personal | consensus
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [error, setError] = useState('');

  const isHost = pool && currentUser && pool.hostId === currentUser.uid;
  const hasVoted = userVote !== null;

  const loadPool = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getRankingPoolById(poolId);
      if (!p) {
        setError('Pool not found');
        setLoading(false);
        return;
      }
      setPool(p);
      setDraftDescription(p.description || '');

      if (currentUser) {
        const vote = await getUserRankingVote(poolId, currentUser.uid);
        setUserVote(vote);
      }

      // Load all votes for the vote count display (host view mostly)
      const allVotes = await getRankingPoolVotes(poolId);
      setVotes(allVotes);
    } catch (err) {
      setError(err.message || 'Failed to load pool');
    }
    setLoading(false);
  }, [poolId, currentUser]);

  useEffect(() => { loadPool(); }, [loadPool]);

  const handleSaveDescription = async () => {
    try {
      await updateRankingPoolDescription(poolId, currentUser.uid, draftDescription);
      setPool({ ...pool, description: draftDescription });
      setEditingDescription(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLock = async () => {
    try {
      await lockRankingPool(poolId, currentUser.uid);
      setPool({ ...pool, status: 'locked' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReopen = async () => {
    try {
      await reopenRankingPool(poolId, currentUser.uid);
      setPool({ ...pool, status: 'open' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this ranking pool? This cannot be undone.')) return;
    try {
      await deleteRankingPool(poolId, currentUser.uid);
      onNavigate('ranking-pools');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading ranking...</p>
        </div>
      </div>
    );
  }

  if (error && !pool) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <p>{error}</p>
          <button className="nav-btn" onClick={() => onNavigate('ranking-pools')}>Back</button>
        </div>
      </div>
    );
  }

  if (!pool) return null;

  const entryMap = new Map(pool.entries.map(e => [e.id, e]));
  const consensus = parseConsensus(pool);

  return (
    <div className="home-container">
      <div className="pool-detail-header">
        <div className="pool-detail-title-row">
          <h1>{pool.title}</h1>
          <span className={`pool-status ${pool.status === 'open' ? 'status-open' : 'status-locked'}`}>
            {pool.status === 'open' ? 'Open' : 'Locked'}
          </span>
        </div>
        <p className="pool-detail-meta">
          Hosted by {pool.hostDisplayName} · {pool.entryCount} entries · {pool.voteCount || 0} {(pool.voteCount === 1) ? 'vote' : 'votes'} · Code: <strong>{pool.joinCode}</strong>
        </p>

        {editingDescription ? (
          <div className="description-edit">
            <textarea
              value={draftDescription}
              onChange={e => setDraftDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
            <div className="description-edit-actions">
              <button className="btn-secondary" onClick={() => {
                setDraftDescription(pool.description || '');
                setEditingDescription(false);
              }}>Cancel</button>
              <button className="nav-btn" onClick={handleSaveDescription}>Save</button>
            </div>
          </div>
        ) : (
          <div className="pool-description-block">
            {pool.description ? (
              <p className="pool-description">{pool.description}</p>
            ) : (
              isHost && <p className="pool-description-empty">No description yet.</p>
            )}
            {isHost && (
              <button
                className="description-edit-btn"
                onClick={() => setEditingDescription(true)}
              >
                {pool.description ? 'Edit' : 'Add description'}
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="ranking-detail-tabs">
        <button
          className={`ranking-tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Entries
        </button>
        <button
          className={`ranking-tab ${activeTab === 'personal' ? 'active' : ''}`}
          onClick={() => setActiveTab('personal')}
          disabled={!hasVoted}
          title={!hasVoted ? 'Submit your ranking to see this' : ''}
        >
          Your Ranking {!hasVoted && '🔒'}
        </button>
        <button
          className={`ranking-tab ${activeTab === 'consensus' ? 'active' : ''}`}
          onClick={() => setActiveTab('consensus')}
          disabled={!hasVoted}
          title={!hasVoted ? 'Submit your ranking to see this' : ''}
        >
          Consensus {!hasVoted && '🔒'}
        </button>
      </div>

      {activeTab === 'info' && (
        <div className="ranking-entries-display">
          <div className="ranking-entries-grid">
            {pool.entries.map((entry, idx) => (
              <div key={entry.id} className="ranking-entry-display">
                {entry.imageUrl && (
                  <img src={entry.imageUrl} alt={entry.text} className="ranking-entry-display-img" />
                )}
                <div className="ranking-entry-display-text">{entry.text}</div>
              </div>
            ))}
          </div>

          <div className="ranking-vote-cta">
            {!currentUser ? (
              <p>Log in to vote on this ranking</p>
            ) : pool.status !== 'open' ? (
              <p>This pool is locked and no longer accepting votes.</p>
            ) : hasVoted ? (
              <div>
                <p>✓ You've submitted your ranking.</p>
                <button className="nav-btn" onClick={() => onNavigate(`ranking-vote-${poolId}`)}>
                  Vote Again
                </button>
              </div>
            ) : (
              <button
                className="nav-btn ranking-start-btn"
                onClick={() => onNavigate(`ranking-vote-${poolId}`)}
              >
                Start Ranking →
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'personal' && userVote && (
        <div className="ranking-results">
          <h2>Your Ranking</h2>
          <p className="ranking-results-sub">
            Based on {userVote.comparisonsMade} head-to-head comparisons
          </p>
          <ol className="ranking-results-list">
            {userVote.ranking.map((entryId, idx) => {
              const entry = entryMap.get(entryId);
              if (!entry) return null;
              return (
                <li key={entryId} className="ranking-result-item">
                  <span className="ranking-result-rank">{idx + 1}</span>
                  {entry.imageUrl && (
                    <img src={entry.imageUrl} alt="" className="ranking-result-img" />
                  )}
                  <span className="ranking-result-text">{entry.text}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {activeTab === 'consensus' && (
        <div className="ranking-results">
          <h2>Consensus Ranking</h2>
          <p className="ranking-results-sub">
            Combined from {pool.voteCount || 0} {(pool.voteCount === 1) ? 'voter' : 'voters'} using Borda count
          </p>
          {consensus.length === 0 ? (
            <p className="empty-state">No votes yet. Be the first!</p>
          ) : (
            <ol className="ranking-results-list">
              {consensus.map((item, idx) => {
                const entry = entryMap.get(item.id);
                if (!entry) return null;
                return (
                  <li key={item.id} className="ranking-result-item">
                    <span className="ranking-result-rank">{idx + 1}</span>
                    {entry.imageUrl && (
                      <img src={entry.imageUrl} alt="" className="ranking-result-img" />
                    )}
                    <span className="ranking-result-text">{entry.text}</span>
                    <span className="ranking-result-score">{item.score} pts</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {isHost && (
        <div className="ranking-host-controls">
          <h3>Host Controls</h3>
          <div className="ranking-host-buttons">
            {pool.status === 'open' ? (
              <button className="btn-secondary" onClick={handleLock}>Lock Pool</button>
            ) : (
              <button className="btn-secondary" onClick={handleReopen}>Reopen Pool</button>
            )}
            <button className="btn-danger" onClick={handleDelete}>Delete Pool</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// RankingVotePage — the head-to-head voting screen
// ============================================================================

export const RankingVotePage = ({ poolId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [pool, setPool] = useState(null);
  const [sortState, setSortState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [animating, setAnimating] = useState(null); // 'a' | 'b' | null

  const storageKey = currentUser ? `ranking_sort_${poolId}_${currentUser.uid}` : null;

  // Load pool and check for saved state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getRankingPoolById(poolId);
        if (cancelled) return;
        if (!p) {
          setError('Pool not found');
          setLoading(false);
          return;
        }
        setPool(p);

        // Try to resume a saved sort state
        if (storageKey) {
          const saved = localStorage.getItem(storageKey);
          if (saved) {
            const restored = deserializeState(saved);
            // Validate that the saved state matches current entries
            const entryIds = new Set(p.entries.map(e => e.id));
            const savedIds = new Set();
            restored?.runs?.forEach(r => r.forEach(id => savedIds.add(id)));
            if (restored?.currentMerge) {
              restored.currentMerge.left.forEach(id => savedIds.add(id));
              restored.currentMerge.right.forEach(id => savedIds.add(id));
            }
            restored?.finalRanking?.forEach(id => savedIds.add(id));

            const matches = savedIds.size === entryIds.size &&
              [...savedIds].every(id => entryIds.has(id));

            if (matches && restored) {
              setShowResumePrompt(true);
              setSortState(restored);
              setLoading(false);
              return;
            } else {
              // Saved state is stale — clear it
              localStorage.removeItem(storageKey);
            }
          }
        }

        // Start fresh
        const entryIds = p.entries.map(e => e.id);
        setSortState(initSort(entryIds));
      } catch (err) {
        setError(err.message || 'Failed to load');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, currentUser]);

  // Persist sort state on every change
  useEffect(() => {
    if (sortState && storageKey && !isComplete(sortState)) {
      localStorage.setItem(storageKey, serializeState(sortState));
    }
  }, [sortState, storageKey]);

  const handleChoice = useCallback((choice) => {
    if (!sortState || animating) return;
    setAnimating(choice);
    // Small delay to let the selection animation play
    setTimeout(() => {
      setSortState(prev => recordChoice(prev, choice));
      setAnimating(null);
    }, 180);
  }, [sortState, animating]);

  const handleUndo = () => {
    if (!sortState) return;
    setSortState(undoLastChoice(sortState));
  };

  const handleRestart = () => {
    if (!pool) return;
    if (!window.confirm('Restart from the beginning? Your progress will be lost.')) return;
    if (storageKey) localStorage.removeItem(storageKey);
    const entryIds = pool.entries.map(e => e.id);
    setSortState(initSort(entryIds));
    setShowResumePrompt(false);
  };

  const handleDismissResume = () => {
    setShowResumePrompt(false);
  };

  const handleResumeStartFresh = () => {
    if (storageKey) localStorage.removeItem(storageKey);
    const entryIds = pool.entries.map(e => e.id);
    setSortState(initSort(entryIds));
    setShowResumePrompt(false);
  };

  const handleSubmit = async () => {
    if (!sortState || !isComplete(sortState)) return;
    setSubmitting(true);
    setError('');
    try {
      await submitRankingVote(
        poolId,
        currentUser.uid,
        currentUser.displayName || 'Anonymous',
        sortState.finalRanking,
        sortState.comparisonsMade
      );
      // Clear saved state
      if (storageKey) localStorage.removeItem(storageKey);
      onNavigate(`ranking-pool-${poolId}`);
    } catch (err) {
      setError(err.message || 'Failed to submit');
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts: ← chooses a, → chooses b
  useEffect(() => {
    const onKey = (e) => {
      if (!sortState || isComplete(sortState) || animating) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleChoice('a'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleChoice('b'); }
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortState, animating]);

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading ranking...</p>
        </div>
      </div>
    );
  }

  if (error && !pool) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <p>{error}</p>
          <button className="nav-btn" onClick={() => onNavigate('ranking-pools')}>Back</button>
        </div>
      </div>
    );
  }

  if (!pool || !sortState) return null;

  if (!currentUser) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <p>Log in to vote on this ranking</p>
        </div>
      </div>
    );
  }

  // Show resume prompt
  if (showResumePrompt) {
    const progress = Math.round(getProgress(sortState) * 100);
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>{pool.title}</h1>
        </div>
        <div className="ranking-resume-prompt">
          <h2>Welcome back!</h2>
          <p>You have a saved ranking in progress ({progress}% complete, {sortState.comparisonsMade} comparisons made).</p>
          <div className="ranking-resume-actions">
            <button className="btn-secondary" onClick={handleResumeStartFresh}>Start Over</button>
            <button className="nav-btn" onClick={handleDismissResume}>Resume</button>
          </div>
        </div>
      </div>
    );
  }

  // Completion screen
  if (isComplete(sortState)) {
    const entryMap = new Map(pool.entries.map(e => [e.id, e]));
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>{pool.title}</h1>
          <p>Your final ranking — review before submitting</p>
        </div>

        <ol className="ranking-results-list">
          {sortState.finalRanking.map((entryId, idx) => {
            const entry = entryMap.get(entryId);
            if (!entry) return null;
            return (
              <li key={entryId} className="ranking-result-item">
                <span className="ranking-result-rank">{idx + 1}</span>
                {entry.imageUrl && (
                  <img src={entry.imageUrl} alt="" className="ranking-result-img" />
                )}
                <span className="ranking-result-text">{entry.text}</span>
              </li>
            );
          })}
        </ol>

        {error && <p className="error-text">{error}</p>}

        <div className="ranking-submit-bar">
          <button className="btn-secondary" onClick={handleRestart} disabled={submitting}>
            Start Over
          </button>
          <button className="nav-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Ranking'}
          </button>
        </div>
      </div>
    );
  }

  // Voting screen
  const matchup = getCurrentMatchup(sortState);
  if (!matchup) return null;

  const entryMap = new Map(pool.entries.map(e => [e.id, e]));
  const entryA = entryMap.get(matchup.a);
  const entryB = entryMap.get(matchup.b);
  const progress = Math.round(getProgress(sortState) * 100);

  return (
    <div className="home-container ranking-vote-container">
      <div className="ranking-vote-header">
        <h1>{pool.title}</h1>
        <div className="ranking-progress">
          <div className="ranking-progress-bar">
            <div className="ranking-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="ranking-progress-text">
            Matchup {sortState.comparisonsMade + 1} · {progress}%
          </span>
        </div>
      </div>

      <div className="ranking-matchup">
        <button
          className={`ranking-card ${animating === 'a' ? 'ranking-card-chosen' : ''} ${animating === 'b' ? 'ranking-card-fading' : ''}`}
          onClick={() => handleChoice('a')}
          disabled={!!animating}
        >
          {entryA?.imageUrl && (
            <img src={entryA.imageUrl} alt="" className="ranking-card-img" />
          )}
          <div className="ranking-card-text">{entryA?.text}</div>
        </button>

        <div className="ranking-vs">VS</div>

        <button
          className={`ranking-card ${animating === 'b' ? 'ranking-card-chosen' : ''} ${animating === 'a' ? 'ranking-card-fading' : ''}`}
          onClick={() => handleChoice('b')}
          disabled={!!animating}
        >
          {entryB?.imageUrl && (
            <img src={entryB.imageUrl} alt="" className="ranking-card-img" />
          )}
          <div className="ranking-card-text">{entryB?.text}</div>
        </button>
      </div>

      <div className="ranking-vote-controls">
        <button
          className="btn-secondary"
          onClick={handleUndo}
          disabled={sortState.history.length === 0 || !!animating}
        >
          ← Undo
        </button>
        <span className="ranking-hint">Use ← → to pick · ⌘Z to undo</span>
        <button
          className="btn-secondary"
          onClick={() => onNavigate(`ranking-pool-${poolId}`)}
        >
          Save & Exit
        </button>
      </div>
    </div>
  );
};
