import {useEffect,useId,useRef,useState} from 'react';
import {callServer} from '../../services/server';
import {rememberUsername} from '../../services/publicUsernames';
import UserLink from '../../components/layout/UserLink';
import {invalidateFeed} from './useForYouFeed';
export default function PostComments({postId,ownerId,uid,onNavigate}){
  const [items,setItems]=useState([]),[cursor,setCursor]=useState(null),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState('');
  const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false),fetching=useRef(false),requestId=useRef(null),alive=useRef(true),inputId=useId();
  async function load(reset=false){
    if(fetching.current)return;fetching.current=true;setLoading(true);setLoadError('');
    try{const data=await callServer('listBracketPostComments',{postId,cursor:reset?null:cursor});if(!alive.current)return;Object.entries(data.usernames||{}).forEach(([id,name])=>rememberUsername(id,name));setItems(old=>[...new Map([...(reset?[]:old),...data.items].map(item=>[item.id,item])).values()]);setCursor(data.nextCursor);setLoaded(true);}
    catch(reason){if(alive.current)setLoadError(reason.message||'Could not load comments.');}
    finally{fetching.current=false;if(alive.current)setLoading(false);}
  }
  useEffect(()=>{alive.current=true;load(true);return()=>{alive.current=false;};},[postId]);
  async function send(event){
    event.preventDefault();if(pending.current||!body.trim())return;pending.current=true;setBusy(true);setError('');
    requestId.current ||= crypto.randomUUID();
    try{await callServer('addBracketPostComment',{postId,body,requestId:requestId.current});invalidateFeed();if(!alive.current)return;setBody('');requestId.current=null;await load(true);}
    catch(reason){if(alive.current)setError(reason.message||'Could not send your comment. Please retry.');}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  async function remove(id){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await callServer('deleteBracketPostComment',{postId,commentId:id});invalidateFeed();if(alive.current)setItems(old=>old.filter(item=>item.id!==id));}catch(reason){if(alive.current)setError(reason.message||'Could not remove the comment.');}finally{pending.current=false;if(alive.current)setBusy(false);}}
  return <section className="post-comments"><h2>Comments</h2>
    {uid?<form onSubmit={send}><label htmlFor={inputId}>Add a comment</label><textarea id={inputId} rows={3} maxLength={1000} value={body} disabled={busy} onChange={event=>{setBody(event.target.value);requestId.current=null;}}/><button className="nav-btn" disabled={busy||loading||!body.trim()}>{busy?'Saving…':'Comment'}</button></form>:<p>Sign in to like or comment.</p>}
    {error&&<p role="alert">{error}</p>}
    <ul>{items.map(item=><li key={item.id}><div className="social-actions"><UserLink userId={item.userId} onNavigate={onNavigate}/><time dateTime={new Date(item.createdAtMs).toISOString()}>{new Date(item.createdAtMs).toLocaleDateString()}</time>{uid&&(uid===item.userId||uid===ownerId)&&<button className="social-button" disabled={busy} aria-label="Remove comment" onClick={()=>remove(item.id)}>Remove</button>}</div><p>{item.body}</p></li>)}</ul>
    {loadError&&<p role="alert">{loadError} <button className="social-button" disabled={loading} onClick={()=>load(!loaded)}>Retry comments</button></p>}
    {loading&&<p role="status">Loading comments…</p>}
    {loaded&&!loading&&!items.length&&!loadError&&<p>No comments yet.</p>}
    {cursor&&!loadError&&<button className="social-button" disabled={loading||busy} onClick={()=>load()}>More comments</button>}
  </section>;
}
