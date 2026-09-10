import { predictionsOpen } from '../lib/poolLifecycle';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Clock, Loader2, AlertTriangle, Trophy, Lock, Users, RotateCcw, Send, X, Trash2 } from './customBracketIcons';
import { SLOT, locate, slotDisplay, feederId, resolveParticipant, matchWinner, setResult, getChampion } from '../lib/customBracket';
import { hydrateState, picksFromState, isEntryComplete, buildLeaderboard, defaultRoundPoints, predictedLosers } from '../lib/customScoring';
import { analyzeCustomPool, summarizeWinningScenarios, shouldShowWinningPaths } from '../lib/customElimination';
import { joinBracketPool, submitPoolPredictions, lockPool, completePool, updatePoolDescription, deletePool, getPoolById } from '../services/bracketService';
import { startCustomPool, recordCustomPoolWinner, updateCustomPoolScores, recalculateCustomPoolScoresManual, subscribeToPool, subscribeToPoolEntries } from '../services/customBracketService';

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

function Board({ state, nameMap, editable, onPick, official, sc, highlight, scores, pickedState }) {
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

function StatusBadge({ status }) {
  if (!status) return null;
  if (status === 'clinched') return <span style={{ ...S.badge, ...S.badgeClinch }}><Trophy size={10} /> Clinched</span>;
  if (status === 'eliminated') return <span style={{ ...S.badge, ...S.badgeOut }}>Out</span>;
  return <span style={{ ...S.badge, ...S.badgeAlive }}>{status === 'unknown' ? 'Undetermined' : 'Alive'}</span>;
}

const STATUS_LABEL = { open: 'Predictions open', locked: 'Locked', in_progress: 'In progress', completed: 'Completed' };

/* ====================================================================== *
 * CustomPoolDetail — runs a bracket pool backed by a custom bracket.
 * Rendered by PoolDetailPage when pool.bracketType === 'custom'.
 * ==================================================================== */
export default function CustomPoolDetail({ poolId, currentUserId, currentUserName, onNavigate }) {
  const [pool, setPool] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entriesError, setEntriesError] = useState('');
  const entryWatch = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('bracket');
  const [predState, setPredState] = useState(null);
  const [resState, setResState] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [sleepers, setSleepers] = useState({ sleeper1: null, sleeper2: null });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);   // another participant's bracket being viewed
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  // Per-matchup score entry. scoreDrafts holds in-flight input strings keyed
  // `${boxId}:${side}` for responsive typing; pendingScoreWrites accumulates the
  // parsed values so a single coalesced flush persists them all at once (avoids
  // the stale-closure race where concurrent saves overwrite each other).
  const [scoreDrafts, setScoreDrafts] = useState({});
  const pendingScoreWrites = useRef({});
  const scoreFlushTimer = useRef(null);
  const inflightFlush = useRef(null);

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);

  // Live subscriptions: the pool doc (status, results, lifecycle) and every
  // entry (predictions + scores). All viewers see results and standings update
  // in real time without reloading.
  useEffect(() => {
    setPool(null); setEntries([]); setViewingEntry(null); setLoading(true);
    const unsubPool = subscribeToPool(poolId, (p) => {
      if (!p) { setError('Pool not found.'); setLoading(false); return; }
      setPool(p); setError(null); setLoading(false); entryWatch.current?.refresh();
    }, (e) => { setError(e?.message || 'Failed to load pool.'); setLoading(false); });
    const unsubEntries = subscribeToPoolEntries(poolId, all => { setEntries(all); setEntriesError(''); }, e => setEntriesError(e.message || 'Could not load participants.'));
    entryWatch.current = unsubEntries;
    return () => { unsubPool(); unsubEntries(); };
  }, [poolId, currentUserId]);

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
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(`pool-draft:${poolId}:${currentUserId}`)); } catch {}
    const resume = predictionsOpen(pool) && draft?.submittedKey === submittedKey ? draft : null;
    setPredState(hydrateState(pool.bracketMatchups, resume?.picks || myEntry?.predictions || {}));
    setSleepers(resume?.sleepers || { sleeper1: myEntry?.sleeper1 || null, sleeper2: myEntry?.sleeper2 || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, currentUserId, structureReady, submittedKey]);

  // The official-results board: viewers (and a not-yet-recording host) mirror
  // pool.customResults live; an actively-recording host keeps resState local and
  // optimistic so rapid taps aren't clobbered by incoming snapshots.
  useEffect(() => {
    if (!pool?.bracketMatchups) { setResState(null); return; }
    if (canRecord) setResState((prev) => prev || hydrateState(pool.bracketMatchups, pool.customResults || {}));
    else setResState(hydrateState(pool.bracketMatchups, pool.customResults || {}));
  }, [pool, canRecord]);

  const run = async (fn, ok) => { setBusy(true); try { await fn(); await entryWatch.current?.refresh(); if (ok) flash(ok); } catch (e) { flash(e?.message || 'Something went wrong'); } setBusy(false); };

  // predictor picks
  const canPredict = joined && predictionsOpen(pool, now);
  useEffect(() => {
    if (!canPredict || !predState) return;
    try { localStorage.setItem(`pool-draft:${poolId}:${currentUserId}`, JSON.stringify({ submittedKey, picks: picksFromState(predState), sleepers })); } catch {}
  }, [poolId, currentUserId, predState, sleepers, submittedKey, canPredict]);
  const loserOptions = [0, 1].map(r => predState ? predictedLosers(pool.bracketMatchups, picksFromState(predState), r) : []);
  const pickPred = (boxId, pid) => { if (!canPredict || !predState) return; try { setPredState(setResult(predState, boxId, pid)); } catch (e) { flash(e.message); } };
  const submitPredictions = () => {
    if (!predState || !isEntryComplete(predState)) return;
    run(() => submitPoolPredictions(poolId, currentUserId, picksFromState(predState), getChampion(predState), pool.enableSleepers ? { sleeper1: loserOptions[0].includes(sleepers.sleeper1) ? sleepers.sleeper1 : null, sleeper2: loserOptions[1].includes(sleepers.sleeper2) ? sleepers.sleeper2 : null } : null), 'Predictions submitted');
  };
  // host results — optimistic local update + persist; snapshots keep everyone else live
  const pickResult = (boxId, pid) => {
    if (!canRecord || !resState || busy) return;
    let next; try { next = setResult(resState, boxId, pid); } catch (e) { flash(e.message); return; }
    setResState(next);
    run(async () => { try { await recordCustomPoolWinner(poolId, boxId, pid); } catch (e) { setResState(resState); throw e; } });
  };

  const leaderboard = useMemo(() => {
    if (!pool) return [];
    const official = hydrateState(pool.bracketMatchups, pool.customResults || {});
    // Pool entries carry their picks under `predictions`; buildLeaderboard reads `picks`.
    const scored = entries.filter((e) => e.predictions).map((e) => ({ ...e, picks: e.predictions, displayName: e.userDisplayName }));
    const scoredById = new Map(buildLeaderboard(official, scored, roundPoints, pool).map(e => [e.id, e]));
    return entries.map(e => scoredById.get(e.id) || { ...e, total: e.score || 0, correct: 0 }).sort((a, b) => b.total - a.total);
  }, [pool, entries, roundPoints]);

  // Official winner per box (pid), for grading any prediction board correct/incorrect.
  const officialWinners = useMemo(() => {
    if (!pool?.bracketMatchups) return {};
    const st = hydrateState(pool.bracketMatchups, pool.customResults || {});
    const loc = locate(st); const m = {};
    for (const id of Object.keys(st.boxes)) { const w = matchWinner(st, loc, id); if (w != null) m[id] = w; }
    return m;
  }, [pool]);

  // Per-matchup scores keyed by *participant* (so a score follows its team onto
  // any board — the official results board and every prediction board alike).
  const scoresByBox = useMemo(() => {
    const cs = pool?.customScores;
    if (!cs || !pool?.bracketMatchups) return {};
    const st = hydrateState(pool.bracketMatchups, pool.customResults || {});
    const loc = locate(st); const map = {};
    for (const id of Object.keys(cs)) {
      const s = cs[id]; if (!s) continue;
      const pa = resolveParticipant(st, loc, id, 'A'); const pb = resolveParticipant(st, loc, id, 'B');
      const m = {};
      if (pa != null && s.a != null) m[pa] = s.a;
      if (pb != null && s.b != null) m[pb] = s.b;
      if (Object.keys(m).length) map[id] = m;
    }
    return map;
  }, [pool]);

  // The bracket of whichever participant is being viewed from the leaderboard.
  const viewingState = useMemo(
    () => (viewingEntry && pool?.bracketMatchups && viewingEntry.predictions) ? hydrateState(pool.bracketMatchups, viewingEntry.predictions) : null,
    [viewingEntry, pool]
  );

  // Elimination analysis (alive / clinched / eliminated) once results are live.
  const analysis = useMemo(() => {
    if (entries.nextCursor || entries.some(e => e.dataError) || !pool?.bracketMatchups || (status !== 'in_progress' && status !== 'completed')) return null;
    return analyzeCustomPool(pool.bracketMatchups, pool.customResults || {}, entries, roundPoints, { pool });
  }, [pool, entries, roundPoints, status]);
  const showPaths = useMemo(
    () => (analysis ? shouldShowWinningPaths(pool.bracketMatchups, pool.customResults || {}, analysis, entries) : false),
    [analysis, pool, entries]
  );
  const viewingStatus = viewingEntry && analysis ? analysis.byUserId[viewingEntry.userId] : null;
  const viewingSummary = useMemo(
    () => (viewingStatus && showPaths ? summarizeWinningScenarios(viewingStatus, nameMap) : null),
    [viewingStatus, showPaths, nameMap]
  );
  const highlightBoxes = useMemo(() => (viewingSummary ? new Set(viewingSummary.required.map((r) => r.boxId)) : null), [viewingSummary]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}?pool=${pool.joinCode}`); flash('Invite link copied'); }
    catch { flash('Could not copy link'); }
  };
  const saveDesc = () => run(async () => { await updatePoolDescription(poolId, currentUserId, descDraft); setEditingDesc(false); }, 'Description saved');
  const removePool = () => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this pool for everyone? This cannot be undone.')) return;
    run(async () => { await deletePool(poolId, currentUserId); onNavigate('pools'); });
  };

  // ---- per-matchup score entry (host) ----------------------------------
  const parseScoreInput = (raw) => {
    if (raw == null) return null;
    const t = String(raw).trim();
    if (t === '') return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  };
  // Flush every accumulated score edit in one write. Reads the pool fresh so we
  // merge onto the latest customScores rather than a stale closure copy.
  const flushPendingScores = async () => {
    if (!canRecord) { pendingScoreWrites.current = {}; return; }
    if (inflightFlush.current) { await inflightFlush.current; }
    const pending = pendingScoreWrites.current;
    if (Object.keys(pending).length === 0) return;
    pendingScoreWrites.current = {};                 // start a fresh batch before async work
    try {
      await updateCustomPoolScores(poolId, currentUserId, pending);
    } catch (e) {
      // Re-queue on failure so edits aren't silently dropped.
      for (const key of Object.keys(pending)) if (!(key in pendingScoreWrites.current)) pendingScoreWrites.current[key] = pending[key];
      flash('Scores could not be saved. Your edits are kept; change or leave the field to retry.');
    }
  };
  const scheduleFlush = () => {
    if (scoreFlushTimer.current) clearTimeout(scoreFlushTimer.current);
    scoreFlushTimer.current = setTimeout(() => {
      scoreFlushTimer.current = null;
      inflightFlush.current = flushPendingScores().finally(() => { inflightFlush.current = null; });
    }, 300);
  };
  const handleScoreChange = (boxId, side, raw) => {
    const key = `${boxId}:${side}`;
    setScoreDrafts((prev) => ({ ...prev, [key]: raw }));
    pendingScoreWrites.current[key] = parseScoreInput(raw);
    scheduleFlush();
  };
  const handleScoreBlur = async (boxId, side, raw) => {
    const key = `${boxId}:${side}`;
    pendingScoreWrites.current[key] = parseScoreInput(raw);
    if (scoreFlushTimer.current) { clearTimeout(scoreFlushTimer.current); scoreFlushTimer.current = null; }
    const p = flushPendingScores(); inflightFlush.current = p; await p; inflightFlush.current = null;
    setScoreDrafts((prev) => { const n = { ...prev }; delete n[key]; return n; });   // clear draft once the live snapshot reflects it
  };
  const getScoreInputValue = (boxId, side) => {
    const key = `${boxId}:${side}`;
    if (key in scoreDrafts) return scoreDrafts[key];
    const v = pool?.customScores?.[boxId]?.[side];
    return v == null ? '' : String(v);
  };
  useEffect(() => () => {
    if (scoreFlushTimer.current) { clearTimeout(scoreFlushTimer.current); scoreFlushTimer.current = null; }
    if (Object.keys(pendingScoreWrites.current).length > 0) flushPendingScores();   // best-effort flush on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Score inputs are for the recording host only; everyone else sees scores
  // read-only via scoresByBox on whichever board they're looking at.
  const scoreUI = canRecord ? { editable: true, get: getScoreInputValue, change: handleScoreChange, blur: handleScoreBlur } : null;

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
          {isHost && pool.joinCode && <div style={S.codeWrap}><span>Code</span><span style={S.codeVal}>{pool.joinCode}</span><button style={S.linkBtn} onClick={copyLink}>Copy link</button></div>}
          {isHost && status === 'open' && <button style={S.primary} disabled={busy} onClick={() => run(() => lockPool(poolId, currentUserId), 'Predictions locked')}><Lock size={14} /> Lock predictions</button>}
          {isHost && status === 'locked' && <button style={S.primary} disabled={busy} onClick={() => run(() => startCustomPool(poolId, currentUserId), 'Pool started')}><Trophy size={14} /> Start &amp; record results</button>}
          {isHost && status === 'in_progress' && <>
            <button style={S.ghost} disabled={busy} onClick={() => run(() => recalculateCustomPoolScoresManual(poolId, currentUserId), 'Scores recalculated')}><RotateCcw size={14} /> Recalc</button>
            <button style={S.primary} disabled={busy} onClick={() => run(() => completePool(poolId, currentUserId), 'Pool completed')}><Check size={14} strokeWidth={3} /> Complete</button>
          </>}
          {isHost && <button style={S.danger} disabled={busy} onClick={removePool}><Trash2 size={14} /> Delete</button>}
        </div>
      </header>

      {pool.lockDate && <div style={S.note}>Predictions close {pool.lockDate.toLocaleString()}{!predictionsOpen(pool, now) ? " · Closed" : ""}</div>}
      {(pool.description || isHost) && (
        <div style={S.descWrap}>
          {editingDesc ? (
            <div style={S.descEdit}>
              <textarea style={S.descArea} rows={3} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} placeholder="Add rules, prizes, or info for participants…" />
              <div style={S.descActions}>
                <button style={S.ghost} disabled={busy} onClick={() => setEditingDesc(false)}>Cancel</button>
                <button style={S.primary} disabled={busy} onClick={saveDesc}><Check size={14} strokeWidth={3} /> Save</button>
              </div>
            </div>
          ) : (
            <div style={S.descRow}>
              <p style={{ ...S.descText, ...(pool.description ? {} : S.descEmpty) }}>{pool.description || 'No description yet.'}</p>
              {isHost && <button style={S.editBtn} onClick={() => { setDescDraft(pool.description || ''); setEditingDesc(true); }}>{pool.description ? 'Edit' : 'Add description'}</button>}
            </div>
          )}
        </div>
      )}

      <div style={S.tabs}>
        {['bracket', 'results', 'leaderboard'].map((t) => (
          <button key={t} style={S.tab(tab === t)} onClick={() => { setTab(t); setViewingEntry(null); }}>{t === 'bracket' ? (isHost ? 'Bracket' : 'My picks') : t === 'results' ? 'Results' : 'Leaderboard'}</button>
        ))}
      </div>

      {status === 'completed' && pool.winnerName && <div style={S.championBar}><Trophy size={18} strokeWidth={2.5} /> <b>{pool.winnerName}</b> wins with {pool.winnerScore} pts</div>}

      <div style={S.scroll}>
        {viewingEntry ? (
          <>
            <div style={S.viewBanner}>
              <button style={S.backMini} onClick={() => setViewingEntry(null)}>← Back</button>
              <span style={S.viewName}>{(viewingEntry.userDisplayName || viewingEntry.displayName || 'Entry')}’s bracket</span>
              {viewingStatus && <StatusBadge status={viewingStatus.status} />}
              <span style={S.viewScore}>{viewingEntry.total ?? viewingEntry.score ?? 0} pts</span>
            </div>
            {viewingStatus && (
              <div style={S.pathPanel}>
                {viewingStatus.status === 'clinched' && <div style={S.pathLine}><Trophy size={13} /> Clinched — guaranteed at least a share of 1st place.</div>}
                {viewingStatus.status === 'eliminated' && <div style={{ ...S.pathLine, color: '#ff8a8a' }}>Eliminated — can no longer reach 1st place.</div>}
                {viewingStatus.status === 'alive' && (
                  viewingSummary ? (
                    <>
                      <div style={S.pathHead}>What needs to happen{viewingSummary.truncated ? ' (partial)' : ''} · {viewingSummary.totalScenarios} winning {viewingSummary.totalScenarios === 1 ? 'path' : 'paths'}</div>
                      {viewingSummary.required.length > 0 && (
                        <div style={S.pathBlock}>
                          <div style={S.pathSub}>Must happen</div>
                          {viewingSummary.required.map((r) => <div key={r.boxId} style={S.pathItem}><span style={S.pathBox}>{r.boxId.toUpperCase()}</span> {r.winnerName} must win</div>)}
                        </div>
                      )}
                      {viewingSummary.rootFor.length > 0 && (
                        <div style={S.pathBlock}>
                          <div style={S.pathSub}>Root for</div>
                          {viewingSummary.rootFor.map((r) => <div key={r.boxId} style={S.pathItem}><span style={S.pathBox}>{r.boxId.toUpperCase()}</span> {r.perOutcome.map((o) => o.winnerName).join(' or ')}</div>)}
                        </div>
                      )}
                      {viewingSummary.required.length === 0 && viewingSummary.rootFor.length === 0 && <div style={S.pathLine}>Still alive — multiple paths to 1st.</div>}
                    </>
                  ) : <div style={S.pathLine}>Still in contention for 1st.</div>
                )}
              </div>
            )}
            {viewingState
              ? <Board state={viewingState} nameMap={nameMap} editable={false} onPick={() => {}} official={officialWinners} highlight={highlightBoxes} scores={scoresByBox} />
              : <div style={S.note}>This participant hasn’t submitted a bracket yet.</div>}
          </>
        ) : (
          <>
        {tab === 'bracket' && (
          !joined ? (
            predictionsOpen(pool, now)
              ? <div style={S.joinWrap}>
                  <div style={S.note}>{isHost ? 'Join your own pool to enter a prediction bracket.' : 'Join the pool to fill out your prediction.'}</div>
                  <button style={S.primary} disabled={busy} onClick={() => { if (!currentUserId) { flash('Please log in to join this pool'); return; } run(() => joinBracketPool(poolId, currentUserId, currentUserName || 'Anonymous'), 'Joined — make your picks'); }}><Users size={14} /> Join pool</button>
                </div>
              : <div style={S.note}>This pool is no longer accepting entries.</div>
          ) : (
            <>
              {canPredict && predState && !isEntryComplete(predState) && <div style={S.note}>Pick a winner in every matchup, then submit.{submitted ? ' Re-submitting replaces your entry.' : ''}</div>}
              {canPredict && pool.enableSleepers && <div style={S.actionBar}>{[1, 2].map((n) => pool.bracketMatchups.rounds.length > n + 1 && <label key={n}>Sleeper {n} ({pool[`sleeper${n}Points`] || 0} bonus pts)<select aria-label={`Sleeper ${n}`} value={loserOptions[n - 1].includes(sleepers[`sleeper${n}`]) ? sleepers[`sleeper${n}`] : ''} onChange={e => setSleepers(old => ({ ...old, [`sleeper${n}`]: e.target.value || null }))}><option value="">No sleeper</option>{loserOptions[n - 1].map(pid => <option key={pid} value={pid}>{nameMap[pid] || pid}</option>)}</select></label>)}</div>}
              {canPredict && <div style={S.actionBar}><button style={{ ...S.primary, ...(predState && isEntryComplete(predState) ? {} : S.primaryOff) }} disabled={busy || !(predState && isEntryComplete(predState))} onClick={submitPredictions}><Send size={14} /> {submitted ? 'Update prediction' : 'Submit prediction'}</button></div>}
              {!canPredict && submitted && <div style={S.note}>Your prediction is in.{status === 'open' ? '' : ' Predictions are locked.'}</div>}
              {predState && <Board state={predState} nameMap={nameMap} editable={canPredict} onPick={pickPred} official={status === 'open' ? null : officialWinners} scores={scoresByBox} />}
            </>
          )
        )}
        {tab === 'results' && (
          <>
            {canRecord && <div style={S.note}>Tap a player to record the official winner. Scores update automatically.</div>}
            {!canRecord && status !== 'in_progress' && status !== 'completed' && <div style={S.note}>Official results appear once the host starts the pool.</div>}
            {resState && <Board state={resState} nameMap={nameMap} editable={canRecord && !busy} onPick={pickResult} sc={scoreUI} scores={scoresByBox} pickedState={submitted ? predState : null} />}
          </>
        )}
        {tab === 'leaderboard' && (
          <div style={S.lb}>
            <div style={S.legend}>{roundPoints.map((pt, i) => <span key={i} style={S.chip}>{i === roundPoints.length - 1 && roundPoints.length > 1 ? 'Final' : `Round ${i + 1}`} · <b style={{ fontWeight: 600 }}>{pt}</b></span>)}</div>
            {leaderboard.length === 0 ? <div style={S.note}>No predictions submitted yet.</div> : leaderboard.map((e, i) => {
              const me = currentUserId && e.userId === currentUserId;
              const champ = e.champion != null ? (nameMap[e.champion] || null) : null;
              const est = analysis?.byUserId?.[e.userId]?.status;
              return (
                <div key={e.userId || i} role={e.predictions ? 'button' : undefined} tabIndex={e.predictions ? 0 : undefined} onKeyDown={event => { if (e.predictions && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setViewingEntry(e); } }} onClick={() => e.predictions && setViewingEntry(e)} title={e.predictions ? 'View this bracket' : undefined} style={{ ...S.row, ...(me ? S.rowMe : {}), cursor: e.predictions ? 'pointer' : 'default' }}>
                  <div style={{ ...S.rank, ...(i === 0 ? S.rankTop : {}) }}>{i + 1}</div>
                  <span style={{ ...S.lbName, ...(me ? { color: 'var(--teal)' } : {}), ...(est === 'eliminated' ? { opacity: 0.5 } : {}) }}>{e.userDisplayName || e.displayName || 'Anonymous'}{me ? ' (you)' : ''}</span>
                  {est && <StatusBadge status={est} />}
                  {champ && <span style={S.lbChamp} title={`Champion pick: ${champ}`}><Trophy size={12} /> {champ}</span>}
                  <span style={S.correct}>{e.predictionsHidden ? 'Picks private' : e.dataError ? 'Picks unavailable' : `${e.correct} correct`}</span>
                  <span style={S.pts}>{e.total} pts</span>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
      {entriesError && <p role="alert">{entriesError} <button onClick={() => entryWatch.current?.refresh()}>Retry participants</button></p>}
      {entries.predictionsHidden && <p style={S.note}>Other participants’ picks stay private until predictions close. Invite codes are visible only to the host.</p>}
      {entries.nextCursor && <p style={S.note}>Showing a partial leaderboard. Winning-path analysis is available after all participants load. <button onClick={() => entryWatch.current?.loadMore()}>Load more participants</button></p>}
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
.cbpd .cb-score{width:30px;flex:none;margin-left:4px;text-align:center;font-size:12px;font-weight:600;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:3px 2px;font-family:inherit;-moz-appearance:textfield}
.cbpd .cb-score::-webkit-outer-spin-button,.cbpd .cb-score::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.cbpd .cb-score:focus{outline:none;border-color:var(--teal)}
.cbpd .cb-score::placeholder{color:var(--muted)}
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
  slotWrong: { background: 'rgba(255,99,99,.13)', border: '1px solid rgba(255,99,99,.5)', color: '#ff8a8a', fontWeight: 600 },
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
  codeWrap: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 },
  codeVal: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 1.5, color: 'var(--text)', textTransform: 'none' },
  linkBtn: { fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 },
  danger: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#ff8a8a', background: 'transparent', border: '1px solid rgba(255,99,99,.4)', borderRadius: 9, padding: '8px 12px', cursor: 'pointer' },
  descWrap: { padding: '10px 18px', borderBottom: '1px solid var(--line)', background: '#101319' },
  descRow: { display: 'flex', alignItems: 'center', gap: 12 },
  descText: { flex: 1, fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', minWidth: 0 },
  descEmpty: { color: 'var(--muted)', fontStyle: 'italic' },
  editBtn: { fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', flexShrink: 0 },
  descEdit: { display: 'flex', flexDirection: 'column', gap: 8 },
  descArea: { width: '100%', resize: 'vertical', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5 },
  descActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  viewBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--line)', background: 'rgba(43,212,192,.05)', position: 'sticky', top: 0, zIndex: 5 },
  backMini: { fontSize: 13, fontWeight: 600, color: 'var(--teal)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', flexShrink: 0 },
  viewName: { flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  viewScore: { fontSize: 14, fontWeight: 600, color: 'var(--teal)', flexShrink: 0 },
  lbChamp: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--orange)', flexShrink: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  scoreText: { marginLeft: 4, fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 18, textAlign: 'right', flex: 'none' },
  slotCol: { display: 'flex', flexDirection: 'column', gap: 1 },
  youPicked: { fontSize: 10.5, lineHeight: 1.25, color: 'var(--muted)', padding: '0 10px 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  youPickedName: { color: '#ff8a8a', fontWeight: 600 },
  cardHl: { boxShadow: '0 0 0 2px var(--teal), 0 6px 18px rgba(43,212,192,.25)' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, padding: '2px 7px', borderRadius: 999, flexShrink: 0 },
  badgeClinch: { background: 'rgba(43,212,192,.16)', color: 'var(--teal)', border: '1px solid rgba(43,212,192,.4)' },
  badgeAlive: { background: 'rgba(245,158,66,.14)', color: 'var(--orange)', border: '1px solid rgba(245,158,66,.35)' },
  badgeOut: { background: 'rgba(255,99,99,.12)', color: '#ff8a8a', border: '1px solid rgba(255,99,99,.35)' },
  pathPanel: { padding: '12px 18px', borderBottom: '1px solid var(--line)', background: '#101319', display: 'flex', flexDirection: 'column', gap: 10 },
  pathLine: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text)', fontWeight: 500 },
  pathHead: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--muted)' },
  pathBlock: { display: 'flex', flexDirection: 'column', gap: 5 },
  pathSub: { fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: .4 },
  pathItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' },
  pathBox: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: 1, color: 'var(--muted)', minWidth: 30 },
};
