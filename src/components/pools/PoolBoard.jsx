import { useMemo } from 'react';
import { Clock, Check, X } from '../customBracketIcons';
import { SLOT, locate, slotDisplay, feederId, resolveParticipant } from '../../lib/customBracket';
import { S } from './poolStyles';
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

export default function Board({ state, nameMap, editable, onPick, official, sc, highlight, scores, pickedState }) {
  const loc = useMemo(() => locate(state), [state]);
  const layout = useMemo(() => computeLayout(state), [state]);
  const lite = (s) => (s && s.kind === 'player' ? { pid: s.pid, name: s.name } : null);
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
          result={state.boxes[id].result} editable={editable} onPick={onPick}
          official={official ? official[id] : null} sc={sc} hl={highlight ? highlight.has(id) : false}
          boxScores={scores ? scores[id] : null}
          picked={pickedState ? { a: lite(resolveSlot(pickedState, loc, nameMap, id, 'A')), b: lite(resolveSlot(pickedState, loc, nameMap, id, 'B')) } : null} />
      ))}
    </div>
  );
}
function Card({ id, pos, a, b, result, editable, onPick, official, sc, hl, boxScores, picked }) {
  if (!pos) return null;
  const decidable = a.kind === 'player' && b.kind === 'player';
  const hasBye = a.kind === 'bye' || b.kind === 'bye';
  const autoWinner = hasBye ? (a.kind === 'player' ? a.pid : (b.kind === 'player' ? b.pid : null)) : null;
  const winnerPid = result?.winnerId ?? autoWinner;
  // When an official winner is known for this box and a pick exists, grade it.
  const graded = official != null && winnerPid != null;
  const pickRight = graded && winnerPid === official;
  const slot = (sl, side) => {
    if (sl.kind === 'pending') return <div style={{ ...S.slot, ...S.slotPending }}><Clock size={13} /> <span style={S.pend}>Winner of {sl.src.toUpperCase()}</span></div>;
    if (sl.kind === 'bye') return <div style={{ ...S.slot, ...S.slotMuted }}><span style={S.byeTxt}>Bye</span></div>;
    if (sl.kind === 'open') return <div style={{ ...S.slot, ...S.slotMuted }}>—</div>;
    const isW = sl.pid === winnerPid, isL = winnerPid != null && !isW, click = editable && decidable;
    const winStyle = isW ? (graded ? (pickRight ? S.slotWin : S.slotWrong) : S.slotWin) : (isL ? S.slotLose : click ? S.slotPick : S.slotIdle);
    const editing = sc && sc.editable && decidable;                          // host score inputs
    const roScore = boxScores && sl.pid != null && boxScores[sl.pid] != null ? boxScores[sl.pid] : null; // score follows the participant
    const youPicked = picked && picked[side] && picked[side].pid !== sl.pid ? picked[side] : null;       // your bracket had someone else here
    return (
      <div style={S.slotCol}>
        <div role={click ? "button" : undefined} tabIndex={click ? 0 : undefined} onKeyDown={e => { if (click && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(id, sl.pid); } }} onClick={click ? () => onPick(id, sl.pid) : undefined} style={{ ...S.slot, ...winStyle, cursor: click ? 'pointer' : 'default' }}>
          {isW && (graded && !pickRight ? <X size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />)}<span style={S.name}>{sl.name}</span>
          {editing
            ? <input aria-label={`Score for ${sl.name}`} className="cb-score" value={sc.get(id, side)} inputMode="numeric" placeholder="–" onClick={(e) => e.stopPropagation()} onChange={(e) => sc.change(id, side, e.target.value)} onBlur={(e) => sc.blur(id, side, e.target.value)} />
            : (roScore != null && <span style={S.scoreText}>{roScore}</span>)}
        </div>
        {youPicked && <div style={S.youPicked}>You picked: <span style={S.youPickedName}>{youPicked.name}</span></div>}
      </div>
    );
  };
  return <div style={{ ...S.card, left: pos.x, top: pos.y, width: CARDW, ...(hl ? S.cardHl : {}) }}><div style={S.tag}>{id.toUpperCase()}</div>{slot(a, 'a')}<div style={S.vs}>vs</div>{slot(b, 'b')}</div>;
}

