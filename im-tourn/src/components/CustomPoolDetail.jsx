import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, Clock, Loader2, AlertTriangle, Trophy, Lock, Users, RotateCcw, Send, X, Trash2 } from './customBracketIcons';
import { locate, matchWinner, setResult, getChampion } from '../lib/customBracket';
import BracketBoard from './BracketBoard';
import { hydrateState, picksFromState, isEntryComplete, buildLeaderboard, defaultRoundPoints, predictedLosers } from '../lib/customScoring';
import { analyzeCustomPool, summarizeWinningScenarios, shouldShowWinningPaths } from '../lib/customElimination';
import { joinBracketPool, submitPoolPredictions, lockPool, completePool, updatePoolDescription, deletePool, getPoolById } from '../services/bracketService';
import { startCustomPool, updateCustomPoolResults, updateCustomPoolScores, recalculateCustomPoolScoresManual, subscribeToPool, subscribeToPoolEntries } from '../services/customBracketService';


function StatusBadge({ status }) {
  if (!status) return null;
  if (status === 'clinched') return <span style={{ ...S.badge, ...S.badgeClinch }}><Trophy size={10} /> Clinched</span>;
  if (status === 'eliminated') return <span style={{ ...S.badge, ...S.badgeOut }}>Out</span>;
  return <span style={{ ...S.badge, ...S.badgeAlive }}>Alive</span>;
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
  const seedMap = pool?.bracketMatchups?.seedMap || null;
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

  // ---- Sleeper picks (participant ids) ----
  const sleepersOn = !!pool?.enableSleepers;
  const roundCountForSleepers = pool?.bracketMatchups?.roundCount || 0;
  const [sleeper1, setSleeper1] = useState(null);
  const [sleeper2, setSleeper2] = useState(null);
  useEffect(() => { setSleeper1(myEntry?.sleeper1 || null); setSleeper2(myEntry?.sleeper2 || null); }, [submittedKey]);
  // Eligible options derive live from the entrant's current picks; a sleeper
  // must be someone THEY predicted to lose in that round. (Sleeper 1 needs a
  // round 3 to reach, sleeper 2 a round 4 — smaller brackets can't have them.)
  const sleeper1Options = useMemo(() => (
    sleepersOn && predState && roundCountForSleepers >= 3 ? predictedLosers(pool.bracketMatchups, picksFromState(predState), 0) : []
  ), [sleepersOn, predState, pool, roundCountForSleepers]);
  const sleeper2Options = useMemo(() => (
    sleepersOn && predState && roundCountForSleepers >= 4 ? predictedLosers(pool.bracketMatchups, picksFromState(predState), 1) : []
  ), [sleepersOn, predState, pool, roundCountForSleepers]);
  // Prune a selection if the entrant changes picks and it's no longer a predicted loser.
  useEffect(() => { if (sleeper1 && sleeper1Options.length && !sleeper1Options.includes(sleeper1)) setSleeper1(null); }, [sleeper1, sleeper1Options]);
  useEffect(() => { if (sleeper2 && sleeper2Options.length && !sleeper2Options.includes(sleeper2)) setSleeper2(null); }, [sleeper2, sleeper2Options]);

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
    const sleepers = sleepersOn ? { sleeper1, sleeper2 } : null;
    run(() => submitPoolPredictions(poolId, currentUserId, picksFromState(predState), getChampion(predState), sleepers), 'Predictions submitted');
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
    return buildLeaderboard(official, scored, roundPoints, pool);
  }, [pool, entries, roundPoints]);

  // Official winner per box (pid), for grading any prediction board correct/incorrect.
  const officialWinners = useMemo(() => {
    if (!pool?.bracketMatchups) return {};
    const st = hydrateState(pool.bracketMatchups, pool.customResults || {});
    const loc = locate(st); const m = {};
    for (const id of Object.keys(st.boxes)) { const w = matchWinner(st, loc, id); if (w != null) m[id] = w; }
    return m;
  }, [pool]);

  // The bracket of whichever participant is being viewed from the leaderboard.
  const viewingState = useMemo(
    () => (viewingEntry && pool?.bracketMatchups && viewingEntry.predictions) ? hydrateState(pool.bracketMatchups, viewingEntry.predictions) : null,
    [viewingEntry, pool]
  );

  // Elimination analysis (alive / clinched / eliminated) once results are live.
  const analysis = useMemo(() => {
    if (!pool?.bracketMatchups || (status !== 'in_progress' && status !== 'completed')) return null;
    return analyzeCustomPool(pool.bracketMatchups, pool.customResults || {}, entries, roundPoints);
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

  const copyLink = () => {
    try { navigator.clipboard.writeText(`${window.location.origin}?pool=${pool.joinCode}`); flash('Invite link copied'); }
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
    const pending = pendingScoreWrites.current;
    if (Object.keys(pending).length === 0) return;
    pendingScoreWrites.current = {};                 // start a fresh batch before async work
    try {
      const fresh = await getPoolById(poolId);
      const scores = JSON.parse(JSON.stringify(fresh?.customScores || {}));
      for (const key of Object.keys(pending)) {
        const i = key.lastIndexOf(':'); if (i < 0) continue;
        const boxId = key.slice(0, i), side = key.slice(i + 1);
        if (!scores[boxId]) scores[boxId] = {};
        scores[boxId][side] = pending[key];
        if (scores[boxId].a == null && scores[boxId].b == null) delete scores[boxId];
      }
      await updateCustomPoolScores(poolId, currentUserId, scores);
    } catch (e) {
      // Re-queue on failure so edits aren't silently dropped.
      for (const key of Object.keys(pending)) if (!(key in pendingScoreWrites.current)) pendingScoreWrites.current[key] = pending[key];
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
  // Score panel: editable for the recording host, read-only for everyone once any score exists.
  const hasScores = !!(pool?.customScores && Object.keys(pool.customScores).length);
  const scoreUI = canRecord
    ? { editable: true, get: getScoreInputValue, change: handleScoreChange, blur: handleScoreBlur }
    : (hasScores ? { editable: false, get: getScoreInputValue } : null);

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
          {pool.joinCode && <div style={S.codeWrap}><span>Code</span><span style={S.codeVal}>{pool.joinCode}</span><button style={S.linkBtn} onClick={copyLink}>Copy link</button></div>}
          {isHost && status === 'open' && <button style={S.primary} disabled={busy} onClick={() => run(() => lockPool(poolId, currentUserId), 'Predictions locked')}><Lock size={14} /> Lock predictions</button>}
          {isHost && status === 'locked' && <button style={S.primary} disabled={busy} onClick={() => run(() => startCustomPool(poolId, currentUserId), 'Pool started')}><Trophy size={14} /> Start &amp; record results</button>}
          {isHost && status === 'in_progress' && <>
            <button style={S.ghost} disabled={busy} onClick={() => run(() => recalculateCustomPoolScoresManual(poolId, currentUserId), 'Scores recalculated')}><RotateCcw size={14} /> Recalc</button>
            <button style={S.primary} disabled={busy} onClick={() => run(() => completePool(poolId, currentUserId), 'Pool completed')}><Check size={14} strokeWidth={3} /> Complete</button>
          </>}
          {isHost && <button style={S.danger} disabled={busy} onClick={removePool}><Trash2 size={14} /> Delete</button>}
        </div>
      </header>

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
              ? <BracketBoard state={viewingState} nameMap={nameMap} seedMap={seedMap} editable={false} onPick={() => {}} official={officialWinners} highlight={highlightBoxes} />
              : <div style={S.note}>This participant hasn’t submitted a bracket yet.</div>}
          </>
        ) : (
          <>
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
              {canPredict && predState && !isEntryComplete(predState) && <div style={S.note}>Pick a winner in every matchup, then submit.{submitted ? ' Re-submitting replaces your entry.' : ''}</div>}
              {canPredict && sleepersOn && roundCountForSleepers >= 3 && (
                <div style={S.sleeperPanel}>
                  <div style={S.sleeperTitle}>Sleeper picks <span style={S.sleeperHint}>bonus points for predicted losers that go far anyway</span></div>
                  <div style={S.sleeperRow}>
                    <label style={S.sleeperLabel}>
                      Round-1 loser makes round 3 <b style={{ fontWeight: 600 }}>(+{pool.sleeper1Points || 0})</b>
                      <select style={S.sleeperSelect} value={sleeper1 || ''} onChange={(e) => setSleeper1(e.target.value || null)} disabled={!sleeper1Options.length}>
                        <option value="">{sleeper1Options.length ? '— optional —' : 'Pick round 1 first'}</option>
                        {sleeper1Options.map((pid) => <option key={pid} value={pid}>{nameMap[pid] || pid}</option>)}
                      </select>
                    </label>
                    {roundCountForSleepers >= 4 && (
                      <label style={S.sleeperLabel}>
                        Round-2 loser makes round 4 <b style={{ fontWeight: 600 }}>(+{pool.sleeper2Points || 0})</b>
                        <select style={S.sleeperSelect} value={sleeper2 || ''} onChange={(e) => setSleeper2(e.target.value || null)} disabled={!sleeper2Options.length}>
                          <option value="">{sleeper2Options.length ? '— optional —' : 'Pick round 2 first'}</option>
                          {sleeper2Options.map((pid) => <option key={pid} value={pid}>{nameMap[pid] || pid}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              )}
              {canPredict && <div style={S.actionBar}><button style={{ ...S.primary, ...(predState && isEntryComplete(predState) ? {} : S.primaryOff) }} disabled={busy || !(predState && isEntryComplete(predState))} onClick={submitPredictions}><Send size={14} /> {submitted ? 'Update prediction' : 'Submit prediction'}</button></div>}
              {!canPredict && submitted && <div style={S.note}>Your prediction is in.{status === 'open' ? '' : ' Predictions are locked.'}</div>}
              {predState && <BracketBoard state={predState} nameMap={nameMap} seedMap={seedMap} editable={canPredict} onPick={pickPred} official={status === 'open' ? null : officialWinners} />}
            </>
          )
        )}
        {tab === 'results' && (
          <>
            {canRecord && <div style={S.note}>Tap a player to record the official winner. Scores update automatically.</div>}
            {!canRecord && status !== 'in_progress' && status !== 'completed' && <div style={S.note}>Official results appear once the host starts the pool.</div>}
            {resState && <BracketBoard state={resState} nameMap={nameMap} seedMap={seedMap} editable={canRecord} onPick={pickResult} sc={scoreUI} />}
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
                <div key={e.userId || i} onClick={() => e.predictions && setViewingEntry(e)} title={e.predictions ? 'View this bracket' : undefined} style={{ ...S.row, ...(me ? S.rowMe : {}), cursor: e.predictions ? 'pointer' : 'default' }}>
                  <div style={{ ...S.rank, ...(i === 0 ? S.rankTop : {}) }}>{i + 1}</div>
                  <span style={{ ...S.lbName, ...(me ? { color: 'var(--teal)' } : {}), ...(est === 'eliminated' ? { opacity: 0.5 } : {}) }}>{e.userDisplayName || e.displayName || 'Anonymous'}{me ? ' (you)' : ''}</span>
                  {est && <StatusBadge status={est} />}
                  {champ && <span style={S.lbChamp} title={`Champion pick: ${champ}`}><Trophy size={12} /> {champ}</span>}
                  {pool.enableSleepers && (e.sleeper1 || e.sleeper2) && (
                    <span style={S.lbSleepers}>
                      {e.sleeper1 && <span style={{ ...S.sleeperChip, ...(e.sleeper1Hit ? S.sleeperChipHit : {}) }} title={`Sleeper 1: ${nameMap[e.sleeper1] || e.sleeper1}${e.sleeper1Hit ? ` (+${pool.sleeper1Points || 0})` : ''}`}>S1 {e.sleeper1Hit ? '✓' : '·'}</span>}
                      {e.sleeper2 && <span style={{ ...S.sleeperChip, ...(e.sleeper2Hit ? S.sleeperChipHit : {}) }} title={`Sleeper 2: ${nameMap[e.sleeper2] || e.sleeper2}${e.sleeper2Hit ? ` (+${pool.sleeper2Points || 0})` : ''}`}>S2 {e.sleeper2Hit ? '✓' : '·'}</span>}
                    </span>
                  )}
                  <span style={S.correct}>{e.correct} correct</span>
                  <span style={S.pts}>{e.total} pts</span>
                </div>
              );
            })}
          </div>
        )}
          </>
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
  sleeperPanel: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', margin: '10px 0' },
  sleeperTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1, color: 'var(--text)', marginBottom: 8 },
  sleeperHint: { fontFamily: "'Outfit',sans-serif", fontSize: 12, letterSpacing: 0, color: 'var(--muted)', marginLeft: 8, textTransform: 'none' },
  sleeperRow: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  sleeperLabel: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: 'var(--muted)', minWidth: 220 },
  sleeperSelect: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  lbSleepers: { display: 'inline-flex', gap: 5, marginLeft: 8 },
  sleeperChip: { fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--line)', color: 'var(--muted)' },
  sleeperChipHit: { background: 'rgba(43,212,192,.14)', border: '1px solid rgba(43,212,192,.45)', color: 'var(--teal)' },
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
