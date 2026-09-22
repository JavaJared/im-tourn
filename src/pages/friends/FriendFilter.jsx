import UsernameText from '../../components/layout/UsernameText';
import { useAuth } from '../../contexts/AuthContext';
import { usePagedCatalog } from '../../lib/usePagedCatalog';
import './friends.css';

export default function FriendFilter({ friendId, mode, onFriendChange, onModeChange }) {
  const { currentUser } = useAuth();
  const friends = usePagedCatalog(['friends'], { endpoint:'listFriends', scope:currentUser?.uid || '', enabled:!!currentUser });
  if (!currentUser) return null;
  const accepted = friends.items.filter(f => f.status === 'accepted');
  return <div className="friend-filter">
    <label>Whose activity?
      <select value={friendId} onChange={e => onFriendChange(e.target.value)}>
        <option value="">Everyone</option>
        {accepted.map(friend => <option key={friend.friendId} value={friend.friendId}><UsernameText userId={friend.friendId} /></option>)}
      </select>
    </label>
    {friendId && <label>Friend’s activity
      <select value={mode} onChange={e => onModeChange(e.target.value)}><option value="created">Created</option><option value="filled">Filled out / voted in</option></select>
    </label>}
    {friends.loading && <span role="status">Loading friends…</span>}
    {friends.error && <p role="alert">Friends could not be loaded. <button onClick={friends.loadMore}>Retry friends</button></p>}
    {friends.hasMore && !friends.error && <button disabled={friends.loading} onClick={friends.loadMore}>Load more friends</button>}
    {!friends.loading && !friends.error && !accepted.length && <span>Accept a friend request in your profile’s Friends page to filter by their activity.</span>}
  </div>;
}
