// src/components/RankingPages.jsx
//
// All the React components for the Rankings feature.
//
// Exported components:
//   <RankingsBrowsePage />     — public list of all rankings (the main entry point)
//   <CreateRankingPage />      — build a new ranking
//   <RankingDetailPage />      — view a ranking, start voting, see results
//   <RankingVotePage />        — head-to-head voting screen
//   <MyRankingsPage />         — profile view: tabs for Created / Voted In

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  createRanking,
  getRankingById,
  getAllRankings,
  getUserCreatedRankings,
  getUserVotedRankings,
  getUserRankingVote,
  submitRankingVote,
  updateRankingDescription,
  closeRanking,
  reopenRanking,
  deleteRanking,
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
// Shared: card component used in browse and profile views
// ============================================================================

const RankingCard = ({ ranking, onClick }) => {
  const isClosed = ranking.status === 'closed';
  return (
    <div className="ranking-browse-card" onClick={onClick}>
      {isClosed && <span className="ranking-card-closed-badge">Closed</span>}
      {ranking.category && <span className="ranking-card-category">{ranking.category}</span>}
      <h3 className="ranking-card-title">{ranking.title}</h3>
      {ranking.description && (
        <p className="ranking-card-description">{ranking.description}</p>
      )}
      <div className="ranking-card-meta">
        <span className="ranking-card-stats">
          {ranking.entryCount} entries · {ranking.voteCount || 0} {(ranking.voteCount === 1) ? 'vote' : 'votes'}
        </span>
        <span className="ranking-card-host">by {ranking.hostDisplayName}</span>
      </div>
    </div>
  );
};

// ============================================================================
// RankingsBrowsePage — public list, the main entry point from the nav
// ============================================================================

