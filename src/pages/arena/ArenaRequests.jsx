import { useCallback, useEffect, useState } from 'react';
import { callServer } from '../../services/server';
import UserLink from '../../components/layout/UserLink';
import ViewLink from '../../components/layout/ViewLink';

export default function ArenaRequests({ isAdmin, onNavigate, onPublished }) {
  const [open, setOpen] = useState(false), [reviewOpen, setReviewOpen] = useState(false), [revision, setRevision] = useState(0);
  return <>
    <details className="arena-panel" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Request a debate</summary>
      {open && <><RequestForm onSent={() => setRevision(n => n + 1)}/><h3>My requests</h3><RequestList key={revision} onNavigate={onNavigate}/></>}
    </details>
    {isAdmin && <details className="arena-panel" onToggle={e => setReviewOpen(e.currentTarget.open)}>
      <summary>Review debate requests</summary>
      {reviewOpen && <RequestList queue onNavigate={onNavigate} onReviewed={result => { setRevision(n => n + 1); if (result.roomId) onPublished(); }}/>}
    </details>}
  </>;
}

function RequestForm({ onSent }) {
  const [title, setTitle] = useState(''), [names, setNames] = useState(''), [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    const candidates = names.split('\n').map(s => s.trim()).filter(Boolean);
    const normalized = candidates.map(s => s.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase());
    if (candidates.length < 5 || candidates.length > 50 || candidates.some(s => s.length > 80) || normalized.some(s => !s) || new Set(normalized).size !== candidates.length) {
      setError('Include 5–50 unique challengers, one per line, with no more than 80 characters each.'); return;
    }
    setBusy(true);
    try {
      await callServer('requestGoatDebate', { title, candidates, requestId });
      setTitle(''); setNames(''); setRequestId(crypto.randomUUID()); setMessage('Request sent for review.'); onSent();
    } catch (e) { setError(e.message || 'Could not send your request. Please retry.'); } finally { setBusy(false); }
  }
  function edit(setter, value) { setter(value); setRequestId(crypto.randomUUID()); setMessage(''); }
  return <form className="arena-form" onSubmit={submit}>
    <label>Debate title<input required maxLength={100} disabled={busy} value={title} onChange={e => edit(setTitle, e.target.value)}/></label>
    <label>Challengers — one per line<textarea required rows={7} maxLength={4100} disabled={busy} value={names} onChange={e => edit(setNames, e.target.value)} aria-describedby="debate-request-hint"/></label>
    <small id="debate-request-hint">Include 5–50 unique challengers. The first two will open the debate if approved.</small>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button className="arena-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
  </form>;
}

function RequestList({ queue = false, onNavigate, onReviewed }) {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false), [result, setResult] = useState(null);
  const load = useCallback(async (after = null) => {
    setBusy(true); setError('');
    try {
      const response = await callServer('listGoatDebateRequests', { queue, cursor: after });
      setItems(old => after ? [...old, ...response.items] : response.items); setCursor(response.nextCursor); setLoaded(true);
    } catch (e) { setError(e.message || 'Requests could not load.'); } finally { setBusy(false); }
  }, [queue]);
  useEffect(() => { load(); }, [load]);
  async function review(id, action, reason) {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await callServer('reviewGoatDebateRequest', { id, action, reason });
      setItems(old => old.filter(item => item.id !== id)); setResult(response);
      onReviewed?.(response);
    } catch (e) { setError(e.message || 'Could not review this request. Please retry.'); } finally { setBusy(false); }
  }
  return <div className="arena-requests">
    <button disabled={busy} onClick={() => load()}>{busy ? 'Loading…' : 'Refresh requests'}</button>
    {error && <p role="alert">{error}</p>}
    {result && <p role="status">{result.status === 'approved' ? 'Debate published. ' : 'Request rejected.'}{result.roomId && <ViewLink view={`debate-${result.roomId}`} onNavigate={onNavigate}>Open debate</ViewLink>}</p>}
    {loaded && !items.length && <p>{queue ? 'No requests awaiting review.' : 'No requests yet.'}</p>}
    {items.map(item => <RequestCard key={item.id} item={item} queue={queue} busy={busy} onReview={review} onNavigate={onNavigate}/>)}
    {cursor && <button disabled={busy} onClick={() => load(cursor)}>More requests</button>}
  </div>;
}

function RequestCard({ item, queue, busy, onReview, onNavigate }) {
  const [reason, setReason] = useState('');
  return <article className="arena-request">
    <h4>{item.title}</h4>
    {queue ? <UserLink userId={item.userId}/> : <p className="arena-request-status">{({ pending: 'Awaiting review', approved: 'Approved', rejected: 'Rejected' })[item.status]}</p>}
    <ol className="arena-request-candidates">{item.candidates.map(c => <li key={c.id}>{c.name}</li>)}</ol>
    {item.reason && <p>{item.reason}</p>}
    {item.roomId && <ViewLink view={`debate-${item.roomId}`} onNavigate={onNavigate}>Open debate</ViewLink>}
    {queue && <div className="arena-form">
      <label>Rejection reason (optional)<input maxLength={300} disabled={busy} value={reason} onChange={e => setReason(e.target.value)}/></label>
      <div className="arena-actions"><button className="arena-primary" disabled={busy} onClick={() => onReview(item.id, 'approve')}>Approve & publish</button><button className="arena-danger" disabled={busy} onClick={() => onReview(item.id, 'reject', reason)}>Reject</button></div>
    </div>}
  </article>;
}
