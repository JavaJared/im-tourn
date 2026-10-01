import { useState } from 'react';
import { bracketFrameStyles as S } from './BracketFrame';
export default function ShareBracketButton({ type, bracketId, title }) {
  const [open,setOpen]=useState(false),[message,setMessage]=useState('');
  const url=`https://imtourn.com/?view=${type==='legacy'?'fill-bracket-':'custom-bracket-'}${encodeURIComponent(bracketId)}`;
  async function share(){
    setMessage('');
    if(navigator.share){try{await navigator.share({title:title||'I’m Tourn bracket',text:'Fill out this bracket!',url});return;}catch(error){if(error.name==='AbortError')return;}}
    setOpen(true);
  }
  async function copy(){try{await navigator.clipboard.writeText(url);setMessage('Link copied.');}catch{setMessage('Select and copy the link below.');}}
  return <div>
    <button type="button" style={S.ghost} onClick={share}>Share bracket</button>
    {open&&<div style={{display:'flex',flexWrap:'wrap',gap:8,maxWidth:320,paddingTop:8}}>
      <input aria-label="Bracket share link" readOnly value={url} onFocus={event=>event.target.select()} style={{width:'100%',minWidth:0}}/>
      <button type="button" style={S.ghost} onClick={copy}>Copy link</button>
      <a style={S.ghost} href={`mailto:?subject=${encodeURIComponent(title||'Try this bracket')}&body=${encodeURIComponent('Fill out this bracket: '+url)}`}>Email</a>
      <button type="button" style={S.ghost} onClick={()=>setOpen(false)}>Close</button>
    </div>}
    {message&&<span role="status">{message}</span>}
  </div>;
}
