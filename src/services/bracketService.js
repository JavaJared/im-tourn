import * as poolPrivacy from './pools/privacy';
import { callServer } from './server';
import { requirePredictionsOpen } from '../lib/poolLifecycle';
import { normalizeSleeper } from '../lib/legacyPoolAdapter';
import { weekKey, standardWeeklyMatchups } from '../lib/weeklyState';
import { onSnapshot } from 'firebase/firestore';
// src/services/bracketService.js
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
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';

const BRACKETS_COLLECTION = 'brackets';
const SUBMISSIONS_COLLECTION = 'submissions';
const WEEKLY_BRACKET_COLLECTION = 'weeklyBracket';
const WEEKLY_VOTES_COLLECTION = 'weeklyVotes';
const WEEKLY_ARCHIVE_COLLECTION = 'weeklyArchive';

// Create a new bracket
export async function createBracket(bracketData, userId, userDisplayName) {
  // Convert matchups to JSON string since Firestore doesn't support nested arrays
  const dataToSave = {
    ...bracketData,
    matchups: JSON.stringify(bracketData.matchups),
    userId,
    userDisplayName: userDisplayName || 'Anonymous',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const docRef = await addDoc(collection(db, BRACKETS_COLLECTION), dataToSave);
  return docRef.id;
}

// Get all brackets (for homepage)
export async function getAllBrackets() {
  const q = query(
    collection(db, BRACKETS_COLLECTION), 
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      matchups: typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups,
      createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'
    };
  });
}

// Get brackets by user
export async function getUserBrackets(userId) {
  const q = query(
    collection(db, BRACKETS_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      matchups: typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups,
      createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'
    };
  });
}

// Get a single bracket by ID
export async function getBracketById(bracketId) {
  const docRef = doc(db, BRACKETS_COLLECTION, bracketId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      matchups: typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups,
      createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'
    };
  }
  return null;
}

// Delete a bracket (only by owner)
export async function deleteBracket(bracketId) {
  await deleteDoc(doc(db, BRACKETS_COLLECTION, bracketId));
}

// Submit a filled bracket
export async function submitFilledBracket(submissionData, bracketId, userId, userDisplayName) {
  // Convert matchups to JSON string since Firestore doesn't support nested arrays
  const dataToSave = {
    ...submissionData,
    matchups: JSON.stringify(submissionData.matchups),
    bracketId,
    userId,
    userDisplayName: userDisplayName || 'Anonymous',
    submittedAt: serverTimestamp()
  };
  
  const docRef = await addDoc(collection(db, SUBMISSIONS_COLLECTION), dataToSave);
  return docRef.id;
}

// Get submissions for a bracket
export async function getBracketSubmissions(bracketId) {
  const q = query(
    collection(db, SUBMISSIONS_COLLECTION),
    where('bracketId', '==', bracketId),
    orderBy('submittedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    submittedAt: doc.data().submittedAt?.toDate?.()?.toLocaleDateString() || 'Recently'
  }));
}

// Toggle upvote on a submission
export async function toggleSubmissionUpvote(submissionId, userId, hasUpvoted) {
  return callServer('setSubmissionUpvote', { submissionId, liked: !hasUpvoted });
}

// Get user's submissions
export async function getUserSubmissions(userId) {
  const q = query(
    collection(db, SUBMISSIONS_COLLECTION),
    where('userId', '==', userId),
    orderBy('submittedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    submittedAt: doc.data().submittedAt?.toDate?.()?.toLocaleDateString() || 'Recently'
  }));
}

// ============ WEEKLY BRACKET FUNCTIONS ============

// Get all 32-entry brackets for admin selection
export async function get32EntryBrackets() {
  const q = query(
    collection(db, BRACKETS_COLLECTION),
    where('size', '==', 32)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      matchups: typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups,
      createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'
    };
  });
}

// Get brackets with 32 or 64 entries (for weekly bracket selection)
export async function getLargeBrackets() {
  // Firestore doesn't support 'in' with orderBy, so we fetch both separately
  const q32 = query(
    collection(db, BRACKETS_COLLECTION),
    where('size', '==', 32)
  );
  const q64 = query(
    collection(db, BRACKETS_COLLECTION),
    where('size', '==', 64)
  );
  
  const [snapshot32, snapshot64] = await Promise.all([
    getDocs(q32),
    getDocs(q64)
  ]);
  
  const brackets = [...snapshot32.docs, ...snapshot64.docs].map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      matchups: typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups,
      createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'
    };
  });
  
  const modern = await getDocs(query(collection(db, 'customBrackets'), where('status', '==', 'published')));
  for (const d of modern.docs) { const data = d.data(); const matchups = standardWeeklyMatchups(data); if (matchups) brackets.push({ id: d.id, ...data, size: data.participantCount, matchups, createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || '' }); }
  // Sort by createdAt descending
  return brackets.sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

