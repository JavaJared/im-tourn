import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Clock, Loader2, AlertTriangle, Trophy, Lock, Users, RotateCcw, Send } from './customBracketIcons';
import { SLOT, locate, slotDisplay, feederId, resolveParticipant, setResult, getChampion } from '../lib/customBracket';
import { hydrateState, picksFromState, isEntryComplete, buildLeaderboard, defaultRoundPoints } from '../lib/customScoring';
import { joinBracketPool, submitPoolPredictions, lockPool, completePool } from '../services/bracketService';
import { startCustomPool, updateCustomPoolResults, recalculateCustomPoolScoresManual, subscribeToPool, subscribeToPoolEntries } from '../services/customBracketService';

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
function resolveSlot(state, loc, nameMap, boxId, slot) {
  const d = slotDisplay(state, loc, boxId, slot);
  if (d.type === SLOT.NAMED) return { kind: 'player', pid: d.participantId, name: d.name };
  if (d.type === SLOT.BYE) return { kind: 'bye' };
  if (d.type === SLOT.OPEN) return { kind: 'open' };
  const pid = resolveParticipant(state, loc, boxId, slot);
  if (pid == null) return { kind: 'pending', src: d.sourceBoxId };
  return { kind: 'player', pid, name: (nameMap && nameMap[pid]) || '—' };
}

function Board({ state, nameMap, editable, onPick }) {
  const loc = useMemo(() => locate(state), [state]);
  const layout = useMemo(() => computeLayout(state), [state]);
  return (
    <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
      {state.rounds.length >= 2 && layout.columns.map((c, i) => <div key={i} style={{ ...S.colHead, left: c.x, width: CARDW }}>{c.label}</div>)}
      <svg style={S.svg} width={layout.width} height={layout.height}>
        {Object.keys(state.boxes).map((id) => {
          const { r, p } = loc[id]; const pos = layout.positions[id]; if (!pos) return null;
          return [0, 1].map((w) => {
            const fid = feederId(state, r, p, w); if (!fid) return null; const cp = layout.positions[fid]; if (!cp) return null;
            const decided = resolveParticipant(state, loc, id, w === 0 ? 'A' : 'B') != null;
            const x1 = cp.x + CARDW, y1 = cp.y + CARDH / 2, x2 = pos.x, y2 = pos.y + CARDH / 2, mx = (x1 + x2) / 2;
            return <path key={id + w} d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} fill="none" stroke={decided ? 'rgba(43,212,192,.5)' : 'rgba(130,139,161,.32)'} strokeWidth="2" />;
          });
        })}
      </svg>
      {Object.keys(state.boxes).map((id) => (
        <Card key={id} id={id} pos={layout.positions[id]}
          a={resolveSlot(state, loc, nameMap, id, 'A')} b={resolveSlot(state, loc, nameMap, id, 'B')}
          result={state.boxes[id].result} editable={editable} onPick={onPick} />
      ))}
    </div>
  );
}
function Card({ id, pos, a, b, result, editable, onPick }) {
  if (!pos) return null;
  const decidable = a.kind === 'player' && b.kind === 'player';
  const hasBye = a.kind === 'bye' || b.kind === 'bye';
  const autoWinner = hasBye ? (a.kind === 'player' ? a.pid : (b.kind === 'player' ? b.pid : null)) : null;
  const winnerPid = result?.winnerId ?? autoWinner;
  const slot = (sl) => {
    if (sl.kind === 'pending') return <div style={{ ...S.slot, ...S.slotPending }}><Clock size={13} /> <span style={S.pend}>Winner of {sl.src.toUpperCase()}</span></div>;
    if (sl.kind === 'bye') return <div style={{ ...S.slot, ...S.slotMuted }}><span style={S.byeTxt}>Bye</span></div>;
    if (sl.kind === 'open') return <div style={{ ...S.slot, ...S.slotMuted }}>—</div>;
    const isW = sl.pid === winnerPid, isL = winnerPid != null && !isW, click = editable && decidable;
    return (
      <div onClick={click ? () => onPick(id, sl.pid) : undefined} style={{ ...S.slot, ...(isW ? S.slotWin : isL ? S.slotLose : click ? S.slotPick : S.slotIdle), cursor: click ? 'pointer' : 'default' }}>
        {isW && <Check size={14} strokeWidth={3} />}<span style={S.name}>{sl.name}</span>
      </div>
    );
  };
  return <div style={{ ...S.card, left: pos.x, top: pos.y, width: CARDW }}><div style={S.tag}>{id.toUpperCase()}</div>{slot(a)}<div style={S.vs}>vs</div>{slot(b)}</div>;
}

