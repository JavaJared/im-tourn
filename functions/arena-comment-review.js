const { getFirestore } = require('firebase-admin/firestore');
const { randomUUID } = require('node:crypto');
const moderation = require('./arena-moderation');
const publicComment = c => ({ body: c.body, userId: c.userId, createdAt: c.createdAt, round: c.round });
async function reviewComment(roomRef, commentId, force = false) {
  const db = getFirestore(), ref = roomRef.collection('reviewQueue').doc(commentId), lease = randomUUID();
  const comment = await db.runTransaction(async tx => {
    const snap = await tx.get(ref), c = snap.data();
    if (!c || c.leaseUntil > Date.now() || (!force && c.moderation)) return null;
    tx.update(ref, { lease, leaseUntil: Date.now() + 30000 });
    return c;
  });
  if (!comment) return;
  const result = await moderation.classify(comment.body);
  await db.runTransaction(async tx => {
    const [snap, account] = await tx.getAll(ref, db.doc(`goatAccounts/${comment.userId}`));
    const current = snap.data();
    // A manual decision or another worker always wins over a stale response.
    if (!current || current.lease !== lease) return;
    const final = account.data()?.restricted ? { status: 'pending', reason: 'account-restricted' } : result;
    if (final.status === 'approved') {
      tx.set(roomRef.collection('comments').doc(commentId), publicComment(current));
      tx.delete(ref);
    } else tx.update(ref, { moderation: final, leaseUntil: 0 });
    if (current.receiptId) tx.set(roomRef.collection('receipts').doc(current.receiptId), { result: { status: final.status, commentId } }, { merge: true });
    tx.set(roomRef.collection('moderationLog').doc(), { action: 'automated-review', commentId, userId: current.userId, ...final, createdAt: Date.now() });
  });
}
module.exports = { reviewComment, publicComment };
