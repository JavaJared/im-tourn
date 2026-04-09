// src/services/rankingService.js
//
// Service layer for the public Rankings feature.
//
// Rankings are public by default (like brackets), discoverable through a
// browse page. Anyone logged in can vote on any ranking. Hosts can close
// a ranking to stop new votes (similar to how a poll closes), but there
// is no concept of "joining" a ranking — they are open access.
//
// Data model:
//   rankings/{rankingId}                — the ranking metadata
//   rankingEntries/{rankingId}_{idx}    — one doc per entry (text + base64 image)
//   rankingVotes/{rankingId}_{userId}   — one doc per voter (their personal ranking)

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
  increment,
} from 'firebase/firestore';
import { db } from '../firebase';
import { computeConsensus } from './interactiveSort';

const RANKINGS_COLLECTION = 'rankings';
const RANKING_ENTRIES_COLLECTION = 'rankingEntries';
const RANKING_VOTES_COLLECTION = 'rankingVotes';

// Hard cap — keeps voting under ~120 comparisons.
export const MAX_RANKING_ENTRIES = 32;
export const MIN_RANKING_ENTRIES = 3;

// ============ HELPERS ============

/**
 * Compress an image file client-side before upload.
 * Returns a base64 data URL sized to fit comfortably in a Firestore doc.
 *
 * Target: max 400px on longest edge, JPEG quality 0.75, which yields
 * roughly 15-40KB per image. The final data URL is checked against a
 * hard size limit, and if it's still too large we try again with a
 * smaller quality.
 */
