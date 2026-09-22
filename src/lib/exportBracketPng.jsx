import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toBlob } from 'html-to-image';
import BracketBoard from '../components/BracketBoard';
import { bracketFrameStyles as S } from '../components/BracketFrame';
import { structureFromState } from './standardBracket';
import { getChampion } from './customBracket';
import { bracketImageLayout, imagePixelRatio, bracketImageFilename } from './bracketImageLayout';

export async function exportBracketPng(state, title = 'My bracket') {
  if(!state?.rounds?.length || !Object.keys(state.boxes||{}).length) throw new Error('There is no bracket to export.');
  const layout=bracketImageLayout(state), {nameMap,seedMap}=structureFromState(state);
  const champion=getChampion(state);
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none;';
  host.setAttribute('aria-hidden','true');host.inert=true;document.body.appendChild(host);
  const root=createRoot(host);
  try {
    flushSync(()=>root.render(<div className="cbpr" style={{...S.root,width:layout.width+2,height:'auto',minHeight:0,boxSizing:'border-box'}}>
      <div style={{...S.top,padding:'24px 32px',display:'block'}}><h1 style={{...S.title,fontSize:30,margin:0,overflowWrap:'anywhere'}}>{title}</h1></div>
      <BracketBoard state={state} nameMap={nameMap} seedMap={seedMap} editable={false} exportMode layoutOverride={layout}/>
      {champion&&<div style={{...S.notice,padding:'18px 32px',fontSize:18}}>Champion: <strong>{nameMap[champion]||'—'}</strong></div>}
    </div>));
    await document.fonts?.ready;
    const node=host.firstElementChild;
    const width=Math.ceil(node.getBoundingClientRect().width),height=Math.ceil(node.getBoundingClientRect().height);
    const blob=await toBlob(node,{backgroundColor:'#0c0e13',width,height,pixelRatio:imagePixelRatio(width,height),preferredFontFormat:'woff2'});
    if(!blob || blob.size===0) throw new Error('The image could not be created. Please retry.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.download=bracketImageFilename(title);link.href=url;document.body.appendChild(link);link.click();link.remove();
    // Give the browser time to consume the object URL, especially on mobile.
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  } finally { root.unmount();host.remove(); }
}
