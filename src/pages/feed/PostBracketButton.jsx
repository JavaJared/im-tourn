import {useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useDialog} from '../../lib/useDialog';
import {callServer} from '../../services/server';
import {invalidateFeed} from './useForYouFeed';
import './social.css';
export default function PostBracketButton({type,bracketId,submissionId}){
  const [open,setOpen]=useState(false),[caption,setCaption]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[posted,setPosted]=useState(null);
  const pending=useRef(false),titleId=useId(),captionId=useId();
  const close=()=>{if(!pending.current)setOpen(false);},dialog=useDialog(open,close);
  async function publish(event){
    event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');
    try{const result=await callServer('publishBracketPost',{type,bracketId,submissionId:submissionId||null,caption,publicConsent:true});invalidateFeed();setPosted(result.id);setOpen(false);}
    catch(reason){setError(reason.message||'Could not post your bracket. Please retry.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <>{posted?<a className="social-button" href={`/?view=feed-post-${posted}`}>View your post</a>:<button className="social-button" onClick={()=>setOpen(true)}>Post to feed</button>}
    {open&&createPortal(<div className="social-overlay"><section ref={dialog} className="social-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>Post your bracket</h2><p>Your completed picks and caption will be public. Anyone can view them; signed-in users can like and comment.</p>
      <form onSubmit={publish}><label htmlFor={captionId}>Caption (optional)</label><textarea id={captionId} value={caption} maxLength={500} disabled={busy} onChange={event=>setCaption(event.target.value)} rows={3}/>
        {error&&<p role="alert">{error}</p>}<div className="social-actions"><button className="social-button" type="button" disabled={busy} onClick={close}>Cancel</button><button className="nav-btn" disabled={busy}>{busy?'Posting…':'Post publicly'}</button></div>
      </form></section></div>,document.body)}
  </>;
}
