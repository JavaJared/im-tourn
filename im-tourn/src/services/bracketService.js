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
  const submissionRef = doc(db, SUBMISSIONS_COLLECTION, submissionId);
  
  if (hasUpvoted) {
    // Remove upvote
    await updateDoc(submissionRef, {
      upvotes: increment(-1),
      upvotedBy: arrayRemove(userId)
    });
  } else {
    // Add upvote
    await updateDoc(submissionRef, {
      upvotes: increment(1),
      upvotedBy: arrayUnion(userId)
    });
  }
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
  const docRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  
  // First, archive the existing bracket if it has a champion
  const existingBracketSnap = await getDoc(docRef);
  if (existingBracketSnap.exists()) {
    const existingData = existingBracketSnap.data();
    const existingMatchups = typeof existingData.matchups === 'string' 
      ? JSON.parse(existingData.matchups) 
      : existingData.matchups;
    
    // Check if there's a final round with a winner
    const finalRound = existingMatchups[existingMatchups.length - 1];
    const finalMatch = finalRound?.[0];
    
    if (finalMatch?.winner) {
      const champion = finalMatch.winner === 1 ? finalMatch.entry1 : finalMatch.entry2;
      
      // Archive the bracket
      await addDoc(collection(db, WEEKLY_ARCHIVE_COLLECTION), {
        title: existingData.title,
        category: existingData.category,
        champion: champion ? { name: champion.name, seed: champion.seed } : null,
        startDate: existingData.startDate,
        archivedAt: serverTimestamp()
      });
    }
  }
  
  // Clear all existing votes from previous bracket
  const votesSnapshot = await getDocs(collection(db, WEEKLY_VOTES_COLLECTION));
  const deletePromises = votesSnapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);
  
  // Initialize votes structure for all matchups
  const votes = {};
  bracketData.matchups.forEach((round, roundIndex) => {
    round.forEach((match, matchIndex) => {
      votes[`r${roundIndex}-m${matchIndex}`] = { entry1: 0, entry2: 0 };
    });
  });
  
  // Get Monday of this week at midnight EST
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  
  const dataToSave = {
    ...bracketData,
    matchups: JSON.stringify(bracketData.matchups),
    votes: JSON.stringify(votes),
    startDate: monday,
    currentRound: 0,
    updatedAt: serverTimestamp()
  };
  
  await setDoc(docRef, dataToSave);
}

// Submit vote for weekly bracket
export async function submitWeeklyVote(userId, roundIndex, votes) {
  // Record individual user vote
  const voteDocRef = doc(db, WEEKLY_VOTES_COLLECTION, `${userId}_round${roundIndex}`);
  await setDoc(voteDocRef, {
    userId,
    roundIndex,
    votes: JSON.stringify(votes),
    submittedAt: serverTimestamp()
  });
  
  // Update vote tallies in weekly bracket
  const bracketRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  const bracketSnap = await getDoc(bracketRef);
  
  if (bracketSnap.exists()) {
    const data = bracketSnap.data();
    const currentVotes = typeof data.votes === 'string' ? JSON.parse(data.votes) : (data.votes || {});
    
    // Add votes
    Object.entries(votes).forEach(([matchId, selection]) => {
      if (currentVotes[matchId]) {
        if (selection === 1) {
          currentVotes[matchId].entry1 += 1;
        } else if (selection === 2) {
          currentVotes[matchId].entry2 += 1;
        }
      }
    });
    
    await updateDoc(bracketRef, {
      votes: JSON.stringify(currentVotes)
    });
  }
}

// Check if user has voted for a round
export async function hasUserVotedForRound(userId, roundIndex) {
  const voteDocRef = doc(db, WEEKLY_VOTES_COLLECTION, `${userId}_round${roundIndex}`);
  const docSnap = await getDoc(voteDocRef);
  return docSnap.exists();
}

// Get user's votes for a round
export async function getUserVotesForRound(userId, roundIndex) {
  const voteDocRef = doc(db, WEEKLY_VOTES_COLLECTION, `${userId}_round${roundIndex}`);
  const docSnap = await getDoc(voteDocRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    return typeof data.votes === 'string' ? JSON.parse(data.votes) : data.votes;
  }
  return null;
}

