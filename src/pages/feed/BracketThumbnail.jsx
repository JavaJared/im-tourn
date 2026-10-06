import {useEffect,useMemo,useRef,useState} from 'react';
import {callServer} from '../../services/server';
import {computeLayout,resolveSlot,CARDW,CARDH} from '../../components/BracketBoard';
import {locate,feederId} from '../../lib/customBracket';
import ViewLink from '../../components/layout/ViewLink';
import './thumbnail.css';
import BracketLoader from '../../components/BracketLoader';

export function ThumbnailDrawing({data,title}) {
  const {state,nameMap,seedMap}=data;
  const {layout,loc}=useMemo(()=>({layout:computeLayout(state),loc:locate(state)}),[state]);
  return <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`Full bracket preview: ${title}`}>
    {state.rounds.flatMap((round,r)=>round.map((id,p)=>{
      const pos=layout.positions[id],winner=state.boxes[id]?.result?.winnerId;
      return <g key={id}>
        {[0,1].map(w=>{
          const source=layout.positions[feederId(state,r,p,w)];if(!source)return null;
          const x=source.x+CARDW,y=source.y+CARDH/2,endY=pos.y+CARDH/2;
          return <path key={w} d={`M${x} ${y} H${(x+pos.x)/2} V${endY} H${pos.x}`} fill="none" stroke="#627086" strokeWidth="2"/>;
        })}
        <rect x={pos.x} y={pos.y} width={CARDW} height={CARDH} rx="10" fill="#1c2432" stroke="#627086"/>
        {['A','B'].map((slot,i)=>{
          const entry=resolveSlot(state,loc,nameMap,id,slot,seedMap);
          const label=entry.kind==='player'?`${entry.seed?`${entry.seed}. `:''}${entry.name}`:entry.kind==='bye'?'Bye':'TBD';
          return <text key={slot} x={pos.x+12} y={pos.y+35+i*52} fill={entry.pid!=null&&entry.pid===winner?'#5ee0c5':'#f0f3f8'} fontSize="17" fontFamily="sans-serif"><title>{label}</title>{label.length>21?`${label.slice(0,20)}…`:label}</text>;
        })}
      </g>;
    }))}
  </svg>;
}

export default function BracketThumbnail({type,id,title,view,onNavigate}) {
  const ref=useRef(null),[visible,setVisible]=useState(false),[data,setData]=useState(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'200px'});
    if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!visible)return;let active=true;setData(null);setFailed(false);
    callServer('getBracketThumbnail',{type,id}).then(value=>{if(active)setData(value);},()=>{if(active)setFailed(true);});
    return()=>{active=false;};
  },[visible,type,id,retry]);
  return <div className="bracket-thumbnail" ref={ref}>
    {data?<ViewLink view={view} onNavigate={onNavigate} aria-label={`Open ${title}`}><ThumbnailDrawing data={data} title={title}/></ViewLink>:failed?<div className="thumbnail-placeholder"><span>Preview unavailable</span><button className="quiet-button" onClick={()=>setRetry(n=>n+1)}>Retry preview</button></div>:<div className="thumbnail-placeholder"><BracketLoader compact label="Loading bracket preview…"/></div>}
  </div>;
}