export async function compressImageToBase64(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  const MAX_DIMENSION = 400;
  const MAX_SIZE_BYTES = 500_000; // 500KB — comfortably under Firestore's 1MB limit

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = dataUrl;
  });

  let { width, height } = img;
  if (width > height) {
    if (width > MAX_DIMENSION) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    }
  } else {
    if (height > MAX_DIMENSION) {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.75;
  let result = canvas.toDataURL('image/jpeg', quality);

  while (result.length > MAX_SIZE_BYTES && quality > 0.3) {
    quality -= 0.1;
    result = canvas.toDataURL('image/jpeg', quality);
  }

  if (result.length > MAX_SIZE_BYTES) {
    throw new Error('Image is too large even after compression. Try a smaller image.');
  }

  return result;
}

// ============ RANKING CRUD ============

/**
 * Create a new public ranking. Starts in 'open' status (accepting votes).
 *
 * @param {object} rankingData - { title, description, category, hostId, hostDisplayName }
 * @param {Array<{text: string, imageUrl: string|null}>} entries
 * @returns {Promise<{id: string}>}
 */
export async function createRanking(rankingData, entries) {
  if (!Array.isArray(entries)) {
    throw new Error('entries must be an array');
  }
  if (entries.length < MIN_RANKING_ENTRIES) {
    throw new Error(`You need at least ${MIN_RANKING_ENTRIES} entries`);
  }
  if (entries.length > MAX_RANKING_ENTRIES) {
    throw new Error(`Maximum of ${MAX_RANKING_ENTRIES} entries allowed`);
  }
  for (const e of entries) {
    if (!e.text || !e.text.trim()) {
      throw new Error('All entries must have text');
    }
  }

  // Create the ranking document first so we have an ID for the entries.
  const rankingRef = await addDoc(collection(db, RANKINGS_COLLECTION), {
    title: rankingData.title,
    description: rankingData.description || '',
    category: rankingData.category || '',
    hostId: rankingData.hostId,
    hostDisplayName: rankingData.hostDisplayName || 'Anonymous',
    entryCount: entries.length,
    voteCount: 0,
    status: 'open', // open | closed
    consensusRanking: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Write each entry as its own doc, keyed by `${rankingId}_${index}`.
  const entryWrites = entries.map((entry, index) => {
    const entryId = `${rankingRef.id}_${index}`;
    const entryRef = doc(db, RANKING_ENTRIES_COLLECTION, entryId);
    return setDoc(entryRef, {
      rankingId: rankingRef.id,
      index,
      text: entry.text.trim(),
      imageUrl: entry.imageUrl || null,
      createdAt: serverTimestamp(),
    });
  });

  await Promise.all(entryWrites);

  return { id: rankingRef.id };
}

/**
 * Get a ranking by ID, including its entries.
 */
export async function getRankingById(rankingId) {
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  const snap = await getDoc(rankingRef);
  if (!snap.exists()) return null;

  const entries = await getRankingEntries(rankingId);

  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    entries,
    createdAt: data.createdAt?.toDate?.() || null,
    updatedAt: data.updatedAt?.toDate?.() || null,
  };
}

/**
 * Get all entries for a ranking, sorted by their index.
 */
export async function getRankingEntries(rankingId) {
  const q = query(
    collection(db, RANKING_ENTRIES_COLLECTION),
    where('rankingId', '==', rankingId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.index - b.index);
}

/**
 * Get ALL rankings for the public browse page.
 * Returns metadata only — does NOT load entries (browse page doesn't need them).
 * Mirrors getAllBrackets() pattern: orderBy createdAt desc, client-side
 * filtering and resorting handled by the page component.
 */
export async function getAllRankings() {
  const q = query(
    collection(db, RANKINGS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    // Strip consensusRanking from the browse payload — it's a JSON string blob
    // and the browse view doesn't need it. Detail view loads it separately.
    const { consensusRanking, ...rest } = data;
    return {
      id: d.id,
      ...rest,
      createdAt: data.createdAt?.toDate?.() || null,
    };
  });
}

/**
 * Get all rankings created by a specific user. Used by the My Rankings page.
 */
export async function getUserCreatedRankings(userId) {
  const q = query(
    collection(db, RANKINGS_COLLECTION),
    where('hostId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    const { consensusRanking, ...rest } = data;
    return {
      id: d.id,
      ...rest,
      createdAt: data.createdAt?.toDate?.() || null,
    };
  });
}

/**
 * Get all rankings a user has voted in. Used by the My Rankings page.
 *
 * Query strategy: find their votes first (cheap, indexed by userId),
 * then load the matching ranking docs. We deliberately don't try to do
 * this in a single query because Firestore doesn't support joins.
 */
export async function getUserVotedRankings(userId) {
  const q = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  const rankingIds = snap.docs.map(d => d.data().rankingId);
  if (rankingIds.length === 0) return [];

  const rankings = await Promise.all(
    rankingIds.map(async (rid) => {
      const ref = doc(db, RANKINGS_COLLECTION, rid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      const { consensusRanking, ...rest } = data;
      return {
        id: snap.id,
        ...rest,
        createdAt: data.createdAt?.toDate?.() || null,
      };
    })
  );
  return rankings
    .filter(r => r !== null)
    .sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt - a.createdAt;
    });
}

/**
 * Update a ranking's description (host only).
 */
export async function updateRankingDescription(rankingId, hostId, description) {
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  const snap = await getDoc(rankingRef);
  if (!snap.exists()) throw new Error('Ranking not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the creator can edit this ranking');
  }
  await updateDoc(rankingRef, {
    description,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Close a ranking (host only) — no more votes can be submitted.
 * Like closing a poll. Existing votes and consensus remain visible.
 */
export async function closeRanking(rankingId, hostId) {
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  const snap = await getDoc(rankingRef);
  if (!snap.exists()) throw new Error('Ranking not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the creator can close this ranking');
  }
  await updateDoc(rankingRef, {
    status: 'closed',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reopen a closed ranking (host only).
 */
export async function reopenRanking(rankingId, hostId) {
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  const snap = await getDoc(rankingRef);
  if (!snap.exists()) throw new Error('Ranking not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the creator can reopen this ranking');
  }
  await updateDoc(rankingRef, {
    status: 'open',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a ranking and all its entries and votes (host only).
 */
export async function deleteRanking(rankingId, hostId) {
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  const snap = await getDoc(rankingRef);
  if (!snap.exists()) throw new Error('Ranking not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the creator can delete this ranking');
  }

  const entries = await getRankingEntries(rankingId);
  const entryDeletes = entries.map(e =>
    deleteDoc(doc(db, RANKING_ENTRIES_COLLECTION, e.id))
  );

  const votesQ = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('rankingId', '==', rankingId)
  );
  const votesSnap = await getDocs(votesQ);
  const voteDeletes = votesSnap.docs.map(d => deleteDoc(d.ref));

  await Promise.all([...entryDeletes, ...voteDeletes]);
  await deleteDoc(rankingRef);
}

// ============ VOTING ============

/**
 * Get a user's vote for a ranking (their personal ranking), or null.
 */
export async function getUserRankingVote(rankingId, userId) {
  const voteRef = doc(db, RANKING_VOTES_COLLECTION, `${rankingId}_${userId}`);
  const snap = await getDoc(voteRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    ranking: typeof data.ranking === 'string' ? JSON.parse(data.ranking) : data.ranking,
    submittedAt: data.submittedAt?.toDate?.() || null,
  };
}

/**
 * Submit a user's final ranking. Recomputes the consensus.
 */
export async function submitRankingVote(rankingId, userId, userDisplayName, ranking, comparisonsMade) {
  const rankingDoc = await getRankingById(rankingId);
  if (!rankingDoc) throw new Error('Ranking not found');
  if (rankingDoc.status === 'closed') {
    throw new Error('This ranking is closed and no longer accepting votes');
  }
  if (!Array.isArray(ranking) || ranking.length === 0) {
    throw new Error('Ranking is empty');
  }

  // Validate: the ranking must include every entry exactly once.
  const entryIds = new Set(rankingDoc.entries.map(e => e.id));
  const rankingSet = new Set(ranking);
  if (rankingSet.size !== entryIds.size) {
    throw new Error('Ranking is incomplete');
  }
  for (const id of ranking) {
    if (!entryIds.has(id)) {
      throw new Error('Ranking contains unknown entry');
    }
  }

  const voteRef = doc(db, RANKING_VOTES_COLLECTION, `${rankingId}_${userId}`);
  const existing = await getDoc(voteRef);
  const isNewVote = !existing.exists();

  await setDoc(voteRef, {
    rankingId,
    userId,
    userDisplayName: userDisplayName || 'Anonymous',
    ranking: JSON.stringify(ranking),
    comparisonsMade: comparisonsMade || 0,
    submittedAt: serverTimestamp(),
  });

  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  if (isNewVote) {
    await updateDoc(rankingRef, {
      voteCount: increment(1),
    });
  }

  await recomputeRankingConsensus(rankingId);
}

/**
 * Fetch all votes for a ranking, recompute the Borda consensus, and store it.
 * Called after every vote submission. Cheap for reasonable voter counts.
 */
export async function recomputeRankingConsensus(rankingId) {
  const q = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('rankingId', '==', rankingId)
  );
  const snap = await getDocs(q);

  const rankings = snap.docs.map(d => {
    const data = d.data();
    return typeof data.ranking === 'string' ? JSON.parse(data.ranking) : data.ranking;
  });

  const consensus = computeConsensus(rankings);

  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  await updateDoc(rankingRef, {
    consensusRanking: JSON.stringify(consensus),
    updatedAt: serverTimestamp(),
  });

  return consensus;
}

/**
 * Get all votes for a ranking (for host stats / future leaderboard view).
 */
export async function getRankingVotes(rankingId) {
  const q = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('rankingId', '==', rankingId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        ranking: typeof data.ranking === 'string' ? JSON.parse(data.ranking) : data.ranking,
        submittedAt: data.submittedAt?.toDate?.() || null,
      };
    })
    .sort((a, b) => {
      if (!a.submittedAt || !b.submittedAt) return 0;
      return b.submittedAt - a.submittedAt;
    });
}

/**
 * Parse the cached consensus ranking off a ranking doc.
 */
export function parseConsensus(ranking) {
  if (!ranking || !ranking.consensusRanking) return [];
  const parsed = typeof ranking.consensusRanking === 'string'
    ? JSON.parse(ranking.consensusRanking)
    : ranking.consensusRanking;
  return parsed || [];
}
