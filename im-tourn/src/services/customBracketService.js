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
import { collection, doc, setDoc, updateDoc, getDoc, deleteDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import { serialize, deserialize } from './customBracketCodec';
import { validateForPublish } from './customBracket';

const COLLECTION = 'customBrackets';
const ref = (id) => doc(db, COLLECTION, id);
const emptyDoc = () => ({ version: 2, rounds: [], boxes: {}, results: {}, scores: {}, participants: {}, participantCount: 0, roundCount: 0 });

export async function createCustomBracket({ hostId, title = 'Untitled bracket', initialState = null }) {
  if (!hostId) throw new Error('hostId is required');
  const base = initialState ? serialize(initialState) : emptyDoc();
  const newRef = doc(collection(db, COLLECTION));
  await setDoc(newRef, { ...base, title, hostId, status: 'draft', scoring: { byTier: {} }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return newRef.id;
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
    rounds: s.rounds, boxes: s.boxes, results: s.results, scores: s.scores,
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
