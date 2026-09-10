import { usePagedCatalog } from '../../lib/usePagedCatalog';
import CatalogControls from '../../components/CatalogControls';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getPredictionPoolByJoinCode,
  getUserHostedPredictionPools,
  getUserJoinedPredictionPools,
  joinPredictionPool,
} from '../../services/bracketService';

const PredictionPoolsPage = ({ onNavigate }) => {

  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const { currentUser } = useAuth();
  const directory = usePagedCatalog(['hosted', 'joined'], { endpoint: 'listUserPools', params: { poolType: 'prediction' }, scope: currentUser?.uid, enabled: !!currentUser });
  const hostedPools = directory.items.filter(p => p.catalogType === 'hosted');
  const joinedPools = directory.items.filter(p => p.catalogType === 'joined' && p.hostId !== currentUser?.uid);
  const loading = directory.loading && !directory.items.length;

  const handleJoinPool = async () => {
    if (!joinCode.trim()) {
      setJoinError('Please enter a join code');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const pool = await getPredictionPoolByJoinCode(joinCode.trim());
      if (!pool) {
        setJoinError('Invalid join code');
        setJoining(false);
        return;
      }

      await joinPredictionPool(pool.id, currentUser.uid, currentUser.displayName || 'Anonymous');
      setJoinCode('');
      onNavigate(`prediction-pool-${pool.id}`);
    } catch (error) {
      setJoinError(error.message);
    }
    setJoining(false);
  };

  const getStatusBadge = (status) => {
    const badges = {
      open: { text: 'Open', class: 'status-open' },
      locked: { text: 'Locked', class: 'status-locked' },
      in_progress: { text: 'In Progress', class: 'status-progress' },
      completed: { text: 'Completed', class: 'status-completed' },
    };
    return badges[status] || { text: status, class: '' };
  };

  if (!currentUser) {
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>Prediction Pools</h1>
          <p>Compete with friends to predict category winners</p>
        </div>
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p>Log in to create or join prediction pools</p>
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
        <h1>Prediction Pools</h1>
        <p>Compete with friends to predict category winners</p>
      </div>

      <div className="pools-actions">
        <button className="nav-btn" onClick={() => onNavigate('create-prediction-pool')}>
          + Create Pool
        </button>

        <div className="join-pool-form">
          <input
            type="text"
            placeholder="Enter join code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
            className="join-code-input"
          />
          <button className="join-btn" onClick={handleJoinPool} disabled={joining}>
            {joining ? 'Joining...' : 'Join'}
          </button>
        </div>
        {joinError && <p className="error-text">{joinError}</p>}
      </div>

      {hostedPools.length > 0 && (
        <div className="pools-section">
          <h2>Pools You Host</h2>
          <div className="pools-grid">
            {hostedPools.map((pool) => {
              const badge = getStatusBadge(pool.status);
              return (
                <div
                  key={pool.id}
                  className="pool-card prediction-pool-card"
                  onClick={() => onNavigate(`prediction-pool-${pool.id}`)}
                >
                  <span className={`pool-status ${badge.class}`}>{badge.text}</span>
                  <h3 className="pool-title">{pool.name}</h3>
                  <p className="pool-bracket">{pool.categories?.length || 0} categories</p>
                  <div className="pool-meta">
                    <span className="pool-code">Open pool to view its invitation</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {joinedPools.length > 0 && (
        <div className="pools-section">
          <h2>Pools You Joined</h2>
          <div className="pools-grid">
            {joinedPools.map((pool) => {
              const badge = getStatusBadge(pool.status);
              return (
                <div
                  key={pool.id}
                  className="pool-card prediction-pool-card"
                  onClick={() => onNavigate(`prediction-pool-${pool.id}`)}
                >
                  <span className={`pool-status ${badge.class}`}>{badge.text}</span>
                  <h3 className="pool-title">{pool.name}</h3>
                  <p className="pool-bracket">{pool.categories?.length || 0} categories</p>
                  <div className="pool-meta">
                    <span className="pool-host">Hosted by {pool.hostDisplayName}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hostedPools.length === 0 && joinedPools.length === 0 && (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p>No prediction pools yet. Create one or join with a code!</p>
        </div>
      )}
      <CatalogControls catalog={directory} />
    </div>
  );
};

export default PredictionPoolsPage;