// Advance weekly bracket to next round (admin/automated)
export async function advanceWeeklyBracket() {
  const bracketRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  const bracketSnap = await getDoc(bracketRef);
  
  if (!bracketSnap.exists()) return null;
  
  const data = bracketSnap.data();
  const matchups = typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups;
  const votes = typeof data.votes === 'string' ? JSON.parse(data.votes) : data.votes;
  const currentRound = data.currentRound || 0;
  
  // Don't advance past the final round
  if (currentRound >= matchups.length - 1) return null;
  
  // Determine winners for current round
  const currentRoundMatchups = matchups[currentRound];
  currentRoundMatchups.forEach((match, matchIndex) => {
    const matchVotes = votes[`r${currentRound}-m${matchIndex}`];
    if (matchVotes && !match.winner) {
      // Determine winner (entry1 wins ties)
      const winner = matchVotes.entry1 >= matchVotes.entry2 ? 1 : 2;
      match.winner = winner;
    }
    
    // Advance winner to next round
    if (match.winner && currentRound < matchups.length - 1) {
      const nextRoundMatchIndex = Math.floor(matchIndex / 2);
      const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
      const winningEntry = match.winner === 1 ? match.entry1 : match.entry2;
      matchups[currentRound + 1][nextRoundMatchIndex][entrySlot] = winningEntry;
    }
  });
  
  // Update bracket
  await updateDoc(bracketRef, {
    matchups: JSON.stringify(matchups),
    currentRound: currentRound + 1,
    lastAdvanced: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return { matchups, currentRound: currentRound + 1 };
}

// Set manual winner for a specific matchup (admin only)
export async function setManualWinner(roundIndex, matchIndex, winner) {
  const bracketRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  const bracketSnap = await getDoc(bracketRef);
  
  if (!bracketSnap.exists()) return null;
  
  const data = bracketSnap.data();
  const matchups = typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups;
  
  // Set the winner
  matchups[roundIndex][matchIndex].winner = winner;
  
  // Propagate to next round if not final
  if (roundIndex < matchups.length - 1) {
    const nextRoundMatchIndex = Math.floor(matchIndex / 2);
    const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
    const winningEntry = winner === 1 
      ? matchups[roundIndex][matchIndex].entry1 
      : matchups[roundIndex][matchIndex].entry2;
    matchups[roundIndex + 1][nextRoundMatchIndex][entrySlot] = winningEntry;
  }
  
  await updateDoc(bracketRef, {
    matchups: JSON.stringify(matchups),
    updatedAt: serverTimestamp()
  });
  
  return matchups;
}

// Check if bracket should auto-advance based on time
export async function checkAndAutoAdvance() {
  const bracketRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  const bracketSnap = await getDoc(bracketRef);
  
  if (!bracketSnap.exists()) return null;
  
  const data = bracketSnap.data();
  const currentRound = data.currentRound || 0;
  const matchups = typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups;
  
  // Don't advance past final round
  if (currentRound >= matchups.length - 1) return null;
  
  // Get current time in EST
  const now = new Date();
  const estOffset = -5; // EST is UTC-5 (ignoring DST for simplicity)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const estTime = new Date(utc + (3600000 * estOffset));
  
  // Get day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = estTime.getDay();
  
  // Map days to expected rounds
  // Monday = round 0, Tuesday = round 1, etc.
  const dayToExpectedRound = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4, 0: 4 };
  const expectedRound = dayToExpectedRound[dayOfWeek] ?? 0;
  
  // If we're behind, advance
  if (currentRound < expectedRound) {
    // Advance all missed rounds
    let advancedMatchups = matchups;
    for (let r = currentRound; r < expectedRound; r++) {
      const votes = typeof data.votes === 'string' ? JSON.parse(data.votes) : data.votes;
      
      // Set winners for this round
      advancedMatchups[r].forEach((match, matchIndex) => {
        if (!match.winner) {
          const matchVotes = votes[`r${r}-m${matchIndex}`];
          // Default to entry1 if no votes or tie
          const winner = (matchVotes && matchVotes.entry2 > matchVotes.entry1) ? 2 : 1;
          match.winner = winner;
        }
        
        // Propagate to next round
        if (r < advancedMatchups.length - 1) {
          const nextRoundMatchIndex = Math.floor(matchIndex / 2);
          const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
          const winningEntry = match.winner === 1 ? match.entry1 : match.entry2;
          advancedMatchups[r + 1][nextRoundMatchIndex][entrySlot] = winningEntry;
        }
      });
    }
    
    await updateDoc(bracketRef, {
      matchups: JSON.stringify(advancedMatchups),
      currentRound: expectedRound,
      lastAdvanced: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { matchups: advancedMatchups, currentRound: expectedRound, autoAdvanced: true };
  }
  
  return null;
}

// Clear weekly bracket (admin) - archives before clearing
export async function clearWeeklyBracket() {
  const bracketRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  const bracketSnap = await getDoc(bracketRef);
  
  // Archive the bracket if it has a champion
  if (bracketSnap.exists()) {
    const data = bracketSnap.data();
    const matchups = typeof data.matchups === 'string' ? JSON.parse(data.matchups) : data.matchups;
    const finalRound = matchups[matchups.length - 1];
    const finalMatch = finalRound?.[0];
    
    let champion = null;
    if (finalMatch?.winner) {
      champion = finalMatch.winner === 1 ? finalMatch.entry1 : finalMatch.entry2;
    }
    
    await addDoc(collection(db, WEEKLY_ARCHIVE_COLLECTION), {
      title: data.title,
      category: data.category,
      champion: champion ? { name: champion.name, seed: champion.seed } : null,
      startDate: data.startDate,
      archivedAt: serverTimestamp()
    });
  }
  
  await deleteDoc(bracketRef);
  
  // Also clear all votes
  const votesSnapshot = await getDocs(collection(db, WEEKLY_VOTES_COLLECTION));
  const deletePromises = votesSnapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);
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
  const joinCode = generateJoinCode();
  
  const docRef = await addDoc(collection(db, POOLS_COLLECTION), {
    ...poolData,
    joinCode,
    bracketMatchups: JSON.stringify(poolData.bracketMatchups),
    results: null, // Will store host's results as matchups progress
    status: 'open', // open, locked, in_progress, completed
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return { id: docRef.id, joinCode };
}

// Get pool by ID
export async function getPoolById(poolId) {
  const docRef = doc(db, POOLS_COLLECTION, poolId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    bracketMatchups: typeof data.bracketMatchups === 'string' ? JSON.parse(data.bracketMatchups) : data.bracketMatchups,
    results: data.results ? (typeof data.results === 'string' ? JSON.parse(data.results) : data.results) : null,
    lockDate: data.lockDate?.toDate?.() || null,
    createdAt: data.createdAt?.toDate?.() || null
  };
}

// Get pool by join code
export async function getPoolByJoinCode(joinCode) {
  const q = query(
    collection(db, POOLS_COLLECTION),
    where('joinCode', '==', joinCode.toUpperCase())
  );
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    bracketMatchups: typeof data.bracketMatchups === 'string' ? JSON.parse(data.bracketMatchups) : data.bracketMatchups,
    results: data.results ? (typeof data.results === 'string' ? JSON.parse(data.results) : data.results) : null,
    lockDate: data.lockDate?.toDate?.() || null,
    createdAt: data.createdAt?.toDate?.() || null
  };
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
  // Check if user already joined
  const existingEntry = await getPoolEntry(poolId, userId);
  if (existingEntry) {
    throw new Error('You have already joined this pool');
  }
  
  // Check if pool is still open
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.status !== 'open') {
    throw new Error('This pool is no longer accepting entries');
  }
  
  // Create entry
  const entryRef = doc(db, POOL_ENTRIES_COLLECTION, `${poolId}_${userId}`);
  await setDoc(entryRef, {
    poolId,
    userId,
    userDisplayName,
    predictions: null, // Will be filled when user submits predictions
    score: 0,
    joinedAt: serverTimestamp(),
    submittedAt: null
  });
  
  return true;
}

// Get a user's pool entry
export async function getPoolEntry(poolId, userId) {
  const entryRef = doc(db, POOL_ENTRIES_COLLECTION, `${poolId}_${userId}`);
  const docSnap = await getDoc(entryRef);
  
  if (!docSnap.exists()) return null;
  
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    predictions: data.predictions ? (typeof data.predictions === 'string' ? JSON.parse(data.predictions) : data.predictions) : null,
    joinedAt: data.joinedAt?.toDate?.() || null,
    submittedAt: data.submittedAt?.toDate?.() || null
  };
}

// Submit predictions for a pool
export async function submitPoolPredictions(poolId, userId, predictions, champion, sleeperPicks = null) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.status !== 'open') {
    throw new Error('This pool is no longer accepting predictions');
  }
  
  const entryRef = doc(db, POOL_ENTRIES_COLLECTION, `${poolId}_${userId}`);
  const updateData = {
    predictions: JSON.stringify(predictions),
    champion,
    submittedAt: serverTimestamp()
  };
  
  // Add sleeper picks if provided
  if (sleeperPicks) {
    updateData.sleeper1 = sleeperPicks.sleeper1 ? JSON.stringify(sleeperPicks.sleeper1) : null;
    updateData.sleeper2 = sleeperPicks.sleeper2 ? JSON.stringify(sleeperPicks.sleeper2) : null;
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

// Calculate score for a single entry
function calculateEntryScore(predictions, results, pool, entry) {
  let score = 0;
  const roundPoints = pool.roundPoints || [1, 2, 4, 8, 16, 32];
  
  // Calculate regular matchup scores
  results.forEach((round, roundIndex) => {
    const pointsForRound = roundPoints[roundIndex] || Math.pow(2, roundIndex);
    
    round.forEach((match, matchIndex) => {
      if (match.winner) {
        const predictionMatch = predictions[roundIndex]?.[matchIndex];
        if (predictionMatch?.winner === match.winner) {
          score += pointsForRound;
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

// Get all entries for a pool (leaderboard)
export async function getPoolEntries(poolId) {
  const q = query(
    collection(db, POOL_ENTRIES_COLLECTION),
    where('poolId', '==', poolId)
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      predictions: data.predictions ? (typeof data.predictions === 'string' ? JSON.parse(data.predictions) : data.predictions) : null,
      sleeper1: data.sleeper1 ? (typeof data.sleeper1 === 'string' ? JSON.parse(data.sleeper1) : data.sleeper1) : null,
      sleeper2: data.sleeper2 ? (typeof data.sleeper2 === 'string' ? JSON.parse(data.sleeper2) : data.sleeper2) : null,
      sleeper1Hit: data.sleeper1Hit || false,
      sleeper2Hit: data.sleeper2Hit || false,
      joinedAt: data.joinedAt?.toDate?.() || null,
      submittedAt: data.submittedAt?.toDate?.() || null
    };
  }).sort((a, b) => b.score - a.score); // Sort by score descending
}

// Complete the pool (declare winner)
export async function completePool(poolId, hostId) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can complete this pool');
  }
  
  // Get the winner (highest score)
  const entries = await getPoolEntries(poolId);
  const winner = entries.length > 0 ? entries[0] : null;
  
  const poolRef = doc(db, POOLS_COLLECTION, poolId);
  await updateDoc(poolRef, {
    status: 'completed',
    winnerId: winner?.userId || null,
    winnerName: winner?.userDisplayName || null,
    winnerScore: winner?.score || 0,
    updatedAt: serverTimestamp()
  });
  
  return { winner };
}

// Delete a pool (host only)
export async function deletePool(poolId, hostId) {
  const pool = await getPoolById(poolId);
  if (!pool) {
    throw new Error('Pool not found');
  }
  if (pool.hostId !== hostId) {
    throw new Error('Only the host can delete this pool');
  }
  
  // Delete all entries
  const entries = await getPoolEntries(poolId);
  const deleteEntryPromises = entries.map(entry => 
    deleteDoc(doc(db, POOL_ENTRIES_COLLECTION, `${poolId}_${entry.userId}`))
  );
  await Promise.all(deleteEntryPromises);
  
  // Delete the pool
  await deleteDoc(doc(db, POOLS_COLLECTION, poolId));
  
  return true;
}
