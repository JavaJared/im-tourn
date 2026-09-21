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
    <h2 ref={heading} tabIndex={-1}>{friend.displayName}’s activity</h2>
    <div className="friend-filter">
      <label>Activity type<select value={kind} onChange={e => {setKind(e.target.value); setSelected(null);}}><option value="brackets">Brackets</option><option value="rankings">Rankings</option></select></label>
      <label>Participation<select value={mode} onChange={e => {setMode(e.target.value); setSelected(null);}}><option value="created">Created</option><option value="filled">Filled out / voted in</option></select></label>
    </div>
    {catalog.loading && <p role="status">Loading activity…</p>}
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
    try { const result = await callServer(endpoint, data); setMessage(result.message || success); setSelected(null); await friends.refresh(); }
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
    <p>Connect with people you know to explore their brackets, rankings, and saved choices.</p>
    <p>Sending or accepting a request agrees to share your published creations and standalone saved brackets and ranking votes, including past activity. Private pools, unpublished drafts, and device-only picks are excluded. Either person can remove the friendship.</p>
    <section className="friend-section"><h2>Add a friend</h2>
      {profile ? <label>Your friend code<input readOnly value={profile.code} onFocus={e => e.target.select()} /><span>Share this code with someone you want to add.</span></label> : profileError ? <p role="alert">{profileError} <button onClick={() => setProfileRetry(n => n + 1)}>Retry friend code</button></p> : <p role="status">Loading your friend code…</p>}
      <form onSubmit={e => { e.preventDefault(); perform('sendFriendRequest', {code}, 'Friend request sent.'); }}>
        <label>Friend’s code<input value={code} onChange={e => setCode(e.target.value)} required maxLength={48} autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>
        <button className="nav-btn" disabled={busy || !code.trim()}>{busy ? 'Saving…' : 'Send friend request'}</button>
      </form>
    </section>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {friends.loading && <p role="status">Loading friends and requests…</p>}
    {[['Incoming requests',incoming],['Sent requests',outgoing],['Your friends',accepted]].map(([title, list]) => <section className="friend-section" key={title}>
      <h2>{title}</h2>
      {!friends.loading && !friends.error && !list.length && <p>None on this page.</p>}
      <ul className="friend-list">{list.map(friend => <li key={friend.id}>
        <UserLink userId={friend.friendId} name={friend.displayName} /><div className="friend-actions">
          {friend.status === 'accepted' ? <><button className="nav-btn" onClick={() => onNavigate(`profile-${friend.friendId}`)}>View profile<span className="sr-only"> for {friend.displayName}</span></button><button className="back-btn" onClick={() => setSelected(friend)}>Activity preview<span className="sr-only"> for {friend.displayName}</span></button><button className="back-btn" disabled={busy} onClick={() => action(friend,'remove')}>Remove friend<span className="sr-only"> {friend.displayName}</span></button></> : friend.incoming ? <><button className="nav-btn" disabled={busy} onClick={() => action(friend,'accept')}>Accept<span className="sr-only"> {friend.displayName}</span></button><button className="back-btn" disabled={busy} onClick={() => action(friend,'decline')}>Decline<span className="sr-only"> {friend.displayName}</span></button></> : <button className="back-btn" disabled={busy} onClick={() => action(friend,'cancel')}>Cancel request<span className="sr-only"> to {friend.displayName}</span></button>}
        </div>
      </li>)}</ul>
    </section>)}
    <CatalogControls catalog={friends} />
    {selected && <FriendActivities key={selected.friendId} friend={selected} onNavigate={onNavigate} />}
  </div>;
}
