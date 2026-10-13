// Local fixtures only. Nothing here persists a pick or publishes a bracket.
import React, { useState } from 'react';
import { BracketFrame, bracketFrameStyles } from '../components/BracketFrame';
import BracketBoard from '../components/BracketBoard';
import PoolStandings from '../components/pools/PoolStandings';
import { S, CSS } from '../components/pools/poolStyles';
import { generateSeededBracket, structureFromState } from '../lib/standardBracket';
import { setResult } from '../lib/customBracket';
import { exportBracketPng } from '../lib/exportBracketPng';
import { Button } from '../components/ui/Button';
import '../components/bracketPickViews.css';
const names = ['Wings', 'Pizza', 'Tacos', 'Nachos', 'Sliders', 'Pretzels', 'Popcorn', 'Chili'];
const entries = [
  { userId:'review-alex', total:28, remainingPossible:160, basePoints:28, maxPossibleScore:188, correct:28, predictions:{} },
  { userId:'review-jamie', total:28, remainingPossible:120, basePoints:28, maxPossibleScore:148, correct:28, predictions:{} },
];
export default function CompetitionPreview() {
  const [state, setState] = useState(() => generateSeededBracket(names));
  const [notice, setNotice] = useState('');
  const { nameMap, seedMap } = structureFromState(state);
  return <>
    <section className="preview-section" id="competition-review"><h2>Bracket picks</h2>
      <BracketFrame><header style={bracketFrameStyles.top}><strong>Game-day favorites</strong><Button onClick={async () => { try { await exportBracketPng(state, 'Design review bracket'); } catch(error) { setNotice(error.message); } }}>Save image</Button></header>
        <nav className="bracket-pick-tabs" aria-label="Example picks"><button aria-pressed="true">My Picks</button><button onClick={()=>setNotice('Friends preview selected')}>Friends</button><button onClick={()=>setNotice('Consensus preview selected')}>Consensus</button></nav>
        <div style={bracketFrameStyles.scroll}><BracketBoard state={state} nameMap={nameMap} seedMap={seedMap} editable onPick={(id,pid)=>setState(value=>setResult(value,id,pid))}/></div>
      </BracketFrame><p role="status">{notice}</p>
    </section>
    <section className="preview-section cbpd" id="standings-review" style={{...S.root,minHeight:0}}><style>{CSS}</style>
      <PoolStandings entries={entries} currentUserId="review-alex" nameMap={nameMap} analysis={{byUserId:{'review-alex':{status:'alive'},'review-jamie':{status:'eliminated'}}}} onView={entry=>setNotice(`Viewing ${entry.userId}`)}/>
    </section>
  </>;
}
