import { useState } from 'react';
import AuthModal from './dialogs/AuthModal';
import { bracketFrameStyles as S } from './BracketFrame';
export default function GuestBracketSave({ guestKey }) {
  const [open,setOpen]=useState(false);
  return <>
    <div style={S.notice}>Your picks stay on this device. Download them, or <button type="button" style={S.ghost} onClick={()=>{try{sessionStorage.setItem('bracket-guest-import',guestKey);}catch{}setOpen(true);}}>Create account / sign in to save</button></div>
    {open&&<AuthModal isOpen onClose={()=>setOpen(false)} initialMode="signup"/>}
  </>;
}
