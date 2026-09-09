import React, { useEffect, useState } from 'react';
import { subscribeToBracket } from '../services/customBracketService';
import CustomBracketBuilder from './CustomBracketBuilder';
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
export default function CustomBracketPage({ bracketId, currentUserId, currentUserName, onNavigate }) {
  const [status, setStatus] = useState(undefined); // undefined = loading, null = missing
  const [hostId, setHostId] = useState(null);

  useEffect(() => {
    if (!bracketId) return undefined;
    const unsub = subscribeToBracket(
      bracketId,
      (state, meta) => { if (!meta.exists) { setStatus(null); return; } setStatus(meta.raw.status); setHostId(meta.raw.hostId); },
      () => setStatus(null),
    );
    return unsub;
  }, [bracketId]);

  const back = () => onNavigate('my-brackets');

  if (status === undefined) return <div className="create-container"><div className="empty-state"><p>Loading bracket…</p></div></div>;
  if (status === null) return <div className="create-container"><div className="empty-state"><p>This bracket could not be found.</p></div></div>;

  const isHost = currentUserId && currentUserId === hostId;
  if (status === 'draft' && isHost) {
    return <CustomBracketBuilder bracketId={bracketId} onExit={(reason) => { if (reason !== 'published') back(); }} />;
  }

  return (
    <CustomBracketFill bracketId={bracketId} currentUserId={currentUserId} currentUserName={currentUserName} onExit={back} />
  );
}
