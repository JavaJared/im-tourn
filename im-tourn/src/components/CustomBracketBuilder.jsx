import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, X, Lock, Trophy, AlertTriangle, Trash2, Check, Loader2 } from './customBracketIcons';
import {
  SLOT, MAX_PARTICIPANTS,
  addFirst, beside, after, before, removeBox,
  setSlotName, setSlotBye, clearSlot,
  locate, slotDisplay, feederId, countNamed, validateForPublish,
} from '../lib/customBracket';
import { subscribeToBracket, persistStructure, publishBracket } from '../services/customBracketService';
import { defaultRoundPoints } from '../lib/customScoring';

/* ---------- layout (UI only) ---------- */
const COLW = 248, ROWH = 150, CARDW = 190, CARDH = 126, PADX = 60, PADTOP = 96, PADBOT = 56;
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
      y = Math.max(y, cursor);
      positions[id] = { x: PADX + r * COLW, y };
      cursor = y + ROWH;
    });
  });
  const ids = Object.keys(positions);
  const maxX = ids.length ? Math.max(...ids.map((i) => positions[i].x)) + CARDW : 360;
  const maxY = ids.length ? Math.max(...ids.map((i) => positions[i].y)) + CARDH : 240;
  const columns = rounds.map((rd, r) => ({ x: PADX + r * COLW, label: (r === rounds.length - 1 && rounds.length > 1) ? 'Final' : `Round ${r + 1}` }));
  return { positions, columns, width: maxX + PADX, height: maxY + PADBOT };
}
const newPid = () => `p_${Math.random().toString(36).slice(2, 9)}`;

/* ====================================================================== *
 * CustomBracketBuilder
 *   props: bracketId (required) — the Firestore doc to edit
 *          onExit(reason?)       — optional, called after publishing
 * The doc should already exist (create it with createCustomBracket and pass
 * its id in). Local engine state is the source of truth while editing; every
 * structural edit persists via persistStructure, and the live subscription
 * skips our own pending writes so it never clobbers in-progress typing.
 * ==================================================================== */
