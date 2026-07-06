/**
 * BracketBoard.jsx — THE bracket renderer.
 *
 * Extracted from CustomPoolDetail so every surface that draws a bracket
 * (pool predictions, results entry, fill-outs, bracket detail, builder
 * preview) renders identically. Standard and custom brackets both produce
 * engine state, so this one component covers both.
 *
 * Props:
 *   state     engine state ({ rounds, boxes }) — hydrate with
 *             customScoring.hydrateState or lib deserialize
 *   nameMap   { pid: displayName }
 *   seedMap   optional { pid: seedNumber } — renders a seed chip when present
 *             (NAMED slots that carry their own `seed` field also render one)
 *   editable  clicks pick winners when true
 *   onPick    (boxId, pid) => void
 *   official  optional { boxId: officialWinnerPid } — grades picks
 *   sc        optional score controller { editable, get, change, blur }
 *   highlight optional Set<boxId> to outline
 *
 * Also exports computeLayout / resolveSlot / layout constants for components
 * that need geometry (e.g. the builder's drag targets).
 */
import React, { useMemo } from 'react';
import { Check, Clock, X } from './customBracketIcons';
import { SLOT, locate, slotDisplay, feederId, resolveParticipant } from '../lib/customBracket';

export const COLW = 248, ROWH = 150, CARDW = 200, CARDH = 116, PADX = 60, PADTOP = 92, PADBOT = 56;

export function computeLayout(state) {
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

export function resolveSlot(state, loc, nameMap, boxId, slot, seedMap) {
  const d = slotDisplay(state, loc, boxId, slot);
  if (d.type === SLOT.NAMED) return { kind: 'player', pid: d.participantId, name: d.name, seed: d.seed ?? (seedMap ? seedMap[d.participantId] : undefined) };
  if (d.type === SLOT.BYE) return { kind: 'bye' };
  if (d.type === SLOT.OPEN) return { kind: 'open' };
  const pid = resolveParticipant(state, loc, boxId, slot);
  if (pid == null) return { kind: 'pending', src: d.sourceBoxId };
  return { kind: 'player', pid, name: (nameMap && nameMap[pid]) || '—', seed: seedMap ? seedMap[pid] : undefined };
}

export default function BracketBoard({ state, nameMap, seedMap, editable, onPick, official, sc, highlight }) {
  const loc = useMemo(() => locate(state), [state]);
  const layout = useMemo(() => computeLayout(state), [state]);
  return (
    <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
      {state.rounds.length >= 2 && layout.columns.map((c, i) => <div key={i} style={{ ...BS.colHead, left: c.x, width: CARDW }}>{c.label}</div>)}
      <svg style={BS.svg} width={layout.width} height={layout.height}>
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
          a={resolveSlot(state, loc, nameMap, id, 'A', seedMap)} b={resolveSlot(state, loc, nameMap, id, 'B', seedMap)}
          result={state.boxes[id].result} editable={editable} onPick={onPick}
          official={official ? official[id] : null} sc={sc} hl={highlight ? highlight.has(id) : false} />
      ))}
    </div>
  );
}

function Card({ id, pos, a, b, result, editable, onPick, official, sc, hl }) {
  if (!pos) return null;
  const decidable = a.kind === 'player' && b.kind === 'player';
  const hasBye = a.kind === 'bye' || b.kind === 'bye';
  const autoWinner = hasBye ? (a.kind === 'player' ? a.pid : (b.kind === 'player' ? b.pid : null)) : null;
  const winnerPid = result?.winnerId ?? autoWinner;
  const graded = official != null && winnerPid != null;
  const pickRight = graded && winnerPid === official;
  const showScore = sc && decidable;
  const slot = (sl, side) => {
    if (sl.kind === 'pending') return <div style={{ ...BS.slot, ...BS.slotPending }}><Clock size={13} /> <span style={BS.pend}>Winner of {sl.src.toUpperCase()}</span></div>;
    if (sl.kind === 'bye') return <div style={{ ...BS.slot, ...BS.slotMuted }}><span style={BS.byeTxt}>Bye</span></div>;
    if (sl.kind === 'open') return <div style={{ ...BS.slot, ...BS.slotMuted }}>—</div>;
    const isW = sl.pid === winnerPid, isL = winnerPid != null && !isW, click = editable && decidable;
    const winStyle = isW ? (graded ? (pickRight ? BS.slotWin : BS.slotWrong) : BS.slotWin) : (isL ? BS.slotLose : click ? BS.slotPick : BS.slotIdle);
    const scoreVal = showScore ? sc.get(id, side) : '';
    return (
      <div onClick={click ? () => onPick(id, sl.pid) : undefined} style={{ ...BS.slot, ...winStyle, cursor: click ? 'pointer' : 'default' }}>
        {isW && (graded && !pickRight ? <X size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />)}
        {sl.seed != null && <span style={BS.seed}>{sl.seed}</span>}
        <span style={BS.name}>{sl.name}</span>
        {showScore && (sc.editable
          ? <input className="cb-score" value={scoreVal} inputMode="numeric" placeholder="–" onClick={(e) => e.stopPropagation()} onChange={(e) => sc.change(id, side, e.target.value)} onBlur={(e) => sc.blur(id, side, e.target.value)} />
          : (scoreVal !== '' && <span style={BS.scoreText}>{scoreVal}</span>))}
      </div>
    );
  };
  return <div style={{ ...BS.card, left: pos.x, top: pos.y, width: CARDW, ...(hl ? BS.cardHl : {}) }}><div style={BS.tag}>{id.toUpperCase()}</div>{slot(a, 'a')}<div style={BS.vs}>vs</div>{slot(b, 'b')}</div>;
}

/* Board-scoped styles. Values match the CustomPoolDetail design system
 * (CSS custom properties are inherited from the host component's root). */
const BS = {
  svg: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  colHead: { position: 'absolute', top: 8, textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1.2, color: 'var(--muted)' },
  card: { position: 'absolute', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 9, boxShadow: '0 6px 18px rgba(0,0,0,.35)', userSelect: 'none' },
  cardHl: { boxShadow: '0 0 0 2px var(--teal), 0 6px 18px rgba(43,212,192,.25)' },
  tag: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, letterSpacing: 1, color: 'var(--muted)', marginBottom: 6, height: 14 },
  vs: { fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: '3px 0', letterSpacing: 1 },
  slot: { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 10px', borderRadius: 8, fontSize: 13, border: '1px solid transparent' },
  slotIdle: { background: 'var(--surface2)', border: '1px solid var(--line)' },
  slotPick: { background: 'var(--surface2)', border: '1px solid #3a4152' },
  slotWin: { background: 'rgba(43,212,192,.14)', border: '1px solid rgba(43,212,192,.45)', color: 'var(--teal)', fontWeight: 600 },
  slotWrong: { background: 'rgba(255,99,99,.13)', border: '1px solid rgba(255,99,99,.5)', color: '#ff8a8a', fontWeight: 600 },
  slotLose: { background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', opacity: .6 },
  slotPending: { background: 'rgba(130,139,161,.07)', border: '1px solid var(--line)', color: 'var(--muted)' },
  slotMuted: { background: 'var(--surface2)', color: 'var(--muted)' },
  name: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  seed: { flex: 'none', minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 5, padding: '0 3px' },
  scoreText: { marginLeft: 4, fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 18, textAlign: 'right', flex: 'none' },
  pend: { fontSize: 12 }, byeTxt: { fontStyle: 'italic' },
};
