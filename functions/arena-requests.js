const { onCall } = require('firebase-functions/v2/https');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
const { fail, requireAdmin, uid, id, text, debateInput, newRoom } = require('./arena-shared');
const db = () => getFirestore();

exports.requestGoatDebate = onCall(async req => {
  const userId = uid(req), data = req.data || {}, input = debateInput(data, 5);
  const key = createHash('sha256').update(`${userId}:${id(data.requestId)}`).digest('hex');
  const ref = db().doc(`goatDebateRequests/${key}`), account = db().doc(`goatAccounts/${userId}`);
  return db().runTransaction(async tx => {
    const [existing, accountSnap] = await tx.getAll(ref, account);
    if (existing.exists) return { id: key, status: existing.data().status };
    const state = accountSnap.data() || {};
    if (state.restricted) fail('permission-denied', 'Your debate participation is restricted pending review.');
    if ((state.pendingDebateRequests || 0) >= 3) fail('resource-exhausted', 'You already have three requests awaiting review.');
    tx.set(ref, { ...input, userId, status: 'pending', createdAt: Date.now() });
    tx.set(account, { pendingDebateRequests: (state.pendingDebateRequests || 0) + 1 }, { merge: true });
    return { id: key, status: 'pending' };
  });
});

exports.listGoatDebateRequests = onCall(async req => {
  const userId = uid(req), data = req.data || {};
  if (data.queue) requireAdmin(req);
  let query = db().collection('goatDebateRequests')
    .where(data.queue ? 'status' : 'userId', '==', data.queue ? 'pending' : userId)
    .orderBy(FieldPath.documentId());
  if (data.cursor) query = query.startAfter(id(data.cursor));
  const snap = await query.limit(21).get(), visible = snap.docs.slice(0, 20);
  return { items: visible.map(s => {
    const r = s.data();
    return { id: s.id, title: r.title, candidates: r.candidates, userId: r.userId, createdAt: r.createdAt, status: r.status, reason: r.reason || '', roomId: r.roomId || null };
  }), nextCursor: snap.size > 20 ? visible.at(-1).id : null };
});

exports.reviewGoatDebateRequest = onCall(async req => {
  requireAdmin(req);
  const data = req.data || {};
  if (!['approve', 'reject'].includes(data.action)) fail('invalid-argument', 'Choose approve or reject.');
  const ref = db().doc(`goatDebateRequests/${id(data.id)}`);
  const reason = data.action === 'reject' && data.reason ? text(data.reason, 300) : '';
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'Request not found.');
    const request = snap.data(), status = data.action === 'approve' ? 'approved' : 'rejected';
    if (request.status !== 'pending') {
      if (request.status !== status) fail('failed-precondition', 'This request has already been reviewed.');
      return { status, roomId: request.roomId || null };
    }
    const account = db().doc(`goatAccounts/${request.userId}`), accountSnap = await tx.get(account);
    const now = Date.now(), roomId = status === 'approved' ? `request_${ref.id}` : null;
    if (roomId) {
      const input = debateInput({ title: request.title, candidates: request.candidates.map(c => c.name) }, 5);
      tx.create(db().doc(`goatDebates/${roomId}`), newRoom(input, req.auth.uid, now));
    }
    tx.update(ref, { status, roomId, reason, reviewedAt: now, reviewerId: req.auth.uid });
    tx.set(account, { pendingDebateRequests: Math.max(0, (accountSnap.data()?.pendingDebateRequests || 0) - 1) }, { merge: true });
    return { status, roomId };
  });
});
