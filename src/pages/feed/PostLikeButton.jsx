import {useEffect,useRef,useState} from 'react';
import {callServer} from '../../services/server';
import {invalidateFeed} from './useForYouFeed';
import './social.css';
export default function PostLikeButton({post,uid}){
  const [liked,setLiked]=useState(!!post.liked),[count,setCount]=useState(post.likeCount||0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  useEffect(()=>{if(!pending.current){setLiked(!!post.liked);setCount(post.likeCount||0);}},[post.id,post.liked,post.likeCount]);
  async function toggle(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{const result=await callServer('setBracketPostLike',{postId:post.id,liked:!liked});setLiked(result.liked);setCount(result.likeCount);invalidateFeed();}catch(reason){setError(reason.message||'Could not update your like. Please retry.');}finally{pending.current=false;setBusy(false);}}
  return <div><button className="social-button" aria-pressed={liked} disabled={!uid||busy} onClick={toggle} title={uid?undefined:'Sign in to like this post'}><span aria-hidden="true">{liked?'♥':'♡'}</span> {busy?'Saving…':`${count} ${count===1?'like':'likes'}`}</button>{error&&<p role="alert">{error}</p>}</div>;
}
