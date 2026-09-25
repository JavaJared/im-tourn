import BracketLoader from '../../components/BracketLoader';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getBracketById } from '../../services/bracketService';
import { callServer } from '../../services/server';
import { validateLegacyMatchups } from '../../lib/recordValidation';
import { FillPage, PDFPage } from '../../app/pages';

// The route, rather than the last opened bracket, owns the displayed record.
export default function BracketUrlPage({ id, mode, onSubmit, onBack, fallback }) {
  const { currentUser } = useAuth();
  const [bracket, setBracket] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBracket(null); setError('');
    if (mode === 'saved' && !currentUser) return () => { active = false; };
    (async () => {
      try {
        let data;
        if (mode === 'fill') data = await getBracketById(id);
        else if (mode === 'saved') data = await callServer('getMySavedActivity', { type: 'standard', id });
        else {
          try { data = JSON.parse(localStorage.getItem('local-bracket:' + id)); } catch { /* Use the current in-memory result when storage is blocked. */ }
          if (!data && fallback?.localId === id) data = fallback;
        }
        if (!data) throw new Error(mode === 'local' ? 'This unsaved result is not available in this browser. Saved account brackets can be opened from My Activities.' : 'This bracket is no longer available.');
        const matchups = validateLegacyMatchups(typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups);
        if (active) setBracket({ ...data, ...(mode==='saved'?{submissionId:id}:{}), id: data.id || id, matchups, title: typeof data.title === 'string' ? data.title : 'Saved bracket', category: typeof data.category === 'string' ? data.category : 'Other', size: Number.isFinite(data.size) ? data.size : matchups[0].length * 2, champion: typeof data.champion?.name === 'string' ? { name: data.champion.name } : null });
      } catch (e) { if (active) setError(e.message || 'Could not load this bracket. Please retry.'); }
    })();
    return () => { active = false; };
  }, [id, mode, currentUser?.uid, retry, fallback]);
  if (mode === 'saved' && !currentUser) return <div className="home-container"><p>Log in using the account menu to open your saved bracket.</p><button onClick={onBack}>Back to browse</button></div>;
  if (error) return <div className="home-container"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry</button><button onClick={onBack}>Back to browse</button></div>;
  if (!bracket) return <BracketLoader label="Loading bracket…"/>;
  return mode === 'fill' ? <FillPage bracket={bracket} onSubmit={onSubmit} onBack={onBack} /> : <PDFPage bracket={bracket} onBack={onBack} />;
}