export default function CustomBracketBuilder({ bracketId, onExit }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [save, setSave] = useState('idle'); // idle | saving | saved | error
  const [toast, setToast] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [roundPoints, setRoundPoints] = useState([]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const flash = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); }, []);

  useEffect(() => {
    if (!bracketId) { setError('No bracket was specified.'); setLoading(false); return undefined; }
    const unsub = subscribeToBracket(
      bracketId,
      (remote, meta) => {
        if (!meta.exists || !remote) { setError('This bracket could not be found.'); setLoading(false); return; }
        setError(null); setLoading(false); setState(remote);
      },
      (err) => { setError(err?.message || 'Lost connection to the bracket.'); setLoading(false); },
    );
    return unsub;
  }, [bracketId]);

  const persist = useCallback(async (next) => {
    setSave('saving');
    try { await persistStructure(bracketId, next); setSave('saved'); }
    catch (e) { setSave('error'); flash(`Couldn't save — ${e?.message || 'please try again'}`); }
  }, [bracketId, flash]);

  const loc = useMemo(() => (state ? locate(state) : {}), [state]);
  const layout = useMemo(() => (state ? computeLayout(state) : null), [state]);
  const validation = useMemo(() => (state ? validateForPublish(state) : { valid: false, errors: [] }), [state]);
  const named = useMemo(() => (state ? countNamed(state) : 0), [state]);

  const apply = (producer, selectAfter) => {
    const cur = stateRef.current; if (!cur) return;
    let next; try { next = producer(cur); } catch (e) { flash(e.message); return; }
    setState(next);
    if (selectAfter !== undefined) setSelectedId(typeof selectAfter === 'function' ? selectAfter(next) : selectAfter);
    persist(next);
  };
  const onAddFirst = () => apply((s) => addFirst(s), (n) => n._lastCreated[0]);
  const onBefore = (id) => apply((s) => before(s, id), (n) => n._lastCreated[0]);
  const onBeside = (id) => apply((s) => beside(s, id), (n) => n._lastCreated[0]);
  const onAfter = (id) => apply((s) => after(s, id), (n) => n._lastCreated[0]);
  const onRemove = (id) => { apply((s) => removeBox(s, id)); setSelectedId(null); };
  const onBye = (id, slot) => apply((s) => setSlotBye(s, id, slot));
  const onClear = (id, slot) => apply((s) => clearSlot(s, id, slot));
  const onName = (id, slot, value) => {
    const cur = stateRef.current; if (!cur) return;
    const trimmed = value.trim();
    const stored = slot === 'A' ? cur.boxes[id].slotA : cur.boxes[id].slotB;
    if (!trimmed) { if (stored.type === SLOT.NAMED) onClear(id, slot); return; }
    if (stored.type === SLOT.NAMED && stored.name === trimmed) return;
    const pid = stored.type === SLOT.NAMED ? stored.participantId : newPid();
    apply((s) => setSlotName(s, id, slot, pid, trimmed));
  };
  const openScoring = () => {
    const cur = stateRef.current; if (!cur) return;
    if (!validateForPublish(cur).valid) { setShowErrors(true); return; }
    setRoundPoints(defaultRoundPoints(cur.rounds.length));
    setScoringOpen(true);
  };
  const setRP = (i, v) => setRoundPoints((rp) => rp.map((x, idx) => (idx === i ? Math.max(0, parseInt(v, 10) || 0) : x)));
  const confirmPublish = async () => {
    const cur = stateRef.current; if (!cur) return;
    setSave('saving'); setScoringOpen(false);
    try { await publishBracket(bracketId, cur, roundPoints); setSave('saved'); flash('Published'); onExit?.('published'); }
    catch (e) {
      setSave('error');
      if (e?.errors) { setShowErrors(true); flash('Not ready to publish yet'); }
      else flash(`Couldn't publish — ${e?.message || 'please try again'}`);
    }
  };

  if (loading) return (
    <div style={S.root} className="cbb"><style>{CSS}</style><div style={S.center}><Loader2 size={20} className="spin" /> Loading bracket…</div></div>
  );
  if (error) return (
    <div style={S.root} className="cbb"><style>{CSS}</style><div style={S.center}><AlertTriangle size={20} /> {error}</div></div>
  );
  if (!state) return null;

  const boxes = state.boxes;
  const hasBoxes = Object.keys(boxes).length > 0;

  return (
    <div style={S.root} className="cbb" onMouseDown={() => setSelectedId(null)}>
      <style>{CSS}</style>

      <header style={S.top} onMouseDown={(e) => e.stopPropagation()}>
        <div style={S.brand}>
          <span style={S.brandMark}>I'M TOURN</span>
          <span style={S.brandSub}>Custom bracket builder</span>
        </div>
        <div style={S.topRight}>
          {hasBoxes && <button style={S.addBtn} onClick={onAddFirst}><Plus size={14} strokeWidth={3} /> Add matchup</button>}
          <span style={S.count}><b style={{ color: named >= MAX_PARTICIPANTS ? 'var(--orange)' : 'var(--text)' }}>{named}</b> / {MAX_PARTICIPANTS} players</span>
          <span style={{ ...S.savePill, opacity: save === 'idle' ? 0 : 1, color: save === 'error' ? 'var(--orange)' : 'var(--teal)' }}>
            {save === 'saving' ? 'Saving…' : save === 'error' ? 'Save failed' : (<><Check size={12} strokeWidth={3} /> Saved</>)}
          </span>
          <button style={{ ...S.publish, ...(validation.valid ? S.publishOn : {}) }} onClick={openScoring}><Trophy size={14} strokeWidth={2.5} /> Publish</button>
        </div>
      </header>

      <div style={S.scroll}>
        {!hasBoxes ? (
          <div style={S.empty} onMouseDown={(e) => e.stopPropagation()}>
            <p style={S.emptyTitle}>A blank canvas</p>
            <p style={S.emptyText}>Place matchups wherever you like. Winners flow into the next round by position — nothing's checked until you publish.</p>
            <button style={S.bigAdd} onClick={onAddFirst}><Plus size={18} strokeWidth={2.5} /> Add the first matchup</button>
          </div>
        ) : (
          <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
            {state.rounds.length >= 2 && layout.columns.map((c, i) => (
              <div key={i} style={{ ...S.colHead, left: c.x, width: CARDW }}>{c.label}</div>
            ))}

            <svg style={S.svg} width={layout.width} height={layout.height}>
              <defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              {Object.keys(boxes).map((id) => {
                const { r, p } = loc[id]; const pos = layout.positions[id]; if (!pos) return null;
                return [0, 1].map((which) => {
                  const fid = feederId(state, r, p, which); if (!fid) return null;
                  const cp = layout.positions[fid]; if (!cp) return null;
                  const x1 = cp.x + CARDW, y1 = cp.y + CARDH / 2, x2 = pos.x, y2 = pos.y + CARDH / 2, mx = (x1 + x2) / 2;
                  return <path key={id + which} d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} style={S.edge} filter="url(#glow)" />;
                });
              })}
            </svg>

            {Object.keys(boxes).map((id) => (
              <MatchCard key={id} id={id}
                dispA={slotDisplay(state, loc, id, 'A')} dispB={slotDisplay(state, loc, id, 'B')}
                pos={layout.positions[id]} selected={selectedId === id}
                onSelect={setSelectedId} onName={onName} onBye={onBye} onClear={onClear} onRemove={onRemove} />
            ))}

            {selectedId && layout.positions[selectedId] && (
              <Handles pos={layout.positions[selectedId]}
                onBefore={() => onBefore(selectedId)} onBeside={() => onBeside(selectedId)} onAfter={() => onAfter(selectedId)} />
            )}
          </div>
        )}
      </div>

      {hasBoxes && (
        <footer style={S.foot} onMouseDown={(e) => e.stopPropagation()}>
          {validation.valid ? (
            <span style={S.ready}><Check size={14} strokeWidth={3} /> Ready to publish</span>
          ) : (
            <button style={S.notReady} onClick={() => setShowErrors((v) => !v)}>
              <AlertTriangle size={14} /> {validation.errors.length} thing{validation.errors.length > 1 ? 's' : ''} to fix before publishing
            </button>
          )}
          {showErrors && !validation.valid && (
            <ul style={S.errList}>{validation.errors.map((e, i) => <li key={i} style={S.errItem}>{e}</li>)}</ul>
          )}
        </footer>
      )}

      {scoringOpen && (
        <div style={S.overlay} onMouseDown={(e) => e.stopPropagation()}>
          <div style={S.sheet}>
            <div style={S.sheetTitle}>Round scoring</div>
            <p style={S.sheetSub}>Points for each correct pick. Later rounds usually count for more.</p>
            <div style={S.rpList}>
              {roundPoints.map((pt, i) => (
                <div key={i} style={S.rpRow}>
                  <span style={S.rpLabel}>{i === roundPoints.length - 1 && roundPoints.length > 1 ? 'Final' : `Round ${i + 1}`}</span>
                  <input type="number" min="0" value={pt} onChange={(e) => setRP(i, e.target.value)} style={S.rpInput} />
                  <span style={S.rpUnit}>pts</span>
                </div>
              ))}
            </div>
            <div style={S.sheetActions}>
              <button style={S.cancelBtn} onClick={() => setScoringOpen(false)}>Cancel</button>
              <button style={S.confirmBtn} onClick={confirmPublish}><Trophy size={14} strokeWidth={2.5} /> Publish bracket</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function MatchCard({ id, dispA, dispB, pos, selected, onSelect, onName, onBye, onClear, onRemove }) {
  if (!pos) return null;
  return (
    <div style={{ ...S.card, left: pos.x, top: pos.y, width: CARDW, ...(selected ? S.cardSel : {}) }} onMouseDown={(e) => { e.stopPropagation(); onSelect(id); }}>
      <div style={S.tag}>{id.toUpperCase()}{selected && (
        <button style={S.del} title="Remove this matchup" onMouseDown={(e) => { e.stopPropagation(); onRemove(id); }}><Trash2 size={12} /></button>
      )}</div>
      <Slot id={id} slot="A" d={dispA} onName={onName} onBye={onBye} onClear={onClear} />
      <div style={S.vs}>vs</div>
      <Slot id={id} slot="B" d={dispB} onName={onName} onBye={onBye} onClear={onClear} />
    </div>
  );
}

function Slot({ id, slot, d, onName, onBye, onClear }) {
  const sig = `${d.type}:${d.participantId || ''}:${d.name || ''}:${d.sourceBoxId || ''}`;
  if (d.type === SLOT.FEED) return <div style={{ ...S.slot, ...S.slotFeed }}><Lock size={12} /> <span style={S.feedTxt}>Winner of {d.sourceBoxId.toUpperCase()}</span></div>;
  if (d.type === SLOT.BYE) return (
    <div style={{ ...S.slot, ...S.slotBye }}><span style={S.byeTxt}>Bye</span>
      <button style={S.slotX} title="Clear" onMouseDown={(e) => { e.stopPropagation(); onClear(id, slot); }}><X size={12} /></button>
    </div>
  );
  const named = d.type === SLOT.NAMED;
  return (
    <div style={{ ...S.slot, ...(named ? S.slotNamed : S.slotOpen) }} onMouseDown={(e) => e.stopPropagation()}>
      <input key={sig} defaultValue={named ? d.name : ''} placeholder="Add player" style={S.input}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur={(e) => onName(id, slot, e.currentTarget.value)} />
      {named ? (
        <button style={S.slotX} title="Clear" onMouseDown={(e) => { e.stopPropagation(); onClear(id, slot); }}><X size={12} /></button>
      ) : (
        <button style={S.byeBtn} title="Make this a bye" onMouseDown={(e) => { e.stopPropagation(); onBye(id, slot); }}>Bye</button>
      )}
    </div>
  );
}

function Handles({ pos, onBefore, onBeside, onAfter }) {
  return (
    <>
      <button className="handle" style={{ ...S.handle, left: pos.x - 52, top: pos.y + CARDH / 2 - 17 }} title="Add a matchup in the earlier round" onMouseDown={(e) => { e.stopPropagation(); onBefore(); }}><Plus size={16} strokeWidth={3} /></button>
      <button className="handle" style={{ ...S.handle, left: pos.x + CARDW + 18, top: pos.y + CARDH / 2 - 17 }} title="Add a matchup in the later round" onMouseDown={(e) => { e.stopPropagation(); onAfter(); }}><Plus size={16} strokeWidth={3} /></button>
      <button className="handle" style={{ ...S.handle, left: pos.x + CARDW / 2 - 17, top: pos.y + CARDH + 18 }} title="Add a matchup in the same round" onMouseDown={(e) => { e.stopPropagation(); onBeside(); }}><Plus size={16} strokeWidth={3} /></button>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap');
.cbb *{box-sizing:border-box}
.cbb ::-webkit-scrollbar{width:11px;height:11px}
.cbb ::-webkit-scrollbar-thumb{background:#2a3040;border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.cbb input::placeholder{color:#5b6275}
.handle{transition:transform .12s ease, box-shadow .12s ease}
.handle:hover{transform:scale(1.12);box-shadow:0 0 0 6px rgba(43,212,192,.14)}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;
const S = {
  root: { '--bg': '#0c0e13', '--surface': '#14171f', '--surface2': '#1b1f2b', '--line': '#2a3040', '--text': '#eef1f7', '--muted': '#828ba1', '--orange': '#ff6a3d', '--teal': '#2bd4c0', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 560, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Outfit',system-ui,sans-serif", borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontSize: 14 },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,#14171f,#101319)' },
  brand: { display: 'flex', flexDirection: 'column', lineHeight: 1 },
  brandMark: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1.5, color: 'var(--orange)' },
  brandSub: { fontSize: 12, color: 'var(--muted)', marginTop: 3 },
  topRight: { display: 'flex', alignItems: 'center', gap: 12 },
  addBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' },
  count: { fontSize: 13, color: 'var(--muted)' },
  savePill: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, transition: 'opacity .3s' },
  publish: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' },
  publishOn: { color: '#0c0e13', background: 'var(--teal)', border: '1px solid var(--teal)' },
  scroll: { flex: 1, overflow: 'auto', position: 'relative' },
  svg: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  edge: { fill: 'none', stroke: 'rgba(43,212,192,.5)', strokeWidth: 2 },
  colHead: { position: 'absolute', top: 26, textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1.2, color: 'var(--muted)' },
  card: { position: 'absolute', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 9, boxShadow: '0 6px 18px rgba(0,0,0,.35)', cursor: 'pointer', userSelect: 'none' },
  cardSel: { border: '2px solid var(--orange)', padding: 8, boxShadow: '0 0 0 4px rgba(255,106,61,.14), 0 8px 22px rgba(0,0,0,.45)' },
  tag: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, letterSpacing: 1, color: 'var(--muted)', marginBottom: 6, height: 14 },
  del: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, color: 'var(--orange)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 },
  vs: { fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: '3px 0', letterSpacing: 1 },
  slot: { display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 8px', borderRadius: 8, fontSize: 13 },
  slotOpen: { border: '1px dashed #3a4152' },
  slotNamed: { border: '1px solid var(--line)', background: 'var(--surface2)' },
  slotFeed: { background: 'rgba(43,212,192,.08)', color: 'var(--teal)', border: '1px solid rgba(43,212,192,.2)' },
  slotBye: { background: 'var(--surface2)', color: 'var(--muted)', justifyContent: 'space-between' },
  feedTxt: { fontSize: 12, fontWeight: 500 },
  byeTxt: { fontStyle: 'italic', fontSize: 13 },
  input: { flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' },
  slotX: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 },
  byeBtn: { fontSize: 11, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', flexShrink: 0 },
  handle: { position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', background: 'var(--teal)', color: '#08221f', border: 'none', cursor: 'pointer', zIndex: 5, boxShadow: '0 4px 12px rgba(43,212,192,.3)' },
  empty: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 },
  emptyTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, letterSpacing: 1.5, margin: 0 },
  emptyText: { color: 'var(--muted)', fontSize: 14, maxWidth: 400, margin: '8px 0 22px', lineHeight: 1.5 },
  bigAdd: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#0c0e13', background: 'var(--orange)', border: 'none', borderRadius: 11, padding: '12px 20px', cursor: 'pointer' },
  foot: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 18px', borderTop: '1px solid var(--line)', background: '#101319' },
  ready: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--teal)', fontWeight: 500 },
  notReady: { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--orange)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 },
  errList: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '4px 18px', animation: 'pop .15s ease' },
  errItem: { fontSize: 12.5, color: 'var(--muted)' },
  overlay: { position: 'absolute', inset: 0, background: 'rgba(6,8,12,.66)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, animation: 'pop .12s ease' },
  sheet: { width: 340, maxWidth: '88%', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,.55)' },
  sheetTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, color: 'var(--text)' },
  sheetSub: { fontSize: 13, color: 'var(--muted)', margin: '4px 0 14px', lineHeight: 1.4 },
  rpList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflow: 'auto' },
  rpRow: { display: 'flex', alignItems: 'center', gap: 10 },
  rpLabel: { flex: 1, fontSize: 14 },
  rpInput: { width: 60, height: 32, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' },
  rpUnit: { fontSize: 12, color: 'var(--muted)', width: 24 },
  sheetActions: { display: 'flex', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 0', cursor: 'pointer' },
  confirmBtn: { flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0c0e13', background: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 9, padding: '10px 0', cursor: 'pointer' },
  toast: { position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: 'var(--orange)', color: '#0c0e13', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)', animation: 'pop .15s ease', zIndex: 20 },
};
