import { useRef, useState } from 'react';
import { bracketFrameStyles as S } from './BracketFrame';

export default function DownloadBracketImage({ getState, title, label, format = 'png' }) {
  const kind=format==='pdf'?'PDF':'PNG';
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  async function download() {
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const state=getState();
      const exporter=await import('../lib/exportBracketPng');
      await (format==='pdf'?exporter.exportBracketPdf:exporter.exportBracketPng)(state,title);
    } catch(reason) {setError(reason.message||'Could not save the image. Please retry.');}
    finally {pending.current=false;setBusy(false);}
  }
  return <div>
    <button style={S.ghost} disabled={busy} onClick={download}>{busy?`Creating ${kind}…`:error?`Retry ${kind}`:label||`Save ${kind}`}</button>
    {busy&&<span className="sr-only" role="status">Creating your bracket image.</span>}
    {error&&<p role="alert" style={{maxWidth:300,overflowWrap:'anywhere'}}>{error}</p>}
  </div>;
}
