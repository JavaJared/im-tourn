import { returnView } from '../lib/useViewNavigation';
import BracketLoader from './BracketLoader';
import React, { lazy, Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { subscribeToBracket } from '../services/customBracketService';
const CustomBracketBuilder = lazy(() => import('./CustomBracketBuilder'));
import CustomBracketFill from './CustomBracketFill';

/**
 * Route wrapper for a single custom bracket (view string `custom-bracket-{id}`).
 *
 *   host + draft   -> builder
 *   published      -> fill it out for fun (anyone)
 *
 * A custom bracket is just a structure, like a default bracket. The competition
 * layer (predictions, scoring, leaderboard, host-entered results) lives on a
 * pool that wraps the bracket — not here.
 */
export default function CustomBracketPage({ bracketId, currentUserId, currentUserName, onNavigate, openSaved = false }) {
  const latest = useRef(null), listeners = useRef(new Set());
  const watchBracket = useCallback((_id, onData, onError) => {
    const listener = {onData,onError}; listeners.current.add(listener);
    if (latest.current?.id === _id) onData(...latest.current.value);
    return () => listeners.current.delete(listener);
  }, [bracketId]);
  const [resetDraft,setResetDraft] = useState(null);
  const [status, setStatus] = useState(undefined); // undefined = loading, null = missing
  const [hostId, setHostId] = useState(null);

  useEffect(() => {
    latest.current = null; setStatus(undefined);
    if (!bracketId) return undefined;
    const unsub = subscribeToBracket(
      bracketId,
      (state, meta) => { latest.current = {id:bracketId,value:[state,meta]}; listeners.current.forEach(listener => listener.onData(state,meta)); if (!meta.exists) { setStatus(null); return; } setResetDraft(meta.raw.resetting ? meta.raw.resetDraftId : null); setStatus(meta.raw.status); setHostId(meta.raw.hostId); },
      () => setStatus(null),
    );
    return unsub;
  }, [bracketId]);

  const back = () => onNavigate(returnView(openSaved ? 'my-activities' : 'home'));

  if (status === undefined) return <div className="create-container"><BracketLoader label="Loading bracket…"/></div>;
  if (status === null) return <div className="create-container"><div className="empty-state"><p>This bracket could not be found.</p></div></div>;

  const isHost = currentUserId && currentUserId === hostId;
  if (resetDraft) return <div className="create-container"><p>This bracket is being updated.</p>{isHost&&<a className="ui-button" href={`?view=custom-bracket-${resetDraft}`}>Resume reset</a>}</div>;
  if (status === 'replaced') return <div className="create-container"><p>This revision has replaced the original bracket.</p><button onClick={back}>Back</button></div>;
  if (status === 'draft' && isHost) {
    return <Suspense fallback={<BracketLoader label="Loading editor…"/>}><CustomBracketBuilder bracketId={bracketId} onExit={(reason) => { if (reason !== 'published') back(); }} /></Suspense>;
  }

  return (
    <CustomBracketFill key={bracketId} watchBracket={watchBracket} openSaved={openSaved} bracketId={bracketId} currentUserId={currentUserId} currentUserName={currentUserName} onExit={back} />
  );
}
