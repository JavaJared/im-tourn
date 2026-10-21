import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

// Recheck the live record: another tab may have published it since the list loaded.
export async function deleteBracketDraft(bracketId, userId) {
  if (!userId) throw new Error('Sign in to delete your draft.');
  const reference = doc(db, 'customBrackets', bracketId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const draft = snapshot.data();
    if (draft.hostId !== userId) throw new Error('Only the owner can delete this draft.');
    if (draft.status !== 'draft') throw new Error('This bracket is no longer a draft. Refresh your activities.');
    if (draft.resetting) throw new Error('Finish the bracket reset before deleting this draft.');
    // A revision draft is independent of its published original until reset begins.
    transaction.delete(reference);
  });
}
