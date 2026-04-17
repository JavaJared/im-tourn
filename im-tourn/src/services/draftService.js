// src/services/draftService.js
//
// Service layer for the live Drafts feature.
//
// Key architectural choice: the entire draft state lives in a single Firestore
// document. This means one `onSnapshot` listener per client gives real-time
// updates for picks, timer, participants — everything. The trade-off is that
// every pick writes to the same document, but since only one user can pick at
// a time (it's their turn), write contention shouldn't occur in practice.
//
// Data stored as JSON strings (following the existing bracketService pattern):
//   participants, draftOrder, picks, scores

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  setDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const DRAFTS_COLLECTION = 'drafts';

export const TIMER_OPTIONS = [
  { value: 0, label: 'No limit' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
  { value: 90, label: '90 seconds' },
  { value: 120, label: '2 minutes' },
];

export const MAX_PARTICIPANTS = 16;
export const MAX_ROUNDS = 20;

// ============ HELPERS ============

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Compute the full snake draft order for a given number of participants
 * and rounds. Returns an array of { round, pickInRound, userId } objects,
 * where round and pickInRound are 1-indexed.
 *
 * Snake order: round 1 goes 1→2→3→...→N, round 2 goes N→...→3→2→1, etc.
 *
 * @param {Array<{userId: string}>} participants — must have .order set (0-indexed)
 * @param {number} rounds
 * @returns {Array<{round: number, pickInRound: number, userId: string, userDisplayName: string}>}
 */
export function computeSnakeOrder(participants, rounds) {
  // Sort by the random order assigned at draft start.
  const sorted = [...participants].sort((a, b) => a.order - b.order);
  const order = [];
  for (let round = 1; round <= rounds; round++) {
    const isEvenRound = round % 2 === 0;
    const roundParticipants = isEvenRound ? [...sorted].reverse() : sorted;
    roundParticipants.forEach((p, idx) => {
      order.push({
        round,
        pickInRound: idx + 1,
        userId: p.userId,
        userDisplayName: p.displayName,
      });
    });
  }
  return order;
}

/**
 * Parse JSON fields from a draft document, handling both string and
 * already-parsed cases (Firestore can return either depending on
 * how the data was written).
 */
function parseDraftDoc(data) {
  const parse = (field) => {
    if (!data[field]) return data[field] === undefined ? undefined : null;
    return typeof data[field] === 'string' ? JSON.parse(data[field]) : data[field];
  };
  return {
    ...data,
    participants: parse('participants') || [],
    draftOrder: parse('draftOrder') || [],
    picks: parse('picks') || [],
    scores: parse('scores') || null,
    createdAt: data.createdAt?.toDate?.() || null,
    updatedAt: data.updatedAt?.toDate?.() || null,
    currentPickDeadline: data.currentPickDeadline?.toDate?.() || null,
  };
}

// ============ REAL-TIME SUBSCRIPTION ============

/**
 * Subscribe to real-time updates on a draft document.
 * Returns an unsubscribe function — call it when the component unmounts.
 *
 * @param {string} draftId
 * @param {function} callback - called with the parsed draft object on every update
 * @param {function} onError - called on subscription errors
 * @returns {function} unsubscribe
 */
export function subscribeToDraft(draftId, callback, onError) {
  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  return onSnapshot(
    draftRef,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...parseDraftDoc(snap.data()) });
    },
    (err) => {
      console.error('Draft subscription error:', err);
      if (onError) onError(err);
    }
  );
}

// ============ DRAFT CRUD ============

/**
 * Create a new draft. Starts in 'open' status, accepting participants.
 */
