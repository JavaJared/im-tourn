import BracketLoader from '../../components/BracketLoader';
import ProfilePosts from '../feed/ProfilePosts';
import ProfileAvatar from './ProfileAvatar';
import ProfileEditor from './ProfileEditor';
import './profile.css';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { callServer } from '../../services/server';
import { usePagedCatalog } from '../../lib/usePagedCatalog';
import CatalogControls from '../../components/CatalogControls';
import FriendActivityDialog from './FriendActivityDialog';
import './friends.css';
import ProfileFriendAction from './ProfileFriendAction';

const statLabels = [
  ['createdBrackets', 'Created brackets'],
  ['createdRankings', 'Created rankings'],
  ['filledBrackets', 'Filled brackets'],
  ['filledRankings', 'Filled rankings'],
  ['poolsJoined', 'Pools joined'],
  ['averageFinalRank', 'Average final rank'],
  ['highestFinalRank', 'Best pool finish'],
  ['poolsWon', 'Pools won'],
];

function ActivityList({ profileId, kind, mode, onNavigate, onSelect, canViewPrivate }) {
  const types = kind === 'brackets' ? ['legacy', 'custom'] : ['ranking'];
  const catalog = usePagedCatalog(types, {
    endpoint: 'listFriendActivities',
    params: { friendId: profileId, mode },
    scope: profileId,
    enabled: mode !== 'filled' || canViewPrivate,
  });
  const open = item => {
    if (mode === 'filled') onSelect(item);
    else if (item.activityType === 'ranking') onNavigate(`ranking-${item.bracketId}`);
    else if (item.activityType === 'custom') onNavigate(`custom-bracket-${item.bracketId}`);
    else onNavigate(`fill-bracket-${item.bracketId}`);
  };
  return <section className="friend-section profile-activity">
    <h2>{mode === 'created' ? 'Created' : 'Filled out / voted in'} {kind}</h2>
    {mode === 'filled' && !canViewPrivate ? <p className="profile-private-note">Filled choices and pool results are visible after you become accepted friends.</p> : <>
    {catalog.error && <p role="alert">{catalog.error}</p>}
    {catalog.loading && !catalog.items.length && <p role="status">Loading activity…</p>}
    {!catalog.loading && !catalog.error && !catalog.items.length && <p>No activity found.</p>}
    <ul className="friend-list">{catalog.items.map(item => <li key={`${item.catalogType}:${item.id}`}>
      <span>{item.title}</span>
      <button className="back-btn" onClick={() => open(item)}>{mode === 'filled' ? 'View saved choices' : 'Open'}<span className="sr-only"> {item.title}</span></button>
    </li>)}</ul>
    <CatalogControls catalog={catalog} />
    </>}
  </section>;
}

export default function ProfilePage({ profileId, onNavigate }) {
  const { currentUser, username, updateUsername } = useAuth();
  const targetId = profileId || currentUser?.uid;
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [statsError, setStatsError] = useState('');
  const [kind, setKind] = useState('brackets'), [mode, setMode] = useState('created'), [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    setProfile(null); setError(''); setStatsError(''); setSelected(null); setMode('created'); setEditing(false);
    if (targetId && currentUser) {
      let full = null;
      callServer('getUserProfile', { profileId:targetId, section:'header' }).then(
        value => { if (active && !full) setProfile(value); },
        reason => { if (active && !full) setError(reason.message || 'This profile could not be loaded.'); },
      );
      callServer('getUserProfile', { profileId:targetId }).then(
        value => { full = value; if (active) { setError(''); setProfile(previous => ({...value, ...(previous ? {bio:previous.bio, photoURL:previous.photoURL} : {}), statsPending:false})); } },
        reason => { if (active) setStatsError(reason.message || 'Statistics could not be loaded.'); },
      );
    }
    return () => { active = false; };
  }, [targetId, currentUser?.uid, retry]);

  if (!currentUser) return <div className="home-container"><h1>Profile</h1><p>Sign in to view profiles.</p></div>;
  if (error) return <div className="home-container"><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="nav-btn" onClick={() => setRetry(value => value + 1)}>Retry loading profile</button></div>;
  if (!profile) return <div className="home-container"><BracketLoader label="Loading profile…"/></div>;

  return <div className="home-container profile-page">
    <header className="profile-hero">
      {profile.isSelf && <button className="profile-edit-button back-btn" aria-label="Edit profile" onClick={() => setEditing(true)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5" /></svg>
      </button>}
      <ProfileAvatar photoURL={profile.photoURL} username={profile.isSelf ? username : profile.username} />
      <div className="profile-identity">
        <h1>@{(profile.isSelf ? username : profile.username) || 'user'}</h1>
        <div className="profile-social">
          {profile.isSelf ? <button className="back-btn" onClick={() => onNavigate('friends')}><strong>{profile.friendCount ?? '—'}</strong> {profile.friendCount === 1 ? 'friend' : 'friends'}</button>
            : <span><strong>{profile.friendCount ?? '—'}</strong> {profile.friendCount === 1 ? 'friend' : 'friends'}</span>}
          <ProfileFriendAction key={`${currentUser.uid}:${profile.id}`} profile={profile} onRefresh={() => setRetry(value => value + 1)} />
        </div>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        {profile.isSelf && !profile.bio && <button className="profile-add-bio" onClick={() => setEditing(true)}>Add bio</button>}
      </div>
    </header>
    {editing && profile.isSelf && <ProfileEditor key={targetId} profile={profile} username={username} updateUsername={updateUsername} onClose={() => setEditing(false)} onSaved={details => setProfile(previous => ({ ...previous, ...details }))} />}
    <section className="profile-stats" aria-label="Profile statistics">
      {statLabels.filter(([key]) => key.startsWith('created') || profile.canViewPrivate).map(([key, label]) => <div className="profile-stat" key={key}><strong>{profile.stats[key] == null ? '—' : profile.stats[key]}</strong><span>{label}</span></div>)}
    </section>
    {profile.statsPending && !statsError && <p role="status">Loading statistics…</p>}
    {statsError && <p role="alert">Statistics unavailable. <button className="back-btn" onClick={() => setRetry(value => value + 1)}>Retry statistics</button></p>}
    {profile.statsIncomplete && <span role="status">Statistics incomplete</span>}
    <section className="friend-section">
      <div className="friend-filter profile-filters">
        {mode!=='posted'&&<label>Activity type<select value={kind} onChange={event => { setKind(event.target.value); setSelected(null); }}><option value="brackets">Brackets</option><option value="rankings">Rankings</option></select></label>}
        <label>Participation<select value={mode} onChange={event => { setMode(event.target.value); setSelected(null); }}><option value="posted">Posted to feed</option><option value="created">Created</option><option value="filled" disabled={!profile.canViewPrivate}>Filled out / voted in{!profile.canViewPrivate ? ' (friends only)' : ''}</option></select></label>
      </div>
      {mode==='posted'?<ProfilePosts key={targetId} userId={targetId} uid={currentUser.uid} onNavigate={onNavigate}/>:<ActivityList key={`${targetId}:${kind}:${mode}`} profileId={targetId} kind={kind} mode={mode} canViewPrivate={profile.canViewPrivate} onNavigate={onNavigate} onSelect={setSelected} />}
    </section>
    <FriendActivityDialog selection={selected} friendId={targetId} onClose={() => setSelected(null)} />
  </div>;
}
