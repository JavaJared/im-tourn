import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Trophy, Lock, Clock, AlertTriangle, Loader2, RotateCcw, Radio } from './customBracketIcons';
import { SLOT, locate, slotDisplay, feederId, resolveParticipant, setResult, setScore, getChampion } from '../lib/customBracket';
import { subscribeToBracket, persistLiveDiff, lockBracket, completeBracket, reopenBracket } from '../services/customBracketService';

/* ---------- layout (shared shape with the builder) ---------- */
const COLW = 248, ROWH = 150, CARDW = 200, CARDH = 126, PADX = 60, PADTOP = 96, PADBOT = 56;
function computeLayout(state) {
  const positions = {}; const rounds = state.rounds;
  rounds.forEach((rd, r) => {
    let cursor = PADTOP;
    rd.forEach((id, p) => {
      let y;
      if (r === 0) y = PADTOP + p * ROWH;
      else {
        const ys = [];
        for (const which of [0, 1]) { const fid = feederId(state, r, p, which); if (fid && positions[fid]) ys.push(positions[fid].y); }
        y = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : cursor;
      }
      y = Math.max(y, cursor); positions[id] = { x: PADX + r * COLW, y }; cursor = y + ROWH;
    });
  });
  const ids = Object.keys(positions);
  const maxX = ids.length ? Math.max(...ids.map((i) => positions[i].x)) + CARDW : 360;
  const maxY = ids.length ? Math.max(...ids.map((i) => positions[i].y)) + CARDH : 240;
  const columns = rounds.map((rd, r) => ({ x: PADX + r * COLW, label: (r === rounds.length - 1 && rounds.length > 1) ? 'Final' : `Round ${r + 1}` }));
  return { positions, columns, width: maxX + PADX, height: maxY + PADBOT };
}

/* Resolve a slot to what should be shown during play. */
function resolveSlotForPlay(state, loc, nameMap, boxId, slot) {
  const d = slotDisplay(state, loc, boxId, slot);
  if (d.type === SLOT.NAMED) return { kind: 'player', pid: d.participantId, name: d.name };
  if (d.type === SLOT.BYE) return { kind: 'bye' };
  if (d.type === SLOT.OPEN) return { kind: 'open' };
  const pid = resolveParticipant(state, loc, boxId, slot); // winner of the feeding box, if any
  if (pid == null) return { kind: 'pending', src: d.sourceBoxId };
  return { kind: 'player', pid, name: nameMap[pid] || '—' };
}
const parseScore = (v) => { const t = String(v).trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? Math.trunc(n) : null; };

/* ====================================================================== *
 * CustomBracketPlay — run a published custom bracket.
 *   props: bracketId, currentUserId, onExit
 * The host (creator) taps a participant to crown them; viewers see the same
 * board read-only and live. Result entry is gated until the bracket is locked.
 * ==================================================================== */
