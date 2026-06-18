import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Clock, Loader2, AlertTriangle, Send, Trophy } from './customBracketIcons';
import { SLOT, locate, slotDisplay, feederId, resolveParticipant, setResult } from '../lib/customBracket';
import { isEntryComplete, picksFromState } from '../lib/customScoring';
import { subscribeToBracket, submitEntry, getEntry } from '../services/customBracketService';

const COLW = 248, ROWH = 150, CARDW = 200, CARDH = 116, PADX = 60, PADTOP = 92, PADBOT = 56;
function computeLayout(state) {
  const positions = {}; const rounds = state.rounds;
  rounds.forEach((rd, r) => {
    let cursor = PADTOP;
    rd.forEach((id, p) => {
      let y;
      if (r === 0) y = PADTOP + p * ROWH;
      else { const ys = []; for (const w of [0, 1]) { const fid = feederId(state, r, p, w); if (fid && positions[fid]) ys.push(positions[fid].y); } y = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : cursor; }
      y = Math.max(y, cursor); positions[id] = { x: PADX + r * COLW, y }; cursor = y + ROWH;
    });
  });
  const ids = Object.keys(positions);
  const maxX = ids.length ? Math.max(...ids.map((i) => positions[i].x)) + CARDW : 360;
  const maxY = ids.length ? Math.max(...ids.map((i) => positions[i].y)) + CARDH : 240;
  const columns = rounds.map((rd, r) => ({ x: PADX + r * COLW, label: (r === rounds.length - 1 && rounds.length > 1) ? 'Final' : `Round ${r + 1}` }));
  return { positions, columns, width: maxX + PADX, height: maxY + PADBOT };
}
function blankPrediction(bracketState) {
  const boxes = {};
  for (const id of Object.keys(bracketState.boxes)) { const b = bracketState.boxes[id]; boxes[id] = { id, slotA: b.slotA, slotB: b.slotB, result: null, score: null }; }
  return { rounds: bracketState.rounds.map((r) => [...r]), boxes, _nextId: bracketState._nextId || 1, _lastCreated: [] };
}
function applyPicks(state, picks) {
  let next = state;
  for (const [boxId, winnerId] of Object.entries(picks || {})) { try { next = setResult(next, boxId, winnerId); } catch { /* stale pick, skip */ } }
  return next;
}
function nameMapOf(state) { const m = {}; for (const id of Object.keys(state.boxes)) for (const k of ['slotA', 'slotB']) { const s = state.boxes[id][k]; if (s.type === SLOT.NAMED) m[s.participantId] = s.name; } return m; }
function resolveSlot(state, loc, nameMap, boxId, slot) {
  const d = slotDisplay(state, loc, boxId, slot);
  if (d.type === SLOT.NAMED) return { kind: 'player', pid: d.participantId, name: d.name };
  if (d.type === SLOT.BYE) return { kind: 'bye' };
  if (d.type === SLOT.OPEN) return { kind: 'open' };
  const pid = resolveParticipant(state, loc, boxId, slot);
  if (pid == null) return { kind: 'pending', src: d.sourceBoxId };
  return { kind: 'player', pid, name: nameMap[pid] || '—' };
}

/* ====================================================================== *
 * CustomBracketPredict — fill out your prediction and submit it (locked in).
 *   props: bracketId, currentUserId, currentUserName, onExit, onViewLeaderboard
 * ==================================================================== */
