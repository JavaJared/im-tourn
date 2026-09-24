import {useId,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {useDialog} from '../../lib/useDialog';
import {predictedFinish} from '../../lib/poolEntryProgress';
import UserLink from '../layout/UserLink';
import './entryPredictions.css';
export default function EntryPredictionsDialog({selection,onClose,structure,entries,currentUserId,loaded,error,onRetry,onLoadMore}){
  const titleId=useId(),ref=useDialog(!!selection,onClose),[loadingMore,setLoadingMore]=useState(false);
  const rows=useMemo(()=>selection?entries.map(entry=>({userId:entry.userId,label:entries.predictionsHidden&&entry.userId!==currentUserId?'Private until predictions close':entry.dataError?'Picks unavailable':predictedFinish(structure,entry.predictions,selection.pid)})):[],[selection,entries,structure,currentUserId]);
  async function more(){if(loadingMore)return;setLoadingMore(true);try{await onLoadMore();}finally{setLoadingMore(false);}}
  if(!selection)return null;
  return createPortal(<div className="modal-overlay" onClick={onClose}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-content entry-predictions" onClick={event=>event.stopPropagation()}>
    <header><h2 id={titleId}>{selection.name}</h2><button type="button" className="back-btn" aria-label="Close entry predictions" onClick={onClose}>Close</button></header>
    <h3>Pool predictions</h3>
    {error&&<p role="alert">{error} <button type="button" className="back-btn" onClick={onRetry}>Retry participants</button></p>}
    {!loaded&&<p role="status">Loading predictions…</p>}
    <ul>{rows.map(row=><li key={row.userId}><UserLink userId={row.userId}/><span>{row.label}</span></li>)}</ul>
    {loaded&&!error&&!rows.length&&<p>No pool participants yet.</p>}
    {entries.nextCursor&&<div><p>Showing {rows.length} participants.</p><button type="button" className="back-btn" disabled={loadingMore} onClick={more}>{loadingMore?'Loading…':'Load more participants'}</button></div>}
  </section></div>,document.body);
}
