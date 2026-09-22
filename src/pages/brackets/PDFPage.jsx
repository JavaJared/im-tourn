import LegacyBracketBoard from '../../components/LegacyBracketBoard';
import DownloadBracketImage from '../../components/DownloadBracketImage';
import { convertLegacyMatchups } from '../../lib/standardBracket';
import { BracketFrame, bracketFrameStyles as S } from '../../components/BracketFrame';

// Keep the existing route/component name so saved-result bookmarks still work.
export default function PDFPage({bracket,onBack}) {
  return <BracketFrame onExit={onBack}>
    <header style={S.top}>
      <div style={S.brand}><h1 style={{...S.title,margin:0}}>{bracket.title}</h1><span style={S.sub}>Read only</span></div>
      <DownloadBracketImage title={bracket.title} getState={()=>convertLegacyMatchups(bracket.matchups,{positionalIds:true}).state}/>
    </header>
    <div style={S.scroll}><LegacyBracketBoard matchups={bracket.matchups}/></div>
    {bracket.champion&&<div style={S.notice}>Champion: <strong>{bracket.champion.name}</strong></div>}
  </BracketFrame>;
}
