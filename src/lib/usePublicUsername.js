import { useEffect, useState } from 'react';
import { refreshUsername, subscribeUsername } from '../services/publicUsernames';

export default function usePublicUsername(userId) {
  const [state, setState] = useState({});
  useEffect(() => {
    const unsubscribe = subscribeUsername(userId, username => setState({ id: userId, username }));
    const interval = setInterval(() => refreshUsername(userId), 60000);
    return () => { unsubscribe(); clearInterval(interval); };
  }, [userId]);
  const username = state.id === userId ? state.username : undefined;
  return username ? `@${username}` : username === undefined ? '…' : 'Username unavailable';
}