// Get current weekly bracket
export async function getWeeklyBracket() {
  const docRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      ...data,
      matchups: typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups,
      votes: typeof data.votes === 'string' ? JSON.parse(data.votes) : (data.votes || {}),
      startDate: data.startDate?.toDate?.() || new Date(data.startDate),
    };
  }
  return null;
}

// Set weekly bracket (admin only)
export async function setWeeklyBracket(bracketData) {
  return callServer('manageWeeklyBracket', { action: 'set', bracket: bracketData });
}

// Submit vote for weekly bracket
export async function submitWeeklyVote(userId, roundIndex, votes, weekId) {
  return callServer('castWeeklyVotes', { weekId, roundIndex, votes });
}

// Check if user has voted for a round
export async function hasUserVotedForRound(userId, roundIndex, bracket) {
  return !!(await getUserVotesForRound(userId, roundIndex, bracket));
}

// Get user's votes for a round
export async function getUserVotesForRound(userId, roundIndex, bracket) {
  if (!bracket) bracket = await getWeeklyBracket();
  if (!bracket) return null;
  const prefix = bracket.weekId ? `${bracket.weekId}_${userId}` : userId;
  const snap = await getDoc(doc(db, WEEKLY_VOTES_COLLECTION, `${prefix}_round${roundIndex}`));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.weekId && data.weekId !== weekKey(bracket)) return null;
  if (!data.weekId && data.submittedAt?.toMillis() < +bracket.startDate) return null;
  return typeof data.votes === 'string' ? JSON.parse(data.votes) : data.votes;
}

// Advance weekly bracket to next round (admin/automated)
export async function advanceWeeklyBracket() {
  return callServer('manageWeeklyBracket', { action: 'advance' });
}

// Set manual winner for a specific matchup (admin only)
export async function setManualWinner(roundIndex, matchIndex, winner) {
  await callServer('manageWeeklyBracket', { action: 'pick', roundIndex, matchIndex, winner });
  return (await getWeeklyBracket())?.matchups || [];
}

// Check if bracket should auto-advance based on time
export async function checkAndAutoAdvance() {
  return getWeeklyBracket(); // Scheduling is server-owned.
}

// Clear weekly bracket (admin) - archives before clearing
export async function clearWeeklyBracket() {
  return callServer('manageWeeklyBracket', { action: 'clear' });
}

// Get archived weekly bracket champions
export async function getWeeklyArchive() {
  const q = query(
    collection(db, WEEKLY_ARCHIVE_COLLECTION),
    orderBy('archivedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      startDate: data.startDate?.toDate?.() || null,
      archivedAt: data.archivedAt?.toDate?.() || null
    };
  });
}

// ============ BRACKET POOLS FUNCTIONS ============

const POOLS_COLLECTION = 'bracketPools';
const POOL_ENTRIES_COLLECTION = 'poolEntries';

// Generate a random 6-character join code
function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, 1, I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a new bracket pool
export async function createBracketPool(poolData) {
  return poolPrivacy.createPool('bracket', poolData);
}

// Get pool by ID
export async function getPoolById(poolId) {
  const docRef = doc(db, POOLS_COLLECTION, poolId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  
  const data = docSnap.data();
  return poolPrivacy.hostInvite('bracket', {
    id: docSnap.id,
    ...data,
    bracketMatchups: poolPrivacy.parsePoolField(data.bracketMatchups),
    results: poolPrivacy.parsePoolField(data.results),
    lockDate: data.lockDate?.toDate?.() || null,
    createdAt: data.createdAt?.toDate?.() || null
  });
}

// Get pool by join code
export async function getPoolByJoinCode(joinCode) {
  return poolPrivacy.resolveInvite('bracket', joinCode);
}

// Get pools hosted by a user
export async function getUserHostedPools(userId) {
  const q = query(
    collection(db, POOLS_COLLECTION),
    where('hostId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      bracketMatchups: typeof data.bracketMatchups === 'string' ? JSON.parse(data.bracketMatchups) : data.bracketMatchups,
      results: data.results ? (typeof data.results === 'string' ? JSON.parse(data.results) : data.results) : null,
      lockDate: data.lockDate?.toDate?.() || null,
      createdAt: data.createdAt?.toDate?.() || null
    };
  });
}