export default function CustomBracketPredict({ bracketId, currentUserId, currentUserName, onExit, onViewLeaderboard }) {
  const [bracket, setBracket] = useState(null);
  const [status, setStatus] = useState(null);
  const [pred, setPred] = useState(null);      // local prediction engine state
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  const predRef = useRef(pred); predRef.current = pred;
  const lsKey = `cbp:pred:${bracketId}:${currentUserId || 'anon'}`;
  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);

  useEffect(() => {
    if (!bracketId) { setError('No bracket specified.'); setLoading(false); return undefined; }
    let initialized = false;
    const unsub = subscribeToBracket(bracketId, async (state, meta) => {
      if (!meta.exists || !state) { setError('This bracket could not be found.'); setLoading(false); return; }
      setBracket(state); setStatus(meta.raw.status); setError(null); setLoading(false);
      if (initialized) return; // structure is frozen post-publish; only seed local state once
      initialized = true;
      const existing = currentUserId ? await getEntry(bracketId, currentUserId) : null;
      if (existing) { setSubmitted(true); setPred(applyPicks(blankPrediction(state), existing.picks)); return; }
      let saved = null;
      try { const raw = localStorage.getItem(lsKey); saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
      setPred(applyPicks(blankPrediction(state), saved || {}));
    }, (err) => { setError(err?.message || 'Connection error.'); setLoading(false); });
    return unsub;
  }, [bracketId, currentUserId, lsKey]);

  const nameMap = useMemo(() => (pred ? nameMapOf(pred) : {}), [pred]);
  const loc = useMemo(() => (pred ? locate(pred) : {}), [pred]);
  const layout = useMemo(() => (pred ? computeLayout(pred) : null), [pred]);
  const complete = useMemo(() => (pred ? isEntryComplete(pred) : false), [pred]);
  const canEdit = !submitted && status === 'published' && !!currentUserId;

  const pick = (boxId, pid) => {
    if (!canEdit) return;
    const cur = predRef.current; let next;
    try { next = setResult(cur, boxId, pid); } catch (e) { flash(e.message); return; }
    setPred(next);
    try { localStorage.setItem(lsKey, JSON.stringify(picksFromState(next))); } catch { /* ignore */ }
  };

  const submit = async () => {
    const cur = predRef.current;
    if (!cur || !isEntryComplete(cur) || !currentUserId) return;
    setSending(true);
    try {
      await submitEntry(bracketId, { userId: currentUserId, displayName: currentUserName || 'Anonymous', picks: picksFromState(cur) });
      setSubmitted(true);
      try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
      flash('Prediction locked in');
    } catch (e) { flash(`Couldn't submit — ${e?.message || 'try again'}`); }
    setSending(false);
  };

  if (loading) return <Shell><div style={S.center}><Loader2 size={20} className="spin" /> Loading…</div></Shell>;
  if (error) return <Shell><div style={S.center}><AlertTriangle size={20} /> {error}</div></Shell>;
  if (!pred || !layout) return null;
  if (status !== 'published' && !submitted) {
    return <Shell onExit={onExit}><div style={S.center}><Clock size={20} /> Predictions are closed for this bracket.{onViewLeaderboard && <button style={S.linkBtn} onClick={onViewLeaderboard}>View leaderboard</button>}</div></Shell>;
  }
  if (!currentUserId) return <Shell onExit={onExit}><div style={S.center}>Sign in to make a prediction.</div></Shell>;

  return (
    <Shell onExit={onExit}>
      <header style={S.top}>
        <div style={S.brand}>
          <span style={S.title}>Your prediction</span>
          <span style={S.sub}>{submitted ? 'Locked in' : 'Tap a player to advance them'}</span>
        </div>
        <div style={S.topRight}>
          {onViewLeaderboard && <button style={S.ghost} onClick={onViewLeaderboard}><Trophy size={14} /> Leaderboard</button>}
          {!submitted && (
            <button style={{ ...S.primary, ...(complete ? {} : S.primaryOff) }} disabled={!complete || sending} onClick={submit}>
              <Send size={14} strokeWidth={2.5} /> {sending ? 'Submitting…' : 'Submit prediction'}
            </button>
          )}
          {submitted && <span style={S.locked}><Check size={14} strokeWidth={3} /> Submitted</span>}
        </div>
      </header>

      {!submitted && !complete && <div style={S.notice}>Pick a winner in every matchup, then submit. You can change picks until you submit — after that it's locked in.</div>}

      <div style={S.scroll}>
        <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
          {pred.rounds.length >= 2 && layout.columns.map((c, i) => <div key={i} style={{ ...S.colHead, left: c.x, width: CARDW }}>{c.label}</div>)}
          <svg style={S.svg} width={layout.width} height={layout.height}>
            {Object.keys(pred.boxes).map((id) => {
              const { r, p } = loc[id]; const pos = layout.positions[id]; if (!pos) return null;
              return [0, 1].map((w) => {
                const fid = feederId(pred, r, p, w); if (!fid) return null; const cp = layout.positions[fid]; if (!cp) return null;
                const decided = resolveParticipant(pred, loc, id, w === 0 ? 'A' : 'B') != null;
                const x1 = cp.x + CARDW, y1 = cp.y + CARDH / 2, x2 = pos.x, y2 = pos.y + CARDH / 2, mx = (x1 + x2) / 2;
                return <path key={id + w} d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} fill="none" stroke={decided ? 'rgba(43,212,192,.5)' : 'rgba(130,139,161,.32)'} strokeWidth="2" />;
              });
            })}
          </svg>
          {Object.keys(pred.boxes).map((id) => (
            <PredictCard key={id} id={id} pos={layout.positions[id]}
              a={resolveSlot(pred, loc, nameMap, id, 'A')} b={resolveSlot(pred, loc, nameMap, id, 'B')}
              result={pred.boxes[id].result} canEdit={canEdit} onPick={pick} />
          ))}
        </div>
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </Shell>
  );
}

