import {useEffect,useRef,useState} from 'react';
import {callServer} from '../../services/server';
import {rememberUsername} from '../../services/publicUsernames';
import FeedCard from './FeedCard';
export default function ProfilePosts({userId,uid,onNavigate}){
  const [items,setItems]=useState([]),[cursor,setCursor]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const busy=useRef(false),alive=useRef(true);
  async function load(){if(busy.current)return;busy.current=true;setLoading(true);setError('');try{const data=await callServer('listUserBracketPosts',{userId,cursor});if(!alive.current)return;Object.entries(data.usernames||{}).forEach(([id,name])=>rememberUsername(id,name));setItems(old=>[...new Map([...old,...data.items].map(item=>[item.id,item])).values()]);setCursor(data.nextCursor);}catch(reason){if(alive.current)setError(reason.message||'Could not load posts.');}finally{busy.current=false;if(alive.current)setLoading(false);}}
  useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;};},[userId]);
  return <section><h2>Posts</h2><div className="feed-posts">{items.map(item=><FeedCard key={item.id} item={item} uid={uid} onNavigate={onNavigate}/>)}</div>{loading&&<p role="status">Loading posts…</p>}{error&&<p role="alert">{error} <button className="social-button" disabled={loading} onClick={load}>Retry</button></p>}{!loading&&!error&&!items.length&&<p>No posts yet.</p>}{cursor&&!error&&<button className="social-button" disabled={loading} onClick={load}>More posts</button>}</section>;
}
