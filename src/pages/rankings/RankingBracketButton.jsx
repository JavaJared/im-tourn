import { useRef, useState } from 'react';
import { callServer } from '../../services/server';

export default function RankingBracketButton({ rankingId, mode, onNavigate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(null), running = useRef(false);
  const create = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      // Reuse the operation ID after a network failure to avoid duplicate drafts.
      requestId.current ||= crypto.randomUUID();
      const result = await callServer('createBracketFromRanking', { rankingId, mode, requestId: requestId.current });
      if (!result?.bracketId) throw new Error('The bracket could not be opened. Please retry.');
      onNavigate('custom-bracket-' + result.bracketId);
    } catch (reason) {
      const unavailable = /not-found|unimplemented|internal|unavailable/.test(String(reason?.code || ''));
      setError(unavailable ? 'Bracket conversion is temporarily unavailable. Please retry shortly.' : reason.message || 'Could not create your bracket. Please retry.');
    } finally { running.current = false; setBusy(false); }
  };
  return <div style={{ marginBlock: 12 }}>
    <button type="button" className="btn-secondary" disabled={busy} onClick={create}>
      {busy ? 'Creating draft…' : error ? 'Retry creating bracket' : mode === 'consensus' ? 'Create consensus bracket' : 'Create bracket'}
    </button>
    {error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}