const STATUS_LABEL = { open: 'Predictions open', locked: 'Locked', in_progress: 'In progress', completed: 'Completed' };

/* ====================================================================== *
 * CustomPoolDetail — runs a bracket pool backed by a custom bracket.
 * Rendered by PoolDetailPage when pool.bracketType === 'custom'.
 * ==================================================================== */
export default function CustomPoolDetail({ poolId, currentUserId, currentUserName, onNavigate }) {
  const [pool, setPool] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('bracket');
  const [predState, setPredState] = useState(null);
  const [resState, setResState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);

  // Live subscriptions: the pool doc (status, results, lifecycle) and every
  // entry (predictions + scores). All viewers see results and standings update
  // in real time without reloading.
  useEffect(() => {
    const unsubPool = subscribeToPool(poolId, (p) => {
      if (!p) { setError('Pool not found.'); setLoading(false); return; }
      setPool(p); setError(null); setLoading(false);
    }, (e) => { setError(e?.message || 'Failed to load pool.'); setLoading(false); });
    const unsubEntries = subscribeToPoolEntries(poolId, (all) => setEntries(all), () => {});
    return () => { unsubPool(); unsubEntries(); };
  }, [poolId]);

  const myEntry = useMemo(() => entries.find((e) => e.userId === currentUserId) || null, [entries, currentUserId]);
  const isHost = !!(pool && currentUserId && pool.hostId === currentUserId);
  const status = pool?.status;
  const nameMap = pool?.bracketMatchups?.nameMap || {};
  const roundPoints = useMemo(() => (pool?.roundPoints && pool.roundPoints.length ? pool.roundPoints : defaultRoundPoints(pool?.bracketMatchups?.rounds?.length || 0)), [pool]);
  const joined = !!myEntry;
  const submitted = !!(myEntry && myEntry.predictions);
  const canRecord = isHost && status === 'in_progress';

  // Initialize the current user's prediction board from their saved entry, but
  // only when that saved entry actually changes (first load, join, or their own
  // submit) — keyed on a stable signal so live snapshots of *other* entries
  // don't wipe in-progress local picks.
  const structureReady = !!pool?.bracketMatchups;
  const submittedKey = myEntry?.submittedAt ? +myEntry.submittedAt : (myEntry ? 'joined' : 'none');
  useEffect(() => {
    if (!pool?.bracketMatchups) { setPredState(null); return; }
    setPredState(hydrateState(pool.bracketMatchups, (myEntry && myEntry.predictions) || {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, structureReady, submittedKey]);

  // The official-results board: viewers (and a not-yet-recording host) mirror
  // pool.customResults live; an actively-recording host keeps resState local and
  // optimistic so rapid taps aren't clobbered by incoming snapshots.
  useEffect(() => {
    if (!pool?.bracketMatchups) { setResState(null); return; }
    if (canRecord) setResState((prev) => prev || hydrateState(pool.bracketMatchups, pool.customResults || {}));
    else setResState(hydrateState(pool.bracketMatchups, pool.customResults || {}));
  }, [pool, canRecord]);

  const run = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) flash(ok); } catch (e) { flash(e?.message || 'Something went wrong'); } setBusy(false); };

  // predictor picks
  const canPredict = joined && status === 'open';
  const pickPred = (boxId, pid) => { if (!canPredict || !predState) return; try { setPredState(setResult(predState, boxId, pid)); } catch (e) { flash(e.message); } };
  const submitPredictions = () => {
    if (!predState || !isEntryComplete(predState)) return;
    run(() => submitPoolPredictions(poolId, currentUserId, picksFromState(predState), getChampion(predState)), 'Predictions submitted');
  };
  // host results — optimistic local update + persist; snapshots keep everyone else live
  const pickResult = (boxId, pid) => {
    if (!canRecord || !resState) return;
    let next; try { next = setResult(resState, boxId, pid); } catch (e) { flash(e.message); return; }
    setResState(next);
    run(() => updateCustomPoolResults(poolId, currentUserId, picksFromState(next)));
  };

  const leaderboard = useMemo(() => {
    if (!pool) return [];
    const official = hydrateState(pool.bracketMatchups, pool.customResults || {});
    // Pool entries carry their picks under `predictions`; buildLeaderboard reads `picks`.
    const scored = entries.filter((e) => e.predictions).map((e) => ({ ...e, picks: e.predictions, displayName: e.userDisplayName }));
    return buildLeaderboard(official, scored, roundPoints);
  }, [pool, entries, roundPoints]);

  if (loading) return <Shell onBack={() => onNavigate('pools')}><div style={S.center}><Loader2 size={20} className="spin" /> Loading pool…</div></Shell>;
  if (error) return <Shell onBack={() => onNavigate('pools')}><div style={S.center}><AlertTriangle size={20} /> {error}</div></Shell>;

  return (
    <Shell onBack={() => onNavigate('pools')}>
      <header style={S.top}>
        <div style={S.brand}>
          <span style={S.title}>{pool.name}</span>
          <span style={S.pill}>{STATUS_LABEL[status] || status}</span>
        </div>
        <div style={S.topRight}>
          {isHost && status === 'open' && <button style={S.primary} disabled={busy} onClick={() => run(() => lockPool(poolId, currentUserId), 'Predictions locked')}><Lock size={14} /> Lock predictions</button>}
          {isHost && status === 'locked' && <button style={S.primary} disabled={busy} onClick={() => run(() => startCustomPool(poolId, currentUserId), 'Pool started')}><Trophy size={14} /> Start &amp; record results</button>}
          {isHost && status === 'in_progress' && <>
            <button style={S.ghost} disabled={busy} onClick={() => run(() => recalculateCustomPoolScoresManual(poolId, currentUserId), 'Scores recalculated')}><RotateCcw size={14} /> Recalc</button>
            <button style={S.primary} disabled={busy} onClick={() => run(() => completePool(poolId, currentUserId), 'Pool completed')}><Check size={14} strokeWidth={3} /> Complete</button>
          </>}
        </div>
      </header>

      <div style={S.tabs}>
        {['bracket', 'results', 'leaderboard'].map((t) => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t === 'bracket' ? (isHost ? 'Bracket' : 'My picks') : t === 'results' ? 'Results' : 'Leaderboard'}</button>
        ))}
      </div>

      {status === 'completed' && pool.winnerName && <div style={S.championBar}><Trophy size={18} strokeWidth={2.5} /> <b>{pool.winnerName}</b> wins with {pool.winnerScore} pts</div>}

      <div style={S.scroll}>
        {tab === 'bracket' && (
          !joined ? (
            status === 'open'
              ? <div style={S.joinWrap}>
                  <div style={S.note}>{isHost ? 'Join your own pool to enter a prediction bracket.' : 'Join the pool to fill out your prediction.'}</div>
                  <button style={S.primary} disabled={busy} onClick={() => run(() => joinBracketPool(poolId, currentUserId, currentUserName || 'Anonymous'), 'Joined — make your picks')}><Users size={14} /> Join pool</button>
                </div>
              : <div style={S.note}>This pool is no longer accepting entries.</div>
          ) : (
            <>
              {canPredict && !isEntryComplete(predState || {}) && <div style={S.note}>Pick a winner in every matchup, then submit.{submitted ? ' Re-submitting replaces your entry.' : ''}</div>}
              {canPredict && <div style={S.actionBar}><button style={{ ...S.primary, ...(predState && isEntryComplete(predState) ? {} : S.primaryOff) }} disabled={busy || !(predState && isEntryComplete(predState))} onClick={submitPredictions}><Send size={14} /> {submitted ? 'Update prediction' : 'Submit prediction'}</button></div>}
              {!canPredict && submitted && <div style={S.note}>Your prediction is in.{status === 'open' ? '' : ' Predictions are locked.'}</div>}
              {predState && <Board state={predState} nameMap={nameMap} editable={canPredict} onPick={pickPred} />}
            </>
          )
        )}
        {tab === 'results' && (
          <>
            {canRecord && <div style={S.note}>Tap a player to record the official winner. Scores update automatically.</div>}
            {!canRecord && status !== 'in_progress' && status !== 'completed' && <div style={S.note}>Official results appear once the host starts the pool.</div>}
            {resState && <Board state={resState} nameMap={nameMap} editable={canRecord} onPick={pickResult} />}
          </>
        )}
        {tab === 'leaderboard' && (
          <div style={S.lb}>
            <div style={S.legend}>{roundPoints.map((pt, i) => <span key={i} style={S.chip}>{i === roundPoints.length - 1 && roundPoints.length > 1 ? 'Final' : `Round ${i + 1}`} · <b style={{ fontWeight: 600 }}>{pt}</b></span>)}</div>
            {leaderboard.length === 0 ? <div style={S.note}>No predictions submitted yet.</div> : leaderboard.map((e, i) => {
              const me = currentUserId && e.userId === currentUserId;
              return (
                <div key={e.userId || i} style={{ ...S.row, ...(me ? S.rowMe : {}) }}>
                  <div style={{ ...S.rank, ...(i === 0 ? S.rankTop : {}) }}>{i + 1}</div>
                  <span style={{ ...S.lbName, ...(me ? { color: 'var(--teal)' } : {}) }}>{e.userDisplayName || e.displayName || 'Anonymous'}{me ? ' (you)' : ''}</span>
                  <span style={S.correct}>{e.correct} correct</span>
                  <span style={S.pts}>{e.total} pts</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {toast && <div style={S.toast}>{toast}</div>}
    </Shell>
  );
}

function Shell({ children, onBack }) {
  return <div style={S.root} className="cbpd"><style>{CSS}</style>{onBack && <button style={S.exit} onClick={onBack} aria-label="Back to pools">×</button>}{children}</div>;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap');
.cbpd *{box-sizing:border-box}
.cbpd ::-webkit-scrollbar{width:11px;height:11px}.cbpd ::-webkit-scrollbar-thumb{background:#2a3040;border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;
const S = {
  root: { '--bg': '#0c0e13', '--surface': '#14171f', '--surface2': '#1b1f2b', '--line': '#2a3040', '--text': '#eef1f7', '--muted': '#828ba1', '--orange': '#ff6a3d', '--teal': '#2bd4c0', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Outfit',system-ui,sans-serif", borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' },
  exit: { position: 'absolute', top: 10, right: 12, zIndex: 30, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer' },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontSize: 14 },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,#14171f,#101319)', gap: 12, flexWrap: 'wrap' },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1 },
  pill: { fontSize: 11, fontWeight: 600, letterSpacing: .4, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 20, border: '1px solid var(--line)', color: 'var(--muted)' },
  topRight: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0c0e13', background: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' },
  primaryOff: { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--line)', cursor: 'not-allowed' },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', cursor: 'pointer' },
  tabs: { display: 'flex', borderBottom: '1px solid var(--line)', background: '#101319' },
  tab: (active) => ({ flex: 1, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: active ? 'var(--teal)' : 'var(--muted)', background: 'transparent', border: 'none', borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent' }),
  championBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', fontSize: 15, color: 'var(--orange)', background: 'rgba(255,106,61,.08)', borderBottom: '1px solid var(--line)' },
  note: { padding: '10px 18px', fontSize: 13, color: 'var(--muted)' },
  joinWrap: { padding: '18px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' },
  actionBar: { padding: '10px 18px', display: 'flex', justifyContent: 'flex-end' },
  scroll: { flex: 1, overflow: 'auto', position: 'relative' },
  svg: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  colHead: { position: 'absolute', top: 8, textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1.2, color: 'var(--muted)' },
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
  lb: { padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  legend: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { fontSize: 12.5, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 11px' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 },
  rowMe: { border: '1px solid rgba(43,212,192,.45)', background: 'rgba(43,212,192,.06)' },
  rank: { width: 26, height: 26, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  rankTop: { background: 'rgba(43,212,192,.16)', color: 'var(--teal)' },
  lbName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 },
  correct: { fontSize: 12, color: 'var(--muted)', flexShrink: 0 },
  pts: { fontSize: 16, fontWeight: 600, minWidth: 54, textAlign: 'right', flexShrink: 0 },
  toast: { position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--orange)', color: '#0c0e13', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)', animation: 'pop .15s ease', zIndex: 20 },
};
