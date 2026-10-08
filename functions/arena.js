const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { randomInt, createHash } = require('node:crypto');
const { SCHEDULE_VERSION, nextEasternMidnight, alignSchedule, canonical, settle, eligibilityReason, restoreEligibility } = require('./arena-core');
const { reviewComment, publicComment } = require('./arena-comment-review');
const moderation = require('./arena-moderation');
const db = () => getFirestore();
const { fail, admin, requireAdmin, uid, id, text, debateInput, newRoom } = require('./arena-shared');
function publicRoom(snap) {
  const r = snap.data();
  const candidates = r.candidates.filter(c => !c.status || c.status === 'approved');
  const visibleIds = new Set(candidates.map(c => c.id));
  return { id: snap.id, ...r, candidates, nominations: Object.fromEntries(Object.entries(r.nominations).filter(([id]) => visibleIds.has(id))), eligibility: Object.fromEntries(candidates.map(c => [c.id, eligibilityReason(r, c)])) };
}
async function advance(ref) {
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref), room = snap.data(), now = Date.now();
    if (!room) return;
    // One-time upgrade: existing results also enforce the chair-change rule.
    if (!room.lossEpoch) {
      const history = await tx.get(ref.collection('history').orderBy('round'));
      Object.assign(room, restoreEligibility(history.docs.map(d => d.data())));
      tx.update(ref, { chairEpoch: room.chairEpoch, lossEpoch: room.lossEpoch });
    }
    const schedule = alignSchedule(room, now);
    if (Object.keys(schedule).length) { Object.assign(room, schedule); tx.update(ref, schedule); }
    if (room.status !== 'active' || room.endAt > now) return;
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
  return { ...result, items: result.items.map(r => publicRoom({ id: r.id, data: () => r })), isAdmin: !!admin(req) };
});
exports.getGoatDebate = onCall(async req => {
  const ref = db().doc(`goatDebates/${id(req.data?.roomId)}`);
  await advance(ref);
  const snap = await ref.get(); if (!snap.exists) fail('not-found', 'Debate not found.');
  const room = publicRoom(snap);
  let personal = null;
  if (req.auth) {
    const [wallet, ballot, nomination] = await db().getAll(db().doc(`goatAccounts/${req.auth.uid}`), ref.collection('ballots').doc(`${room.round}_${req.auth.uid}`), ref.collection('supporters').doc(`${room.round}_${req.auth.uid}`));
    const nominated = snap.data().candidates.find(c => c.id === nomination.data()?.candidateId);
    personal = { nominationName: nominated?.name || null, nominationStatus: nominated?.status || 'approved', vote: ballot.data()?.candidateId || null, nomination: nomination.data()?.candidateId || null, restricted: !!wallet.data()?.restricted };
  }
  return { room, personal, isAdmin: !!admin(req), serverNow: Date.now() };
});
exports.listGoatDiscussion = onCall(async req => {
  const ref = db().doc(`goatDebates/${id(req.data?.roomId)}`);
  const collection = ref.collection(req.data?.history ? 'history' : 'comments');
  return page(collection.orderBy(req.data?.history ? 'round' : 'createdAt', 'desc'), req.data?.cursor, collection);
});
// Participation limits and retry receipts are enforced transactionally.
exports.actOnGoatDebate = onCall(async req => {
  const user = uid(req), data = req.data || {}, action = data.action;
  if (!['vote', 'nominate', 'comment'].includes(action)) fail('invalid-argument', 'Unknown action.');
  const ref = db().doc(`goatDebates/${id(data.roomId)}`), requestId = id(data.requestId);
  const receipt = ref.collection('receipts').doc(createHash('sha256').update(`${user}:${requestId}`).digest('hex'));
  await advance(ref);
  const body = action === 'comment' ? text(data.body, 1000) : null;
  const result = await db().runTransaction(async tx => {
    const accountRef = db().doc(`goatAccounts/${user}`);
    const [snap, walletSnap, previous] = await tx.getAll(ref, accountRef, receipt);
    if (previous.exists) return previous.data().result;
    const room = snap.data(), wallet = walletSnap.data(), now = Date.now();
    if (!room) fail('not-found', 'Debate not found.');
    if (wallet?.restricted) fail('permission-denied', 'Your debate participation is restricted pending review. Use the site feedback form to appeal.');
    const waitingForChallenger = action === 'nominate' && room.status === 'paused' && room.matchup.length === 1;
    if ((!waitingForChallenger && (room.status !== 'active' || room.endAt <= now)) || data.round !== room.round) fail('failed-precondition', 'This matchup has ended or is paused. Refresh the debate.');
    let result = { ok: true };
    if (action === 'vote' || action === 'nominate') {
      const voting = action === 'vote';
      let candidate, added = false;
      if (!voting && data.name !== undefined) {
        const name = text(data.name, 80).normalize('NFKC').replace(/\p{Cf}/gu, '').trim().replace(/\s+/g, ' ');
        if (!canonical(name) || name.length > 80) fail('invalid-argument', 'Enter a candidate name.');
        candidate = room.candidates.find(c => canonical(c.name) === canonical(name));
        if (!candidate) {
          if (room.candidates.length >= 100) fail('resource-exhausted', 'This room has reached its candidate limit. Support an existing candidate.');
          candidate = { id: `c${room.candidates.length + 1}`, name, status: 'pending' };
          added = true;
        }
      } else candidate = room.candidates.find(c => c.id === id(data.candidateId));
      if (!candidate) fail('invalid-argument', 'Choose an existing candidate.');
      const candidateId = candidate.id;
      const reason = voting ? (!room.matchup.includes(candidateId) ? 'Choose a participant in the current matchup.' : '') : eligibilityReason(room, candidate, true);
      if (reason) fail('failed-precondition', reason);
      const record = ref.collection(voting ? 'ballots' : 'supporters').doc(`${room.round}_${user}`);
      if ((await tx.get(record)).exists) fail('already-exists', voting ? 'You have already voted today.' : 'You have already nominated or supported a challenger in this matchup.');
      const field = voting ? 'votes' : 'nominations';
      tx.update(ref, { [field]: { ...room[field], [candidateId]: (room[field][candidateId] || 0) + 1 }, ...(added ? { candidates: [...room.candidates, candidate] } : {}) });
      tx.set(record, { candidateId, createdAt: now });
      result = { ...result, candidateId, status: candidate.status || 'approved' };
    } else {
      if (wallet?.commentAt > now - 10000) fail('resource-exhausted', 'Wait a few seconds before commenting again.');
      // Fail closed: unreviewed content never enters the public comments collection.
      const commentId = `${String(now).padStart(13, '0')}_${receipt.id}`;
      tx.set(ref.collection('reviewQueue').doc(commentId), { body, userId: user, createdAt: now, round: room.round, receiptId: receipt.id });
      result = { ...result, status: 'pending', commentId };
    }
    if (body) tx.set(accountRef, { commentAt: now }, { merge: true });
    tx.set(receipt, { result });
    return result;
  });
  if (action === 'comment' && result.status === 'pending') {
    await reviewComment(ref, result.commentId);
    return (await receipt.get()).data()?.result || result;
  }
  return result;
});
exports.createGoatDebate = onCall(async req => {
  requireAdmin(req); const user = uid(req), data = req.data || {};
  const input = debateInput(data);
  const key = createHash('sha256').update(`${user}:${id(data.requestId)}`).digest('hex');
  const ref = db().doc(`goatDebates/${key}`), account = db().doc(`goatAccounts/${user}`);
  return db().runTransaction(async tx => {
    const [existing, wallet] = await tx.getAll(ref, account), now = Date.now();
    if (existing.exists) return { id: ref.id };
    if (wallet.data()?.restricted) fail('permission-denied', 'Account restricted.');
    tx.set(ref, newRoom(input, user, now));
    return { id: ref.id };
  });
});
exports.manageGoatDebate = onCall(async req => {
  requireAdmin(req); const data = req.data || {}, ref = db().doc(`goatDebates/${id(data.roomId)}`);
  if (data.action === 'moderationStatus') return { configured: !!(await moderation.getKey()) };
  if (data.action === 'recheckComment') { await reviewComment(ref, id(data.commentId), true); return { ok: true }; }
  if (data.action === 'candidateQueue') {
    const snap = await ref.get();
    if (!snap.exists) fail('not-found', 'Debate not found.');
    return { items: snap.data().candidates.filter(c => c.status === 'pending') };
  }
  if (data.action === 'queue') return page(ref.collection('reviewQueue').orderBy(FieldPath.documentId()), data.cursor);
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) fail('not-found', 'Debate not found.');
    const room = snap.data();
    if (data.action === 'pause') tx.update(ref, { status: 'paused', endAt: null, pauseReason: 'Paused by an administrator.' });
    else if (data.action === 'resume') {
      if (room.status === 'active') return { ok: true };
      if (room.matchup.length !== 2) fail('failed-precondition', 'Add a challenger before resuming.');
      tx.update(ref, { status: 'active', endAt: nextEasternMidnight(Date.now()), scheduleVersion: SCHEDULE_VERSION, pauseReason: '' });
    } else if (data.action === 'candidate') {
      const name = text(data.name, 80);
      if (room.candidates.length >= 100 || room.candidates.some(c => canonical(c.name) === canonical(name))) fail('invalid-argument', 'Duplicate candidate or 100-candidate limit reached.');
      const candidate = { id: `c${room.candidates.length + 1}`, name };
      const patch = { candidates: [...room.candidates, candidate] };
      if (room.matchup.length === 1) { patch.matchup = [...room.matchup, candidate.id]; patch.lastPlayed = { ...room.lastPlayed, [candidate.id]: room.round }; }
      tx.update(ref, patch);
    } else if (['approveCandidate', 'rejectCandidate'].includes(data.action)) {
      const candidateId = id(data.candidateId), candidate = room.candidates.find(c => c.id === candidateId);
      if (!candidate || candidate.status !== 'pending') fail('failed-precondition', 'This candidate has already been reviewed.');
      const patch = { candidates: room.candidates.map(c => c.id === candidateId ? { ...c, status: data.action === 'approveCandidate' ? 'approved' : 'rejected' } : c) };
      if (data.action === 'approveCandidate' && room.matchup.length === 1) {
        patch.matchup = [...room.matchup, candidateId];
        patch.lastPlayed = { ...room.lastPlayed, [candidateId]: room.round };
      }
      tx.update(ref, patch);
      tx.set(ref.collection('moderationLog').doc(), { action: data.action, candidateId, moderatorId: req.auth.uid, createdAt: Date.now() });
    } else if (['approve', 'remove', 'restrict'].includes(data.action)) {
      const commentId = id(data.commentId), pending = ref.collection('reviewQueue').doc(commentId), visible = ref.collection('comments').doc(commentId);
      const [queued, published] = await tx.getAll(pending, visible), comment = queued.data() || published.data();
      if (!comment) return { ok: true };
      if (data.action === 'approve') tx.set(visible, publicComment(comment)); else tx.delete(visible);
      tx.delete(pending);
      if (comment.receiptId) tx.set(ref.collection('receipts').doc(comment.receiptId), { result: { status: data.action === 'approve' ? 'approved' : 'removed', commentId } }, { merge: true });
      if (data.action === 'restrict') tx.set(db().doc(`goatAccounts/${comment.userId}`), { restricted: true }, { merge: true });
      tx.set(ref.collection('moderationLog').doc(), { action: data.action, moderatorId: req.auth.uid, commentId, userId: comment.userId, createdAt: Date.now() });
    } else if (data.action === 'restore') {
      tx.set(db().doc(`goatAccounts/${id(data.userId)}`), { restricted: false }, { merge: true });
      tx.set(ref.collection('moderationLog').doc(), { action: 'restore', moderatorId: req.auth.uid, userId: data.userId, createdAt: Date.now() });
    } else fail('invalid-argument', 'Unknown action.');
    return { ok: true };
  });
});
// Includes midnight itself; later runs recover from delays and align legacy rooms
// without requiring anyone to open them. Pagination avoids starving rooms > 50.
exports.advanceGoatDebates = onSchedule({ schedule: '*/5 * * * *', timeZone: 'America/New_York' }, async () => {
  let cursor;
  do {
    let query = db().collection('goatDebates').orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const doc of page.docs) {
      const room = doc.data();
      if (room.scheduleVersion !== SCHEDULE_VERSION || (room.status === 'active' && room.endAt <= Date.now())) await advance(doc.ref);
    }
    cursor = page.size === 100 ? page.docs.at(-1).id : null;
  } while (cursor);
});
exports.internal = { advance };
