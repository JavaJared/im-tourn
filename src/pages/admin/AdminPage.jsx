import { useState, useEffect, lazy } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getLargeBrackets,
  getWeeklyBracket,
  setWeeklyBracket,
  advanceWeeklyBracket,
  clearWeeklyBracket,
  setManualWinner,
} from '../../services/bracketService';
import { ADMIN_USER_IDS } from '../../config/app.js';

const FeedbackInbox = lazy(() => import('../../components/FeedbackInbox'));

const AdminPage = () => {
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewBracket, setPreviewBracket] = useState(null);
  const [currentWeekly, setCurrentWeekly] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingRound, setEditingRound] = useState(null);
  const { currentUser } = useAuth();

  const isAdmin = currentUser && ADMIN_USER_IDS.includes(currentUser.uid);

  const getRoundName = (roundIndex) => {
    const names = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final 4', 'Championship'];
    // For 32-entry brackets, skip 'Round of 64'
    const totalRounds = currentWeekly?.matchups?.length || 5;
    const startIndex = totalRounds === 5 ? 1 : 0;
    return names[roundIndex + startIndex] || `Round ${roundIndex + 1}`;
  };

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    try {
      const [bracketsData, weeklyData] = await Promise.all([
        getLargeBrackets(),
        getWeeklyBracket(),
      ]);
      setBrackets(bracketsData);
      setCurrentWeekly(weeklyData);
    } catch (error) {
      console.error('Error loading admin data:', error);
    }
    setLoading(false);
  };

  const handleRandomBracket = () => {
    if (brackets.length === 0) {
      alert('No 32 or 64-entry brackets available');
      return;
    }
    const randomIndex = Math.floor(Math.random() * brackets.length);
    setPreviewBracket(brackets[randomIndex]);
  };

  const handleConfirmBracket = async () => {
    if (!previewBracket) return;

    setActionLoading(true);
    try {
      await setWeeklyBracket(previewBracket);
      setCurrentWeekly(previewBracket);
      setPreviewBracket(null);
      alert('Weekly bracket has been set!');
    } catch (error) {
      console.error('Error setting weekly bracket:', error);
      alert('Failed to set weekly bracket');
    }
    setActionLoading(false);
  };

  const handleAdvanceRound = async () => {
    if (
      !confirm(
        'Are you sure you want to advance to the next round? This will determine winners based on current votes.',
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      await advanceWeeklyBracket();
      await loadData();
      alert('Bracket advanced to next round!');
    } catch (error) {
      console.error('Error advancing bracket:', error);
      alert('Failed to advance bracket');
    }
    setActionLoading(false);
  };

  const handleClearBracket = async () => {
    if (!confirm('Clear the current weekly bracket? Completed results will be archived.')) {
      return;
    }

    setActionLoading(true);
    try {
      await clearWeeklyBracket();
      setCurrentWeekly(null);
      alert('Weekly bracket cleared!');
    } catch (error) {
      console.error('Error clearing bracket:', error);
      alert('Failed to clear bracket');
    }
    setActionLoading(false);
  };

  const handleSetWinner = async (roundIndex, matchIndex, winner) => {
    setActionLoading(true);
    try {
      const updatedMatchups = await setManualWinner(roundIndex, matchIndex, winner);
      setCurrentWeekly((prev) => ({ ...prev, matchups: updatedMatchups }));
    } catch (error) {
      console.error('Error setting winner:', error);
      alert('Failed to set winner');
    }
    setActionLoading(false);
  };

  if (!isAdmin) {
    return (
      <div className="home-container">
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <p>Access denied. Admin privileges required.</p>
          {currentUser && (
            <p style={{ fontSize: '0.8rem', marginTop: '1rem', color: 'var(--text-muted)' }}>
              Your User ID: {currentUser.uid}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Admin Panel</h1>
        <p>Manage the weekly bracket</p>
      </div>

      <FeedbackInbox />
      {/* Current Weekly Bracket Status */}
      <div className="admin-section">
        <h2 className="admin-section-title">Current Weekly Bracket</h2>
        {currentWeekly ? (
          <div className="current-weekly-info">
            <div className="weekly-detail">
              <span className="label">Title:</span>
              <span className="value">{currentWeekly.title}</span>
            </div>
            <div className="weekly-detail">
              <span className="label">Category:</span>
              <span className="value">{currentWeekly.category}</span>
            </div>
            <div className="weekly-detail">
              <span className="label">Current Round:</span>
              <span className="value">{currentWeekly.currentRound + 1} of 5</span>
            </div>
            <div className="admin-actions">
              <button
                className="admin-btn advance"
                onClick={handleAdvanceRound}
                disabled={actionLoading}
              >
                Advance to Next Round
              </button>
              <button
                className="admin-btn danger"
                onClick={handleClearBracket}
                disabled={actionLoading}
              >
                Clear Weekly Bracket
              </button>
            </div>
          </div>
        ) : (
          <p className="no-weekly">No weekly bracket is currently set.</p>
        )}
      </div>

      {/* Select New Bracket */}
      <div className="admin-section">
        <h2 className="admin-section-title">Select New Weekly Bracket</h2>
        <p className="admin-hint">Available 32/64-entry brackets: {brackets.length}</p>

        <button
          className="admin-btn primary"
          onClick={handleRandomBracket}
          disabled={brackets.length === 0}
        >
          🎲 Pull Random Bracket
        </button>

        {previewBracket && (
          <div className="preview-bracket-card">
            <h3>{previewBracket.title}</h3>
            <p className="preview-meta">
              {previewBracket.category} • Created by {previewBracket.userDisplayName}
            </p>
            <div className="preview-entries">
              <strong>Entries:</strong>
              <div className="entries-preview">
                {previewBracket.entries.map((entry, idx) => (
                  <span key={idx} className="entry-chip">
                    {entry.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="preview-actions">
              <button
                className="admin-btn success"
                onClick={handleConfirmBracket}
                disabled={actionLoading}
              >
                ✓ Confirm next weekly bracket
              </button>
              <button className="admin-btn secondary" onClick={handleRandomBracket}>
                ↻ Try Another
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Winner Selection */}
      {currentWeekly && (
        <div className="admin-section">
          <h2 className="admin-section-title">Manual Winner Selection</h2>
          <p className="admin-hint">
            Choose winners for the current round, then advance. Closed rounds stay fixed so existing
            ballots keep their meaning.
          </p>

          <div className="round-selector">
            {currentWeekly.matchups.map((round, roundIndex) => (
              <button
                key={roundIndex}
                className={`round-tab ${editingRound === roundIndex ? 'active' : ''}`}
                disabled={roundIndex !== (currentWeekly.currentRound || 0)}
                onClick={() => setEditingRound(editingRound === roundIndex ? null : roundIndex)}
              >
                {getRoundName(roundIndex)}
                {round.every((m) => m.winner) && <span className="round-complete-check">✓</span>}
              </button>
            ))}
          </div>

          {editingRound !== null && (
            <div className="manual-matchups">
              <h3 className="editing-round-title">Editing: {getRoundName(editingRound)}</h3>
              {currentWeekly.matchups[editingRound].map((match, matchIndex) => (
                <div key={matchIndex} className="manual-matchup">
                  <div className="manual-matchup-number">Match {matchIndex + 1}</div>
                  <div className="manual-entries">
                    <button
                      className={`manual-entry ${match.winner === 1 ? 'is-winner' : ''}`}
                      onClick={() => handleSetWinner(editingRound, matchIndex, 1)}
                      disabled={actionLoading || !match.entry1}
                    >
                      {match.entry1 ? (
                        <>
                          <span className="manual-seed">{match.entry1.seed}</span>
                          <span className="manual-name">{match.entry1.name}</span>
                          {match.winner === 1 && <span className="winner-badge">WINNER</span>}
                        </>
                      ) : (
                        <span className="manual-name tbd">TBD</span>
                      )}
                    </button>
                    <span className="vs-text">vs</span>
                    <button
                      className={`manual-entry ${match.winner === 2 ? 'is-winner' : ''}`}
                      onClick={() => handleSetWinner(editingRound, matchIndex, 2)}
                      disabled={actionLoading || !match.entry2}
                    >
                      {match.entry2 ? (
                        <>
                          <span className="manual-seed">{match.entry2.seed}</span>
                          <span className="manual-name">{match.entry2.name}</span>
                          {match.winner === 2 && <span className="winner-badge">WINNER</span>}
                        </>
                      ) : (
                        <span className="manual-name tbd">TBD</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPage;
