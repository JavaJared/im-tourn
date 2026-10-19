import {useEffect,useRef,useState} from 'react';
import ActionDialog from './ActionDialog';
import {Button} from './ui/Button';
import {callServer} from '../services/server';
import './editPublishedBracket.css';
export default function ResetBracketDialog({draftId,onClose}){
 const [preview,setPreview]=useState(null),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[started,setStarted]=useState(false);
 const active=useRef(true),running=useRef(false);
 useEffect(()=>{active.current=true;load();return()=>{active.current=false;};},[draftId]);
 async function load(){setBusy(true);setError('');try{const p=await callServer('resetPublishedBracket',{draftId,action:'preview'});if(!active.current)return;setPreview(p);setStarted(!!p.started);}catch(e){if(active.current)setError(e.message);}finally{if(active.current)setBusy(false);}}
 async function run(){
  if(running.current)return;running.current=true;setBusy(true);setError('');
  try{
   let result=started?{done:false}:await callServer('resetPublishedBracket',{draftId,action:'begin',confirmation,expectedVersion:preview.version});
   setStarted(true);
   while(!result.done&&active.current)result=await callServer('resetPublishedBracket',{draftId,action:'continue'});
   if(result.done)window.location.assign('?view='+encodeURIComponent(result.view));
  }catch(e){if(active.current)setError(e.message||'Reset paused. Retry to continue safely.');}
  finally{running.current=false;if(active.current)setBusy(false);}
 }
 return <ActionDialog title="Replace original bracket" onClose={()=>{if(!busy)onClose();}}><div className="published-bracket-editor">
  {error&&<p role="alert">{error}</p>}
  {!preview&&!busy&&<Button onClick={load}>Retry loading</Button>}
  {busy&&<p role="status">{started?'Deleting old activity and replacing the bracket…':'Preparing reset…'}</p>}
  {preview&&!started&&<>
   <p>This permanently deletes {preview.picks} saved brackets, {preview.pools} pools (including pools created by other users and all their predictions/results), and {preview.posts} feed posts with their likes and comments. New activity added before confirmation will also be deleted.</p>
   <p>The original link will open the updated bracket. This cannot be undone.</p>
   <label>Type “{preview.title}” to confirm<input value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label>
   <Button disabled={busy||confirmation!==preview.title} onClick={run}>Replace original and delete activity</Button>
  </>}
  {started&&!busy&&<><p>The reset has started. The bracket stays locked until cleanup finishes.</p><Button onClick={run}>Resume reset</Button></>}
  <Button disabled={busy} onClick={onClose}>{started?'Close':'Cancel'}</Button>
 </div></ActionDialog>;
}
