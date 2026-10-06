import {useCallback,useEffect,useRef,useState} from 'react';
import {callServer} from '../../services/server';
import {rememberUsername} from '../../services/publicUsernames';
// In-memory only, isolated to the most recently used account. Keep the feed
// visible while a fresh visit loads, without persisting private interests.
let cached=null;
export function invalidateFeed(){cached=null;}
export default function useForYouFeed(uid) {
  const scope=uid||'guest';
  const saved=cached?.scope===scope&&cached.expires>Date.now()?cached:null;
  const [items,setItems]=useState(()=>saved?.items||[]),[cursor,setCursor]=useState(()=>saved?.cursor||null);
  const [started,setStarted]=useState(!!saved),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [personalizationUnavailable,setUnavailable]=useState(false),[postsUnavailable,setPostsUnavailable]=useState(false);
  const activeScope=useRef(scope);activeScope.current=scope;
  const hidden=useRef(new Set());
  const pendingReset=useRef(false);
  const busy=useRef(false),generation=useRef(0),alive=useRef(true),cursorRef=useRef(saved?.cursor||null),itemsRef=useRef(saved?.items||[]);
  const remember=()=>{cached={scope,items:itemsRef.current,cursor:cursorRef.current,expires:Date.now()+600000};};
  const load=useCallback(async(reset=false)=>{
    if(busy.current)return;
    reset=reset||pendingReset.current;pendingReset.current=reset;
    busy.current=true;const request=++generation.current;setLoading(true);setError('');
    try {
      const data=await callServer('getForYouFeed',{cursor:reset?null:cursorRef.current,...(reset?{recentlyShown:itemsRef.current.slice(0,8).map(item=>`${item.type}:${item.id}`)}:{})});
      if(!alive.current||request!==generation.current)return;
      if(!Array.isArray(data?.items)||!(data.nextCursor===null||typeof data.nextCursor==='string'))throw Error('Could not load the feed.');
      Object.entries(data.usernames||{}).forEach(([id,name])=>rememberUsername(id,name));
      itemsRef.current=[...new Map([...(reset?[]:itemsRef.current),...data.items.filter(item=>item&&typeof item.id==='string'&&['legacy','custom','ranking','post'].includes(item.type)&&!hidden.current.has(`${item.type}:${item.id}`))].map(item=>[`${item.type}:${item.id}`,item])).values()];
      pendingReset.current=false;cursorRef.current=data.nextCursor;setItems(itemsRef.current);setCursor(data.nextCursor);setStarted(true);setUnavailable(!!data.personalizationUnavailable);setPostsUnavailable(!!data.postsUnavailable);remember();
    }catch(reason){if(alive.current&&request===generation.current)setError(/internal|not-found|unavailable|failed to fetch|network/i.test(`${reason.code || ''} ${reason.message || ''}`) ? 'Your feed is temporarily unavailable. Please retry in a moment, or use Explore to find brackets and rankings.' : reason.message || 'Could not load the feed. Please retry.');}
    finally{if(request===generation.current){busy.current=false;if(alive.current)setLoading(false);}}
  },[scope]);
  useEffect(()=>{
    alive.current=true;
    if(!saved)cached=null;
    load(true);
    const refresh=()=>load(true);
    if(typeof window!=='undefined')window.addEventListener('imtourn:refresh-feed',refresh);
    return()=>{alive.current=false;generation.current++;busy.current=false;if(typeof window!=='undefined')window.removeEventListener('imtourn:refresh-feed',refresh);};
  },[scope]);
  const hide=async item=>{
    await callServer('recordFeedFeedback',{type:item.type,itemId:item.id,action:'hide'});
    if(!alive.current||activeScope.current!==scope)return;
    hidden.current.add(`${item.type}:${item.id}`);
    itemsRef.current=itemsRef.current.filter(entry=>entry.id!==item.id||entry.type!==item.type);setItems(itemsRef.current);remember();
  };
  return {items,loading,error,personalizationUnavailable,postsUnavailable,hasMore:!started||cursor!==null,loadMore:()=>load(),refresh:()=>load(true),hide};
}
