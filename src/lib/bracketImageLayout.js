import { computeLayout, COLW, ROWH, CARDW, CARDH, PADX, PADTOP, PADBOT } from '../components/BracketBoard';
import { feederId } from './customBracket';

export function bracketImageLayout(state) {
  const normal = computeLayout(state), last = state.rounds.length - 1;
  if (normal.height <= 1600 || last < 2 || state.rounds[last].length !== 1) return {...normal, twoSided:false};
  // Trace each branch to one of the final's two feeders. Disconnected custom
  // layouts stay in their original shape rather than inventing new matchups.
  const sides = {};
  for (let r=0;r<last;r++) for(let p=0;p<state.rounds[r].length;p++) {
    let index=p;
    for(let next=r+1;next<=last;next++) {
      index=Math.floor(index/2);
      if(!state.rounds[next][index]) return {...normal,twoSided:false};
    }
    sides[state.rounds[r][p]]=Math.floor(p/2**(last-1-r));
  }
  const positions={}, centerX=PADX+last*COLW;
  for(let r=0;r<last;r++) {
    const cursors=[PADTOP,PADTOP];
    state.rounds[r].forEach((id,p)=>{
      const side=sides[id], ys=[0,1].map(w=>positions[feederId(state,r,p,w)]?.y).filter(Number.isFinite);
      const y=Math.max(cursors[side],ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:PADTOP);
      positions[id]={x:side===0?PADX+r*COLW:centerX+(last-r)*COLW,y};
      cursors[side]=y+ROWH;
    });
  }
  const roots=state.rounds[last-1].map(id=>positions[id]?.y).filter(Number.isFinite);
  positions[state.rounds[last][0]]={x:centerX,y:roots.length?roots.reduce((a,b)=>a+b,0)/roots.length:PADTOP};
  const columns=[];
  for(let r=0;r<last;r++) for(const side of [0,1]) if(state.rounds[r].some(id=>sides[id]===side)) columns.push({x:side===0?PADX+r*COLW:centerX+(last-r)*COLW,label:`Round ${r+1}`});
  columns.push({x:centerX,label:'Final'});
  const height=Math.max(...Object.values(positions).map(p=>p.y))+CARDH+PADBOT;
  if(height>=normal.height) return {...normal,twoSided:false};
  return {positions,columns,width:centerX+last*COLW+CARDW+PADX,height,twoSided:true};
}

export function imagePixelRatio(width,height) {
  return Math.min(2,8192/width,8192/height,Math.sqrt(12_000_000/(width*height)));
}
export function bracketImageFilename(title) {
  return `${String(title||'My bracket').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().slice(0,100)||'My bracket'}.png`;
}
