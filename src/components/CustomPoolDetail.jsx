import Board from './pools/PoolBoard';
import Shell from './pools/PoolShell';
import { S } from './pools/poolStyles';
import { predictionsOpen } from '../lib/poolLifecycle';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Clock, Loader2, AlertTriangle, Trophy, Lock, Users, RotateCcw, Send, X, Trash2 } from './customBracketIcons';
import { SLOT, locate, slotDisplay, feederId, resolveParticipant, matchWinner, setResult, getChampion } from '../lib/customBracket';
import { hydrateState, picksFromState, isEntryComplete, buildLeaderboard, defaultRoundPoints, predictedLosers } from '../lib/customScoring';
import { usePoolAnalysis } from '../lib/usePoolAnalysis';
import { summarizeWinningScenarios, shouldShowWinningPaths } from '../lib/customElimination';
import { joinBracketPool, submitPoolPredictions, lockPool, completePool, updatePoolDescription, deletePool, getPoolById } from '../services/bracketService';
import { startCustomPool, recordCustomPoolWinner, updateCustomPoolScores, recalculateCustomPoolScoresManual, subscribeToPool, subscribeToPoolEntries } from '../services/customBracketService';

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
  const analysisInput = useMemo(() => {
    if (entries.nextCursor || entries.some(e => e.dataError) || !pool?.bracketMatchups || (status !== 'in_progress' && status !== 'completed')) return null;
    return { structure: pool.bracketMatchups, results: pool.customResults || {}, entries, roundPoints, pool };
  }, [pool, entries, roundPoints, status]);
  const { analysis, error: analysisError, loading: analysisLoading } = usePoolAnalysis(analysisInput);
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
    if (!(key in pendingScoreWrites.current)) {
      setScoreDrafts((prev) => {
        if (prev[key] !== raw) return prev; // A newer edit must survive an older save.
        const next = { ...prev }; delete next[key]; return next;
      });
    }
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
      {analysisLoading && <p role="status">Calculating winning paths…</p>}
        {analysisError && <p role="status">{analysisError}</p>}
        {entries.predictionsHidden && <p style={S.note}>Other participants’ picks stay private until predictions close. Invite codes are visible only to the host.</p>}
      {entries.nextCursor && <p style={S.note}>Showing a partial leaderboard. Winning-path analysis is available after all participants load. <button onClick={() => entryWatch.current?.loadMore()}>Load more participants</button></p>}
      {toast && <div style={S.toast}>{toast}</div>}
    </Shell>
  );
}
