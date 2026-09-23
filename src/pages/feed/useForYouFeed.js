import {useCallback,useEffect,useRef,useState} from 'react';
import {callServer} from '../../services/server';
import {rememberUsername} from '../../services/publicUsernames';
// In-memory only, isolated to the most recently used account. Keep the feed
// in place when returning from a bracket without persisting private interests.
let cached=null;
export default function useForYouFeed(uid) {
  const scope=uid||'guest';
  const saved=cached?.scope===scope&&cached.expires>Date.now()?cached:null;
  const [items,setItems]=useState(()=>saved?.items||[]),[cursor,setCursor]=useState(()=>saved?.cursor||null);
  const [started,setStarted]=useState(!!saved),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [personalizationUnavailable,setUnavailable]=useState(false);
  const activeScope=useRef(scope);activeScope.current=scope;
  const hidden=useRef(new Set());
  const busy=useRef(false),generation=useRef(0),alive=useRef(true),cursorRef=useRef(saved?.cursor||null),itemsRef=useRef(saved?.items||[]);
  const remember=()=>{cached={scope,items:itemsRef.current,cursor:cursorRef.current,expires:Date.now()+600000};};
  const load=useCallback(async(reset=false)=>{
    if(busy.current)return;
    busy.current=true;const request=++generation.current;setLoading(true);setError('');
    try {
      const data=await callServer('getForYouFeed',{cursor:reset?null:cursorRef.current});
      if(!alive.current||request!==generation.current)return;
      if(!Array.isArray(data?.items)||!(data.nextCursor===null||typeof data.nextCursor==='string'))throw Error('Could not load the feed.');
      Object.entries(data.usernames||{}).forEach(([id,name])=>rememberUsername(id,name));
      itemsRef.current=[...new Map([...(reset?[]:itemsRef.current),...data.items.filter(item=>item&&typeof item.id==='string'&&['legacy','custom','ranking'].includes(item.type)&&!hidden.current.has(`${item.type}:${item.id}`))].map(item=>[`${item.type}:${item.id}`,item])).values()];
      cursorRef.current=data.nextCursor;setItems(itemsRef.current);setCursor(data.nextCursor);setStarted(true);setUnavailable(!!data.personalizationUnavailable);remember();
    }catch(reason){if(alive.current&&request===generation.current)setError(reason.message||'Could not load the feed.');}
    finally{if(request===generation.current){busy.current=false;if(alive.current)setLoading(false);}}
  },[scope]);
  useEffect(()=>{
    alive.current=true;
    if(!saved){cached=null;load(true);}
    return()=>{alive.current=false;generation.current++;busy.current=false;};
  },[scope]);
  const hide=async item=>{
    await callServer('recordFeedFeedback',{type:item.type,itemId:item.id,action:'hide'});
    if(!alive.current||activeScope.current!==scope)return;
    hidden.current.add(`${item.type}:${item.id}`);
    itemsRef.current=itemsRef.current.filter(entry=>entry.id!==item.id||entry.type!==item.type);setItems(itemsRef.current);remember();
  };
  return {items,loading,error,personalizationUnavailable,hasMore:!started||cursor!==null,loadMore:()=>load(),refresh:()=>load(true),hide};
}
