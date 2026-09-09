import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
export async function submitFeedback({ type, subject, description, email }) {
  if (!auth.currentUser) throw new Error('Please log in before sending feedback. Your message will stay here.');
  await addDoc(collection(db, 'feedback'), { userId: auth.currentUser.uid, type, subject: subject.trim(), description: description.trim(), email: email.trim(), createdAt: serverTimestamp() });
}
