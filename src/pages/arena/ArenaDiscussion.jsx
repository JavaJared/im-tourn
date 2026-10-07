import { useEffect, useState } from 'react';
import { callServer } from '../../services/server';
import UserLink from '../../components/layout/UserLink';
import BracketLoader from '../../components/BracketLoader';
export default function ArenaDiscussion({ room, currentUser, disabled, onAction, isAdmin }) {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [body, setBody] = useState(''), [notice, setNotice] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function load(after) {
    try {
      const data = await callServer('listGoatDiscussion', { roomId: room.id, cursor: after });
      setItems(old => after ? [...new Map([...old, ...data.items].map(c => [c.id, c])).values()] : data.items);
      setCursor(data.nextCursor); setError('');
    } catch(e) { setError(e.message || 'Comments could not load.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(timer); }, [room.id]);
  async function submit(e) {
    e.preventDefault(); setNotice('');
    if (await onAction('comment', { body, requestId })) { setBody(''); setRequestId(crypto.randomUUID()); setNotice('Comment submitted for review. It will appear once approved.'); }
  }
  return <section aria-label="Discussion" className="arena-panel"><h2>Discussion</h2>
    {currentUser ? <form className="arena-form" onSubmit={submit}><label htmlFor="arena-comment">Your argument<textarea id="arena-comment" required maxLength={1000} value={body} disabled={disabled} onChange={e => { setBody(e.target.value); setRequestId(crypto.randomUUID()); }}/></label><button disabled={disabled || !body.trim()}>Submit for review · 1 credit</button><small>Comments are reviewed before publication. Credits reset at midnight UTC.</small></form> : <p>Sign in to join the discussion.</p>}
    {notice && <p role="status">{notice}</p>}
    {loading && <BracketLoader compact/>}{error && <p role="alert">{error} <button onClick={() => load()}>Retry</button></p>}
    {!loading && !items.length && <p>No approved comments yet.</p>}
    {items.map(c => <article className="arena-comment" key={c.id}><UserLink userId={c.userId}/><time dateTime={new Date(c.createdAt).toISOString()}>{new Date(c.createdAt).toLocaleString()}</time><p>{c.body}</p>{isAdmin && <button onClick={async () => { try { await callServer('manageGoatDebate', { roomId: room.id, action: 'remove', commentId: c.id }); await load(); } catch(e) { setError(e.message); } }}>Remove comment</button>}</article>)}
    {cursor && <button onClick={() => load(cursor)}>Older comments</button>}
  </section>;
}