// Get pools a user has joined
export async function getUserJoinedPools(userId) {
  const q = query(
    collection(db, POOL_ENTRIES_COLLECTION),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  
  const poolIds = snapshot.docs.map(doc => doc.data().poolId);
  if (poolIds.length === 0) return [];
  
  // Fetch each pool
  const pools = await Promise.all(
    poolIds.map(async (poolId) => {
      const pool = await getPoolById(poolId);
      return pool;
    })
  );
  
  return pools.filter(p => p !== null);
}

// Join a bracket pool
export async function joinBracketPool(poolId, userId, userDisplayName) {
  return poolPrivacy.joinPool('bracket', poolId);
}

// Get a user's pool entry
export async function getPoolEntry(poolId, userId) {
  return poolPrivacy.ownEntry('bracket', poolId);
}

// Submit predictions for a pool
export async function submitPoolPredictions(poolId, userId, predictions, champion, sleeperPicks = null) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  requirePredictionsOpen(pool);
  
  const entryRef = doc(db, POOL_ENTRIES_COLLECTION, `${poolId}_${userId}`);
  const updateData = {
    predictions: JSON.stringify(predictions),
    champion,
    submittedAt: serverTimestamp()
  };
  
  // Add sleeper picks if provided
  if (sleeperPicks) {
    // New-format sleepers are participant-id strings and are stored raw;
    // legacy object picks keep their stringified form.
    const enc = (v) => (v ? (typeof v === 'string' ? v : JSON.stringify(v)) : null);
    updateData.sleeper1 = enc(sleeperPicks.sleeper1);
    updateData.sleeper2 = enc(sleeperPicks.sleeper2);
    updateData.sleeper1Hit = false;
    updateData.sleeper2Hit = false;
  }
  
  await updateDoc(entryRef, updateData);
  
  return true;
}

// Lock the pool (no more entries/predictions allowed)
export async function lockPool(poolId, hostId) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can lock this pool');
  }
  
  const poolRef = doc(db, POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    status: 'locked',
    updatedAt: serverTimestamp()
  });
  
  return true;
}

// Update pool description
export async function updatePoolDescription(poolId, hostId, description) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can edit this pool');
  }
  
  const poolRef = doc(db, POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    description: description,
    updatedAt: serverTimestamp()
  });
  
  return true;
}

// Start the pool (begin entering results)
export async function startPool(poolId, hostId) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can start this pool');
  }
  
  const poolRef = doc(db, POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    status: 'in_progress',
    results: JSON.stringify(pool.bracketMatchups), // Initialize results with the bracket structure
    updatedAt: serverTimestamp()
  });
  
  return true;
}

// Update pool results (host sets winners)
export async function updatePoolResults(poolId, hostId, results) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can update results');
  }
  
  const poolRef = doc(db, POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    results: JSON.stringify(results),
    updatedAt: serverTimestamp()
  });
  
  // Recalculate scores for all entries
  await recalculatePoolScores(poolId, results, pool);
  
  return true;
}

// Check if a participant made it to a specific round in the results
function didParticipantMakeRound(results, participant, targetRound) {
  if (!participant || !results) return false;
  
  // Check if participant appears in the target round
  for (const match of results[targetRound] || []) {
    if (match.entry1?.seed === participant.seed || match.entry2?.seed === participant.seed) {
      return true;
    }
  }
  return false;
}

// Get the actual winner participant from a match
function getMatchWinner(match) {
  if (!match || !match.winner) return null;
  return match.winner === 1 ? match.entry1 : match.entry2;
}

// Check if two participants are the same (by seed)
function isSameParticipant(p1, p2) {
  if (!p1 || !p2) return false;
  return p1.seed === p2.seed;
}