export async function createDraft(draftData) {
  const joinCode = generateJoinCode();
  const docRef = await addDoc(collection(db, DRAFTS_COLLECTION), {
    title: draftData.title,
    description: draftData.description || '',
    category: draftData.category || '',
    hostId: draftData.hostId,
    hostDisplayName: draftData.hostDisplayName || 'Anonymous',
    rounds: draftData.rounds,
    timerSeconds: draftData.timerSeconds || 0, // 0 = no limit
    joinCode,
    status: 'open', // open | drafting | completed
    participants: JSON.stringify([{ userId: draftData.hostId, displayName: draftData.hostDisplayName }]),
    draftOrder: '[]',
    currentPickIndex: 0,
    currentPickDeadline: null,
    picks: '[]',
    scores: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: docRef.id, joinCode };
}

/**
 * Get a draft by ID (one-time read, not real-time).
 */
export async function getDraftById(draftId) {
  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  const snap = await getDoc(draftRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...parseDraftDoc(snap.data()) };
}

/**
 * Get a draft by join code.
 */
export async function getDraftByJoinCode(joinCode) {
  const q = query(
    collection(db, DRAFTS_COLLECTION),
    where('joinCode', '==', joinCode.toUpperCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...parseDraftDoc(d.data()) };
}

/**
 * Get all drafts for the public browse page.
 */
export async function getAllDrafts() {
  const q = query(
    collection(db, DRAFTS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    // Only return metadata for browse — skip heavy JSON fields
    return {
      id: d.id,
      title: data.title,
      description: data.description,
      category: data.category,
      hostId: data.hostId,
      hostDisplayName: data.hostDisplayName,
      rounds: data.rounds,
      timerSeconds: data.timerSeconds,
      status: data.status,
      participantCount: (typeof data.participants === 'string'
        ? JSON.parse(data.participants) : data.participants || []).length,
      createdAt: data.createdAt?.toDate?.() || null,
    };
  });
}

/**
 * Get all drafts a user created or joined.
 */
export async function getUserCreatedDrafts(userId) {
  const q = query(
    collection(db, DRAFTS_COLLECTION),
    where('hostId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title,
      status: data.status,
      rounds: data.rounds,
      participantCount: (typeof data.participants === 'string'
        ? JSON.parse(data.participants) : data.participants || []).length,
      createdAt: data.createdAt?.toDate?.() || null,
    };
  });
}

/**
 * Get all drafts a user joined (by scanning participant arrays).
 * Unfortunately there's no way to query "does a JSON-stringified array
 * contain my userId" in Firestore, so we have to load all drafts and
 * filter client-side. For a small app this is fine; at scale we'd
 * denormalize into a separate collection.
 */
export async function getUserJoinedDrafts(userId) {
  const q = query(
    collection(db, DRAFTS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => {
      const data = d.data();
      const participants = typeof data.participants === 'string'
        ? JSON.parse(data.participants) : data.participants || [];
      const isParticipant = participants.some(p => p.userId === userId);
      if (!isParticipant || data.hostId === userId) return null;
      return {
        id: d.id,
        title: data.title,
        status: data.status,
        rounds: data.rounds,
        participantCount: participants.length,
        createdAt: data.createdAt?.toDate?.() || null,
      };
    })
    .filter(Boolean);
}

// ============ LOBBY OPERATIONS ============

/**
 * Join a draft (add yourself to the participants array).
 */
export async function joinDraft(draftId, userId, displayName) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.status !== 'open') throw new Error('This draft is no longer accepting participants');
  if (draft.participants.some(p => p.userId === userId)) {
    throw new Error('You already joined this draft');
  }
  if (draft.participants.length >= MAX_PARTICIPANTS) {
    throw new Error(`Maximum ${MAX_PARTICIPANTS} participants`);
  }

  const updated = [...draft.participants, { userId, displayName }];
  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  await updateDoc(draftRef, {
    participants: JSON.stringify(updated),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Leave a draft (remove yourself from participants). Only while open.
 */
export async function leaveDraft(draftId, userId) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.status !== 'open') throw new Error('Cannot leave a draft in progress');

  const updated = draft.participants.filter(p => p.userId !== userId);
  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  await updateDoc(draftRef, {
    participants: JSON.stringify(updated),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Kick a participant (host only). Only while open.
 */
export async function kickParticipant(draftId, hostId, targetUserId) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.hostId !== hostId) throw new Error('Only the host can kick participants');
  if (draft.status !== 'open') throw new Error('Cannot kick during a draft');

  const updated = draft.participants.filter(p => p.userId !== targetUserId);
  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  await updateDoc(draftRef, {
    participants: JSON.stringify(updated),
    updatedAt: serverTimestamp(),
  });
}

// ============ DRAFT LIFECYCLE ============

/**
 * Start the draft (host only). Randomizes participant order, computes
 * the full snake draft sequence, and moves status to 'drafting'.
 * Requires at least 2 participants.
 */
export async function startDraft(draftId, hostId) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.hostId !== hostId) throw new Error('Only the host can start the draft');
  if (draft.status !== 'open') throw new Error('Draft has already started');
  if (draft.participants.length < 2) {
    throw new Error('Need at least 2 participants to start');
  }

  // Assign random order to participants
  const shuffled = [...draft.participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const withOrder = shuffled.map((p, idx) => ({ ...p, order: idx }));

  // Compute the full snake order
  const draftOrder = computeSnakeOrder(withOrder, draft.rounds);

  // Compute the first pick's deadline (if timer is enabled)
  let deadline = null;
  if (draft.timerSeconds > 0) {
    deadline = Timestamp.fromDate(
      new Date(Date.now() + draft.timerSeconds * 1000)
    );
  }

  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  await updateDoc(draftRef, {
    status: 'drafting',
    participants: JSON.stringify(withOrder),
    draftOrder: JSON.stringify(draftOrder),
    currentPickIndex: 0,
    currentPickDeadline: deadline,
    picks: '[]',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Submit a pick for the current turn.
 *
 * Validates that it's the caller's turn, records the pick, advances
 * the draft to the next pick (or marks it complete if this was the last
 * pick), and sets the new deadline.
 *
 * @param {string} draftId
 * @param {string} userId - must match the current pick's userId
 * @param {string} selection - what they're drafting (free text)
 */
export async function submitPick(draftId, userId, selection) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.status !== 'drafting') throw new Error('Draft is not in progress');

  const currentPick = draft.draftOrder[draft.currentPickIndex];
  if (!currentPick) throw new Error('No more picks to make');
  if (currentPick.userId !== userId) {
    throw new Error("It's not your turn");
  }

  const pickEntry = {
    pickIndex: draft.currentPickIndex,
    round: currentPick.round,
    pickInRound: currentPick.pickInRound,
    userId: currentPick.userId,
    userDisplayName: currentPick.userDisplayName,
    selection: selection?.trim() || null,
    skipped: !selection?.trim(),
    pickedAt: new Date().toISOString(),
  };

  const updatedPicks = [...draft.picks, pickEntry];
  const nextIndex = draft.currentPickIndex + 1;
  const isComplete = nextIndex >= draft.draftOrder.length;

  // Compute deadline for the next pick
  let deadline = null;
  if (!isComplete && draft.timerSeconds > 0) {
    deadline = Timestamp.fromDate(
      new Date(Date.now() + draft.timerSeconds * 1000)
    );
  }

  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  await updateDoc(draftRef, {
    picks: JSON.stringify(updatedPicks),
    currentPickIndex: nextIndex,
    currentPickDeadline: deadline,
    status: isComplete ? 'completed' : 'drafting',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Skip the current pick (auto-skip when timer expires).
 * Any participant can call this once the deadline has passed.
 * The pick is recorded with selection: null and skipped: true.
 */
export async function skipPick(draftId) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.status !== 'drafting') throw new Error('Draft is not in progress');

  const currentPick = draft.draftOrder[draft.currentPickIndex];
  if (!currentPick) throw new Error('No more picks');

  // Verify deadline has passed (with a small grace period)
  if (draft.timerSeconds > 0 && draft.currentPickDeadline) {
    const now = Date.now();
    const deadline = draft.currentPickDeadline.getTime();
    if (now < deadline - 2000) { // 2s grace period
      throw new Error('Timer has not expired yet');
    }
  }

  // Record a skipped pick
  return submitPickInternal(draft, currentPick, null, true);
}

/**
 * Internal helper for recording a pick (used by both submitPick and skipPick).
 */
async function submitPickInternal(draft, currentPick, selection, skipped) {
  const pickEntry = {
    pickIndex: draft.currentPickIndex,
    round: currentPick.round,
    pickInRound: currentPick.pickInRound,
    userId: currentPick.userId,
    userDisplayName: currentPick.userDisplayName,
    selection: selection || null,
    skipped: !!skipped,
    pickedAt: new Date().toISOString(),
  };

  const updatedPicks = [...draft.picks, pickEntry];
  const nextIndex = draft.currentPickIndex + 1;
  const isComplete = nextIndex >= draft.draftOrder.length;

  let deadline = null;
  if (!isComplete && draft.timerSeconds > 0) {
    deadline = Timestamp.fromDate(
      new Date(Date.now() + draft.timerSeconds * 1000)
    );
  }

  const draftRef = doc(db, DRAFTS_COLLECTION, draft.id);
  await updateDoc(draftRef, {
    picks: JSON.stringify(updatedPicks),
    currentPickIndex: nextIndex,
    currentPickDeadline: deadline,
    status: isComplete ? 'completed' : 'drafting',
    updatedAt: serverTimestamp(),
  });
}

// ============ SCORING ============

/**
 * Save scores for all picks (host only).
 * scores is an object mapping pickIndex → numerical score.
 * e.g. { 0: 10, 1: 5, 2: 8, ... }
 */
export async function saveScores(draftId, hostId, scores) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.hostId !== hostId) throw new Error('Only the host can score');
  if (draft.status !== 'completed') throw new Error('Draft is not complete');

  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  await updateDoc(draftRef, {
    scores: JSON.stringify(scores),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Compute per-participant totals from a scores object.
 * Returns sorted array: [{ userId, displayName, total, pickScores: [...] }]
 */
export function computeLeaderboard(draft) {
  if (!draft || !draft.scores || !draft.picks) return [];
  const scores = draft.scores;
  const totals = new Map();

  for (const pick of draft.picks) {
    const score = scores[pick.pickIndex] || 0;
    if (!totals.has(pick.userId)) {
      totals.set(pick.userId, {
        userId: pick.userId,
        displayName: pick.userDisplayName,
        total: 0,
        pickScores: [],
      });
    }
    const entry = totals.get(pick.userId);
    entry.total += score;
    entry.pickScores.push({ ...pick, score });
  }

  return Array.from(totals.values()).sort((a, b) => b.total - a.total);
}

// ============ HOST MANAGEMENT ============

/**
 * Update description (host only).
 */
export async function updateDraftDescription(draftId, hostId, description) {
  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  const snap = await getDoc(draftRef);
  if (!snap.exists()) throw new Error('Draft not found');
  if (snap.data().hostId !== hostId) throw new Error('Only the host can edit');
  await updateDoc(draftRef, { description, updatedAt: serverTimestamp() });
}

/**
 * Delete a draft (host only).
 */
export async function deleteDraft(draftId, hostId) {
  const draftRef = doc(db, DRAFTS_COLLECTION, draftId);
  const snap = await getDoc(draftRef);
  if (!snap.exists()) throw new Error('Draft not found');
  if (snap.data().hostId !== hostId) throw new Error('Only the host can delete');
  await deleteDoc(draftRef);
}
