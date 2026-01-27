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
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

const BRACKETS_COLLECTION = 'brackets';
const SUBMISSIONS_COLLECTION = 'submissions';
const WEEKLY_BRACKET_COLLECTION = 'weeklyBracket';
const WEEKLY_VOTES_COLLECTION = 'weeklyVotes';

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
  
  // Determine winners for current round
  const currentRoundMatchups = matchups[currentRound];
  currentRoundMatchups.forEach((match, matchIndex) => {
    const matchVotes = votes[`r${currentRound}-m${matchIndex}`];
    if (matchVotes) {
      // Determine winner (entry1 wins ties)
      const winner = matchVotes.entry1 >= matchVotes.entry2 ? 1 : 2;
      match.winner = winner;
      
      // Advance winner to next round
      if (currentRound < matchups.length - 1) {
        const nextRoundMatchIndex = Math.floor(matchIndex / 2);
        const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
        const winningEntry = winner === 1 ? match.entry1 : match.entry2;
        matchups[currentRound + 1][nextRoundMatchIndex][entrySlot] = winningEntry;
      }
    }
  });
  
  // Update bracket
  await updateDoc(bracketRef, {
    matchups: JSON.stringify(matchups),
    currentRound: currentRound + 1,
    updatedAt: serverTimestamp()
  });
  
  return { matchups, currentRound: currentRound + 1 };
}

// Clear weekly bracket (admin)
export async function clearWeeklyBracket() {
  const bracketRef = doc(db, WEEKLY_BRACKET_COLLECTION, 'current');
  await deleteDoc(bracketRef);
  
  // Also clear all votes
  const votesSnapshot = await getDocs(collection(db, WEEKLY_VOTES_COLLECTION));
  const deletePromises = votesSnapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);
}