// Calculate score for a single entry
function calculateEntryScore(predictions, results, pool, entry) {
  let score = 0;
  const roundPoints = pool.roundPoints || [1, 2, 4, 8, 16, 32, 64];
  
  // Calculate regular matchup scores
  results.forEach((round, roundIndex) => {
    const pointsForRound = roundPoints[roundIndex] || Math.pow(2, roundIndex);
    
    round.forEach((match, matchIndex) => {
      if (match.winner) {
        const predictionMatch = predictions[roundIndex]?.[matchIndex];
        if (predictionMatch?.winner) {
          // Get the actual winner from both the result and prediction
          const actualWinner = getMatchWinner(match);
          const predictedWinner = getMatchWinner(predictionMatch);
          
          // Only count as correct if they predicted the same PARTICIPANT winning
          // (not just the same position winning)
          if (isSameParticipant(actualWinner, predictedWinner)) {
            score += pointsForRound;
          }
        }
      }
    });
  });
  
  // Calculate sleeper pick scores
  let sleeper1Hit = false;
  let sleeper2Hit = false;
  
  if (pool.enableSleepers && entry) {
    // Sleeper 1: Round 1 loser who makes Round 3+
    if (entry.sleeper1) {
      const sleeper1Data = typeof entry.sleeper1 === 'string' ? JSON.parse(entry.sleeper1) : entry.sleeper1;
      if (sleeper1Data && didParticipantMakeRound(results, sleeper1Data, 2)) { // Round 3 is index 2
        score += pool.sleeper1Points || 0;
        sleeper1Hit = true;
      }
    }
    
    // Sleeper 2: Round 2 loser who makes Round 4+
    if (entry.sleeper2) {
      const sleeper2Data = typeof entry.sleeper2 === 'string' ? JSON.parse(entry.sleeper2) : entry.sleeper2;
      if (sleeper2Data && didParticipantMakeRound(results, sleeper2Data, 3)) { // Round 4 is index 3
        score += pool.sleeper2Points || 0;
        sleeper2Hit = true;
      }
    }
  }
  
  return { score, sleeper1Hit, sleeper2Hit };
}

// Recalculate scores for all entries in a pool
async function recalculatePoolScores(poolId, results, pool) {
  const entries = await getPoolEntries(poolId);
  
  const updatePromises = entries.map(async (entry) => {
    if (!entry.predictions) return;
    
    const { score, sleeper1Hit, sleeper2Hit } = calculateEntryScore(entry.predictions, results, pool, entry);
    const entryRef = doc(db, POOL_ENTRIES_COLLECTION, `${poolId}_${entry.userId}`);
    
    const updateData = { score };
    if (pool.enableSleepers) {
      updateData.sleeper1Hit = sleeper1Hit;
      updateData.sleeper2Hit = sleeper2Hit;
    }
    
    await updateDoc(entryRef, updateData);
  });
  
  await Promise.all(updatePromises);
}

// Manually recalculate scores (exported for host use)
export async function recalculatePoolScoresManual(poolId, hostId) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can recalculate scores');
  }
  if (!pool.results) {
    throw new Error('No results to score against');
  }
  
  await recalculatePoolScores(poolId, pool.results, pool);
  return true;
}

// Get all entries for a pool (leaderboard)
export async function getPoolEntries(poolId, cursor = null) {
  return poolPrivacy.poolEntries('bracket', poolId, cursor);
}

// Complete the pool (declare winner)
export async function completePool(poolId, hostId) {
  return callServer('managePoolResults', { poolId, action: 'complete' });
}

// Delete a pool (host only)
export async function deletePool(poolId, hostId) {
  return poolPrivacy.removePool('bracket', poolId);
}

// ============ PREDICTION POOLS FUNCTIONS ============

const PREDICTION_POOLS_COLLECTION = 'predictionPools';
const PREDICTION_ENTRIES_COLLECTION = 'predictionEntries';

// Generate a random 6-character join code for prediction pools
function generatePredictionJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a new prediction pool
export async function createPredictionPool(poolData) {
  return poolPrivacy.createPool('prediction', poolData);
}

