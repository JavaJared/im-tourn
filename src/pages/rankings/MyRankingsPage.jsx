import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserCreatedRankings, getUserVotedRankings } from '../../services/rankingService';
import { RankingCard } from './shared';

export const MyRankingsPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;
  const [results, setResults] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState('created');

  useEffect(() => {
    let cancelled = false;
    setResults({ userId });
    if (userId) {
      for (const [tab, load] of Object.entries({ created: getUserCreatedRankings, voted: getUserVotedRankings })) {
        Promise.resolve().then(() => load(userId)).then(
          data => { if (!cancelled) setResults(previous => ({ ...previous, [tab]: { data } })); },
          error => {
            console.error(`Error loading ${tab} rankings:`, error);
            if (!cancelled) setResults(previous => ({ ...previous, [tab]: { error: true } }));
          }
        );
      }
    }
    return () => { cancelled = true; };
  }, [userId, attempt]);

  // Never show another account's results while its replacement request starts.
  const current = results.userId === userId ? results : {};
  const selected = current[activeTab];

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

  const list = selected?.data || [];

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
          Created{current.created?.data ? ` (${current.created.data.length})` : ''}
        </button>
        <button
          className={`ranking-tab ${activeTab === 'voted' ? 'active' : ''}`}
          onClick={() => setActiveTab('voted')}
        >
          Voted In{current.voted?.data ? ` (${current.voted.data.length})` : ''}
        </button>
      </div>

      {!selected ? (
        <div className="loading-state" role="status">Loading your rankings...</div>
      ) : selected.error ? (
        <div className="empty-state" role="alert">
          <p>We couldn't load your {activeTab === 'created' ? 'created rankings' : 'ranking votes'}. Please try again.</p>
          <button className="nav-btn" onClick={() => setAttempt(value => value + 1)}>Retry loading rankings</button>
        </div>
      ) : list.length === 0 ? (
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
