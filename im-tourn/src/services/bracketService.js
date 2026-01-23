// src/services/bracketService.js
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  doc, 
  deleteDoc, 
  updateDoc,
  query, 
  orderBy, 
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

const BRACKETS_COLLECTION = 'brackets';
const SUBMISSIONS_COLLECTION = 'submissions';

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
