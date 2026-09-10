import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getRankingById, getUserRankingVote, updateRankingDescription, closeRanking, reopenRanking, deleteRanking, parseConsensus } from '../../services/rankingService';

export const RankingDetailPage = ({ rankingId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [ranking, setRanking] = useState(null);
  const [userVote, setUserVote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
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
