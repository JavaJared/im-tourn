import {useState} from 'react';
import {callServer} from '../../services/server';
import UserLink from '../../components/layout/UserLink';
import ViewLink from '../../components/layout/ViewLink';
import PostLikeButton from './PostLikeButton';
import './feed.css';
export default function FeedCard({item,onNavigate,uid,onHide}) {
  const [hiding,setHiding]=useState(false),[error,setError]=useState('');
  const isRanking=item.type==='ranking',isPost=item.type==='post';
  const view=`${isPost?'feed-post':isRanking?'ranking':item.type==='custom'?'custom-bracket':'fill-bracket'}-${item.id}`;
  const trackOpen=()=>{if(uid)callServer('recordFeedFeedback',{type:item.type,itemId:item.id,action:'open'}).catch(()=>{});};
  async function hide(){if(hiding)return;setHiding(true);setError('');try{await onHide(item);}catch(reason){setError(reason.message||'Could not update your feed.');setHiding(false);}}
  return <article className="feed-card">
    <header className="feed-card-header">
      <div className="feed-author"><span className="feed-avatar" aria-hidden="true">{isRanking?'≡':'⑂'}</span><div><UserLink userId={item.userId||item.hostId} onNavigate={onNavigate}/><span className="feed-reason">{item.reason}</span></div></div>
      {uid&&onHide&&<button className="feed-dismiss" aria-label={`Not interested in ${item.title}`} disabled={hiding} onClick={hide}>{hiding?'Hiding…':'Not interested'}</button>}
    </header>
    <div className="feed-card-body">
      <div className="feed-tags"><span>{isPost?'Completed bracket':isRanking?'Ranking':'Bracket'}</span><span>{item.category}</span>{item.completed&&<span>Played</span>}</div>
      <h2><ViewLink view={view} onNavigate={next=>{trackOpen();onNavigate(next);}}>{item.title}</ViewLink></h2>
      {(isPost?item.caption:item.description)&&<p>{isPost?item.caption:item.description}</p>}{isPost&&<div className="post-champion">Champion pick: <strong>{item.champion}</strong></div>}
    </div>
    <footer>{isPost?<PostLikeButton post={item} uid={uid}/>:<span>{isRanking?item.entryCount:item.size} entries{isRanking?` · ${item.voteCount||0} votes`:''}</span>}{isPost&&<ViewLink view={view} onNavigate={onNavigate}>{item.commentCount||0} comments</ViewLink>}<ViewLink className="nav-btn" view={view} onNavigate={next=>{trackOpen();onNavigate(next);}}>{isPost?'View picks':item.completed?'View picks':isRanking?'Rank it':'Make your picks'}</ViewLink></footer>
    {error&&<p className="feed-error" role="alert">{error}</p>}
  </article>;
}
