/**
 * customBracketService.js — the only module that imports Firebase for custom
 * brackets. Translates between engine state (customBracket.js) and the
 * Firestore document (customBracketCodec.js).
 *
 * Import paths assume ./firebase, ./customBracket, ./customBracketCodec as
 * siblings; adjust to your layout.
 *
 * React integration: local engine state is the source of truth while editing.
 *   Structural click / name-flush  -> persistStructure(bracketId, next)
 *   Result / score during play     -> persistLiveDiff(bracketId, prev, next)
 * subscribeToBracket skips snapshots with pending local writes, so live edits
 * are never echoed back over the author's input.
 */
import { collection, doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, onSnapshot, serverTimestamp, deleteField, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { serialize, deserialize } from '../lib/customBracketCodec';
import { validateForPublish } from '../lib/customBracket';

const COLLECTION = 'customBrackets';
const ref = (id) => doc(db, COLLECTION, id);
const emptyDoc = () => ({ version: 2, rounds: [], boxes: {}, results: {}, scores: {}, participants: {}, participantCount: 0, roundCount: 0 });

export async function createCustomBracket({ hostId, title = 'Untitled bracket', hostName = null, description = '', category = null, initialState = null }) {
  if (!hostId) throw new Error('hostId is required');
  const base = initialState ? serialize(initialState) : emptyDoc();
  const newRef = doc(collection(db, COLLECTION));
  await setDoc(newRef, {
    ...base, title, hostId, hostName, description, category,
    status: 'draft', type: 'custom', scoring: { byTier: {} },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return newRef.id;
}

const tsToDate = (ts) => (ts && ts.toDate ? ts.toDate() : (ts && ts.seconds != null ? new Date(ts.seconds * 1000) : null));

/** Map a raw custom-bracket doc into the shape the bracket cards expect. */
export function customCardView(d) {
  const created = tsToDate(d.createdAt);
  return {
    id: d.id,
    title: d.title || 'Untitled bracket',
    category: d.category || 'Custom',
    description: d.description || '',
    size: d.participantCount || 0,
    roundCount: d.roundCount || 0,
    status: d.status || 'draft',
    userDisplayName: d.hostName || 'Anonymous',
    createdAt: created ? created.toLocaleDateString() : '',
    createdAtMs: created ? created.getTime() : 0,
    isCustom: true,
  };
}

const byNewest = (a, b) => b.createdAtMs - a.createdAtMs;

/** A host's own custom brackets (all statuses) for the "my brackets" list. */
export async function getUserCustomBrackets(hostId) {
  const snap = await getDocs(query(collection(db, COLLECTION), where('hostId', '==', hostId)));
  return snap.docs.map((d) => customCardView({ id: d.id, ...d.data() })).sort(byNewest);
}

/** All published-or-later custom brackets for the public browse. */
export async function getPublicCustomBrackets() {
  const snap = await getDocs(query(collection(db, COLLECTION), where('status', 'in', ['published', 'locked', 'complete'])));
  return snap.docs.map((d) => customCardView({ id: d.id, ...d.data() })).sort(byNewest);
}

export function subscribeToBracket(bracketId, onChange, onError) {
  return onSnapshot(ref(bracketId), { includeMetadataChanges: true }, (snap) => {
    if (!snap.exists()) { onChange(null, { exists: false }); return; }
    if (snap.metadata.hasPendingWrites) return;
    onChange(deserialize(snap.data()), { exists: true, fromCache: snap.metadata.fromCache, raw: snap.data() });
  }, onError);
}

export async function getBracketOnce(bracketId) {
  const snap = await getDoc(ref(bracketId));
  return snap.exists() ? deserialize(snap.data()) : null;
}

/** Full structure write — discrete structural edits and the name-typing flush. Draft only. */
export async function persistStructure(bracketId, state) {
  const s = serialize(state);
  await updateDoc(ref(bracketId), {
    rounds: s.rounds, boxes: s.boxes, results: s.results, scores: s.scores,
    participants: s.participants, participantCount: s.participantCount, roundCount: s.roundCount,
    updatedAt: serverTimestamp(),
  });
}

/** Minimal field-path write — results/scores during live play. Passes the freeze rule. */
export async function persistLiveDiff(bracketId, prevState, nextState) {
  const updates = {};
  const ids = new Set([...Object.keys(prevState.boxes), ...Object.keys(nextState.boxes)]);
  for (const id of ids) {
    const pr = prevState.boxes[id]?.result?.winnerId ?? null;
    const nr = nextState.boxes[id]?.result?.winnerId ?? null;
    if (pr !== nr) updates[`results.${id}`] = nr === null ? deleteField() : nr;
    const ps = prevState.boxes[id]?.score ?? null;
    const ns = nextState.boxes[id]?.score ?? null;
    if (JSON.stringify(ps) !== JSON.stringify(ns)) updates[`scores.${id}`] = ns === null ? deleteField() : { a: ns.a, b: ns.b };
  }
  if (Object.keys(updates).length === 0) return false;
  updates.updatedAt = serverTimestamp();
  await updateDoc(ref(bracketId), updates);
  return true;
}

export async function publishBracket(bracketId, state) {
  const { valid, errors } = validateForPublish(state);
  if (!valid) { const err = new Error('Bracket is not ready to publish'); err.errors = errors; throw err; }
  const s = serialize(state);
  await updateDoc(ref(bracketId), {
    rounds: s.rounds, boxes: s.boxes,
    participants: s.participants, participantCount: s.participantCount, roundCount: s.roundCount,
    status: 'published', updatedAt: serverTimestamp(),
  });
}

export async function setBracketStatus(bracketId, status) { await updateDoc(ref(bracketId), { status, updatedAt: serverTimestamp() }); }
export const lockBracket = (id) => setBracketStatus(id, 'locked');
export const completeBracket = (id) => setBracketStatus(id, 'complete');
export async function deleteBracket(bracketId) { await deleteDoc(ref(bracketId)); }

/** Reopen a completed bracket for result corrections (complete -> locked). */
export const reopenBracket = (id) => setBracketStatus(id, 'locked');



/* ---------------- fill-for-fun submissions ---------------- */
const fillsCol = (bracketId) => collection(db, COLLECTION, bracketId, 'submissions');

/** Save a filled-out bracket (anyone signed in can fill a published bracket for fun). */
export async function submitCustomFill(bracketId, { userId, displayName, picks, champion }) {
  if (!userId) throw new Error('Sign in to save your bracket');
  const newRef = doc(fillsCol(bracketId));
  await setDoc(newRef, {
    userId, displayName: displayName || 'Anonymous',
    picks: picks || {}, champion: champion || null,
    createdAt: serverTimestamp(),
  });
  return newRef.id;
}

/** All fill-out submissions for a bracket (for the host's submissions view). */
export async function getCustomFills(bracketId) {
  const snap = await getDocs(fillsCol(bracketId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------- custom-bracket pools ---------------- */
// Custom brackets can back a bracket pool. The generic pool functions in
// bracketService (createBracketPool, getPoolById, joinBracketPool,
// submitPoolPredictions, lockPool, completePool, getPoolEntries) are reused
// as-is. Only the seed-specific steps need custom equivalents: initializing
// results, recording the host's official picks, and round-weighted scoring.
import { getPoolById, getPoolEntries } from './bracketService';
import { hydrateState, scoreEntry } from '../lib/customScoring';

const POOLS = 'bracketPools';
const POOL_ENTRIES = 'poolEntries';

/** Snapshot a published custom bracket's structure for storage on a pool. */
export async function getCustomStructureForPool(bracketId) {
  const state = await getBracketOnce(bracketId);
  if (!state) throw new Error('Bracket not found');
  const boxes = {};
  const nameMap = {};
  for (const id of Object.keys(state.boxes)) {
    const b = state.boxes[id];
    boxes[id] = { slotA: b.slotA, slotB: b.slotB };
    for (const k of ['slotA', 'slotB']) { const s = b[k]; if (s.type === 'named') nameMap[s.participantId] = s.name; }
  }
  return { rounds: state.rounds.map((r) => [...r]), boxes, nameMap, roundCount: state.rounds.length };
}

/** Start a custom pool (host begins recording results). */
export async function startCustomPool(poolId, hostId) {
  const pool = await getPoolById(poolId);
  if (!pool) throw new Error('Pool not found');
  if (pool.hostId !== hostId) throw new Error('Only the host can start this pool');
  await updateDoc(doc(db, POOLS, poolId), { status: 'in_progress', customResults: {}, updatedAt: serverTimestamp() });
  return true;
}

async function recalcCustom(poolId, pool, resultsMap) {
  const state = hydrateState(pool.bracketMatchups, resultsMap || {});
  const roundPoints = pool.roundPoints || [];
  const entries = await getPoolEntries(poolId);
  await Promise.all(entries.map(async (entry) => {
    if (!entry.predictions) return;
    const { total } = scoreEntry(state, entry.predictions, roundPoints);
    await updateDoc(doc(db, POOL_ENTRIES, `${poolId}_${entry.userId}`), { score: total });
  }));
}

/** Record the host's official results map { boxId: winnerPid } and rescore. */
export async function updateCustomPoolResults(poolId, hostId, resultsMap) {
  const pool = await getPoolById(poolId);
  if (!pool) throw new Error('Pool not found');
  if (pool.hostId !== hostId) throw new Error('Only the host can update results');
  await updateDoc(doc(db, POOLS, poolId), { customResults: resultsMap || {}, updatedAt: serverTimestamp() });
  await recalcCustom(poolId, pool, resultsMap || {});
  return true;
}

/** Re-run scoring for every entry against the stored results. */
export async function recalculateCustomPoolScoresManual(poolId, hostId) {
  const pool = await getPoolById(poolId);
  if (!pool) throw new Error('Pool not found');
  if (pool.hostId !== hostId) throw new Error('Only the host can recalculate scores');
  await recalcCustom(poolId, pool, pool.customResults || {});
  return true;
}

/**
 * Record per-matchup scores. `scoresMap` is { boxId: { a: number|null, b: number|null } }.
 * Scores are display-only (they never affect points), so this does not rescore.
 */
export async function updateCustomPoolScores(poolId, hostId, scoresMap) {
  const pool = await getPoolById(poolId);
  if (!pool) throw new Error('Pool not found');
  if (pool.hostId !== hostId) throw new Error('Only the host can record scores');
  await updateDoc(doc(db, POOLS, poolId), { customScores: scoresMap || {}, updatedAt: serverTimestamp() });
  return true;
}

/* ---- real-time pool subscriptions (custom pools) ---- */
function parsePoolDoc(id, data) {
  return {
    id, ...data,
    bracketMatchups: typeof data.bracketMatchups === 'string' ? JSON.parse(data.bracketMatchups) : data.bracketMatchups,
    results: data.results ? (typeof data.results === 'string' ? JSON.parse(data.results) : data.results) : null,
    lockDate: data.lockDate?.toDate?.() || null,
    createdAt: data.createdAt?.toDate?.() || null,
  };
}
function parsePoolEntryDoc(id, data) {
  return {
    id, ...data,
    predictions: data.predictions ? (typeof data.predictions === 'string' ? JSON.parse(data.predictions) : data.predictions) : null,
    joinedAt: data.joinedAt?.toDate?.() || null,
    submittedAt: data.submittedAt?.toDate?.() || null,
  };
}
/** Live updates for a custom pool document. */
export function subscribeToPool(poolId, onChange, onError) {
  return onSnapshot(doc(db, POOLS, poolId), (snap) => {
    onChange(snap.exists() ? parsePoolDoc(snap.id, snap.data()) : null);
  }, onError);
}
/** Live updates for every entry in a pool (predictions + scores). */
export function subscribeToPoolEntries(poolId, onChange, onError) {
  const q = query(collection(db, POOL_ENTRIES), where('poolId', '==', poolId));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => parsePoolEntryDoc(d.id, d.data())).sort((a, b) => (b.score || 0) - (a.score || 0)));
  }, onError);
}
