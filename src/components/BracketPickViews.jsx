import { useEffect, useState } from 'react';
import { callServer } from '../services/server';
import { usePagedCatalog } from '../lib/usePagedCatalog';
import BracketBoard from './BracketBoard';
import UsernameText from './layout/UsernameText';
import './bracketPickViews.css';

export default function BracketPickViews({type,bracketId,userId,view,onView,disabled,children}) {
  const [friendId,setFriendId]=useState(''),[result,setResult]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const friends=usePagedCatalog(['friends'],{endpoint:'listFriends',scope:userId||'',enabled:view==='friends'&&!!userId});
  const accepted=friends.items.filter(item=>item.status==='accepted');
  useEffect(()=>{
    let active=true;setResult(null);setError('');
    if(view==='mine'||(view==='friends'&&(!userId||!friendId)))return;
    callServer('getBracketPickView',{type,bracketId,mode:view==='friends'?'friend':'community',...(view==='friends'?{friendId}:{})}).then(value=>{if(active)setResult(value);},reason=>{if(active)setError(reason.message||'Could not load picks.');});
    return ()=>{active=false;};
  },[type,bracketId,userId,view,friendId,attempt]);
  return <>
    <nav className="bracket-pick-tabs" aria-label="Bracket picks">
      {[['mine','My Picks'],['friends','Friends'],['community','Community']].map(([id,label])=><button key={id} type="button" aria-pressed={view===id} disabled={disabled} onClick={()=>onView(id)}>{label}</button>)}
    </nav>
    {view==='mine'?children:<>
      <div className="bracket-pick-summary">
        {view==='friends'&&(!userId?<p>Sign in to view friends’ picks.</p>:<>
          <label>Friend <select value={friendId} onChange={event=>setFriendId(event.target.value)}><option value="">Choose a friend</option>{accepted.map(friend=><option key={friend.friendId} value={friend.friendId}><UsernameText userId={friend.friendId}/></option>)}</select></label>
          {friends.loading&&<p role="status">Loading friends…</p>}
          {friends.error&&<p role="alert">{friends.error} <button onClick={friends.loadMore}>Retry friends</button></p>}
          {friends.hasMore&&!friends.error&&<button disabled={friends.loading} onClick={friends.loadMore}>Load more friends</button>}
          {!friends.loading&&!friends.error&&!accepted.length&&<p>No accepted friends on this page.</p>}
        </>)}
        {error&&<p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Retry picks</button></p>}
        {!error&&!result&&(view==='community'||(userId&&friendId))&&<p role="status">Loading picks…</p>}
        {result&&view==='friends'&&!result.found&&<p>This friend hasn’t saved a completed bracket for the current version.</p>}
        {result&&view==='community'&&<>
          <p>Based on {result.sampleSize} {result.sampleSize===1?'bracket':'brackets'}{result.partial?' · Partial consensus (latest 2,000 submissions)':''}</p>
          <details><summary>How consensus works</summary><p>Each person’s latest compatible completed bracket counts once. Percentages show support for advancing beyond each round, so opponents’ percentages may not add to 100%. Ties use support in the preceding round, then original bracket order. With no support for either entrant, the matchup stays unanswered. Pool predictions are excluded. Results may take up to a minute to refresh.</p></details>
          <button onClick={()=>setAttempt(n=>n+1)}>Refresh consensus</button>
        </>}
      </div>
      {result?.state&&!error&&<BracketBoard state={result.state} nameMap={result.nameMap} seedMap={result.seedMap} editable={false} support={result.support}/>}
    </>}
  </>;
}
