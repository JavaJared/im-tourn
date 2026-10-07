const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { randomInt, createHash } = require('node:crypto');
const { DAY, canonical, balance, settle } = require('./arena-core');
const db = () => getFirestore();
const fail = (code, message) => { throw new HttpsError(code, message); };
const admin = req => req.auth && (req.auth.token?.admin === true || req.auth.uid === 'VBbDwj6gkVgW7gBcs3vTmt0ulLF2');
function requireAdmin(req) { if (!admin(req)) fail('permission-denied', 'Administrator access required.'); }
function uid(req) { if (!req.auth) fail('unauthenticated', 'Sign in to participate.'); return req.auth.uid; }
function id(value) { if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value)) fail('invalid-argument', 'Invalid identifier.'); return value; }
function text(value, max) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail('invalid-argument', `Enter between 1 and ${max} characters.`); return value.trim(); }
function publicRoom(snap) { const r = snap.data(); return { id: snap.id, ...r }; }
async function advance(ref) {
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref), room = snap.data(), now = Date.now();
    if (!room || room.status !== 'active' || room.endAt > now) return;
    const { next, history } = settle(room, now, randomInt);
    tx.set(ref.collection('history').doc(String(room.round).padStart(8, '0')), history);
    tx.set(ref, next);
  });
}
async function page(query, cursor, collection = null) {
  if (cursor) {
    if (collection) {
      const boundary = await collection.doc(id(cursor)).get();
      if (!boundary.exists) fail('failed-precondition', 'This page changed. Refresh to continue.');
      query = query.startAfter(boundary);
    } else query = query.startAfter(id(cursor));
  }
  const rows = await query.limit(31).get(), visible = rows.docs.slice(0, 30);
  return { items: visible.map(s => ({ id: s.id, ...s.data() })), nextCursor: rows.size > 30 ? visible.at(-1).id : null };
}
exports.listGoatDebates = onCall(async req => {
  const result = await page(db().collection('goatDebates').orderBy(FieldPath.documentId()), req.data?.cursor);
  return { ...result, isAdmin: !!admin(req) };
});
exports.getGoatDebate = onCall(async req => {
  const ref = db().doc(`goatDebates/${id(req.data?.roomId)}`);
  await advance(ref);
  const snap = await ref.get(); if (!snap.exists) fail('not-found', 'Debate not found.');
  const room = publicRoom(snap);
  let personal = null;
  if (req.auth) {
    const [wallet, ballot, nomination] = await db().getAll(db().doc(`goatAccounts/${req.auth.uid}`), ref.collection('ballots').doc(`${room.round}_${req.auth.uid}`), ref.collection('supporters').doc(`${room.round}_${req.auth.uid}`));
    personal = { credits: balance(wallet.data(), Date.now()), vote: ballot.data()?.candidateId || null, nomination: nomination.data()?.candidateId || null, restricted: !!wallet.data()?.restricted };
  }
  return { room, personal, isAdmin: !!admin(req), serverNow: Date.now() };
});
exports.listGoatDiscussion = onCall(async req => {
  const ref = db().doc(`goatDebates/${id(req.data?.roomId)}`);
  const collection = ref.collection(req.data?.history ? 'history' : 'comments');
  return page(collection.orderBy(req.data?.history ? 'round' : 'createdAt', 'desc'), req.data?.cursor, collection);
});
// All credit spending, participation limits, and retries share one transaction.
exports.actOnGoatDebate = onCall(async req => {
  const user = uid(req), data = req.data || {}, action = data.action;
  if (!['vote', 'nominate', 'comment'].includes(action)) fail('invalid-argument', 'Unknown action.');
  const ref = db().doc(`goatDebates/${id(data.roomId)}`), requestId = id(data.requestId);
  const receipt = ref.collection('receipts').doc(createHash('sha256').update(`${user}:${requestId}`).digest('hex'));
  const body = action === 'comment' ? text(data.body, 1000) : null;
  return db().runTransaction(async tx => {
    const accountRef = db().doc(`goatAccounts/${user}`);
    const [snap, walletSnap, previous] = await tx.getAll(ref, accountRef, receipt);
    if (previous.exists) return previous.data().result;
    const room = snap.data(), wallet = walletSnap.data(), now = Date.now();
    if (!room) fail('not-found', 'Debate not found.');
    if (wallet?.restricted) fail('permission-denied', 'Your debate participation is restricted pending review. Use the site feedback form to appeal.');
    if (room.status !== 'active' || room.endAt <= now || data.round !== room.round) fail('failed-precondition', 'This matchup has ended or is paused. Refresh the debate.');
    const cost = action === 'vote' ? 0 : action === 'nominate' ? 2 : 1;
    const credits = balance(wallet, now);
    if (credits < cost) fail('resource-exhausted', 'Not enough credits. Your 10 daily credits reset at midnight UTC.');
    let result = { credits: credits - cost };
    if (action === 'vote' || action === 'nominate') {
      const candidateId = id(data.candidateId);
      if (!room.candidates.some(c => c.id === candidateId)) fail('invalid-argument', 'Choose an existing candidate.');
      const voting = action === 'vote';
      if (voting ? !room.matchup.includes(candidateId) : room.matchup.includes(candidateId) || room.round - (room.lastPlayed[candidateId] ?? -99) < 2) fail('failed-precondition', 'This candidate is not eligible for this action.');
      const record = ref.collection(voting ? 'ballots' : 'supporters').doc(`${room.round}_${user}`);
      if ((await tx.get(record)).exists) fail('already-exists', voting ? 'You have already voted today.' : 'You have already supported a challenger today.');
      const field = voting ? 'votes' : 'nominations';
      tx.update(ref, { [field]: { ...room[field], [candidateId]: (room[field][candidateId] || 0) + 1 } });
      tx.set(record, { candidateId, createdAt: now });
    } else {
      if (wallet?.commentAt > now - 10000) fail('resource-exhausted', 'Wait a few seconds before commenting again.');
      // Fail closed: unreviewed content never enters the public comments collection.
      const commentId = `${String(now).padStart(13, '0')}_${receipt.id}`;
      tx.set(ref.collection('reviewQueue').doc(commentId), { body, userId: user, createdAt: now, round: room.round });
      result = { ...result, status: 'pending', commentId };
    }
    tx.set(accountRef, { day: new Date(now).toISOString().slice(0, 10), balance: credits - cost, ...(body ? { commentAt: now } : {}) }, { merge: true });
    tx.set(receipt, { result });
    return result;
  });
});
exports.createGoatDebate = onCall(async req => {
  requireAdmin(req); const user = uid(req), data = req.data || {};
  const title = text(data.title, 100);
  if (!Array.isArray(data.candidates) || data.candidates.length < 4 || data.candidates.length > 50) fail('invalid-argument', 'Supply 4–50 candidates, with the opening pair first.');
  const candidates = data.candidates.map((name, i) => ({ id: `c${i + 1}`, name: text(name, 80) }));
  if (new Set(candidates.map(c => canonical(c.name))).size !== candidates.length) fail('invalid-argument', 'Candidate names must be unique.');
  const key = createHash('sha256').update(`${user}:${id(data.requestId)}`).digest('hex');
  const ref = db().doc(`goatDebates/${key}`), account = db().doc(`goatAccounts/${user}`);
  return db().runTransaction(async tx => {
    const [existing, wallet] = await tx.getAll(ref, account), now = Date.now();
    if (existing.exists) return { id: ref.id };
    if (wallet.data()?.restricted) fail('permission-denied', 'Account restricted.');
    const credits = balance(wallet.data(), now); if (credits < 5) fail('resource-exhausted', 'Creating a debate costs 5 credits.');
    tx.set(ref, { title, candidates, creatorId: user, createdAt: now, round: 1, matchup: ['c1', 'c2'], defender: null, votes: {}, nominations: {}, stats: {}, lastPlayed: { c1: 1, c2: 1 }, status: 'active', endAt: now + DAY, pauseReason: '' });
    tx.set(account, { day: new Date(now).toISOString().slice(0, 10), balance: credits - 5 }, { merge: true });
    return { id: ref.id };
  });
});
exports.manageGoatDebate = onCall(async req => {
  requireAdmin(req); const data = req.data || {}, ref = db().doc(`goatDebates/${id(data.roomId)}`);
  if (data.action === 'queue') return page(ref.collection('reviewQueue').orderBy(FieldPath.documentId()), data.cursor);
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) fail('not-found', 'Debate not found.');
    const room = snap.data();
    if (data.action === 'pause') tx.update(ref, { status: 'paused', endAt: null, pauseReason: 'Paused by an administrator.' });
    else if (data.action === 'resume') {
      if (room.status === 'active') return { ok: true };
      if (room.matchup.length !== 2) fail('failed-precondition', 'Add a challenger before resuming.');
      tx.update(ref, { status: 'active', endAt: Date.now() + DAY, pauseReason: '' });
    } else if (data.action === 'candidate') {
      const name = text(data.name, 80);
      if (room.candidates.length >= 100 || room.candidates.some(c => canonical(c.name) === canonical(name))) fail('invalid-argument', 'Duplicate candidate or 100-candidate limit reached.');
      const candidate = { id: `c${room.candidates.length + 1}`, name };
      const patch = { candidates: [...room.candidates, candidate] };
      if (room.matchup.length === 1) { patch.matchup = [...room.matchup, candidate.id]; patch.lastPlayed = { ...room.lastPlayed, [candidate.id]: room.round }; }
      tx.update(ref, patch);
    } else if (['approve', 'remove', 'restrict'].includes(data.action)) {
      const commentId = id(data.commentId), pending = ref.collection('reviewQueue').doc(commentId), visible = ref.collection('comments').doc(commentId);
      const [queued, published] = await tx.getAll(pending, visible), comment = queued.data() || published.data();
      if (!comment) return { ok: true };
      if (data.action === 'approve') tx.set(visible, comment); else tx.delete(visible);
      tx.delete(pending);
      if (data.action === 'restrict') tx.set(db().doc(`goatAccounts/${comment.userId}`), { restricted: true }, { merge: true });
      tx.set(ref.collection('moderationLog').doc(), { action: data.action, moderatorId: req.auth.uid, commentId, userId: comment.userId, createdAt: Date.now() });
    } else if (data.action === 'restore') {
      tx.set(db().doc(`goatAccounts/${id(data.userId)}`), { restricted: false }, { merge: true });
      tx.set(ref.collection('moderationLog').doc(), { action: 'restore', moderatorId: req.auth.uid, userId: data.userId, createdAt: Date.now() });
    } else fail('invalid-argument', 'Unknown action.');
    return { ok: true };
  });
});
exports.advanceGoatDebates = onSchedule('every 5 minutes', async () => {
  const due = await db().collection('goatDebates').where('endAt', '>', 0).where('endAt', '<=', Date.now()).limit(50).get();
  for (const doc of due.docs) await advance(doc.ref);
});
exports.internal = { advance };
