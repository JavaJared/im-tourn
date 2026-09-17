import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { callServer } from '../../services/server';
import { usePagedCatalog } from '../../lib/usePagedCatalog';
import CatalogControls from '../../components/CatalogControls';
import FriendActivityDialog from './FriendActivityDialog';
import './friends.css';

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

function ActivityList({ profileId, kind, mode, onNavigate, onSelect }) {
  const types = kind === 'brackets' ? ['legacy', 'custom'] : ['ranking'];
  const catalog = usePagedCatalog(types, {
    endpoint: 'listFriendActivities',
    params: { friendId: profileId, mode },
    scope: profileId,
  });
  const open = item => {
    if (mode === 'filled') onSelect(item);
    else if (item.activityType === 'ranking') onNavigate(`ranking-${item.bracketId}`);
    else if (item.activityType === 'custom') onNavigate(`custom-bracket-${item.bracketId}`);
    else onNavigate(`fill-bracket-${item.bracketId}`);
  };
  return <section className="friend-section profile-activity">
    <h2>{mode === 'created' ? 'Created' : 'Filled out / voted in'} {kind}</h2>
    {catalog.error && <p role="alert">{catalog.error}</p>}
    {catalog.loading && !catalog.items.length && <p role="status">Loading activity…</p>}
    {!catalog.loading && !catalog.error && !catalog.items.length && <p>No activity found.</p>}
    <ul className="friend-list">{catalog.items.map(item => <li key={`${item.catalogType}:${item.id}`}>
      <span>{item.title}</span>
      <button className="back-btn" onClick={() => open(item)}>{mode === 'filled' ? 'View saved choices' : 'Open'}<span className="sr-only"> {item.title}</span></button>
    </li>)}</ul>
    <CatalogControls catalog={catalog} />
  </section>;
}

export default function ProfilePage({ profileId, onNavigate }) {
  const { currentUser } = useAuth();
  const targetId = profileId || currentUser?.uid;
  const [profile, setProfile] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [kind, setKind] = useState('brackets'), [mode, setMode] = useState('created'), [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    setProfile(null); setError('');
    if (targetId) callServer('getUserProfile', { profileId: targetId }).then(
      value => { if (active) setProfile(value); },
      reason => { if (active) setError(reason.message || 'This profile could not be loaded.'); },
    );
    return () => { active = false; };
  }, [targetId, retry]);

  if (!currentUser) return <div className="home-container"><h1>Profile</h1><p>Sign in to view profiles.</p></div>;
  if (error) return <div className="home-container"><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="nav-btn" onClick={() => setRetry(value => value + 1)}>Retry loading profile</button></div>;
  if (!profile) return <div className="home-container"><p role="status">Loading profile…</p></div>;

  return <div className="home-container profile-page">
    <div className="profile-heading">
      <div className="profile-avatar" aria-hidden="true">{profile.displayName?.[0]?.toUpperCase() || '?'}</div>
      <div><h1>{profile.displayName}’s Profile</h1><p>{profile.isSelf ? 'Your public activity and private account statistics.' : 'A friend’s shared activity and statistics.'}</p></div>
    </div>
    <p className="profile-privacy">Published creations are visible here. Filled choices and pool statistics are shared only with you and accepted friends. Private pool predictions and unpublished drafts are never included.</p>
    <section className="profile-stats" aria-label="Profile statistics">
      {statLabels.map(([key, label]) => <div className="profile-stat" key={key}><strong>{profile.stats[key] == null ? '—' : profile.stats[key]}</strong><span>{label}</span></div>)}
    </section>
    <section className="friend-section">
      <div className="friend-filter profile-filters">
        <label>Activity type<select value={kind} onChange={event => { setKind(event.target.value); setSelected(null); }}><option value="brackets">Brackets</option><option value="rankings">Rankings</option></select></label>
        <label>Participation<select value={mode} onChange={event => { setMode(event.target.value); setSelected(null); }}><option value="created">Created</option><option value="filled">Filled out / voted in</option></select></label>
      </div>
      <ActivityList key={`${targetId}:${kind}:${mode}`} profileId={targetId} kind={kind} mode={mode} onNavigate={onNavigate} onSelect={setSelected} />
    </section>
    <FriendActivityDialog selection={selected} friendId={targetId} onClose={() => setSelected(null)} />
  </div>;
}
