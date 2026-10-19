import { useState } from 'react';
import { Pencil } from 'lucide-react';
import ActionDialog from './ActionDialog';
import { Button } from './ui/Button';
import { callServer } from '../services/server';
import './editPublishedBracket.css';

export default function EditPublishedBracket({ type, bracketId, onSaved }) {
  const [open,setOpen] = useState(false), [details,setDetails] = useState(null);
  const [version,setVersion] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [revision,setRevision] = useState(null), [requestId,setRequestId] = useState(null), [notice,setNotice] = useState('');
  const close = () => { if (!busy) setOpen(false); };
  async function load() {
    setOpen(true);setDetails(null);setError('');setRevision(null);setNotice('');setBusy(true);setRequestId(crypto.randomUUID());
    try { const result=await callServer('managePublishedBracket',{type,bracketId,action:'load'});setDetails(result.details);setVersion(result.version); }
    catch(e){setError(e.message || 'Could not load the editor.');}finally{setBusy(false);}
  }
  async function save(action) {
    setBusy(true);setError('');
    try {
      const result=await callServer('managePublishedBracket',{type,bracketId,action,details,expectedVersion:version,requestId});
      if(action==='revise')setRevision(result.bracketId);
      else {onSaved?.(details);setOpen(false);setNotice('Bracket updated.');}
    } catch(e){setError(e.message || 'Changes were not saved. Please retry.');}finally{setBusy(false);}
  }
  return <>
    <Button onClick={load}><Pencil size={16} aria-hidden="true"/>Edit bracket</Button>
    {notice&&<span role="status">{notice}</span>}
    {open&&<ActionDialog title="Edit bracket" onClose={close}>
      {busy&&!details&&<p role="status">Loading editor…</p>}
      {error&&<p role="alert">{error}</p>}
      {!busy&&!details&&<Button onClick={load}>Retry</Button>}
      {details&&!revision&&<form className="published-bracket-editor" onSubmit={event=>{event.preventDefault();save('save');}}>
        <label>Title<input required maxLength={200} value={details.title} disabled={busy} onChange={e=>setDetails({...details,title:e.target.value})}/></label>
        <label>Description<textarea rows={4} maxLength={5000} value={details.description} disabled={busy} onChange={e=>setDetails({...details,description:e.target.value})}/></label>
        <label>Category<input maxLength={100} value={details.category} disabled={busy} onChange={e=>setDetails({...details,category:e.target.value})}/></label>
        <div className="published-bracket-editor-actions"><Button type="submit" variant="primary" disabled={busy||!details.title.trim()}>{busy?'Saving…':'Save changes'}</Button><Button type="button" onClick={close} disabled={busy}>Cancel</Button></div>
        <hr/><Button type="button" disabled={busy||!details.title.trim()} onClick={()=>save('revise')}>Edit entries or matchups</Button>
        <p>This creates a draft copy with a new link. Existing picks, posts, and pools stay with the original bracket.</p>
      </form>}
      {revision&&<div className="published-bracket-editor"><p>Your draft copy is ready. Edit its entries and matchups, then publish when ready.</p><a className="ui-button ui-button--primary" href={`?view=custom-bracket-${encodeURIComponent(revision)}`}>Open draft editor</a></div>}
    </ActionDialog>}
  </>;
}
