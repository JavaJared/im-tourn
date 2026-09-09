import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getPredictionPoolById,
  joinPredictionPool,
  getPredictionEntry,
  submitPredictionPoolPredictions,
  lockPredictionPool,
  updatePredictionPoolDescription,
  startPredictionPool,
  updatePredictionPoolResults,
  getPredictionPoolEntries,
  completePredictionPool,
  deletePredictionPool,
} from '../../services/bracketService';

const PredictionPoolDetailPage = ({ poolId, onNavigate }) => {
  const [pool, setPool] = useState(null);
  const [entry, setEntry] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('predictions');
  const [predictions, setPredictions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [viewingEntry, setViewingEntry] = useState(null);

  // Description editing state
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const { currentUser } = useAuth();

  const isHost = currentUser && pool?.hostId === currentUser.uid;

  useEffect(() => {
    loadPoolData();
  }, [poolId, currentUser]);

  const loadPoolData = async () => {
    try {
      const poolData = await getPredictionPoolById(poolId);
      setPool(poolData);

      if (currentUser) {
        const entryData = await getPredictionEntry(poolId, currentUser.uid);
        setEntry(entryData);

        if (entryData?.predictions) {
          setPredictions(entryData.predictions);
        }
      }

      const entriesData = await getPredictionPoolEntries(poolId);
      setEntries(entriesData);
    } catch (error) {
      console.error('Error loading pool:', error);
    }
    setLoading(false);
  };

  const handlePredictionSelect = (categoryIndex, optionIndex) => {
    if (pool.status !== 'open' || entry?.submittedAt) return;

    setPredictions((prev) => ({
      ...prev,
      [categoryIndex]: optionIndex,
    }));
  };

  const handleSubmitPredictions = async () => {
    // Check all categories are filled
    const allFilled = pool.categories.every((_, index) => predictions[index] !== undefined);

    if (!allFilled) {
      alert('Please make a prediction for all categories');
      return;
    }

    setSubmitting(true);
    try {
      await submitPredictionPoolPredictions(poolId, currentUser.uid, predictions);
      await loadPoolData();
      alert('Predictions submitted!');
    } catch (error) {
      alert(error.message);
    }
    setSubmitting(false);
  };

  const handleHostAction = async (action) => {
    try {
      switch (action) {
        case 'lock':
          await lockPredictionPool(poolId, currentUser.uid);
          break;
        case 'start':
          await startPredictionPool(poolId, currentUser.uid);
          break;
        case 'complete':
          await completePredictionPool(poolId, currentUser.uid);
          break;
        case 'delete':
          if (window.confirm('Are you sure you want to delete this pool?')) {
            await deletePredictionPool(poolId, currentUser.uid);
            onNavigate('prediction-pools');
            return;
          }
          break;
      }
      await loadPoolData();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleResultSelect = async (categoryIndex, optionIndex) => {
    if (!isHost || pool.status !== 'in_progress') return;

    const newResults = { ...(pool.results || {}) };
    newResults[categoryIndex] = optionIndex;

    try {
      await updatePredictionPoolResults(poolId, currentUser.uid, newResults);
      await loadPoolData();
    } catch (error) {
      alert(error.message);
    }
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}?predictionpool=${pool.joinCode}`;
    navigator.clipboard.writeText(link);
    alert('Join link copied!');
  };

  const getPredictionStatus = (categoryIndex, optionIndex) => {
    if (
      !pool.results ||
      pool.results[categoryIndex] === null ||
      pool.results[categoryIndex] === undefined
    ) {
      return 'pending';
    }
    const displayPredictions = viewingEntry
      ? viewingEntry.predictions
      : entry?.predictions || predictions;
    if (displayPredictions[categoryIndex] === optionIndex) {
      return pool.results[categoryIndex] === optionIndex ? 'correct' : 'incorrect';
    }
    return 'neutral';
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
          <button className="back-btn" onClick={() => onNavigate('prediction-pools')}>
            Back to Pools
          </button>
        </div>
      </div>
    );
  }

  const displayPredictions = viewingEntry
    ? viewingEntry.predictions
    : entry?.submittedAt
      ? entry.predictions
      : predictions;
  const canMakePredictions =
    pool.status === 'open' && !entry?.submittedAt && entry && !viewingEntry;
  const canSetResults =
    activeTab === 'results' && isHost && pool.status === 'in_progress' && !viewingEntry;

  const handleSaveDescription = async () => {
    try {
      await updatePredictionPoolDescription(poolId, currentUser.uid, descriptionDraft);
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

  return (
    <div className="home-container">
      <div className="pool-header">
        <div className="pool-header-info">
          <button className="back-link" onClick={() => onNavigate('prediction-pools')}>
            ← Back to Pools
          </button>
          <h1>{pool.name}</h1>
          <p>{pool.categories?.length || 0} categories</p>
        </div>

        <div className="pool-header-actions">
          <div className="pool-code-display">
            <span>Join Code:</span>
            <strong>{pool.joinCode}</strong>
            <button className="copy-btn" onClick={copyJoinLink}>
              Copy Link
            </button>
          </div>

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
                <button
                  className="action-btn complete"
                  onClick={() => handleHostAction('complete')}
                >
                  Complete Pool
                </button>
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
          className={`pool-tab ${activeTab === 'predictions' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('predictions');
            setViewingEntry(null);
          }}
        >
          {pool.status === 'open' && !entry?.submittedAt ? 'Make Predictions' : 'My Predictions'}
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

      {viewingEntry && (
        <div className="viewing-participant-header">
          <button className="back-link" onClick={() => setViewingEntry(null)}>
            ← Back to Leaderboard
          </button>
          <h3>Viewing {viewingEntry.userDisplayName}'s Predictions</h3>
          <span className="participant-score">Score: {viewingEntry.score} pts</span>
        </div>
      )}

      {(activeTab === 'predictions' || activeTab === 'results' || viewingEntry) && (
        <div className="prediction-categories-container">
          {canMakePredictions && (
            <div className="prediction-instructions">
              <p>Select your prediction for each category, then submit!</p>
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
              <p>
                Click on entries to set the actual results as games are played. Optionally enter
                scores in the input boxes.
              </p>
            </div>
          )}

          <div className="prediction-categories">
            {pool.categories.map((category, catIndex) => (
              <div key={catIndex} className="prediction-category">
                <div className="category-title">
                  <h3>{category.name}</h3>
                  <span className="category-points">
                    {category.points} pt{category.points !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="category-options-list">
                  {category.options.map((option, optIndex) => {
                    const isSelected = displayPredictions?.[catIndex] === optIndex;
                    const isResult = pool.results?.[catIndex] === optIndex;
                    const status =
                      (pool.status === 'in_progress' || pool.status === 'completed') &&
                      !canSetResults
                        ? getPredictionStatus(catIndex, optIndex)
                        : 'neutral';

                    return (
                      <div
                        key={optIndex}
                        className={`prediction-option ${isSelected ? 'selected' : ''} ${isResult && !canSetResults ? 'is-result' : ''} ${status} ${canMakePredictions || canSetResults ? 'clickable' : ''}`}
                        onClick={() => {
                          if (canMakePredictions) {
                            handlePredictionSelect(catIndex, optIndex);
                          } else if (canSetResults) {
                            handleResultSelect(catIndex, optIndex);
                          }
                        }}
                      >
                        <span className="option-text">{option}</span>
                        {isSelected && <span className="selected-check">✓</span>}
                        {isResult && !canSetResults && <span className="result-badge">Winner</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && !viewingEntry && (
        <div className="pool-leaderboard">
          {pool.status === 'completed' && pool.winnerId && (
            <div className="pool-winner-banner">
              <span className="trophy">🏆</span>
              <span className="winner-text">
                {pool.winnerName} wins with {pool.winnerScore} points!
              </span>
            </div>
          )}

          <div className="leaderboard-table prediction-leaderboard">
            <div className="leaderboard-header">
              <span className="lb-rank">Rank</span>
              <span className="lb-name">Player</span>
              <span className="lb-score">Score</span>
              <span className="lb-action"></span>
            </div>
            {entries.map((participantEntry, index) => (
              <div
                key={participantEntry.id}
                className={`leaderboard-row ${participantEntry.userId === currentUser?.uid ? 'current-user' : ''}`}
              >
                <span className="lb-rank">
                  {index === 0 && entries.length > 1 ? '👑' : `#${index + 1}`}
                </span>
                <span className="lb-name">{participantEntry.userDisplayName}</span>
                <span className="lb-score">{participantEntry.score}</span>
                <span className="lb-action">
                  {participantEntry.submittedAt && (
                    <button
                      className="view-bracket-btn"
                      onClick={() => setViewingEntry(participantEntry)}
                    >
                      View
                    </button>
                  )}
                </span>
              </div>
            ))}
            {entries.length === 0 && <div className="leaderboard-empty">No participants yet</div>}
          </div>

          <div className="scoring-info">
            <h4>Scoring</h4>
            <p>
              {pool.categories
                .map((cat, i) => `${cat.name}: ${cat.points} pt${cat.points !== 1 ? 's' : ''}`)
                .join(' • ')}
            </p>
          </div>
        </div>
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
                await joinPredictionPool(
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

export default PredictionPoolDetailPage;
