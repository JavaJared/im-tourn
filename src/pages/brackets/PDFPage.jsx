import {useState} from 'react';
import BracketPickViews from '../../components/BracketPickViews';
import PostBracketButton from '../feed/PostBracketButton';
import {useAuth} from '../../contexts/AuthContext';
import LegacyBracketBoard from '../../components/LegacyBracketBoard';
import DownloadBracketImage from '../../components/DownloadBracketImage';
import { convertLegacyMatchups } from '../../lib/standardBracket';
import { BracketFrame, bracketFrameStyles as S } from '../../components/BracketFrame';

// Keep the existing route/component name so saved-result bookmarks still work.
export default function PDFPage({bracket,onBack}) {
  const {currentUser}=useAuth();
  const [view,setView]=useState('mine');
  // Saved routes use the submission ID as `id`; social views need its source bracket.
  const sourceId=Object.hasOwn(bracket,'bracketId')?bracket.bracketId:bracket.id;
  const board=<LegacyBracketBoard matchups={bracket.matchups}/>;
  return <BracketFrame onExit={onBack}>
    <header style={S.top}>
      <div style={S.brand}><h1 style={{...S.title,margin:0}}>{bracket.title}</h1><span style={S.sub}>Read only</span></div>
      {view==='mine' && <div style={S.topRight}>{currentUser && sourceId && bracket.submissionId && <PostBracketButton type="legacy" bracketId={sourceId} submissionId={bracket.submissionId}/>}<DownloadBracketImage title={bracket.title} getState={()=>convertLegacyMatchups(bracket.matchups,{positionalIds:true}).state}/></div>}
    </header>
    <div style={S.scroll}>{sourceId?<BracketPickViews key={sourceId} type="legacy" bracketId={sourceId} userId={currentUser?.uid} view={view} onView={setView}>{board}</BracketPickViews>:board}</div>
    {view==='mine' && bracket.champion&&<div style={S.notice}>Champion: <strong>{bracket.champion.name}</strong></div>}
  </BracketFrame>;
}