export const RankingsBrowsePage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest | popular

  useEffect(() => {
    loadRankings();
  }, []);

  const loadRankings = async () => {
    try {
      const data = await getAllRankings();
      setRankings(data);
    } catch (error) {
      console.error('Error loading rankings:', error);
    }
    setLoading(false);
  };

  const categories = [...new Set(rankings.map(r => r.category).filter(Boolean))].sort();

  const filtered = rankings
    .filter(r => {
      const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || r.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'popular') {
        // Sort by vote count desc; tiebreak on newest
        const voteCmp = (b.voteCount || 0) - (a.voteCount || 0);
        if (voteCmp !== 0) return voteCmp;
      }
      // Default / fallback: newest first
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSortBy('newest');
  };

  const hasActiveFilters = searchTerm || selectedCategory || sortBy !== 'newest';

  return (
    <div className="home-container">
      <div className="hero">
        <h1>RANK <span>ANYTHING</span></h1>
        <p>Create a list, let the crowd sort it head-to-head, and discover the consensus.</p>
        {!currentUser && (
          <p className="hero-cta">Sign up to create and vote on rankings!</p>
        )}
      </div>

      <div className="section-title">BROWSE RANKINGS</div>

      {/* Filter / sort bar — mirrors the brackets browse layout */}
      <div className="filter-bar">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search rankings..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        {categories.length > 0 && (
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        <div className="ranking-sort-toggle">
          <button
            className={sortBy === 'newest' ? 'active' : ''}
            onClick={() => setSortBy('newest')}
          >
            Newest
          </button>
          <button
            className={sortBy === 'popular' ? 'active' : ''}
            onClick={() => setSortBy('popular')}
          >
            Popular
          </button>
        </div>

        {hasActiveFilters && (
          <button className="clear-filters-btn" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {currentUser && (
        <div className="ranking-browse-actions">
          <button className="nav-btn" onClick={() => onNavigate('create-ranking')}>
            + Create Ranking
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading rankings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          {rankings.length === 0 ? (
            <>
              <p>No rankings yet. Be the first to create one!</p>
              {currentUser && (
                <button className="nav-btn" onClick={() => onNavigate('create-ranking')} style={{ marginTop: '1rem' }}>
                  Create the First Ranking
                </button>
              )}
            </>
          ) : (
            <p>No rankings match your filters.</p>
          )}
        </div>
      ) : (
        <div className="ranking-browse-grid">
          {filtered.map(r => (
            <RankingCard
              key={r.id}
              ranking={r}
              onClick={() => onNavigate(`ranking-${r.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CreateRankingPage — build a new ranking
// ============================================================================

export const CreateRankingPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
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
      const { id } = await createRanking(
        {
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          hostId: currentUser.uid,
          hostDisplayName: currentUser.displayName || 'Anonymous',
        },
        filled
      );
      onNavigate(`ranking-${id}`);
    } catch (err) {
      setError(err.message || 'Failed to create ranking');
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
          <label>Category (optional)</label>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Movies, Music, Sports"
            maxLength={40}
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
                      e.target.value = '';
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
            onClick={() => onNavigate('rankings')}
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
// RankingDetailPage — view a ranking, start voting, see results
// ============================================================================

export const RankingDetailPage = ({ rankingId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [ranking, setRanking] = useState(null);
  const [userVote, setUserVote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // info | personal | consensus
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [error, setError] = useState('');

  const isHost = ranking && currentUser && ranking.hostId === currentUser.uid;
  const hasVoted = userVote !== null;
  const isClosed = ranking?.status === 'closed';

  const loadRanking = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getRankingById(rankingId);
      if (!r) {
        setError('Ranking not found');
        setLoading(false);
        return;
      }
      setRanking(r);
      setDraftDescription(r.description || '');

      if (currentUser) {
        const vote = await getUserRankingVote(rankingId, currentUser.uid);
        setUserVote(vote);
      }
    } catch (err) {
      setError(err.message || 'Failed to load ranking');
    }
    setLoading(false);
  }, [rankingId, currentUser]);

  useEffect(() => { loadRanking(); }, [loadRanking]);

  const handleSaveDescription = async () => {
    try {
      await updateRankingDescription(rankingId, currentUser.uid, draftDescription);
      setRanking({ ...ranking, description: draftDescription });
      setEditingDescription(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClose = async () => {
    try {
      await closeRanking(rankingId, currentUser.uid);
      setRanking({ ...ranking, status: 'closed' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReopen = async () => {
    try {
      await reopenRanking(rankingId, currentUser.uid);
      setRanking({ ...ranking, status: 'open' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this ranking? This cannot be undone.')) return;
    try {
      await deleteRanking(rankingId, currentUser.uid);
      onNavigate('rankings');
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

  if (error && !ranking) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <p>{error}</p>
          <button className="nav-btn" onClick={() => onNavigate('rankings')}>Back to Rankings</button>
        </div>
      </div>
    );
  }

  if (!ranking) return null;

  const entryMap = new Map(ranking.entries.map(e => [e.id, e]));
  const consensus = parseConsensus(ranking);

  return (
    <div className="home-container">
      <div className="pool-detail-header">
        <div className="pool-detail-title-row">
          <h1>{ranking.title}</h1>
          {isClosed && (
            <span className="pool-status status-locked">Closed</span>
          )}
        </div>
        <p className="pool-detail-meta">
          by {ranking.hostDisplayName} · {ranking.entryCount} entries · {ranking.voteCount || 0} {(ranking.voteCount === 1) ? 'vote' : 'votes'}
          {ranking.category && <> · {ranking.category}</>}
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
                setDraftDescription(ranking.description || '');
                setEditingDescription(false);
              }}>Cancel</button>
              <button className="nav-btn" onClick={handleSaveDescription}>Save</button>
            </div>
          </div>
        ) : (
          <div className="pool-description-block">
            {ranking.description ? (
              <p className="pool-description">{ranking.description}</p>
            ) : (
              isHost && <p className="pool-description-empty">No description yet.</p>
            )}
            {isHost && (
              <button
                className="description-edit-btn"
                onClick={() => setEditingDescription(true)}
              >
                {ranking.description ? 'Edit' : 'Add description'}
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
            {ranking.entries.map((entry) => (
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
            ) : isClosed ? (
              <p>This ranking is closed and no longer accepting votes.</p>
            ) : hasVoted ? (
              <div>
                <p>✓ You've submitted your ranking.</p>
                <button className="nav-btn" onClick={() => onNavigate(`ranking-vote-${rankingId}`)}>
                  Vote Again
                </button>
              </div>
            ) : (
              <button
                className="nav-btn ranking-start-btn"
                onClick={() => onNavigate(`ranking-vote-${rankingId}`)}
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
            Combined from {ranking.voteCount || 0} {(ranking.voteCount === 1) ? 'voter' : 'voters'} using Borda count
          </p>
          {consensus.length === 0 ? (
            <p className="empty-state">No votes yet. Be the first!</p>
          ) : (
            <ol className="ranking-results-list">
              {consensus.map((item) => {
                const entry = entryMap.get(item.id);
                if (!entry) return null;
                const idx = consensus.indexOf(item);
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
          <h3>Creator Controls</h3>
          <div className="ranking-host-buttons">
            {!isClosed ? (
              <button className="btn-secondary" onClick={handleClose}>Close Ranking</button>
            ) : (
              <button className="btn-secondary" onClick={handleReopen}>Reopen Ranking</button>
            )}
            <button className="btn-danger" onClick={handleDelete}>Delete Ranking</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// RankingVotePage — the head-to-head voting screen
// ============================================================================

export const RankingVotePage = ({ rankingId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [ranking, setRanking] = useState(null);
  const [sortState, setSortState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [animating, setAnimating] = useState(null); // 'a' | 'b' | null

  const storageKey = currentUser ? `ranking_sort_${rankingId}_${currentUser.uid}` : null;

  // Load ranking and check for saved state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getRankingById(rankingId);
        if (cancelled) return;
        if (!r) {
          setError('Ranking not found');
          setLoading(false);
          return;
        }
        setRanking(r);

        // Try to resume a saved sort state
        if (storageKey) {
          const saved = localStorage.getItem(storageKey);
          if (saved) {
            const restored = deserializeState(saved);
            // Validate that the saved state matches current entries
            const entryIds = new Set(r.entries.map(e => e.id));
            const savedIds = new Set();
            restored?.runs?.forEach(run => run.forEach(id => savedIds.add(id)));
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
              localStorage.removeItem(storageKey);
            }
          }
        }

        // Start fresh
        const entryIds = r.entries.map(e => e.id);
        setSortState(initSort(entryIds));
      } catch (err) {
        setError(err.message || 'Failed to load');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingId, currentUser]);

  // Persist sort state on every change
  useEffect(() => {
    if (sortState && storageKey && !isComplete(sortState)) {
      localStorage.setItem(storageKey, serializeState(sortState));
    }
  }, [sortState, storageKey]);

  const handleChoice = useCallback((choice) => {
    if (!sortState || animating) return;
    setAnimating(choice);
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
    if (!ranking) return;
    if (!window.confirm('Restart from the beginning? Your progress will be lost.')) return;
    if (storageKey) localStorage.removeItem(storageKey);
    const entryIds = ranking.entries.map(e => e.id);
    setSortState(initSort(entryIds));
    setShowResumePrompt(false);
  };

  const handleDismissResume = () => {
    setShowResumePrompt(false);
  };

  const handleResumeStartFresh = () => {
    if (storageKey) localStorage.removeItem(storageKey);
    const entryIds = ranking.entries.map(e => e.id);
    setSortState(initSort(entryIds));
    setShowResumePrompt(false);
  };

  const handleSubmit = async () => {
    if (!sortState || !isComplete(sortState)) return;
    setSubmitting(true);
    setError('');
    try {
      await submitRankingVote(
        rankingId,
        currentUser.uid,
        currentUser.displayName || 'Anonymous',
        sortState.finalRanking,
        sortState.comparisonsMade
      );
      if (storageKey) localStorage.removeItem(storageKey);
      onNavigate(`ranking-${rankingId}`);
    } catch (err) {
      setError(err.message || 'Failed to submit');
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts: ← chooses a, → chooses b, ⌘Z undoes
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

  if (error && !ranking) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <p>{error}</p>
          <button className="nav-btn" onClick={() => onNavigate('rankings')}>Back to Rankings</button>
        </div>
      </div>
    );
  }

  if (!ranking || !sortState) return null;

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
          <h1>{ranking.title}</h1>
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
    const entryMap = new Map(ranking.entries.map(e => [e.id, e]));
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>{ranking.title}</h1>
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

  const entryMap = new Map(ranking.entries.map(e => [e.id, e]));
  const entryA = entryMap.get(matchup.a);
  const entryB = entryMap.get(matchup.b);
  const progress = Math.round(getProgress(sortState) * 100);

  return (
    <div className="home-container ranking-vote-container">
      <div className="ranking-vote-header">
        <h1>{ranking.title}</h1>
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
          onClick={() => onNavigate(`ranking-${rankingId}`)}
        >
          Save & Exit
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MyRankingsPage — profile view with Created / Voted In tabs
// ============================================================================

export const MyRankingsPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [created, setCreated] = useState([]);
  const [voted, setVoted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('created'); // created | voted

  useEffect(() => {
    if (currentUser) {
      loadAll();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const loadAll = async () => {
    try {
      const [createdData, votedData] = await Promise.all([
        getUserCreatedRankings(currentUser.uid),
        getUserVotedRankings(currentUser.uid),
      ]);
      setCreated(createdData);
      // Filter out rankings the user also created — they're already in the
      // Created tab and we don't want to show them twice.
      setVoted(votedData.filter(r => r.hostId !== currentUser.uid));
    } catch (err) {
      console.error('Error loading my rankings:', err);
    }
    setLoading(false);
  };

  if (!currentUser) {
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>My Rankings</h1>
        </div>
        <div className="empty-state">
          <p>Log in to see your rankings</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading your rankings...</p>
        </div>
      </div>
    );
  }

  const list = activeTab === 'created' ? created : voted;

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>My Rankings</h1>
        <p>Rankings you've created and voted on</p>
      </div>

      <div className="ranking-detail-tabs">
        <button
          className={`ranking-tab ${activeTab === 'created' ? 'active' : ''}`}
          onClick={() => setActiveTab('created')}
        >
          Created ({created.length})
        </button>
        <button
          className={`ranking-tab ${activeTab === 'voted' ? 'active' : ''}`}
          onClick={() => setActiveTab('voted')}
        >
          Voted In ({voted.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          {activeTab === 'created' ? (
            <>
              <p>You haven't created any rankings yet.</p>
              <button className="nav-btn" onClick={() => onNavigate('create-ranking')} style={{ marginTop: '1rem' }}>
                Create Your First Ranking
              </button>
            </>
          ) : (
            <>
              <p>You haven't voted in any rankings yet.</p>
              <button className="nav-btn" onClick={() => onNavigate('rankings')} style={{ marginTop: '1rem' }}>
                Browse Rankings
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="ranking-browse-grid">
          {list.map(r => (
            <RankingCard
              key={r.id}
              ranking={r}
              onClick={() => onNavigate(`ranking-${r.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
