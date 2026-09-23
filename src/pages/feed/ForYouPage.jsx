import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../../contexts/AuthContext';
import {callServer} from '../../services/server';
import UserLink from '../../components/layout/UserLink';
import ViewLink from '../../components/layout/ViewLink';
import useForYouFeed from './useForYouFeed';
import './feed.css';
function FeedCard({item,onNavigate,uid,onHide}) {
  const [hiding,setHiding]=useState(false),[error,setError]=useState('');
  const isRanking=item.type==='ranking';
  const view=`${isRanking?'ranking':item.type==='custom'?'custom-bracket':'fill-bracket'}-${item.id}`;
  const trackOpen=()=>{if(uid)callServer('recordFeedFeedback',{type:item.type,itemId:item.id,action:'open'}).catch(()=>{});};
  async function hide(){if(hiding)return;setHiding(true);setError('');try{await onHide(item);}catch(reason){setError(reason.message||'Could not update your feed.');setHiding(false);}}
  return <article className="feed-card">
    <header className="feed-card-header">
      <div className="feed-author"><span className="feed-avatar" aria-hidden="true">{isRanking?'≡':'⑂'}</span><div><UserLink userId={item.userId||item.hostId} onNavigate={onNavigate}/><span className="feed-reason">{item.reason}</span></div></div>
      {uid&&<button className="feed-dismiss" aria-label={`Not interested in ${item.title}`} disabled={hiding} onClick={hide}>{hiding?'Hiding…':'Not interested'}</button>}
    </header>
    <div className="feed-card-body">
      <div className="feed-tags"><span>{isRanking?'Ranking':'Bracket'}</span><span>{item.category}</span>{item.completed&&<span>Played</span>}</div>
      <h2><ViewLink view={view} onNavigate={next=>{trackOpen();onNavigate(next);}}>{item.title}</ViewLink></h2>
      {item.description&&<p>{item.description}</p>}
    </div>
    <footer><span>{isRanking?item.entryCount:item.size} entries{isRanking?` · ${item.voteCount||0} votes`:''}</span><ViewLink className="nav-btn" view={view} onNavigate={next=>{trackOpen();onNavigate(next);}}>{item.completed?'View picks':isRanking?'Rank it':'Make your picks'}</ViewLink></footer>
    {error&&<p className="feed-error" role="alert">{error}</p>}
  </article>;
}
export default function ForYouPage({onNavigate}) {
  const {currentUser}=useAuth();
  const feed=useForYouFeed(currentUser?.uid),sentinel=useRef(null);
  useEffect(()=>{
    if(!feed.hasMore||feed.loading||feed.error||!sentinel.current||typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))feed.loadMore();},{rootMargin:'500px'});
    observer.observe(sentinel.current);return()=>observer.disconnect();
  },[feed.hasMore,feed.loading,feed.error,feed.items.length]);
  return <div className="for-you-page">
    <header className="feed-heading"><h1>For You</h1><div><ViewLink view="browse" onNavigate={onNavigate}>Browse</ViewLink><button className="back-btn" disabled={feed.loading} onClick={feed.refresh}>Refresh</button><ViewLink className="nav-btn" view="create" onNavigate={onNavigate}>Create</ViewLink></div></header>
    <nav className="feed-explore" aria-label="Explore content"><ViewLink view="browse" onNavigate={onNavigate}>All brackets</ViewLink><ViewLink view="rankings" onNavigate={onNavigate}>All rankings</ViewLink></nav>
    {feed.personalizationUnavailable&&<p role="status">Showing discoveries while your personalized feed is unavailable.</p>}
    <div className="feed-posts">{feed.items.map(item=><FeedCard key={`${item.type}:${item.id}`} item={item} uid={currentUser?.uid} onNavigate={onNavigate} onHide={feed.hide}/>)}</div>
    {feed.error&&<p className="feed-error" role="alert">{feed.error} <button className="back-btn" disabled={feed.loading} onClick={feed.loadMore}>Retry</button></p>}
    {feed.loading&&<p className="feed-state" role="status">Loading your feed…</p>}
    {!feed.loading&&!feed.error&&!feed.items.length&&<p className="feed-state">No recommendations yet. Check Browse for more to play.</p>}
    <div ref={sentinel} className="feed-end">{feed.hasMore&&!feed.error&&<button className="back-btn" disabled={feed.loading} onClick={feed.loadMore}>Load more</button>}
      {!feed.hasMore&&feed.items.length>0&&<p>You’re all caught up.</p>}</div>
  </div>;
}
