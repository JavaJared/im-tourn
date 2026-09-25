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
  const [status, setStatus] = useState(undefined); // undefined = loading, null = missing
  const [hostId, setHostId] = useState(null);

  useEffect(() => {
    latest.current = null; setStatus(undefined);
    if (!bracketId) return undefined;
    const unsub = subscribeToBracket(
      bracketId,
      (state, meta) => { latest.current = {id:bracketId,value:[state,meta]}; listeners.current.forEach(listener => listener.onData(state,meta)); if (!meta.exists) { setStatus(null); return; } setStatus(meta.raw.status); setHostId(meta.raw.hostId); },
      () => setStatus(null),
    );
    return unsub;
  }, [bracketId]);

  const back = () => onNavigate(openSaved ? 'my-activities' : 'my-brackets');

  if (status === undefined) return <div className="create-container"><BracketLoader label="Loading bracket…"/></div>;
  if (status === null) return <div className="create-container"><div className="empty-state"><p>This bracket could not be found.</p></div></div>;

  const isHost = currentUserId && currentUserId === hostId;
  if (status === 'draft' && isHost) {
    return <Suspense fallback={<BracketLoader label="Loading editor…"/>}><CustomBracketBuilder bracketId={bracketId} onExit={(reason) => { if (reason !== 'published') back(); }} /></Suspense>;
  }

  return (
    <CustomBracketFill key={bracketId} watchBracket={watchBracket} openSaved={openSaved} bracketId={bracketId} currentUserId={currentUserId} currentUserName={currentUserName} onExit={back} />
  );
}
