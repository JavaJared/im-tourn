import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getRankingById, submitRankingVote } from '../../services/rankingService';
import { initSort, getCurrentMatchup, recordChoice, undoLastChoice, isComplete, getProgress, serializeState, deserializeState } from '../../services/interactiveSort';

export const RankingVotePage = ({ rankingId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [ranking, setRanking] = useState(null);
  const [sortState, setSortState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [animating, setAnimating] = useState(null);

  const storageKey = currentUser ? `ranking_sort_${rankingId}_${currentUser.uid}` : null;

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

        if (storageKey) {
          const saved = localStorage.getItem(storageKey);
          if (saved) {
            const restored = deserializeState(saved);
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