function PredictCard({ id, pos, a, b, result, canEdit, onPick }) {
  if (!pos) return null;
  const decidable = a.kind === 'player' && b.kind === 'player';
  const hasBye = a.kind === 'bye' || b.kind === 'bye';
  const autoWinner = hasBye ? (a.kind === 'player' ? a.pid : (b.kind === 'player' ? b.pid : null)) : null;
  const winnerPid = result?.winnerId ?? autoWinner;
  const slot = (sl) => {
    if (sl.kind === 'pending') return <div style={{ ...S.slot, ...S.slotPending }}><Clock size={13} /> <span style={S.pend}>Winner of {sl.src.toUpperCase()}</span></div>;
    if (sl.kind === 'bye') return <div style={{ ...S.slot, ...S.slotMuted }}><span style={S.byeTxt}>Bye</span></div>;
    if (sl.kind === 'open') return <div style={{ ...S.slot, ...S.slotMuted }}>—</div>;
    const isW = sl.pid === winnerPid, isL = winnerPid != null && !isW, click = canEdit && decidable;
    return (
      <div onClick={click ? () => onPick(id, sl.pid) : undefined} style={{ ...S.slot, ...(isW ? S.slotWin : isL ? S.slotLose : click ? S.slotPick : S.slotIdle), cursor: click ? 'pointer' : 'default' }}>
        {isW && <Check size={14} strokeWidth={3} />}<span style={S.name}>{sl.name}</span>
      </div>
    );
  };
  return (
    <div style={{ ...S.card, left: pos.x, top: pos.y, width: CARDW }}>
      <div style={S.tag}>{id.toUpperCase()}</div>
      {slot(a)}<div style={S.vs}>vs</div>{slot(b)}
    </div>
  );
}

function Shell({ children, onExit }) {
  return <div style={S.root} className="cbpr"><style>{CSS}</style>{onExit && <button style={S.exit} onClick={onExit} aria-label="Back">×</button>}{children}</div>;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap');
.cbpr *{box-sizing:border-box}
.cbpr ::-webkit-scrollbar{width:11px;height:11px}
.cbpr ::-webkit-scrollbar-thumb{background:#2a3040;border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;
const S = {
  root: { '--bg': '#0c0e13', '--surface': '#14171f', '--surface2': '#1b1f2b', '--line': '#2a3040', '--text': '#eef1f7', '--muted': '#828ba1', '--orange': '#ff6a3d', '--teal': '#2bd4c0', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 560, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Outfit',system-ui,sans-serif", borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' },
  exit: { position: 'absolute', top: 10, right: 12, zIndex: 30, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer' },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--muted)', fontSize: 14 },
  linkBtn: { color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,#14171f,#101319)' },
  brand: { display: 'flex', flexDirection: 'column', lineHeight: 1.2 },
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--muted)', marginTop: 3 },
  topRight: { display: 'flex', alignItems: 'center', gap: 10 },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', cursor: 'pointer' },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0c0e13', background: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' },
  primaryOff: { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--line)', cursor: 'not-allowed' },
  locked: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--teal)' },
  notice: { padding: '9px 18px', fontSize: 13, color: 'var(--muted)', background: 'rgba(43,212,192,.05)', borderBottom: '1px solid var(--line)' },
  scroll: { flex: 1, overflow: 'auto', position: 'relative' },
  svg: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  colHead: { position: 'absolute', top: 24, textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1.2, color: 'var(--muted)' },
  card: { position: 'absolute', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 9, boxShadow: '0 6px 18px rgba(0,0,0,.35)', userSelect: 'none' },
  tag: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, letterSpacing: 1, color: 'var(--muted)', marginBottom: 6, height: 14 },
  vs: { fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: '3px 0', letterSpacing: 1 },
  slot: { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 10px', borderRadius: 8, fontSize: 13, border: '1px solid transparent' },
  slotIdle: { background: 'var(--surface2)', border: '1px solid var(--line)' },
  slotPick: { background: 'var(--surface2)', border: '1px solid #3a4152' },
  slotWin: { background: 'rgba(43,212,192,.14)', border: '1px solid rgba(43,212,192,.45)', color: 'var(--teal)', fontWeight: 600 },
  slotLose: { background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', opacity: .6 },
  slotPending: { background: 'rgba(130,139,161,.07)', border: '1px solid var(--line)', color: 'var(--muted)' },
  slotMuted: { background: 'var(--surface2)', color: 'var(--muted)' },
  name: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pend: { fontSize: 12 }, byeTxt: { fontStyle: 'italic' },
  toast: { position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--orange)', color: '#0c0e13', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)', animation: 'pop .15s ease', zIndex: 20 },
};
