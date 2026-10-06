import ActionDialog from '../../components/ActionDialog';
import ActionDisclosure from '../../components/ActionDisclosure';
import BracketLoader from '../../components/BracketLoader';
import UsernameText from '../../components/layout/UsernameText';
import UserLink from '../../components/layout/UserLink';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { callServer } from '../../services/server';
import { usePagedCatalog } from '../../lib/usePagedCatalog';
import CatalogControls from '../../components/CatalogControls';
import FriendActivityDialog from './FriendActivityDialog';
import './friends.css';

function FriendActivities({ friend, onNavigate }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [kind, setKind] = useState('brackets'), [mode, setMode] = useState('created'), [selected, setSelected] = useState(null);
  const catalog = usePagedCatalog(kind === 'brackets' ? ['legacy','custom'] : ['ranking'], { endpoint:'listFriendActivities', params:{friendId:friend.friendId, mode} });
  const open = item => mode === 'filled' ? setSelected(item) : onNavigate(`${item.activityType === 'ranking' ? 'ranking-' : item.activityType === 'custom' ? 'custom-bracket-' : 'fill-bracket-'}${item.bracketId}`);
  return <section className="friend-section">
    <h2 ref={heading} tabIndex={-1}><UsernameText userId={friend.friendId} />’s activity</h2>
    <div className="friend-filter">
      <label>Activity type<select value={kind} onChange={e => {setKind(e.target.value); setSelected(null);}}><option value="brackets">Brackets</option><option value="rankings">Rankings</option></select></label>
      <label>Participation<select value={mode} onChange={e => {setMode(e.target.value); setSelected(null);}}><option value="created">Created</option><option value="filled">Filled out / voted in</option></select></label>
    </div>
    {catalog.loading && <BracketLoader compact label="Loading activity…" />}
    {!catalog.loading && !catalog.error && !catalog.items.length && <p>No shared activity on this page. {catalog.hasMore ? 'Load more to continue.' : ''}</p>}
    <ul className="friend-list">{catalog.items.map(item => <li key={`${item.catalogType}:${item.id}`}><span>{item.title}</span><button className="back-btn" onClick={() => open(item)}>{mode === 'filled' ? 'View saved choices' : 'Open'}<span className="sr-only"> {item.title}</span></button></li>)}</ul>
    <CatalogControls catalog={catalog} />
    <FriendActivityDialog selection={selected} friendId={friend.friendId} onClose={() => setSelected(null)} />
  </section>;
}

export default function FriendsPage({ onNavigate }) {
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState(null), [profileError, setProfileError] = useState(''), [profileRetry, setProfileRetry] = useState(0);
  const [code, setCode] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null);
  const [removingFriend,setRemovingFriend]=useState(null);
  const inFlight = useRef(false);
  const friends = usePagedCatalog(['friends'], { endpoint:'listFriends', scope:currentUser?.uid || '', enabled:!!currentUser });
  useEffect(() => {
    let active = true; setProfile(null); setProfileError('');
    if (currentUser) callServer('getFriendProfile', {}).then(value => { if (active) setProfile(value); }).catch(() => { if (active) setProfileError('Your friend code could not be loaded.'); });
    return () => { active = false; };
  }, [currentUser?.uid, profileRetry]);
  const perform = async (endpoint, data, success) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(''); setError('');
    try { const result = await callServer(endpoint, data); setMessage(result.message || success); setSelected(null); setRemovingFriend(null); await friends.refresh(); }
    catch (reason) { setError(reason.message || 'That action could not be saved. Please retry.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (!currentUser) return <div className="home-container"><h1>Friends</h1><p>Sign in to add friends and see their activity.</p></div>;
  const accepted = friends.items.filter(f => f.status === 'accepted');
  const incoming = friends.items.filter(f => f.status === 'pending' && f.incoming);
  const outgoing = friends.items.filter(f => f.status === 'pending' && !f.incoming);
  const action = (f, value) => perform('respondToFriend', { friendId:f.friendId, action:value }, value === 'accept' ? 'Friend request accepted.' : value === 'remove' ? 'Friend removed. Shared history access has ended.' : 'Request dismissed.');
  return <div className="home-container friends-page">
    <h1>Friends</h1>

    <section className="friend-section"><h2>Add a friend</h2>
      <details className="friend-invite"><summary>Invite with a friend code</summary>{profile ? <label>Your friend code<input readOnly value={profile.code} onFocus={e => e.target.select()} /></label> : profileError ? <p role="alert">{profileError} <button onClick={() => setProfileRetry(n => n + 1)}>Retry friend code</button></p> : <BracketLoader compact label="Loading your friend code…" />}</details>
      <form onSubmit={e => { e.preventDefault(); perform('sendFriendRequest', (/^[A-Fa-f0-9]{24}$/.test(code.replace(/[\s-]/g, '')) ? {code} : {username:code}), 'Friend request sent.'); }}>
        <label>Friend’s username<input placeholder="@username or friend code" value={code} onChange={e => setCode(e.target.value)} required maxLength={48} autoCapitalize="none" autoComplete="off" spellCheck={false} /></label>
        <button className="nav-btn" disabled={busy || !code.trim()}>{busy ? 'Saving…' : 'Send friend request'}</button>
      </form>
    </section>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {friends.loading && <BracketLoader compact label="Loading friends and requests…" />}
    {[['Incoming requests',incoming],['Sent requests',outgoing],['Your friends',accepted]].map(([title, list]) => <section className="friend-section" key={title}>
      <h2>{title} <span className="quiet-count">{list.length}{friends.hasMore?'+':''}</span></h2>
      {!friends.loading && !friends.error && !list.length && <p>None on this page.</p>}
      <ul className="friend-list">{list.map(friend => <li key={friend.id}>
        <UserLink userId={friend.friendId} /><div className="friend-actions">
          {friend.status === 'accepted' ? <ActionDisclosure label="More"><button className="back-btn" onClick={() => setSelected(friend)}>Activity preview<span className="sr-only"> for <UsernameText userId={friend.friendId} /></span></button><button className="back-btn" disabled={busy} onClick={() => setRemovingFriend(friend)}>Remove friend<span className="sr-only"> <UsernameText userId={friend.friendId} /></span></button></ActionDisclosure> : friend.incoming ? <><button className="nav-btn" disabled={busy} onClick={() => action(friend,'accept')}>Accept<span className="sr-only"> <UsernameText userId={friend.friendId} /></span></button><button className="back-btn" disabled={busy} onClick={() => action(friend,'decline')}>Decline<span className="sr-only"> <UsernameText userId={friend.friendId} /></span></button></> : <button className="back-btn" disabled={busy} onClick={() => action(friend,'cancel')}>Cancel request<span className="sr-only"> to <UsernameText userId={friend.friendId} /></span></button>}
        </div>
      </li>)}</ul>
    </section>)}
    {removingFriend&&<ActionDialog title="Remove friend?" onClose={()=>{if(!busy)setRemovingFriend(null);}}><p>Remove <UsernameText userId={removingFriend.friendId}/>? Shared history access will end.</p>{error&&<p role="alert">{error}</p>}<div className="download-options"><button className="back-btn" disabled={busy} onClick={()=>setRemovingFriend(null)}>Cancel</button><button className="back-btn" disabled={busy} onClick={()=>action(removingFriend,'remove')}>{busy?'Removing…':'Remove friend'}</button></div></ActionDialog>}
    <CatalogControls catalog={friends} />
    {selected && <FriendActivities key={selected.friendId} friend={selected} onNavigate={onNavigate} />}
  </div>;
}
