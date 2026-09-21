import { useCallback, useEffect, useRef, useState } from 'react';
import { callServer } from '../services/server';

export default function useAccountUsername(user) {
  const uid = user?.uid;
  const activeUid = useRef(uid); activeUid.current = uid;
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!uid) { setState({}); return; }
    setState({ uid, loading: true });
    callServer('getAccountUsername', {}).then(
      data => { if (active) setState({ uid, ...data }); },
      error => { if (active) setState({ uid, error: error.message || 'Could not load your username.' }); },
    );
    return () => { active = false; };
  }, [uid, attempt]);
  const updateUsername = useCallback(async username => {
    if (!uid) throw Error('Sign in to change your username.');
    const data = await callServer('setAccountUsername', { username });
    if (activeUid.current === uid) setState({ uid, ...data });
    return data;
  }, [uid]);
  return { account: state.uid === uid ? state : { loading: !!uid }, updateUsername,
    retryUsername: () => setAttempt(value => value + 1) };
}
