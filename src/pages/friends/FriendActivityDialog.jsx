import { useEffect, useState } from 'react';
import { callServer } from '../../services/server';
import { useDialog } from '../../lib/useDialog';
import './friends.css';

export default function FriendActivityDialog({ selection, friendId, onClose }) {
  const ref = useDialog(!!selection, onClose);
  const [result, setResult] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null); setError('');
    if (selection && friendId) callServer('getFriendActivity', { friendId, type: selection.activityType, activityId: selection.activityId }).then(
      value => { if (active) setResult(value); },
      reason => { if (active) setError(reason.message || 'Saved choices could not be loaded.'); }
    );
    return () => { active = false; };
  }, [selection, friendId, retry]);
  if (!selection) return null;
  return <div className="modal-overlay" onClick={onClose}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="friend-picks-heading" className="friend-dialog" onClick={e => e.stopPropagation()}>
      <button className="back-btn" onClick={onClose}>Close saved choices</button>
      <h2 id="friend-picks-heading">{selection.title} — friend’s saved choices</h2>

      {error ? <div role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>Retry</button></div> : !result ? <p role="status">Loading saved choices…</p> : result.sections.map((section, i) => <section key={i}><h3>{section.title}</h3><ol>{section.choices.map((choice, j) => <li key={j}>{choice}</li>)}</ol></section>)}
    </section>
  </div>;
}
