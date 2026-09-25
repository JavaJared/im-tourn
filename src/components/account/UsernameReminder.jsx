import {useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useDialog} from '../../lib/useDialog';
import UsernameForm from './UsernameForm';
import './username.css';

export default function UsernameReminder({userId,account,onSave}){
  const key=`username-reminder:v1:${userId}`;
  const [dismissed,setDismissed]=useState(()=>{try{return sessionStorage.getItem(key)==='dismissed';}catch{return false;}});
  const [busy,setBusy]=useState(false),pending=useRef(false),titleId=useId();
  // Wait for fresh account data: cached defaults may have been changed elsewhere.
  const open=!!account.username&&account.usernameIsDefault===true&&!account.loading&&!account.error&&!dismissed;
  function dismiss(){if(pending.current)return;setDismissed(true);try{sessionStorage.setItem(key,'dismissed');}catch{/* Still dismiss for this mount when storage is unavailable. */}}
  const ref=useDialog(open,dismiss);
  async function save(value){
    pending.current=true;setBusy(true);
    try{const result=await onSave(value);if(result.usernameIsDefault===true)throw Error('Choose a new username instead of your assigned one.');setDismissed(true);return result;}
    finally{pending.current=false;setBusy(false);}
  }
  if(!open)return null;
  return createPortal(<div className="modal-overlay" onClick={dismiss}><section ref={ref} className="modal-content username-reminder" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event=>event.stopPropagation()}>
    <h2 id={titleId}>Choose your username</h2>
    <p>Your current username is <strong>@{account.username}</strong>. Pick one your friends will recognize.</p>
    <UsernameForm onSave={save}/>
    <button type="button" className="back-btn" disabled={busy} onClick={dismiss}>Maybe later</button>
  </section></div>,document.body);
}
