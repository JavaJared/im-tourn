/**
 * customBracketService.js
 *
 * The ONLY module that imports Firebase for custom brackets. It translates
 * between the engine `state` (from customBracket.js) and the Firestore
 * document (via customBracketCodec.js). The engine and codec stay
 * Firebase-free and independently testable.
 *
 * Import paths below assume:
 *   ./firebase            -> exports the initialized Firestore `db`
 *   ./customBracket       -> the pure engine
 *   ./customBracketCodec  -> the pure codec
 * Adjust to match your project layout.
 *
 * --- React integration contract -------------------------------------------
 * Local engine `state` is the source of truth while a host is editing.
 *
 *   Structural click (addBefore/addBeside/removeMatch/setSlotBye/clearSlot):
 *       next = addBefore(state, id); setState(next);
 *       await persistStructure(bracketId, next);
 *
 *   Name typing (the rapid-edit case): apply optimistically to local state on
 *   every keystroke, accumulate the pending values in a ref, and flush ONCE on
 *   idle/blur by calling persistStructure with the latest state. The flush
 *   reads the ref, never a stale closure.
 *
 *   Result / score during live play:
 *       const prev = state; const next = setResult(state, id, w);
 *       setState(next);
 *       await persistLiveDiff(bracketId, prev, next);   // field-path write
 *
 * subscribeToBracket skips snapshots with pending local writes, so the
 * listener never clobbers in-flight typing or causes echo flicker.
 * -------------------------------------------------------------------------- */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import { serialize, deserialize } from './customBracketCodec';
import { validateForPublish } from './customBracket';

const COLLECTION = 'customBrackets';
const ref = (id) => doc(db, COLLECTION, id);

const emptyDoc = () => ({
  version: 1,
  matches: {},
  results: {},
  scores: {},
  participants: {},
  rootMatchId: null,
  participantCount: 0,
});

/** Create a new draft bracket. Returns the new bracket id. */
export async function createCustomBracket({ hostId, title = 'Untitled bracket', initialState = null }) {
  if (!hostId) throw new Error('hostId is required');
  const base = initialState ? serialize(initialState) : emptyDoc();
  const newRef = doc(collection(db, COLLECTION));
  await setDoc(newRef, {
    ...base,
    title,
    hostId,
    status: 'draft',
    scoring: { byTier: {} },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newRef.id;
}

/**
 * Subscribe to a bracket. `onChange(state | null, meta)` fires on every
 * server-confirmed change. Snapshots reflecting our own un-acked writes are
 * skipped so local edits aren't echoed back. Returns the unsubscribe fn.
 */
export function subscribeToBracket(bracketId, onChange, onError) {
  return onSnapshot(
    ref(bracketId),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) {
        onChange(null, { exists: false });
        return;
      }
      if (snap.metadata.hasPendingWrites) return; // our own optimistic write
      const data = snap.data();
      onChange(deserialize(data), {
        exists: true,
        fromCache: snap.metadata.fromCache,
        raw: data,
      });
    },
    onError,
  );
}

/** One-shot read. */
export async function getBracketOnce(bracketId) {
  const snap = await getDoc(ref(bracketId));
  return snap.exists() ? deserialize(snap.data()) : null;
}

/**
 * Full structure write — for discrete structural edits and the name-typing
 * flush. Rewrites the structure plus the denormalized fields, and re-writes
 * results/scores so any cascade-cleared results are persisted too. Only valid
 * while the bracket is still `draft` (the security rules freeze structure once
 * it is published).
 */
export async function persistStructure(bracketId, state) {
  const s = serialize(state);
  await updateDoc(ref(bracketId), {
    matches: s.matches,
    results: s.results,
    scores: s.scores,
    participants: s.participants,
    rootMatchId: s.rootMatchId,
    participantCount: s.participantCount,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Minimal field-path write — for results/scores during live play. Diffs the
 * previous and next engine states and writes only the changed result/score
 * fields (cascade-cleared downstream results show up here as deletes). Touches
 * only `results`/`scores`/`updatedAt`, so it passes the published/locked freeze
 * rule. Returns true if anything was written.
 */
export async function persistLiveDiff(bracketId, prevState, nextState) {
  const updates = {};
  const ids = new Set([
    ...Object.keys(prevState.matches),
    ...Object.keys(nextState.matches),
  ]);

  for (const id of ids) {
    const pr = prevState.matches[id]?.result?.winnerId ?? null;
    const nr = nextState.matches[id]?.result?.winnerId ?? null;
    if (pr !== nr) {
      updates[`results.${id}`] = nr === null ? deleteField() : nr;
    }

    const ps = prevState.matches[id]?.score ?? null;
    const ns = nextState.matches[id]?.score ?? null;
    if (JSON.stringify(ps) !== JSON.stringify(ns)) {
      updates[`scores.${id}`] = ns === null ? deleteField() : { a: ns.a, b: ns.b };
    }
  }

  if (Object.keys(updates).length === 0) return false;
  updates.updatedAt = serverTimestamp();
  await updateDoc(ref(bracketId), updates);
  return true;
}

/**
 * Validate and publish in a single write while the doc is still `draft`
 * (so the structure write and the status flip both pass the rules). Throws an
 * Error with `.errors` if the bracket isn't publishable.
 */
export async function publishBracket(bracketId, state) {
  const { valid, errors } = validateForPublish(state);
  if (!valid) {
    const err = new Error('Bracket is not ready to publish');
    err.errors = errors;
    throw err;
  }
  const s = serialize(state);
  await updateDoc(ref(bracketId), {
    matches: s.matches,
    results: s.results,
    scores: s.scores,
    participants: s.participants,
    rootMatchId: s.rootMatchId,
    participantCount: s.participantCount,
    status: 'published',
    updatedAt: serverTimestamp(),
  });
}

export async function setBracketStatus(bracketId, status) {
  await updateDoc(ref(bracketId), { status, updatedAt: serverTimestamp() });
}
export const lockBracket = (id) => setBracketStatus(id, 'locked');
export const completeBracket = (id) => setBracketStatus(id, 'complete');

export async function deleteBracket(bracketId) {
  await deleteDoc(ref(bracketId));
}
