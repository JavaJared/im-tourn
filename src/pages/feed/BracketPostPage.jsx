import BracketLoader from '../../components/BracketLoader';
import {useEffect,useState} from 'react';
import {useAuth} from '../../contexts/AuthContext';
import {callServer} from '../../services/server';
import {rememberUsername} from '../../services/publicUsernames';
import UserLink from '../../components/layout/UserLink';
import ViewLink from '../../components/layout/ViewLink';
import BracketBoard from '../../components/BracketBoard';
import {BracketFrame,bracketFrameStyles} from '../../components/BracketFrame';
import PostLikeButton from './PostLikeButton';
import PostComments from './PostComments';
import {invalidateFeed} from './useForYouFeed';
import './social.css';
export default function BracketPostPage({postId,onNavigate}){
  const {currentUser}=useAuth(),uid=currentUser?.uid;
  const [post,setPost]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[removing,setRemoving]=useState(false),[confirm,setConfirm]=useState(false),[removeError,setRemoveError]=useState('');
  useEffect(()=>{let active=true;setPost(null);setError('');callServer('getBracketPost',{postId}).then(data=>{if(active){Object.entries(data.usernames||{}).forEach(([id,name])=>rememberUsername(id,name));setPost(data);}}).catch(reason=>{if(active)setError(reason.message||'Could not load the post.');});return()=>{active=false;};},[postId,uid,retry]);
  async function remove(){if(removing)return;setRemoving(true);setRemoveError('');try{await callServer('deleteBracketPost',{postId});invalidateFeed();onNavigate('home');}catch(reason){setRemoveError(reason.message||'Could not remove the post.');setRemoving(false);}}
  return <section className="bracket-post-page"><ViewLink view="home" onNavigate={onNavigate}>Back to For You</ViewLink>
    {error?<p role="alert">{error} <button className="social-button" onClick={()=>setRetry(value=>value+1)}>Retry</button></p>:!post?<BracketLoader label="Loading post…"/>:<>
      <header className="post-heading"><div><UserLink userId={post.userId} onNavigate={onNavigate}/><h1>{post.title}</h1></div>{uid===post.userId&&(confirm?<div className="social-actions"><span>Remove this public post?</span><button className="social-button" disabled={removing} onClick={()=>setConfirm(false)}>Cancel</button><button className="social-button" disabled={removing} onClick={remove}>{removing?'Removing…':'Remove post'}</button></div>:<button className="social-button" onClick={()=>setConfirm(true)}>Remove post</button>)}</header>
      {removeError&&<p role="alert">{removeError}</p>}{post.caption&&<p className="post-caption">{post.caption}</p>}
      <BracketFrame><div style={bracketFrameStyles.scroll}><BracketBoard state={post.state} nameMap={post.nameMap} seedMap={post.seedMap} editable={false}/></div></BracketFrame>
      <div className="social-actions post-interactions"><PostLikeButton post={post} uid={uid}/><ViewLink className="social-button" view={`${post.bracketType==='custom'?'custom-bracket':'fill-bracket'}-${post.bracketId}`} onNavigate={onNavigate}>Make your picks</ViewLink></div>
      <PostComments key={`${postId}:${uid||'guest'}`} postId={postId} ownerId={post.userId} uid={uid} onNavigate={onNavigate}/>
    </>}
  </section>;
}
