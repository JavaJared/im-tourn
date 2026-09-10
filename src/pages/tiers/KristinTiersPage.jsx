import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { TIER_SHAPE, TOTAL_SLOTS, countFilled } from '../../lib/tierList';
import { createTierList, getMyTierLists } from '../../services/tierService';

export const KristinTiersPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const mine = await getMyTierLists(currentUser.uid);
        if (!cancelled) setLists(mine);
      } catch (err) {
        console.error('Error loading tier lists:', err);
        if (!cancelled) setError('Could not load your tier lists');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      setError('Give your tier list a name');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const { id } = await createTierList(currentUser.uid, newTitle);
      setNewTitle('');
      onNavigate(`kristin-tiers-${id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="home-container">
        <div className="page-header">
          <h1>Kristin Tiers</h1>
          <p>Sort anything into three tiers</p>
        </div>
        <div className="empty-state">
          <p>Log in to build your tier lists</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading tier lists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Kristin Tiers</h1>
        <p>Sort anything into three tiers — {TIER_SHAPE.map(t => t.slots).join(', ')} slots. Only you can see these.</p>
      </div>

      <div className="kt-create-row">
        <input
          type="text"
          className="kt-input"
          placeholder="Name your tier list"
          value={newTitle}
          maxLength={80}
          onChange={(e) => { setNewTitle(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
        />
        <button className="nav-btn" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating...' : '+ New List'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {lists.length === 0 ? (
        <div className="empty-state">
          <p>No tier lists yet. Name one above to get started.</p>
        </div>
      ) : (
        <div className="pools-grid">
          {lists.map((list) => {
            const filled = countFilled(list.placements);
            return (
              <div
                key={list.id}
                className="pool-card"
                onClick={() => onNavigate(`kristin-tiers-${list.id}`)}
              >
                <h3 className="pool-title">{list.title}</h3>
                <p className="pool-bracket">{filled} / {TOTAL_SLOTS} slots filled</p>
                <div className="pool-meta">
                  <span className="pool-host">{list.items.length} item{list.items.length === 1 ? '' : 's'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
