import {useRef,useState} from 'react';
import {callServer} from '../../services/server';
export default function SendBracketButton({friendId,type,bracketId}) {
  const [status,setStatus]=useState(''),[error,setError]=useState('');
  const busy=useRef(false);
  async function send() {
    if(busy.current)return;
    busy.current=true;setStatus('sending');setError('');
    try { const result=await callServer('sendBracketNotification',{friendId,type,bracketId});setStatus(result.alreadySent?'already':'sent'); }
    catch(reason){setStatus('');setError(reason.message||'Could not send bracket. Please retry.');}
    finally{busy.current=false;}
  }
  return <div>
    <button type="button" disabled={!!status} onClick={send}>{status==='sending'?'Sending…':status==='sent'?'Bracket sent':status==='already'?'Already sent':error?'Retry sending bracket':'Send bracket to friend'}</button>
    {(status==='sent'||status==='already')&&<span role="status"> {status==='already'?'This bracket is already in their notifications.':'Added to their notifications.'}</span>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