export default function CustomBracketPlay({ bracketId, currentUserId, onExit }) {
  const [state, setState] = useState(null);
  const [meta, setMeta] = useState(null); // { status, hostId, title }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [save, setSave] = useState('idle');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const stateRef = useRef(state); stateRef.current = state;
  const flash = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); }, []);

  useEffect(() => {
    if (!bracketId) { setError('No bracket was specified.'); setLoading(false); return undefined; }
    const unsub = subscribeToBracket(bracketId, (remote, m) => {
      if (!m.exists || !remote) { setError('This bracket could not be found.'); setLoading(false); return; }
      setError(null); setLoading(false); setState(remote);
      setMeta({ status: m.raw.status, hostId: m.raw.hostId, title: m.raw.title || 'Custom bracket' });
    }, (err) => { setError(err?.message || 'Lost connection to the bracket.'); setLoading(false); });
    return unsub;
  }, [bracketId]);

  const isHost = !!(meta && currentUserId && meta.hostId === currentUserId);
  const status = meta?.status;
  const canEnter = isHost && status === 'locked';

  const nameMap = useMemo(() => {
    const m = {}; if (!state) return m;
    for (const id of Object.keys(state.boxes)) for (const k of ['slotA', 'slotB']) { const s = state.boxes[id][k]; if (s.type === SLOT.NAMED) m[s.participantId] = s.name; }
    return m;
  }, [state]);
  const loc = useMemo(() => (state ? locate(state) : {}), [state]);
  const layout = useMemo(() => (state ? computeLayout(state) : null), [state]);
  const champion = useMemo(() => (state ? getChampion(state) : null), [state]);

  const applyLive = (producer) => {
    const cur = stateRef.current; if (!cur) return;
    let next; try { next = producer(cur); } catch (e) { flash(e.message); return; }
    setState(next); setSave('saving');
    persistLiveDiff(bracketId, cur, next).then((wrote) => setSave(wrote ? 'saved' : 'idle')).catch((e) => { setSave('error'); flash(`Couldn't save — ${e?.message || 'try again'}`); });
  };
  const onPick = (boxId, pid) => { if (!canEnter) return; applyLive((s) => setResult(s, boxId, pid)); };
  const onScore = (boxId, side, value) => {
    if (!canEnter) return;
    applyLive((s) => {
      const cur = s.boxes[boxId].score || {};
      const a = side === 'A' ? parseScore(value) : (cur.a ?? null);
      const b = side === 'B' ? parseScore(value) : (cur.b ?? null);
      return setScore(s, boxId, a, b);
    });
  };

  const runStatus = async (fn, okMsg) => {
    setBusy(true); setSave('saving');
    try { await fn(bracketId); setSave('saved'); if (okMsg) flash(okMsg); }
    catch (e) { setSave('error'); flash(`Couldn't update — ${e?.message || 'try again'}`); }
    finally { setBusy(false); }
  };

  if (loading) return <Shell><div style={S.center}><Loader2 size={20} className="spin" /> Loading bracket…</div></Shell>;
  if (error) return <Shell><div style={S.center}><AlertTriangle size={20} /> {error}</div></Shell>;
  if (!state || !meta) return null;
  if (status === 'draft') return <Shell><div style={S.center}><Lock size={20} /> This bracket hasn't been published yet.</div></Shell>;

  const championName = champion ? (nameMap[champion] || '—') : null;

  return (
    <Shell onExit={onExit}>
      <header style={S.top}>
        <div style={S.brand}>
          <span style={S.title}>{meta.title}</span>
          <StatusPill status={status} />
        </div>
        <div style={S.topRight}>
          <span style={{ ...S.savePill, opacity: save === 'saving' || save === 'error' ? 1 : 0, color: save === 'error' ? 'var(--orange)' : 'var(--muted)' }}>
            {save === 'saving' ? 'Saving…' : save === 'error' ? 'Save failed' : ''}
          </span>
          {!isHost && <span style={S.live}><Radio size={13} /> Live</span>}
          {isHost && status === 'published' && (
            <button style={S.primary} disabled={busy} onClick={() => runStatus(lockBracket, 'Locked — results are open')}><Lock size={14} strokeWidth={2.5} /> Lock predictions &amp; start</button>
          )}
          {isHost && status === 'locked' && (
            <button style={{ ...S.primary, ...(champion ? {} : S.primaryOff) }} disabled={busy || !champion} title={champion ? 'Finish the tournament' : 'Decide the final first'} onClick={() => runStatus(completeBracket, 'Tournament complete')}><Trophy size={14} strokeWidth={2.5} /> Mark complete</button>
          )}
          {isHost && status === 'complete' && (
            <button style={S.ghost} disabled={busy} onClick={() => runStatus(reopenBracket, 'Reopened for edits')}><RotateCcw size={14} /> Reopen</button>
          )}
        </div>
      </header>

      {status === 'published' && (
        <div style={S.notice}>
          {isHost
            ? 'Predictions are open. Locking closes entries and lets you start recording results — this can\u2019t be undone.'
            : 'Predictions are open. Results will appear here live once the host starts the tournament.'}
        </div>
      )}
      {status === 'complete' && championName && (
        <div style={S.championBar}><Trophy size={18} strokeWidth={2.5} /> <b>{championName}</b> wins it all</div>
      )}

      <div style={S.scroll}>
        <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
          {state.rounds.length >= 2 && layout.columns.map((c, i) => (
            <div key={i} style={{ ...S.colHead, left: c.x, width: CARDW }}>{c.label}</div>
          ))}

          <svg style={S.svg} width={layout.width} height={layout.height}>
            {Object.keys(state.boxes).map((id) => {
              const { r, p } = loc[id]; const pos = layout.positions[id]; if (!pos) return null;
              return [0, 1].map((which) => {
                const fid = feederId(state, r, p, which); if (!fid) return null;
                const cp = layout.positions[fid]; if (!cp) return null;
                const decided = resolveParticipant(state, loc, id, which === 0 ? 'A' : 'B') != null;
                const x1 = cp.x + CARDW, y1 = cp.y + CARDH / 2, x2 = pos.x, y2 = pos.y + CARDH / 2, mx = (x1 + x2) / 2;
                return <path key={id + which} d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} fill="none" stroke={decided ? 'rgba(43,212,192,.55)' : 'rgba(130,139,161,.35)'} strokeWidth="2" />;
              });
            })}
          </svg>

          {Object.keys(state.boxes).map((id) => (
            <PlayCard key={id} id={id} pos={layout.positions[id]}
              a={resolveSlotForPlay(state, loc, nameMap, id, 'A')}
              b={resolveSlotForPlay(state, loc, nameMap, id, 'B')}
              result={state.boxes[id].result} score={state.boxes[id].score}
              canEnter={canEnter} onPick={onPick} onScore={onScore} />
          ))}
        </div>
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </Shell>
  );
}

