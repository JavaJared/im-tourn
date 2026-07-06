import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Trophy, Lock, AlertTriangle, Loader2, RotateCcw, Radio } from './customBracketIcons';
import { SLOT, setResult, setScore, getChampion } from '../lib/customBracket';
import BracketBoard from './BracketBoard';
import { subscribeToBracket, persistLiveDiff, lockBracket, completeBracket, reopenBracket } from '../services/customBracketService';

/* ---------- layout (shared shape with the builder) ---------- */
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

  // Adapter between BracketBoard's controlled score inputs and this
  // component's blur-commit persistence. Drafts hold in-progress typing;
  // blur clears the draft and writes through onScore ('a'/'b' -> 'A'/'B').
  const [scoreDrafts, setScoreDrafts] = useState({});
  const sc = useMemo(() => {
    const key = (id, side) => `${id}:${side}`;
    const get = (id, side) => {
      const k = key(id, side);
      if (scoreDrafts[k] != null) return scoreDrafts[k];
      const s = stateRef.current?.boxes[id]?.score;
      const v = side === 'a' ? s?.a : s?.b;
      return v ?? '';
    };
    if (canEnter) {
      return {
        editable: true,
        get,
        change: (id, side, v) => setScoreDrafts((d) => ({ ...d, [key(id, side)]: v })),
        blur: (id, side, v) => {
          setScoreDrafts((d) => { const n = { ...d }; delete n[key(id, side)]; return n; });
          onScore(id, side === 'a' ? 'A' : 'B', v);
        },
      };
    }
    const hasScores = state && Object.values(state.boxes).some((b) => b.score && (b.score.a != null || b.score.b != null));
    return hasScores ? { editable: false, get } : null;
  }, [state, canEnter, scoreDrafts]);

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
        <BracketBoard state={state} nameMap={nameMap} editable={canEnter} onPick={onPick} sc={sc} />
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </Shell>
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
