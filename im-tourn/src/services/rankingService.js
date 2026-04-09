// src/services/rankingService.js
//
// Service layer for Ranking Pools — the "head-to-head sorted ranking" feature.
//
// Data model:
//   rankingPools/{poolId}              — the pool metadata + join code
//   rankingEntries/{poolId}_{idx}      — one doc per entry (holds base64 image inline)
//   rankingVotes/{poolId}_{userId}     — one doc per voter (their personal ranking)
//
// We use a flat collection (not subcollections) to match the pattern of
// bracketPools / predictionPools in bracketService.js. Entries are stored in
// their own collection so each one has its own 1MB budget for images.

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

const RANKING_POOLS_COLLECTION = 'rankingPools';
const RANKING_ENTRIES_COLLECTION = 'rankingEntries';
const RANKING_VOTES_COLLECTION = 'rankingVotes';

// Hard cap — keeps voting under ~120 comparisons.
export const MAX_RANKING_ENTRIES = 32;
export const MIN_RANKING_ENTRIES = 3;

// ============ HELPERS ============

function generateRankingJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Compress an image file client-side before upload.
 * Returns a base64 data URL sized to fit comfortably in a Firestore doc.
 *
 * Target: max 400px on longest edge, JPEG quality 0.75, which yields
 * roughly 15-40KB per image. The final data URL is checked against a
 * hard size limit, and if it's still too large we try again with a
 * smaller quality.
 *
 * @param {File} file - image file from an <input type="file">
 * @returns {Promise<string>} base64 data URL
 */
