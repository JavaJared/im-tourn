import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Trophy, Users } from './customBracketIcons';
import { defaultRoundPoints, buildLeaderboard } from '../lib/customScoring';
import { subscribeToBracket, subscribeToEntries } from '../services/customBracketService';

/* ====================================================================== *
 * CustomBracketLeaderboard — live, round-weighted ranking of all entries.
 *   props: bracketId, currentUserId, onExit
 * Scores are derived on the fly from picks + official results, so the board
 * updates the moment the host records a result or a new entry comes in.
 * ==================================================================== */
export default function CustomBracketLeaderboard({ bracketId, currentUserId, onExit }) {
  const [bracket, setBracket] = useState(null);
  const [roundPoints, setRoundPoints] = useState(null);
  const [roundCount, setRoundCount] = useState(0);
  const [status, setStatus] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bracketId) return undefined;
    const unsubB = subscribeToBracket(bracketId, (state, meta) => {
      if (!meta.exists) { setError('Bracket not found.'); setLoading(false); return; }
      setBracket(state); setStatus(meta.raw.status);
      setRoundCount(meta.raw.roundCount || state.rounds.length);
      setRoundPoints(meta.raw.roundPoints || null);
      setLoading(false);
    }, (e) => { setError(e?.message || 'Connection error.'); setLoading(false); });
    const unsubE = subscribeToEntries(bracketId, setEntries, () => { /* keep last */ });
    return () => { unsubB && unsubB(); unsubE && unsubE(); };
  }, [bracketId]);

  const points = useMemo(() => roundPoints || defaultRoundPoints(roundCount), [roundPoints, roundCount]);
  const board = useMemo(() => (bracket ? buildLeaderboard(bracket, entries, points) : []), [bracket, entries, points]);

  if (loading) return <Shell><div style={S.center}><Loader2 size={20} className="spin" /> Loading…</div></Shell>;
  if (error) return <Shell><div style={S.center}>{error}</div></Shell>;

  return (
    <Shell onExit={onExit}>
      <div style={S.head}>
        <div style={S.title}><Trophy size={18} strokeWidth={2.5} /> Leaderboard</div>
        <div style={S.count}><Users size={13} /> {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</div>
      </div>

      <div style={S.legend}>
        {points.map((pt, i) => (
          <span key={i} style={S.chip}>{i === points.length - 1 && points.length > 1 ? 'Final' : `Round ${i + 1}`} · <b style={{ fontWeight: 600 }}>{pt} pt{pt === 1 ? '' : 's'}</b></span>
        ))}
      </div>

      {status === 'published' && (
        <div style={S.notice}>Scoring begins once the host locks predictions and starts recording results.</div>
      )}

      <div style={S.list}>
        {board.length === 0 ? (
          <div style={S.empty}>No predictions yet — be the first to enter.</div>
        ) : board.map((e, i) => {
          const me = currentUserId && e.userId === currentUserId;
          return (
            <div key={e.userId || i} style={{ ...S.row, ...(me ? S.rowMe : {}) }}>
              <div style={{ ...S.rank, ...(i === 0 ? S.rankTop : {}) }}>{i + 1}</div>
              <span style={{ ...S.name, ...(me ? { color: 'var(--teal)' } : {}) }}>{e.displayName || 'Anonymous'}{me ? ' (you)' : ''}</span>
              <span style={S.correct}>{e.correct} correct</span>
              <span style={S.pts}>{e.total} pt{e.total === 1 ? '' : 's'}</span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ children, onExit }) {
  return <div style={S.root} className="cblb"><style>{CSS}</style>{onExit && <button style={S.exit} onClick={onExit} aria-label="Back">×</button>}{children}</div>;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap');
.cblb *{box-sizing:border-box}
.cblb ::-webkit-scrollbar{width:11px}.cblb ::-webkit-scrollbar-thumb{background:#2a3040;border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
`;
const S = {
  root: { '--bg': '#0c0e13', '--surface': '#14171f', '--surface2': '#1b1f2b', '--line': '#2a3040', '--text': '#eef1f7', '--muted': '#828ba1', '--orange': '#ff6a3d', '--teal': '#2bd4c0', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Outfit',system-ui,sans-serif", borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' },
  exit: { position: 'absolute', top: 10, right: 12, zIndex: 30, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer' },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontSize: 14 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' },
  title: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, color: 'var(--orange)' },
  count: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--muted)' },
  legend: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--line)' },
  chip: { fontSize: 12.5, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 11px' },
  notice: { padding: '9px 18px', fontSize: 13, color: 'var(--muted)', background: 'rgba(255,106,61,.05)', borderBottom: '1px solid var(--line)' },
  list: { flex: 1, overflow: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '30px 0' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 },
  rowMe: { border: '1px solid rgba(43,212,192,.45)', background: 'rgba(43,212,192,.06)' },
  rank: { width: 26, height: 26, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  rankTop: { background: 'rgba(43,212,192,.16)', color: 'var(--teal)' },
  name: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 },
  correct: { fontSize: 12, color: 'var(--muted)', flexShrink: 0 },
  pts: { fontSize: 16, fontWeight: 600, minWidth: 54, textAlign: 'right', flexShrink: 0 },
};
