import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToDraft } from '../../services/draftService';
import { LobbyView, LiveDraftView, DraftResultsView } from './shared';

export const DraftLobbyPage = ({ draftId, onNavigate }) => {
  const { currentUser } = useAuth();
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  // Real-time subscription
  useEffect(() => {
    setDraft(null); setLoading(true); setError('');
    const unsub = subscribeToDraft(
      draftId,
      (d) => { setDraft(d); setLoading(false); setError(''); },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [draftId, currentUser?.uid, retry]);

  if (loading) return <div className="home-container"><div className="loading-state"><div className="spinner"></div><p>Loading draft...</p></div></div>;
  if (error && !draft) return <div className="home-container"><div className="empty-state"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry</button><button className="nav-btn" onClick={() => onNavigate('drafts')}>Back</button></div></div>;
  if (!draft) return <div className="home-container"><div className="empty-state"><p>Draft not found.</p><button className="nav-btn" onClick={() => onNavigate('drafts')}>Back</button></div></div>;

  if (draft.schemaVersion !== 2) return <div className="home-container"><p>This older draft is read-only. Create a new draft to use the repaired controls.</p><button onClick={() => onNavigate('drafts')}>Back to drafts</button></div>;
  if (error) return <div className="home-container"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>Reconnect</button></div>;
  if (draft.status === 'open') return <LobbyView draft={draft} onNavigate={onNavigate} />;
  if (draft.status === 'drafting') return <LiveDraftView draft={draft} onNavigate={onNavigate} />;
  if (draft.status === 'completed') return <DraftResultsView draft={draft} onNavigate={onNavigate} />;

  return null;
};
