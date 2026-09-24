import {useId,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {useDialog} from '../../lib/useDialog';
import {predictedFinish} from '../../lib/poolEntryProgress';
import UserLink from '../layout/UserLink';
import './entryPredictions.css';
export default function EntryPredictionsDialog({selection,onClose,structure,entries,currentUserId,loaded,error,onRetry,onLoadMore}){
  const titleId=useId(),ref=useDialog(!!selection,onClose),[loadingMore,setLoadingMore]=useState(false);
  const rows=useMemo(()=>selection?entries.map(entry=>({userId:entry.userId,label:entries.predictionsHidden&&entry.userId!==currentUserId?'Private until predictions close':entry.dataError?'Picks unavailable':predictedFinish(structure,entry.predictions,selection.pid)})):[],[selection,entries,structure,currentUserId]);
  const groups=useMemo(()=>{
    const byFinish=new Map();
    for(const row of rows){if(!byFinish.has(row.label))byFinish.set(row.label,[]);byFinish.get(row.label).push(row);}
    const order=label=>{
      const round=/^Out in round (\d+)$/.exec(label);
      if(round)return Number(round[1]);
      return (structure?.rounds?.length||0)+1+['Runner-up (final)','Champion','Not submitted','Picks incomplete','Picks unavailable','Entry unavailable','Private until predictions close'].indexOf(label);
    };
    return [...byFinish].sort(([a],[b])=>order(a)-order(b));
  },[rows,structure]);
  async function more(){if(loadingMore)return;setLoadingMore(true);try{await onLoadMore();}finally{setLoadingMore(false);}}
  if(!selection)return null;
  return createPortal(<div className="modal-overlay" onClick={onClose}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-content entry-predictions" onClick={event=>event.stopPropagation()}>
    <header><h2 id={titleId}>{selection.name}</h2><button type="button" className="back-btn" aria-label="Close entry predictions" onClick={onClose}>Close</button></header>
    <h3>Pool predictions</h3>
    {error&&<p role="alert">{error} <button type="button" className="back-btn" onClick={onRetry}>Retry participants</button></p>}
    {!loaded&&<p role="status">Loading predictions…</p>}
    {groups.map(([label,members],index)=><section className="entry-prediction-group" key={label} aria-labelledby={`${titleId}-group-${index}`}>
      <h4 id={`${titleId}-group-${index}`}>{label} <span>({members.length})</span></h4>
      <ul>{members.map(row=><li key={row.userId}><UserLink userId={row.userId}/></li>)}</ul>
    </section>)}
    {loaded&&!error&&!rows.length&&<p>No pool participants yet.</p>}
    {entries.nextCursor&&<div><p>Showing {rows.length} participants.</p><button type="button" className="back-btn" disabled={loadingMore} onClick={more}>{loadingMore?'Loading…':'Load more participants'}</button></div>}
  </section></div>,document.body);
}
