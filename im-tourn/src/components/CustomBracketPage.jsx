import React, { useEffect, useState } from 'react';
import { subscribeToBracket } from '../services/customBracketService';
import CustomBracketBuilder from './CustomBracketBuilder';
import CustomBracketPlay from './CustomBracketPlay';
import CustomBracketPredict from './CustomBracketPredict';
import CustomBracketLeaderboard from './CustomBracketLeaderboard';

/**
 * Route wrapper for a single custom bracket (view string `custom-bracket-{id}`).
 *
 *   host + draft                  -> builder (full screen)
 *   everyone else                 -> tabbed: Bracket | Leaderboard
 *     Bracket tab:
 *       non-host while published   -> make-your-prediction board
 *       otherwise                  -> official results board (host gets controls)
 *     Leaderboard tab              -> live round-weighted standings
 */
export default function CustomBracketPage({ bracketId, currentUserId, currentUserName, onNavigate }) {
  const [status, setStatus] = useState(undefined); // undefined = loading, null = missing
  const [hostId, setHostId] = useState(null);
  const [tab, setTab] = useState('bracket');

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

  const predicting = !isHost && status === 'published';
  const bracketView = predicting
    ? <CustomBracketPredict bracketId={bracketId} currentUserId={currentUserId} currentUserName={currentUserName} onExit={back} onViewLeaderboard={() => setTab('leaderboard')} />
    : <CustomBracketPlay bracketId={bracketId} currentUserId={currentUserId} onExit={back} />;

  const tabBtn = (active) => ({
    flex: 1, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    color: active ? '#2bd4c0' : '#828ba1', background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid #2bd4c0' : '2px solid transparent',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600, fontFamily: "'Outfit',system-ui,sans-serif" }}>
      <div style={{ display: 'flex', background: '#101319', border: '1px solid #2a3040', borderBottom: 'none', borderRadius: '14px 14px 0 0', overflow: 'hidden' }}>
        <button style={tabBtn(tab === 'bracket')} onClick={() => setTab('bracket')}>{predicting ? 'Your prediction' : 'Bracket'}</button>
        <button style={tabBtn(tab === 'leaderboard')} onClick={() => setTab('leaderboard')}>Leaderboard</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'bracket'
          ? bracketView
          : <CustomBracketLeaderboard bracketId={bracketId} currentUserId={currentUserId} onExit={back} />}
      </div>
    </div>
  );
}