function PlayCard({ id, pos, a, b, result, score, canEnter, onPick, onScore }) {
  if (!pos) return null;
  const decidable = a.kind === 'player' && b.kind === 'player';
  const hasBye = a.kind === 'bye' || b.kind === 'bye';
  const autoWinner = hasBye ? (a.kind === 'player' ? a.pid : (b.kind === 'player' ? b.pid : null)) : null;
  const winnerPid = result?.winnerId ?? autoWinner;

  const renderSlot = (slot, side) => {
    if (slot.kind === 'pending') return <div style={{ ...S.slot, ...S.slotPending }}><Clock size={13} /> <span style={S.pendTxt}>Winner of {slot.src.toUpperCase()}</span></div>;
    if (slot.kind === 'bye') return <div style={{ ...S.slot, ...S.slotMuted }}><span style={S.byeTxt}>Bye</span></div>;
    if (slot.kind === 'open') return <div style={{ ...S.slot, ...S.slotMuted }}>—</div>;
    const isWinner = slot.pid === winnerPid;
    const isLoser = winnerPid != null && !isWinner;
    const clickable = canEnter && decidable;
    const sv = side === 'A' ? score?.a : score?.b;
    return (
      <div onClick={clickable ? () => onPick(id, slot.pid) : undefined}
        style={{ ...S.slot, ...(isWinner ? S.slotWin : isLoser ? S.slotLose : clickable ? S.slotPick : S.slotIdle), cursor: clickable ? 'pointer' : 'default' }}>
        {isWinner && <Check size={14} strokeWidth={3} />}
        <span style={S.nameTxt}>{slot.name}</span>
        {clickable
          ? <input type="number" key={`sc-${side}-${sv ?? ''}`} defaultValue={sv ?? ''} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={(e) => onScore(id, side, e.currentTarget.value)} style={S.scoreInput} aria-label="score" />
          : (sv != null ? <span style={S.scoreTxt}>{sv}</span> : null)}
      </div>
    );
  };

  return (
    <div style={{ ...S.card, left: pos.x, top: pos.y, width: CARDW }}>
      <div style={S.tag}>{id.toUpperCase()}{result && <span style={S.finalTag}>final</span>}</div>
      {renderSlot(a, 'A')}
      <div style={S.vs}>vs</div>
      {renderSlot(b, 'B')}
    </div>
  );
}

