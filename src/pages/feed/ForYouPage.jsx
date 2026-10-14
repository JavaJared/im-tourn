import { RefreshCw, Compass } from 'lucide-react';
import { Button, buttonClass } from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import FeedSkeleton from '../../components/ui/FeedSkeleton';
import BracketLoader from '../../components/BracketLoader';
import {useEffect,useRef} from 'react';
import {useAuth} from '../../contexts/AuthContext';
import ViewLink from '../../components/layout/ViewLink';
import useForYouFeed from './useForYouFeed';
import './feed.css';
import FeedCard from './FeedCard';

export default function ForYouPage({onNavigate}) {
  const {currentUser}=useAuth();
  const feed=useForYouFeed(currentUser?.uid),sentinel=useRef(null);
  useEffect(()=>{
    if(!feed.hasMore||feed.loading||feed.error||!sentinel.current||typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))feed.loadMore();},{rootMargin:'500px'});
    observer.observe(sentinel.current);return()=>observer.disconnect();
  },[feed.hasMore,feed.loading,feed.error,feed.items.length]);
  return <div className="for-you-page">
    <header className="feed-heading"><h1>For You</h1><div><Button variant="ghost" disabled={feed.loading} onClick={feed.refresh}><RefreshCw size={18} aria-hidden="true"/>Refresh</Button></div></header>

    {feed.personalizationUnavailable&&<p role="status">Showing discoveries while your personalized feed is unavailable.</p>}
    <div>{feed.postsUnavailable&&<p role="status">Some posts could not load. Refresh to try again.</p>}</div>
    <div className="feed-posts">{feed.items.map(item=><FeedCard key={`${item.type}:${item.id}`} item={item} uid={currentUser?.uid} onNavigate={onNavigate} onHide={feed.hide}/>)}</div>
    {feed.error&&<p className="feed-error" role="alert">{feed.error} <button className="back-btn" disabled={feed.loading} onClick={feed.loadMore}>Retry</button></p>}
    {feed.loading&&(feed.items.length ? <BracketLoader label="Loading more…" compact/> : <FeedSkeleton/>)}
    {!feed.loading&&!feed.error&&!feed.items.length&&<EmptyState icon={Compass} title="Find your next competition" action={<ViewLink className={buttonClass('primary')} view="browse" onNavigate={onNavigate}>Explore brackets</ViewLink>}>Discover brackets, rankings, and debates from the community.</EmptyState>}
    <div ref={sentinel} className="feed-end">{feed.hasMore&&!feed.error&&<button className="back-btn" disabled={feed.loading} onClick={feed.loadMore}>Load more</button>}
      {!feed.hasMore&&feed.items.length>0&&<p>You’re all caught up.</p>}</div>
  </div>;
}