export async function compressImageToBase64(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  const MAX_DIMENSION = 400;
  const MAX_SIZE_BYTES = 500_000; // 500KB — comfortably under Firestore's 1MB limit

  // Load the file as a data URL, then draw it to a canvas at reduced size.
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

  // Compute target dimensions preserving aspect ratio.
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

  // Try successively lower qualities until we fit.
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

// ============ POOL CRUD ============

/**
 * Create a new ranking pool. The pool starts in 'open' status, meaning
 * it's accepting votes. The host can lock it later to stop new votes.
 *
 * @param {object} poolData - { title, description, hostId, hostDisplayName }
 * @param {Array<{text: string, imageUrl: string|null}>} entries
 * @returns {Promise<{id: string, joinCode: string}>}
 */
export async function createRankingPool(poolData, entries) {
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

  const joinCode = generateRankingJoinCode();

  // Create the pool document first so we have an ID for the entries.
  const poolRef = await addDoc(collection(db, RANKING_POOLS_COLLECTION), {
    title: poolData.title,
    description: poolData.description || '',
    hostId: poolData.hostId,
    hostDisplayName: poolData.hostDisplayName || 'Anonymous',
    entryCount: entries.length,
    voteCount: 0,
    joinCode,
    status: 'open', // open | locked
    consensusRanking: null, // cached aggregate, recomputed on vote submit
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Write each entry as its own doc, keyed by `${poolId}_${index}`.
  // We use a deterministic index-based ID so we can retrieve them in order
  // later without needing a Firestore orderBy.
  const entryWrites = entries.map((entry, index) => {
    const entryId = `${poolRef.id}_${index}`;
    const entryRef = doc(db, RANKING_ENTRIES_COLLECTION, entryId);
    return setDoc(entryRef, {
      poolId: poolRef.id,
      index,
      text: entry.text.trim(),
      imageUrl: entry.imageUrl || null, // base64 data URL or null
      createdAt: serverTimestamp(),
    });
  });

  await Promise.all(entryWrites);

  return { id: poolRef.id, joinCode };
}

/**
 * Get a ranking pool by ID, including its entries.
 * Returns null if not found.
 */
export async function getRankingPoolById(poolId) {
  const poolRef = doc(db, RANKING_POOLS_COLLECTION, poolId);
  const poolSnap = await getDoc(poolRef);
  if (!poolSnap.exists()) return null;

  const entries = await getRankingPoolEntries(poolId);

  const data = poolSnap.data();
  return {
    id: poolSnap.id,
    ...data,
    entries,
    createdAt: data.createdAt?.toDate?.() || null,
    updatedAt: data.updatedAt?.toDate?.() || null,
  };
}

/**
 * Get a ranking pool by its 6-character join code.
 */
export async function getRankingPoolByJoinCode(joinCode) {
  const q = query(
    collection(db, RANKING_POOLS_COLLECTION),
    where('joinCode', '==', joinCode.toUpperCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const poolDoc = snap.docs[0];
  const entries = await getRankingPoolEntries(poolDoc.id);
  const data = poolDoc.data();
  return {
    id: poolDoc.id,
    ...data,
    entries,
    createdAt: data.createdAt?.toDate?.() || null,
    updatedAt: data.updatedAt?.toDate?.() || null,
  };
}

/**
 * Get all entries for a pool, sorted by their index.
 */
export async function getRankingPoolEntries(poolId) {
  const q = query(
    collection(db, RANKING_ENTRIES_COLLECTION),
    where('poolId', '==', poolId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.index - b.index);
}

/**
 * Get all ranking pools hosted by a user.
 */
export async function getUserHostedRankingPools(userId) {
  const q = query(
    collection(db, RANKING_POOLS_COLLECTION),
    where('hostId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || null,
    };
  });
}

/**
 * Get all ranking pools a user has voted in.
 * We do this by querying rankingVotes for the user, then loading each pool.
 */
export async function getUserVotedRankingPools(userId) {
  const q = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  const poolIds = snap.docs.map(d => d.data().poolId);
  if (poolIds.length === 0) return [];

  const pools = await Promise.all(
    poolIds.map(async pid => {
      const ref = doc(db, RANKING_POOLS_COLLECTION, pid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || null,
      };
    })
  );
  return pools.filter(p => p !== null);
}

/**
 * Update a ranking pool's description (host only).
 */
export async function updateRankingPoolDescription(poolId, hostId, description) {
  const poolRef = doc(db, RANKING_POOLS_COLLECTION, poolId);
  const snap = await getDoc(poolRef);
  if (!snap.exists()) throw new Error('Pool not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the host can edit this pool');
  }
  await updateDoc(poolRef, {
    description,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Lock a pool (host only) — no more votes can be submitted.
 */
export async function lockRankingPool(poolId, hostId) {
  const poolRef = doc(db, RANKING_POOLS_COLLECTION, poolId);
  const snap = await getDoc(poolRef);
  if (!snap.exists()) throw new Error('Pool not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the host can lock this pool');
  }
  await updateDoc(poolRef, {
    status: 'locked',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reopen a locked pool (host only).
 */
export async function reopenRankingPool(poolId, hostId) {
  const poolRef = doc(db, RANKING_POOLS_COLLECTION, poolId);
  const snap = await getDoc(poolRef);
  if (!snap.exists()) throw new Error('Pool not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the host can reopen this pool');
  }
  await updateDoc(poolRef, {
    status: 'open',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a pool and all its entries and votes (host only).
 */
export async function deleteRankingPool(poolId, hostId) {
  const poolRef = doc(db, RANKING_POOLS_COLLECTION, poolId);
  const snap = await getDoc(poolRef);
  if (!snap.exists()) throw new Error('Pool not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the host can delete this pool');
  }

  // Delete all entries
  const entries = await getRankingPoolEntries(poolId);
  const entryDeletes = entries.map(e =>
    deleteDoc(doc(db, RANKING_ENTRIES_COLLECTION, e.id))
  );

  // Delete all votes
  const votesQ = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('poolId', '==', poolId)
  );
  const votesSnap = await getDocs(votesQ);
  const voteDeletes = votesSnap.docs.map(d => deleteDoc(d.ref));

  await Promise.all([...entryDeletes, ...voteDeletes]);
  await deleteDoc(poolRef);
}

// ============ VOTING ============

/**
 * Get a user's vote for a pool (their personal ranking), or null.
 */
export async function getUserRankingVote(poolId, userId) {
  const voteRef = doc(db, RANKING_VOTES_COLLECTION, `${poolId}_${userId}`);
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
 * Submit a user's final ranking for a pool. Recomputes the consensus.
 *
 * @param {string} poolId
 * @param {string} userId
 * @param {string} userDisplayName
 * @param {string[]} ranking - entry IDs in order (best first)
 * @param {number} comparisonsMade - for stats display
 */
export async function submitRankingVote(poolId, userId, userDisplayName, ranking, comparisonsMade) {
  const pool = await getRankingPoolById(poolId);
  if (!pool) throw new Error('Pool not found');
  if (pool.status !== 'open') {
    throw new Error('This pool is no longer accepting votes');
  }
  if (!Array.isArray(ranking) || ranking.length === 0) {
    throw new Error('Ranking is empty');
  }

  // Validate: the ranking must include every entry in the pool exactly once.
  const entryIds = new Set(pool.entries.map(e => e.id));
  const rankingSet = new Set(ranking);
  if (rankingSet.size !== entryIds.size) {
    throw new Error('Ranking is incomplete');
  }
  for (const id of ranking) {
    if (!entryIds.has(id)) {
      throw new Error('Ranking contains unknown entry');
    }
  }

  const voteRef = doc(db, RANKING_VOTES_COLLECTION, `${poolId}_${userId}`);
  const existing = await getDoc(voteRef);
  const isNewVote = !existing.exists();

  await setDoc(voteRef, {
    poolId,
    userId,
    userDisplayName: userDisplayName || 'Anonymous',
    ranking: JSON.stringify(ranking),
    comparisonsMade: comparisonsMade || 0,
    submittedAt: serverTimestamp(),
  });

  // Bump the vote count on the pool (only for new votes).
  const poolRef = doc(db, RANKING_POOLS_COLLECTION, poolId);
  if (isNewVote) {
    await updateDoc(poolRef, {
      voteCount: increment(1),
    });
  }

  // Recompute consensus from ALL votes and cache it on the pool doc.
  await recomputeRankingConsensus(poolId);
}

/**
 * Fetch all votes for a pool, recompute the Borda consensus, and store it.
 * Called after every vote submission. Cheap for reasonable voter counts.
 */
export async function recomputeRankingConsensus(poolId) {
  const q = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('poolId', '==', poolId)
  );
  const snap = await getDocs(q);

  const rankings = snap.docs.map(d => {
    const data = d.data();
    return typeof data.ranking === 'string' ? JSON.parse(data.ranking) : data.ranking;
  });

  const consensus = computeConsensus(rankings);

  const poolRef = doc(db, RANKING_POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    consensusRanking: JSON.stringify(consensus),
    updatedAt: serverTimestamp(),
  });

  return consensus;
}

/**
 * Get all votes for a pool (for leaderboard / host view).
 */
export async function getRankingPoolVotes(poolId) {
  const q = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('poolId', '==', poolId)
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
 * Get the consensus ranking (already computed), as an array of entry objects
 * with their scores, sorted best first.
 */
export function parseConsensus(pool) {
  if (!pool || !pool.consensusRanking) return [];
  const parsed = typeof pool.consensusRanking === 'string'
    ? JSON.parse(pool.consensusRanking)
    : pool.consensusRanking;
  return parsed || [];
}
