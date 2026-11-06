const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const S = require('./generated/scoring.cjs');
const { parse, poolLeaderboard } = require('./api').internal;
const validId = value => typeof value === 'string' && /^[\w-]{1,200}$/.test(value);

exports.removePoolParticipant = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const { poolId, userId } = req.data || {};
  if (!validId(poolId) || !validId(userId)) throw new HttpsError('invalid-argument', 'Invalid pool or participant.');
  const db = getFirestore(), ref = db.doc(`bracketPools/${poolId}`);
  const entryRef = db.doc(`poolEntries/${poolId}_${userId}`);
  const removalRef = ref.collection('removedParticipants').doc(userId);
  return db.runTransaction(async tx => {
    const [snapshot, entry, removal] = await Promise.all([tx.get(ref), tx.get(entryRef), tx.get(removalRef)]);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Pool not found.');
    const raw = snapshot.data();
    if (raw.hostId !== req.auth.uid) throw new HttpsError('permission-denied', 'Only the host can remove participants.');
    if (userId === raw.hostId) throw new HttpsError('failed-precondition', 'Hosts cannot remove themselves.');
    if (removal.exists) return { removed: true }; // Safe retry, including after completion.
    if (!['open', 'locked', 'in_progress', 'completed'].includes(raw.status)) throw new HttpsError('failed-precondition', 'This pool is unavailable.');
    if (!entry.exists) throw new HttpsError('not-found', 'This participant is no longer in the pool.');
    if (entry.data().poolId !== poolId || entry.data().userId !== userId) throw new HttpsError('failed-precondition', 'Participant data is inconsistent.');
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    let board = [];
    if (raw.status === 'completed') {
      const entries = await tx.get(db.collection('poolEntries').where('poolId', '==', poolId));
      const pool = S.adaptLegacyPool({ ...raw, bracketMatchups: parse(raw.bracketMatchups), results: parse(raw.results) });
      const state = S.hydrateState(pool.bracketMatchups, pool.customResults || {});
      if (!S.isEntryComplete(state) || !S.getChampion(state)) throw new HttpsError('failed-precondition', 'Official results are incomplete. Correct them before removing a participant from this completed pool.');
      board = poolLeaderboard(poolId, pool, state, entries.docs.filter(doc => doc.id !== entryRef.id));
      const winners = board.filter(entry => entry.total === board[0]?.total);
      Object.assign(updates, { winnerId: winners[0]?.userId || null, winnerIds: winners.map(entry => entry.userId),
        winnerName: winners.map(entry => entry.displayName || 'Anonymous').join(' & ') || null, winnerScore: winners[0]?.total || 0 });
    }
    // Reading and updating the pool serializes removal with joins, completion
    // and result recording. A concurrent pick update cannot recreate the entry.
    tx.create(removalRef, { userId, removedBy: req.auth.uid, removedAt: FieldValue.serverTimestamp() });
    tx.delete(entryRef);
    for (const entry of board) tx.update(db.doc(`poolEntries/${entry.id}`), { score: entry.total, sleeper1Hit: entry.sleeper1Hit, sleeper2Hit: entry.sleeper2Hit });
    tx.update(ref, updates);
    return { removed: true };
  });
});
