import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getPoolByJoinCode,
  getUserHostedPools,
  getUserJoinedPools,
  joinBracketPool,
} from '../../services/bracketService';

const PoolsPage = ({ onNavigate }) => {
  const [hostedPools, setHostedPools] = useState([]);
  const [joinedPools, setJoinedPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const POOL_FILTERS = ['active', 'open', 'in_progress', 'completed', 'all'];
  const [statusFilter, setStatusFilter] = useState(() => {
    try {
      const saved = localStorage.getItem('imtourn-pool-filter');
      return POOL_FILTERS.includes(saved) ? saved : 'active';
    } catch (e) {
      return 'active';
    }
  });
  const { currentUser } = useAuth();

  const changeFilter = (key) => {
    setStatusFilter(key);
    try {
      localStorage.setItem('imtourn-pool-filter', key);
    } catch (e) {
      /* private mode etc. */
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadPools();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  const loadPools = async () => {
    try {
      const [hosted, joined] = await Promise.all([
        getUserHostedPools(currentUser.uid),
        getUserJoinedPools(currentUser.uid),
      ]);
      setHostedPools(hosted);
      // Filter out pools the user hosts from joined pools
      setJoinedPools(joined.filter((p) => p.hostId !== currentUser.uid));
    } catch (error) {
      console.error('Error loading pools:', error);
    }
    setLoading(false);
  };

  const matchesFilter = (pool) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return pool.status !== 'completed';
    return pool.status === statusFilter;
  };
  const visibleHosted = hostedPools.filter(matchesFilter);
  const visibleJoined = joinedPools.filter(matchesFilter);
  const countFor = (key) =>
    [...hostedPools, ...joinedPools].filter((p) =>
      key === 'all' ? true : key === 'active' ? p.status !== 'completed' : p.status === key,
    ).length;

  const handleJoinPool = async () => {
    if (!joinCode.trim()) {
      setJoinError('Please enter a join code');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const pool = await getPoolByJoinCode(joinCode.trim());
      if (!pool) {
        setJoinError('Invalid join code');
        setJoining(false);
        return;
      }

      await joinBracketPool(pool.id, currentUser.uid, currentUser.displayName || 'Anonymous');
      setJoinCode('');
      onNavigate(`pool-${pool.id}`);
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
          <h1>Bracket Pools</h1>
          <p>Compete with friends to predict bracket outcomes</p>
        </div>
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p>Log in to create or join bracket pools</p>
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
        <h1>Bracket Pools</h1>
        <p>Compete with friends to predict bracket outcomes</p>
      </div>

      <div className="pools-actions">
        <button className="nav-btn" onClick={() => onNavigate('create-pool')}>
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

      <div className="pool-filters">
        {[
          ['active', 'Active'],
          ['open', 'Open'],
          ['in_progress', 'In Progress'],
          ['completed', 'Completed'],
          ['all', 'All'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`pool-filter-chip ${statusFilter === key ? 'selected' : ''}`}
            onClick={() => changeFilter(key)}
          >
            {label} <span className="pool-filter-count">{countFor(key)}</span>
          </button>
        ))}
      </div>

      {visibleHosted.length > 0 && (
        <div className="pools-section">
          <h2>Pools You Host</h2>
          <div className="pools-grid">
            {visibleHosted.map((pool) => {
              const badge = getStatusBadge(pool.status);
              return (
                <div
                  key={pool.id}
                  className="pool-card"
                  onClick={() => onNavigate(`pool-${pool.id}`)}
                >
                  <span className={`pool-status ${badge.class}`}>{badge.text}</span>
                  <h3 className="pool-title">{pool.name}</h3>
                  <p className="pool-bracket">{pool.bracketTitle}</p>
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
            {visibleJoined.map((pool) => {
              const badge = getStatusBadge(pool.status);
              return (
                <div
                  key={pool.id}
                  className="pool-card"
                  onClick={() => onNavigate(`pool-${pool.id}`)}
                >
                  <span className={`pool-status ${badge.class}`}>{badge.text}</span>
                  <h3 className="pool-title">{pool.name}</h3>
                  <p className="pool-bracket">{pool.bracketTitle}</p>
                  <div className="pool-meta">
                    <span className="pool-host">Hosted by {pool.hostDisplayName}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading &&
        visibleHosted.length === 0 &&
        visibleJoined.length === 0 &&
        (hostedPools.length > 0 || joinedPools.length > 0) && (
          <div className="empty-state">
            <p>No pools match this filter.</p>
          </div>
        )}

      {hostedPools.length === 0 && joinedPools.length === 0 && (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p>No pools yet. Create one or join with a code!</p>
        </div>
      )}
    </div>
  );
};

export default PoolsPage;