// Get prediction pool by ID
export async function getPredictionPoolById(poolId) {
  const docRef = doc(db, PREDICTION_POOLS_COLLECTION, poolId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  
  const data = docSnap.data();
  const categories = poolPrivacy.parsePoolField(data.categories);
  if (!Array.isArray(categories) || !categories.length || categories.some(category => !category || typeof category.name !== 'string' || !Array.isArray(category.options) || category.options.some(option => typeof option !== 'string'))) throw new Error('This pool contains damaged categories. Please contact its host.');
  return poolPrivacy.hostInvite('prediction', {
    id: docSnap.id,
    ...data,
    categories,
    results: poolPrivacy.parsePoolField(data.results),
    lockDate: data.lockDate?.toDate?.() || null,
    createdAt: data.createdAt?.toDate?.() || null
  });
}

// Get prediction pool by join code
export async function getPredictionPoolByJoinCode(joinCode) {
  return poolPrivacy.resolveInvite('prediction', joinCode);
}

// Get prediction pools hosted by a user
export async function getUserHostedPredictionPools(userId) {
  const q = query(
    collection(db, PREDICTION_POOLS_COLLECTION),
    where('hostId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      categories: typeof data.categories === 'string' ? JSON.parse(data.categories) : data.categories,
      results: data.results ? (typeof data.results === 'string' ? JSON.parse(data.results) : data.results) : null,
      lockDate: data.lockDate?.toDate?.() || null,
      createdAt: data.createdAt?.toDate?.() || null
    };
  });
}

// Get prediction pools a user has joined
export async function getUserJoinedPredictionPools(userId) {
  const q = query(
    collection(db, PREDICTION_ENTRIES_COLLECTION),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  
  const poolIds = snapshot.docs.map(doc => doc.data().poolId);
  if (poolIds.length === 0) return [];
  
  const pools = await Promise.all(
    poolIds.map(async (poolId) => {
      const pool = await getPredictionPoolById(poolId);
      return pool;
    })
  );
  
  return pools.filter(p => p !== null);
}

// Join a prediction pool
export async function joinPredictionPool(poolId, userId, userDisplayName) {
  return poolPrivacy.joinPool('prediction', poolId);
}

// Get a user's prediction entry
export async function getPredictionEntry(poolId, userId) {
  return poolPrivacy.ownEntry('prediction', poolId);
}

// Submit predictions for a prediction pool
export async function submitPredictionPoolPredictions(poolId, userId, predictions) {
  const pool = await getPredictionPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  requirePredictionsOpen(pool);
  
  const entryRef = doc(db, PREDICTION_ENTRIES_COLLECTION, `${poolId}_${userId}`);
  await updateDoc(entryRef, {
    predictions: JSON.stringify(predictions),
    submittedAt: serverTimestamp()
  });
  
  return true;
}

// Lock the prediction pool
export async function lockPredictionPool(poolId, hostId) {
  const pool = await getPredictionPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can lock this pool');
  }
  
  const poolRef = doc(db, PREDICTION_POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    status: 'locked',
    updatedAt: serverTimestamp()
  });
  
  return true;
}

// Update prediction pool description
export async function updatePredictionPoolDescription(poolId, hostId, description) {
  const pool = await getPredictionPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can edit this pool');
  }
  
  const poolRef = doc(db, PREDICTION_POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    description: description,
    updatedAt: serverTimestamp()
  });
  
  return true;
}

// Start the prediction pool (begin entering results)
export async function startPredictionPool(poolId, hostId) {
  const pool = await getPredictionPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can start this pool');
  }
  
  // Initialize results as empty object
  const results = {};
  pool.categories.forEach((_, index) => {
    results[index] = null;
  });
  
  const poolRef = doc(db, PREDICTION_POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    status: 'in_progress',
    results: JSON.stringify(results),
    updatedAt: serverTimestamp()
  });
  
  return true;
}

// Update prediction pool results
export async function updatePredictionPoolResults(poolId, _hostId, results) { return callServer('managePredictionResults', { poolId, action: 'results', results }); }

// Get all entries for a prediction pool
export async function getPredictionPoolEntries(poolId, cursor = null) {
  return poolPrivacy.poolEntries('prediction', poolId, cursor);
}

// Complete the prediction pool
export async function completePredictionPool(poolId) { return callServer('managePredictionResults', { poolId, action: 'complete' }); }

// Delete a prediction pool
export async function deletePredictionPool(poolId, hostId) {
  return poolPrivacy.removePool('prediction', poolId);
}

export function subscribeWeeklyBracket(onChange, onError) {
  return onSnapshot(doc(db, WEEKLY_BRACKET_COLLECTION, 'current'), snap => {
    if (!snap.exists()) { onChange(null); return; }
    try {
      const data = snap.data();
      onChange({ ...data, matchups: typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups, votes: typeof data.votes === 'string' ? JSON.parse(data.votes) : data.votes || {}, startDate: data.startDate?.toDate?.() || new Date(data.startDate) });
    } catch { onError?.(new Error('Weekly bracket data could not be loaded.')); }
  }, onError);
}
