import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {callServer} from '../../services/server';
import {useDialog} from '../../lib/useDialog';
import './notifications.css';

export default function NotificationBell({onNavigate}) {
  const [open,setOpen]=useState(false),[count,setCount]=useState(0),[items,setItems]=useState([]);
  const [cursor,setCursor]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const alive=useRef(true),version=useRef(0),working=useRef(false),countVersion=useRef(0);
  const ref=useDialog(open,()=>setOpen(false));
  useEffect(()=>{
    alive.current=true;
    let pending=false;
    const poll=async()=>{
      if(document.hidden||pending||working.current)return;
      pending=true;const sequence=++countVersion.current;
      try {const data=await callServer('listBracketNotifications',{countOnly:true});if(alive.current&&sequence===countVersion.current)setCount(data.unreadCount);}
      catch {/* The inbox provides an explicit retry if fetching fails. */}
      finally{pending=false;}
    };
    poll();const timer=setInterval(poll,60000);
    window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);
    return ()=>{alive.current=false;version.current++;clearInterval(timer);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll);};
  },[]);
  async function load(next=null) {
    const request=++version.current,sequence=++countVersion.current;
    setLoading(true);setError('');
    try {
      const data=await callServer('listBracketNotifications',{cursor:next});
      if(!alive.current||request!==version.current)return;
      setItems(previous=>next?[...new Map([...previous,...data.items].map(item=>[item.id,item])).values()]:data.items);
      setCursor(data.nextCursor);if(sequence===countVersion.current)setCount(data.unreadCount);
    }catch(reason){if(alive.current&&request===version.current)setError(reason.message||'Could not load notifications.');}
    finally{if(alive.current&&request===version.current)setLoading(false);}
  }
  async function read(item,shouldOpen) {
    if(working.current)return;
    working.current=true;setBusy(item.id);setError('');
    // Invalidate older reads so they cannot restore an unread badge.
    version.current++;countVersion.current++;setLoading(false);
    try {
      const result=await callServer('readBracketNotification',{notificationId:item.id,open:shouldOpen});
      if(!alive.current)return;
      countVersion.current++;
      setItems(previous=>previous.map(entry=>entry.id===item.id?{...entry,read:true}:entry));
      if(!item.read)setCount(value=>Math.max(0,value-1));
      if(shouldOpen){setOpen(false);onNavigate(result.view);}
    }catch(reason){if(alive.current)setError(reason.message||'Could not open notification.');}
    finally{working.current=false;if(alive.current)setBusy('');}
  }
  return <>
    <button className="notification-bell back-btn" type="button" aria-label={`Notifications${count?`, ${count} unread`:''}`} aria-haspopup="dialog" onClick={()=>{setOpen(true);load();}}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
      {count>0&&<span className="notification-badge" aria-hidden="true">{count>99?'99+':count}</span>}
    </button>
    {open&&createPortal(<div className="notification-overlay" onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <section className="notification-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-title" ref={ref}>
        <header><h2 id="notification-title">Notifications</h2><button className="back-btn" onClick={()=>setOpen(false)} aria-label="Close notifications">✕</button></header>
        <button className="back-btn" disabled={loading||!!busy} onClick={()=>load()}>Refresh</button>
        {error&&<p role="alert">{error} <button className="back-btn" disabled={loading||!!busy} onClick={()=>load()}>Retry</button></p>}
        {loading&&<p role="status">Loading notifications…</p>}
        {!loading&&!error&&!items.length&&<p>No shared brackets yet.</p>}
        <ul>{items.map(item=><li key={item.id} className={item.read?'':'notification-unread'}>
          <p>{!item.read&&<strong>New · </strong>}{item.username?`@${item.username}`:'A friend'} sent you a bracket</p>
          <strong>{item.title}</strong>
          <div><button className="nav-btn" disabled={!!busy} onClick={()=>read(item,true)}>{busy===item.id?'Working…':'Open bracket'}</button>
          {!item.read&&<button className="back-btn" disabled={!!busy} onClick={()=>read(item,false)}>Mark read</button>}</div>
        </li>)}</ul>
        {cursor&&<button className="back-btn" disabled={loading||!!busy} onClick={()=>load(cursor)}>Load older notifications</button>}
      </section>
    </div>,document.body)}
  </>;
}
