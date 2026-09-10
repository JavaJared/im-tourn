import { usePagedCatalog } from '../../lib/usePagedCatalog';
import CatalogControls from '../../components/CatalogControls';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserCreatedDrafts, getUserJoinedDrafts } from '../../services/draftService';
import { DraftCard } from './shared';

export const MyDraftsPage = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('created');
  const createdCatalog = usePagedCatalog(['draft'], { params: { mine: 'hosted' }, scope: currentUser?.uid || '', enabled: !!currentUser });
  const joinedCatalog = usePagedCatalog(['draft'], { params: { mine: 'joined' }, scope: currentUser?.uid || '', enabled: !!currentUser });
  const created = createdCatalog.items, joined = joinedCatalog.items.filter(draft => draft.hostId !== currentUser?.uid);
  const catalog = activeTab === 'created' ? createdCatalog : joinedCatalog;
  const loading = catalog.loading && !catalog.items.length;

  if (!currentUser) return <div className="home-container"><div className="page-header"><h1>My Drafts</h1></div><div className="empty-state"><p>Log in to see your drafts</p></div></div>;
  if (loading) return <div className="home-container"><div className="loading-state"><div className="spinner"></div><p>Loading...</p></div></div>;

  const list = activeTab === 'created' ? created : joined;
  return (
    <div className="home-container">
      <div className="page-header"><h1>My Drafts</h1><p>Drafts you've created and joined</p></div>
      <div className="ranking-detail-tabs">
        <button className={`ranking-tab ${activeTab === 'created' ? 'active' : ''}`} onClick={() => setActiveTab('created')}>Created ({created.length})</button>
        <button className={`ranking-tab ${activeTab === 'joined' ? 'active' : ''}`} onClick={() => setActiveTab('joined')}>Joined ({joined.length})</button>
      </div>
      {list.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
          {activeTab === 'created' ? (
            <><p>You haven't created any drafts yet.</p><button className="nav-btn" onClick={() => onNavigate('create-draft')} style={{ marginTop: '1rem' }}>Create Your First Draft</button></>
          ) : (
            <><p>You haven't joined any drafts yet.</p><button className="nav-btn" onClick={() => onNavigate('drafts')} style={{ marginTop: '1rem' }}>Browse Drafts</button></>
          )}
        </div>
      ) : (
        <div className="draft-browse-grid">
          {list.map(d => <DraftCard key={d.id} draft={d} onClick={() => onNavigate(`draft-${d.id}`)} />)}
        </div>
      )}
      <CatalogControls catalog={catalog} />
    </div>
  );
};
