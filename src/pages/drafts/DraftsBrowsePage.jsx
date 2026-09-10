import { usePagedCatalog } from '../../lib/usePagedCatalog';
import CatalogControls from '../../components/CatalogControls';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getDraftByJoinCode, getAllDrafts, joinDraft } from '../../services/draftService';
import { DraftCard } from './shared';

export const DraftsBrowsePage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const catalog = usePagedCatalog(['draft']);
  const drafts = catalog.items;
  const loading = catalog.loading && !drafts.length;
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const filtered = drafts
    .filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'popular') {
        const cmp = (b.participantCount || 0) - (a.participantCount || 0);
        if (cmp !== 0) return cmp;
      }
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const handleJoin = async () => {
    if (!joinCode.trim()) { setJoinError('Please enter a join code'); return; }
    setJoining(true); setJoinError('');
    try {
      const draft = await getDraftByJoinCode(joinCode.trim());
      if (!draft) { setJoinError('Invalid join code'); setJoining(false); return; }
      setJoinCode('');
      onNavigate(`draft-${draft.id}`);
    } catch (e) { setJoinError(e.message); }
    setJoining(false);
  };

  return (
    <div className="home-container">
      <div className="hero">
        <h1>LIVE <span>DRAFTS</span></h1>
        <p>Create a draft room, invite friends, pick in real-time — just like the pros.</p>
        {!currentUser && <p className="hero-cta">Sign up to create or join a draft!</p>}
      </div>
      <div className="section-title">BROWSE DRAFTS</div>
      <div className="filter-bar">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input type="text" placeholder="Search drafts..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} className="search-input" />
        </div>
        <div className="ranking-sort-toggle">
          <button className={sortBy === 'newest' ? 'active' : ''} onClick={() => setSortBy('newest')}>Newest</button>
          <button className={sortBy === 'popular' ? 'active' : ''} onClick={() => setSortBy('popular')}>Popular</button>
        </div>
      </div>

      {currentUser && (
        <div className="draft-browse-actions">
          <button className="nav-btn" onClick={() => onNavigate('create-draft')}>+ Create Draft</button>
          <div className="join-pool-form">
            <input type="text" placeholder="Enter join code" value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={8} className="join-code-input" />
            <button className="join-btn" onClick={handleJoin} disabled={joining}>
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
          {joinError && <p className="error-text">{joinError}</p>}
        </div>
      )}

      {loading ? (
        <div className="loading-state"><div className="spinner"></div><p>Loading drafts...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
          <p>{drafts.length === 0 ? 'No drafts yet. Create one to get started!' : 'No drafts match your search.'}</p>
        </div>
      ) : (
        <div className="draft-browse-grid">
          {filtered.map(d => <DraftCard key={d.id} draft={d} onClick={() => onNavigate(`draft-${d.id}`)} />)}
        </div>
      )}
      <CatalogControls catalog={catalog} />
    </div>
  );
};
