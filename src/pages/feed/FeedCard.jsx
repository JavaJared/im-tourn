import usePublicUsername from '../../lib/usePublicUsername';
import ActionDialog from '../../components/ActionDialog';
import {useEffect,useState} from 'react';
import {callServer} from '../../services/server';
import UserLink from '../../components/layout/UserLink';
import ViewLink from '../../components/layout/ViewLink';
import PostLikeButton from './PostLikeButton';
import './feed.css';
export default function FeedCard({item,onNavigate,uid,onHide}) {
  const [hiding,setHiding]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[options,setOptions]=useState(false);
  const author=usePublicUsername(item.userId||item.hostId),[photoFailed,setPhotoFailed]=useState(false);
  useEffect(()=>setPhotoFailed(false),[item.photoURL]);
  const isRanking=item.type==='ranking',isPost=item.type==='post';
  const view=`${isPost?'feed-post':isRanking?'ranking':item.type==='custom'?'custom-bracket':'fill-bracket'}-${item.id}`;
  const trackOpen=()=>{if(uid)callServer('recordFeedFeedback',{type:item.type,itemId:item.id,action:'open'}).catch(()=>{});};
  async function hide(){if(hiding)return;setHiding(true);setError('');try{await onHide(item);}catch(reason){setError(reason.message||'Could not update your feed.');setHiding(false);}}
  return <article className="feed-card">
    <header className="feed-card-header">
      <div className="feed-author"><span className="feed-avatar" aria-hidden="true">{item.photoURL&&!photoFailed?<img src={item.photoURL} alt="" loading="lazy" onError={()=>setPhotoFailed(true)}/>:author.startsWith('@')?author[1].toUpperCase():'?'}</span><div><UserLink userId={item.userId||item.hostId} onNavigate={onNavigate}/><span className="feed-reason">{item.reason}</span></div></div>
      {uid&&onHide&&<><button className="back-btn" aria-label={`Options for ${item.title}`} onClick={()=>setOptions(true)}>More</button>{options&&<ActionDialog title="Feed options" onClose={()=>setOptions(false)}><button className="feed-dismiss" aria-label={`Not interested in ${item.title}`} disabled={hiding} onClick={hide}>{hiding?'Hiding…':'Not interested'}</button>{error&&<p role="alert">{error}</p>}</ActionDialog>}</>}
    </header>
    <div className="feed-card-body">
      <div className="feed-tags"><span>{isPost?'Completed bracket':isRanking?'Ranking':'Bracket'}</span>{item.category&&<span>{item.category}</span>}{item.completed&&<span>Played</span>}</div>
      <h2><ViewLink view={view} onNavigate={next=>{trackOpen();onNavigate(next);}}>{item.title}</ViewLink></h2>
      {(isPost?item.caption:item.description)&&<div><p className={expanded||(isPost?item.caption:item.description).length<=180?'':'feed-caption-clamped'}>{isPost?item.caption:item.description}</p>{(isPost?item.caption:item.description).length>180&&<button className="quiet-button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Less':'More'}</button>}</div>}{isPost&&<div className="post-champion"><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h12v12H4M4 30h12v12H4M16 12h12v24H16M28 24h16"/></svg><div><span>Champion pick</span><strong>{item.champion}</strong></div></div>}

    </div>
    <footer>{isPost?<PostLikeButton post={item} uid={uid}/>:<span>{isRanking?item.entryCount:item.size} entries{isRanking?` · ${item.voteCount||0} votes`:''}</span>}{isPost&&<ViewLink view={view} onNavigate={onNavigate}>{item.commentCount||0} comments</ViewLink>}<ViewLink className="back-btn" view={view} onNavigate={next=>{trackOpen();onNavigate(next);}}>{isPost?'View picks':item.completed?(isRanking?'View ranking':'View picks'):isRanking?'Rank entries':'Make your picks'}</ViewLink></footer>
    {error&&<p className="feed-error" role="alert">{error}</p>}
  </article>;
}
