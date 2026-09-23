import { rememberUsername } from '../services/publicUsernames';
import { useCallback, useEffect, useRef, useState } from 'react';
import { callServer } from '../services/server';

const cacheKey = uid => `account-username:v1:${uid}`;
function cachedAccount(uid) {
  try {
    const entry = JSON.parse(sessionStorage.getItem(cacheKey(uid)));
    if (entry?.expires > Date.now() && /^[a-z][a-z0-9_]{2,23}$/.test(entry.data?.username)) return entry.data;
  } catch { /* Storage is optional. */ }
  return null;
}
function cacheAccount(uid, data) {
  try {
    if (data.username) sessionStorage.setItem(cacheKey(uid), JSON.stringify({data, expires:Date.now()+86400000}));
    else sessionStorage.removeItem(cacheKey(uid));
  } catch { /* Storage is optional. */ }
}
export default function useAccountUsername(user) {
  const uid = user?.uid;
  const requestRevision = useRef(0);
  const activeUid = useRef(uid); activeUid.current = uid;
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!uid) { setState({}); return; }
    setState({ uid, ...cachedAccount(uid), loading: true });
    const revision = ++requestRevision.current;
    callServer('getAccountUsername', {}).then(
      data => { if (active && revision === requestRevision.current) { cacheAccount(uid, data); rememberUsername(uid, data.username); setState({ uid, ...data }); } },
      error => { if (active && revision === requestRevision.current) setState(previous => ({ ...previous, uid, loading:false, error: error.message || 'Could not load your username.' })); },
    );
    return () => { active = false; };
  }, [uid, attempt]);
  const updateUsername = useCallback(async username => {
    if (!uid) throw Error('Sign in to change your username.');
    const data = await callServer('setAccountUsername', { username });
    if (activeUid.current === uid) { requestRevision.current++; cacheAccount(uid, data); rememberUsername(uid, data.username); setState({ uid, ...data }); }
    return data;
  }, [uid]);
  return { account: state.uid === uid ? state : { ...cachedAccount(uid), loading: !!uid }, updateUsername,
    retryUsername: () => setAttempt(value => value + 1) };
}
