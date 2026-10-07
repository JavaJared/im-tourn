import { useState } from 'react';
import { callServer } from '../../services/server';
import UserLink from '../../components/layout/UserLink';
export function CreateDebate({ onCreated }) {
  const [title, setTitle] = useState(''), [candidates, setCandidates] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await callServer('createGoatDebate', { title, candidates: candidates.split('\n').map(s => s.trim()).filter(Boolean), requestId }); onCreated(result.id); }
    catch (e) { setError(e.message || 'Could not create debate.'); } finally { setBusy(false); }
  }
  return <details className="arena-panel"><summary>Create featured debate</summary><form className="arena-form" onSubmit={submit}>
    <label>Debate title<input required maxLength={100} value={title} disabled={busy} onChange={e => { setTitle(e.target.value); setRequestId(crypto.randomUUID()); }}/></label>
    <label>Candidates — one per line<textarea required rows={6} value={candidates} disabled={busy} onChange={e => { setCandidates(e.target.value); setRequestId(crypto.randomUUID()); }}/></label>
    <p>First two candidates open the debate. Include at least two reserve challengers.</p>
    {error && <p role="alert">{error}</p>}<button className="arena-primary" disabled={busy}>{busy ? 'Creating…' : 'Create · 5 credits'}</button>
  </form></details>;
}
export default function ArenaAdmin({ room, onRefresh }) {
  const [candidates, setCandidates] = useState(null);
  const [queue, setQueue] = useState(null), [cursor, setCursor] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [name, setName] = useState(''), [restoreId, setRestoreId] = useState('');
  async function run(action, extra = {}) {
    setBusy(true); setError('');
    try {
      const result = await callServer('manageGoatDebate', { roomId: room.id, action, ...extra });
      if (action === 'candidateQueue') setCandidates(result.items);
      else if (action === 'queue') { setQueue(items => extra.cursor ? [...items, ...result.items] : result.items); setCursor(result.nextCursor); }
      else { if (extra.candidateId) setCandidates(items => items?.filter(c => c.id !== extra.candidateId)); if (extra.commentId) setQueue(items => items?.filter(c => c.id !== extra.commentId)); await onRefresh(); }
    } catch(e) { setError(e.message || 'Action failed.'); } finally { setBusy(false); }
  }
  return <details className="arena-panel"><summary>Host controls & moderation</summary><div className="arena-form">
    <button disabled={busy} onClick={() => run(room.status === 'active' ? 'pause' : 'resume')}>{room.status === 'active' ? 'Pause debate' : 'Resume · new 24-hour window'}</button>
    <form onSubmit={e => { e.preventDefault(); run('candidate', { name }); }}><label>New candidate<input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label><button className="arena-primary" disabled={busy}>Add candidate</button></form>
    <button disabled={busy} onClick={() => run('candidateQueue')}>Review nominated challengers</button>
    {candidates?.length === 0 && <p>No challengers awaiting review.</p>}
    {candidates?.map(c => <div className="arena-list-row" key={c.id}><strong>{c.name}</strong><div className="arena-actions"><button disabled={busy} onClick={() => run('approveCandidate', { candidateId: c.id })}>Approve challenger</button><button className="arena-danger" disabled={busy} onClick={() => run('rejectCandidate', { candidateId: c.id })}>Reject</button></div></div>)}
    <button disabled={busy} onClick={() => run('queue')}>Review pending comments</button>
    {queue?.length === 0 && <p>No comments awaiting review.</p>}
    {queue?.map(c => <article className="arena-comment" key={c.id}><UserLink userId={c.userId}/><p>{c.body}</p><div className="arena-actions"><button disabled={busy} onClick={() => run('approve', { commentId: c.id })}>Approve</button><button className="arena-danger" disabled={busy} onClick={() => run('remove', { commentId: c.id })}>Remove</button><button className="arena-danger" disabled={busy} onClick={() => run('restrict', { commentId: c.id })}>Remove & restrict debate access</button></div><small>User ID: {c.userId}</small></article>)}
    {cursor && <button disabled={busy} onClick={() => run('queue', { cursor })}>More pending comments</button>}
    <form onSubmit={e => { e.preventDefault(); run('restore', { userId: restoreId }); }}><label>Restore debate access after appeal — user ID<input required value={restoreId} onChange={e => setRestoreId(e.target.value)}/></label><button disabled={busy}>Restore access</button></form>
    {error && <p role="alert">{error}</p>}
  </div></details>;
}