function StatusPill({ status }) {
  const map = { published: ['Predictions open', 'var(--muted)'], locked: ['Live', 'var(--teal)'], complete: ['Complete', 'var(--orange)'] };
  const [label, color] = map[status] || [status, 'var(--muted)'];
  return <span style={{ ...S.pill, color, borderColor: color }}>{label}</span>;
}

function Shell({ children, onExit }) {
  return (
    <div style={S.root} className="cbp">
      <style>{CSS}</style>
      {onExit && <button style={S.exit} onClick={onExit} aria-label="Back">×</button>}
      {children}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap');
.cbp *{box-sizing:border-box}
.cbp ::-webkit-scrollbar{width:11px;height:11px}
.cbp ::-webkit-scrollbar-thumb{background:#2a3040;border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.cbp input[type=number]::-webkit-inner-spin-button{opacity:.4}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;
const S = {
  root: { '--bg': '#0c0e13', '--surface': '#14171f', '--surface2': '#1b1f2b', '--line': '#2a3040', '--text': '#eef1f7', '--muted': '#828ba1', '--orange': '#ff6a3d', '--teal': '#2bd4c0', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 560, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Outfit',system-ui,sans-serif", borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' },
  exit: { position: 'absolute', top: 10, right: 12, zIndex: 30, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer' },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontSize: 14 },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,#14171f,#101319)' },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, color: 'var(--text)' },
  pill: { fontSize: 11, fontWeight: 600, letterSpacing: .4, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 20, border: '1px solid' },
  topRight: { display: 'flex', alignItems: 'center', gap: 12 },
  savePill: { fontSize: 12, transition: 'opacity .3s' },
  live: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--teal)' },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0c0e13', background: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' },
  primaryOff: { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--line)', cursor: 'not-allowed' },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' },
  notice: { padding: '9px 18px', fontSize: 13, color: 'var(--muted)', background: 'rgba(255,106,61,.06)', borderBottom: '1px solid var(--line)' },
  championBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', fontSize: 15, color: 'var(--orange)', background: 'rgba(255,106,61,.08)', borderBottom: '1px solid var(--line)' },
  scroll: { flex: 1, overflow: 'auto', position: 'relative' },
  svg: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  colHead: { position: 'absolute', top: 26, textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1.2, color: 'var(--muted)' },
  card: { position: 'absolute', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 9, boxShadow: '0 6px 18px rgba(0,0,0,.35)', userSelect: 'none' },
  tag: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, letterSpacing: 1, color: 'var(--muted)', marginBottom: 6, height: 14 },
  finalTag: { fontFamily: "'Outfit',sans-serif", fontSize: 10, letterSpacing: .5, color: 'var(--orange)', textTransform: 'uppercase' },
  vs: { fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: '3px 0', letterSpacing: 1 },
  slot: { display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 10px', borderRadius: 8, fontSize: 13, border: '1px solid transparent' },
  slotIdle: { background: 'var(--surface2)', border: '1px solid var(--line)' },
  slotPick: { background: 'var(--surface2)', border: '1px solid #3a4152' },
  slotWin: { background: 'rgba(43,212,192,.14)', border: '1px solid rgba(43,212,192,.45)', color: 'var(--teal)', fontWeight: 600 },
  slotLose: { background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', opacity: .65 },
  slotPending: { background: 'rgba(130,139,161,.07)', border: '1px solid var(--line)', color: 'var(--muted)' },
  slotMuted: { background: 'var(--surface2)', color: 'var(--muted)' },
  nameTxt: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pendTxt: { fontSize: 12 },
  byeTxt: { fontStyle: 'italic' },
  scoreInput: { width: 34, height: 24, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', flexShrink: 0 },
  scoreTxt: { fontSize: 14, fontWeight: 600, color: 'inherit', flexShrink: 0, minWidth: 16, textAlign: 'right' },
  toast: { position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--orange)', color: '#0c0e13', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)', animation: 'pop .15s ease', zIndex: 20 },
};
