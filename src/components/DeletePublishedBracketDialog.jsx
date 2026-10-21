import { useEffect, useRef, useState } from 'react';
import ActionDialog from './ActionDialog';
import { Button } from './ui/Button';
import { callServer } from '../services/server';
import './editPublishedBracket.css';

export default function DeletePublishedBracketDialog({ bracketId, type, onClose, onDeleted }) {
  const [preview,setPreview] = useState(null), [confirmation,setConfirmation] = useState('');
  const [busy,setBusy] = useState(true), [error,setError] = useState(''), [started,setStarted] = useState(false);
  const active = useRef(true), running = useRef(false);
  const call = data => callServer('deletePublishedBracket', {bracketId,type,...data});
  useEffect(() => { active.current = true; load(); return () => { active.current = false; }; }, [bracketId,type]);
  async function load() {
    setBusy(true); setError('');
    try {
      const result = await call({action:'preview'});
      if (!active.current) return;
      if (result.done) { onDeleted(); return; }
      setPreview(result); setStarted(!!result.started);
    } catch (e) { if (active.current) setError(e.message || 'Could not load deletion details.'); }
    finally { if (active.current) setBusy(false); }
  }
  async function remove() {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      let result = started ? {done:false} : await call({action:'begin',confirmation,expectedVersion:preview.version});
      if (active.current) setStarted(true);
      while (!result.done && active.current) result = await call({action:'continue'});
      if (result.done && active.current) onDeleted();
    } catch (e) { if (active.current) setError(e.message || 'Deletion paused. Retry to continue.'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  return <ActionDialog title="Delete published bracket?" onClose={() => { if (!busy) onClose(); }}><div className="published-bracket-editor">
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">{started ? 'Deleting bracket and activity…' : 'Preparing deletion…'}</p>}
    {!preview && !busy && <Button onClick={load}>Retry loading</Button>}
    {preview && !started && <>
      <p>This permanently deletes “{preview.title}”, {preview.picks} saved brackets, {preview.pools} pools (including other users’ pools and all predictions/results), and {preview.posts} feed posts with their likes and comments.</p>
      <p>Activity added before confirmation will also be removed. Shared links will stop working. This cannot be undone.</p>
      <label>Type “{preview.title}” to confirm<input value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>
      <Button disabled={busy || confirmation !== preview.title} onClick={remove}>Delete bracket and activity</Button>
    </>}
    {started && !busy && <><p>Deletion has started. The bracket stays locked until cleanup finishes.</p><Button onClick={remove}>Resume deletion</Button></>}
    <Button disabled={busy} onClick={onClose}>{started ? 'Close' : 'Cancel'}</Button>
  </div></ActionDialog>;
}
