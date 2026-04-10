// src/services/rankingService.js
//
// Service layer for the public Rankings feature.
//
// Rankings are public by default (like brackets), discoverable through a
// browse page. Anyone logged in can vote on any ranking. Hosts can close
// a ranking to stop new votes, but there is no concept of "joining" a
// ranking — they are open access.
//
// Data model:
//   rankings/{rankingId}                — the ranking metadata
//   rankingEntries/{rankingId}_{idx}    — one doc per entry (text + image URL)
//   rankingVotes/{rankingId}_{userId}   — one doc per voter (their personal ranking)
//
// Images are stored in Firebase Storage at:
//   rankings/{rankingId}/entries/{entryIndex}-{suffix}.jpg
//
// Each entry doc carries BOTH `imageUrl` (public download URL for display)
// AND `imagePath` (the Storage path, used for cleanup on delete/reupload).

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
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../firebase';
import { computeConsensus } from './interactiveSort';

const RANKINGS_COLLECTION = 'rankings';
const RANKING_ENTRIES_COLLECTION = 'rankingEntries';
const RANKING_VOTES_COLLECTION = 'rankingVotes';

// Hard cap — keeps voting under ~120 comparisons.
export const MAX_RANKING_ENTRIES = 32;
export const MIN_RANKING_ENTRIES = 3;

// ============ IMAGE HELPERS ============

/**
 * Short random suffix for uploaded file names. This guarantees that when
 * an image is swapped/reuploaded, the new file has a different URL than
 * the old one — otherwise the CDN might serve a cached old version.
 */
function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Compress an image file client-side before upload.
 * Returns a JPEG Blob sized for display quality while staying fast to
 * transfer on mobile connections.
 *
 * Target: max 1200px on the longest edge, JPEG quality 0.85.
 * Expected size: ~150–400KB for typical photo content.
 *
 * @param {File} file - image file from an <input type="file">
 * @returns {Promise<Blob>} JPEG blob ready to upload
 */
export async function compressImage(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  const MAX_DIMENSION = 1200;
  const QUALITY = 0.85;

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

  // Preserve aspect ratio while fitting within MAX_DIMENSION on longest edge.
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

  // Convert to a Blob — this is what Firebase Storage wants, and it
  // avoids the ~33% base64 encoding overhead.
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to compress image'))),
      'image/jpeg',
      QUALITY
    );
  });

  return blob;
}

/**
 * Upload a compressed image Blob to Firebase Storage.
 * Returns the public download URL and the storage path (kept for cleanup).
 *
 * @param {string} rankingId - ID of the ranking this entry belongs to
 * @param {number} entryIndex - 0-based index of the entry
 * @param {Blob} blob - the compressed image blob from compressImage()
 * @returns {Promise<{url: string, path: string}>}
 */
export async function uploadEntryImage(rankingId, entryIndex, blob) {
  const suffix = randomSuffix();
  const path = `rankings/${rankingId}/entries/${entryIndex}-${suffix}.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(ref);
  return { url, path };
}

/**
 * Delete an uploaded entry image by its storage path.
 * Safe to call on a path that doesn't exist — "object-not-found" errors
 * are swallowed because the goal is just to ensure the file is gone.
 *
 * @param {string} path - the storage path (e.g. 'rankings/abc/entries/0-xyz.jpg')
 */
export async function deleteEntryImage(path) {
  if (!path) return;
  try {
    const ref = storageRef(storage, path);
    await deleteObject(ref);
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') {
      console.warn('Failed to delete entry image:', path, err);
    }
  }
}

// ============ RANKING CRUD ============

/**
 * Create a new public ranking. Starts in 'open' status (accepting votes).
 *
 * Upload flow:
 *   1. Create the ranking doc first (so we have an ID)
 *   2. Upload any pending image blobs to rankings/{id}/entries/...
 *   3. Write the entry docs with the resulting URLs + paths
 *   4. If anything fails partway, best-effort cleanup
 *
 * Entries passed in should have shape:
 *   { text: string, imageBlob: Blob | null }
 *
 * The caller holds images as Blobs until this function runs, so nothing
 * is uploaded if the user abandons the create form.
 *
 * @param {object} rankingData - { title, description, category, hostId, hostDisplayName }
 * @param {Array<{text: string, imageBlob: Blob | null}>} entries
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

  // Step 1: create the ranking doc first so we know the ID.
  const rankingRef = await addDoc(collection(db, RANKINGS_COLLECTION), {
    title: rankingData.title,
    description: rankingData.description || '',
    category: rankingData.category || '',
    hostId: rankingData.hostId,
    hostDisplayName: rankingData.hostDisplayName || 'Anonymous',
    entryCount: entries.length,
    voteCount: 0,
    status: 'open',
    consensusRanking: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const rankingId = rankingRef.id;

  // Step 2: upload images in parallel. Each upload returns {url, path}
  // or null if the entry had no image.
  let uploadResults;
  try {
    uploadResults = await Promise.all(
      entries.map(async (entry, index) => {
        if (!entry.imageBlob) return null;
        return uploadEntryImage(rankingId, index, entry.imageBlob);
      })
    );
  } catch (uploadErr) {
    // Upload failed — roll back the ranking doc so we don't leave a
    // half-created ranking behind.
    await deleteDoc(rankingRef).catch(() => {});
    throw new Error('Image upload failed: ' + (uploadErr.message || 'unknown error'));
  }

  // Step 3: write entry docs with URLs.
  try {
    const entryWrites = entries.map((entry, index) => {
      const entryId = `${rankingId}_${index}`;
      const entryRef = doc(db, RANKING_ENTRIES_COLLECTION, entryId);
      const uploaded = uploadResults[index];
      return setDoc(entryRef, {
        rankingId,
        index,
        text: entry.text.trim(),
        imageUrl: uploaded?.url || null,
        imagePath: uploaded?.path || null,
        createdAt: serverTimestamp(),
      });
    });
    await Promise.all(entryWrites);
  } catch (writeErr) {
    // Entry write failed — clean up uploaded images and the ranking doc
    // to avoid leaking Storage files.
    await Promise.all(
      uploadResults
        .filter(Boolean)
        .map(r => deleteEntryImage(r.path))
    );
    await deleteDoc(rankingRef).catch(() => {});
    throw writeErr;
  }

  return { id: rankingId };
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
 */
export async function getAllRankings() {
  const q = query(
    collection(db, RANKINGS_COLLECTION),
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
 * Delete a ranking and all its entries, votes, and uploaded images (host only).
 */
export async function deleteRanking(rankingId, hostId) {
  const rankingRef = doc(db, RANKINGS_COLLECTION, rankingId);
  const snap = await getDoc(rankingRef);
  if (!snap.exists()) throw new Error('Ranking not found');
  if (snap.data().hostId !== hostId) {
    throw new Error('Only the creator can delete this ranking');
  }

  const entries = await getRankingEntries(rankingId);

  // Delete Storage images in parallel (errors swallowed by deleteEntryImage).
  const imageDeletes = entries
    .filter(e => e.imagePath)
    .map(e => deleteEntryImage(e.imagePath));

  // Delete entry docs.
  const entryDeletes = entries.map(e =>
    deleteDoc(doc(db, RANKING_ENTRIES_COLLECTION, e.id))
  );

  // Delete votes.
  const votesQ = query(
    collection(db, RANKING_VOTES_COLLECTION),
    where('rankingId', '==', rankingId)
  );
  const votesSnap = await getDocs(votesQ);
  const voteDeletes = votesSnap.docs.map(d => deleteDoc(d.ref));

  await Promise.all([...imageDeletes, ...entryDeletes, ...voteDeletes]);
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
