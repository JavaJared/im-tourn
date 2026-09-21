import { useEffect, useRef, useState } from 'react';
import { callServer } from '../../services/server';

export default function ProfileFriendAction({ profile, onRefresh }) {
  const [state, setState] = useState({ busy: false, error: '' });
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  if (profile.isSelf) return null;
  async function act(action) {
    setState({ busy: true, error: '' });
    try {
      await callServer(action === 'send' ? 'sendFriendRequest' : 'respondToFriend', { friendId: profile.id, ...(action === 'send' ? {} : { action }) });
      if (active.current) onRefresh();
    } catch (error) {
      if (active.current) setState({ busy: false, error: error.message || 'Please try again.' });
    }
  }
  return <div className="profile-friend-action">
    <div className="friend-actions">
      {profile.relationship === 'accepted' ? <span role="status">Friends</span>
        : profile.relationship === 'incoming' ? <><span>Friend request received</span><button className="nav-btn" disabled={state.busy} onClick={() => act('accept')}>Accept request</button><button className="back-btn" disabled={state.busy} onClick={() => act('decline')}>Decline</button></>
        : profile.relationship === 'outgoing' ? <><span role="status">Friend request pending</span><button className="back-btn" disabled={state.busy} onClick={() => act('cancel')}>Cancel request</button></>
        : profile.canSendFriendRequest ? <button className="nav-btn" disabled={state.busy} onClick={() => act('send')}>Add friend</button> : null}
    </div>
    {state.busy && <p role="status">Saving…</p>}
    {state.error && <p role="alert">{state.error}</p>}
  </div>;
}
