import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserCreatedRankings, getUserVotedRankings } from '../../services/rankingService';
import { RankingCard } from './shared';

export const MyRankingsPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [created, setCreated] = useState([]);
  const [voted, setVoted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('created');

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
