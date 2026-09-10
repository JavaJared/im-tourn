const { validateLegacyMatchups, validateStructure } = require('./generated/scoring.cjs');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp, FieldPath } = require('firebase-admin/firestore');
const { randomInt, createHash } = require('node:crypto');
const db = getFirestore();
const kinds = { bracket: ['bracketPools', 'poolEntries'], prediction: ['predictionPools', 'predictionEntries'] };
const stamp = () => FieldValue.serverTimestamp();
function auth(req) { if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.'); return req.auth.uid; }
function kind(value) { if (!Object.hasOwn(kinds, value)) throw new HttpsError('invalid-argument', 'Invalid pool type.'); return kinds[value]; }
function id(value) { if (typeof value !== 'string' || !/^[\w-]{1,200}$/.test(value)) throw new HttpsError('invalid-argument', 'Invalid pool ID.'); return value; }
function code(value) { if (typeof value !== 'string' || !/^[A-Z0-9]{6,8}$/.test(value.trim().toUpperCase())) throw new HttpsError('invalid-argument', 'Enter a valid invite code.'); return value.trim().toUpperCase(); }
function inviteRef(type, poolId) { return db.doc(`poolInvites/${type}_${poolId}`); }
function codeRef(type, value) { return db.doc(`poolInviteCodes/${createHash('sha256').update(`${type}:${value}`).digest('hex')}`); }
function open(pool, now = Date.now()) { return pool.status === 'open' && (!pool.lockDate || now < pool.lockDate.toMillis()); }
function text(value, max, required = false) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpsError('invalid-argument', 'Check the pool details.'); return value.trim(); }
async function rateLimit(uid) {
  const ref = db.doc(`poolJoinAttempts/${uid}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref), now = Date.now();
    const data = snap.data(), active = data && now - data.startedAt.toMillis() < 15 * 60 * 1000;
    if (active && data.count >= 30) throw new HttpsError('resource-exhausted', 'Too many join attempts. Try again in 15 minutes.');
    tx.set(ref, { count: active ? data.count + 1 : 1, startedAt: active ? data.startedAt : Timestamp.fromMillis(now) });
  });
}
async function resolve(type, value) {
  const [collection] = kind(type), key = code(value);
  const registered = await codeRef(type, key).get();
  if (registered.exists) return registered.data().poolId;
  // Compatibility during rollout; migration removes the public field afterward.
  const legacy = await db.collection(collection).where('joinCode', '==', key).limit(2).get();
  return legacy.size === 1 ? legacy.docs[0].id : null;
}
exports.resolvePoolInvite = onCall(async req => {
  const { type, joinCode } = req.data || {};
  const poolId = await resolve(type, joinCode);
  return poolId ? { id: poolId } : null;
});
exports.getPoolInvite = onCall(async req => {
  const uid = auth(req), { type, poolId } = req.data || {}, [collection] = kind(type);
  const pool = await db.doc(`${collection}/${id(poolId)}`).get();
  if (!pool.exists || pool.data().hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can view invitations.');
  const invite = await inviteRef(type, poolId).get();
  return { joinCode: invite.data()?.joinCode || pool.data().joinCode || null };
});
exports.createPrivatePool = onCall(async req => {
  const uid = auth(req), { type, pool: input } = req.data || {}, [collection] = kind(type);
  if (!input || typeof input !== 'object') throw new HttpsError('invalid-argument', 'Pool details are required.');
  const pool = { name: text(input.name, 160, true), description: text(input.description || '', 5000), hostId: uid,
    hostDisplayName: String(req.auth.token.name || 'Anonymous').slice(0, 100), status: 'open', results: null, createdAt: stamp(), updatedAt: stamp(), privacyVersion: 1 };
  const date = input.lockDate ? new Date(input.lockDate) : null;
  if (date && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())) throw new HttpsError('invalid-argument', 'Choose a future lock date.');
  pool.lockDate = date ? Timestamp.fromDate(date) : null;
  if (type === 'bracket') {
    if (!input.bracketMatchups || typeof input.bracketMatchups !== 'object') throw new HttpsError('invalid-argument', 'Select a valid bracket.');
    try { if (Array.isArray(input.bracketMatchups)) validateLegacyMatchups(input.bracketMatchups); else validateStructure(input.bracketMatchups); } catch { throw new HttpsError('invalid-argument', 'Select a valid bracket.'); }
    pool.bracketMatchups = JSON.stringify(input.bracketMatchups);
    for (const field of ['bracketId', 'bracketTitle', 'bracketCategory', 'bracketType']) pool[field] = text(input[field] || '', 200);
    if (!Array.isArray(input.roundPoints) || input.roundPoints.length > 16 || input.roundPoints.some(p => !Number.isFinite(p) || p < 0 || p > 10000)) throw new HttpsError('invalid-argument', 'Invalid round points.');
    pool.roundPoints = input.roundPoints;
    pool.enableSleepers = input.enableSleepers === true;
    for (const field of ['sleeper1Points', 'sleeper2Points']) {
      const points = input[field] || 0;
      if (!Number.isFinite(points) || points < 0 || points > 10000) throw new HttpsError('invalid-argument', 'Invalid sleeper points.');
      pool[field] = points;
    }
  } else {
    if (!Array.isArray(input.categories) || input.categories.length < 1 || input.categories.length > 50) throw new HttpsError('invalid-argument', 'Invalid categories.');
    for (const category of input.categories) {
      if (!category || typeof category.name !== 'string' || !category.name.trim() || category.name.length > 160 || !Array.isArray(category.options) || category.options.length < 2 || category.options.length > 100 || category.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 200) || (category.points != null && (!Number.isFinite(category.points) || category.points < 0 || category.points > 10000))) throw new HttpsError('invalid-argument', 'Check category names, options and points.');
    }
    pool.categories = JSON.stringify(input.categories);
  }
  if (Buffer.byteLength(JSON.stringify(pool)) > 500000) throw new HttpsError('invalid-argument', 'This pool is too large.');
  const ref = db.collection(collection).doc();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = Array.from({ length: 8 }, () => chars[randomInt(chars.length)]).join('');
    const reserved = await db.runTransaction(async tx => {
      const index = codeRef(type, joinCode);
      if ((await tx.get(index)).exists) return false;
      tx.create(ref, pool);
      tx.create(inviteRef(type, ref.id), { hostId: uid, poolId: ref.id, type, joinCode });
      tx.create(index, { poolId: ref.id, type });
      return true;
    });
    if (reserved) return { id: ref.id, joinCode };
  }
  throw new HttpsError('unavailable', 'Could not reserve an invitation. Please retry.');
});
exports.joinPrivatePool = onCall(async req => {
  const uid = auth(req), { type, poolId, joinCode } = req.data || {}, [collection, entries] = kind(type);
  id(poolId);
  await rateLimit(uid);
  const resolved = joinCode ? await resolve(type, joinCode) : null;
  return db.runTransaction(async tx => {
    const ref = db.doc(`${collection}/${poolId}`), entry = db.doc(`${entries}/${poolId}_${uid}`);
    const [pool, existing] = await Promise.all([tx.get(ref), tx.get(entry)]);
    if (!pool.exists) throw new HttpsError('not-found', 'Pool not found.');
    if (existing.exists) return { alreadyJoined: true };
    if (pool.data().hostId !== uid && resolved !== poolId) throw new HttpsError('permission-denied', 'Use the host’s invitation code to join this pool.');
    if (!open(pool.data())) throw new HttpsError('failed-precondition', 'This pool is closed to new entries.');
    tx.create(entry, { poolId, userId: uid, userDisplayName: String(req.auth.token.name || 'Anonymous').slice(0, 100), predictions: null, score: 0, joinedAt: stamp(), submittedAt: null });
    return { alreadyJoined: false };
  });
});
exports.readPoolEntries = onCall(async req => {
  const uid = auth(req), { type, poolId } = req.data || {}, [collection, entries] = kind(type);
  id(poolId);
  const [pool, membership] = await Promise.all([db.doc(`${collection}/${poolId}`).get(), db.doc(`${entries}/${poolId}_${uid}`).get()]);
  if (!pool.exists) throw new HttpsError('not-found', 'Pool not found.');
  if (pool.data().hostId !== uid && !membership.exists) return { entries: [], nextCursor: null, predictionsHidden: true };
  const cursor = req.data.cursor ? id(req.data.cursor) : null;
  let query = db.collection(entries).where('poolId', '==', poolId).orderBy(FieldPath.documentId()).limit(51);
  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get(), data = pool.data();
  const hidden = !(['locked', 'in_progress', 'completed'].includes(data.status) || (data.status === 'open' && data.lockDate && data.lockDate.toMillis() <= Date.now()));
  const page = snap.docs.slice(0, 50).map(doc => {
    const data = doc.data();
    const summary = { id: doc.id, poolId, userId: data.userId, userDisplayName: data.userDisplayName || 'Anonymous', score: data.score || 0,
      joinedAt: data.joinedAt?.toMillis?.() || null, submittedAt: data.submittedAt?.toMillis?.() || null };
    if (hidden && data.userId !== uid) return { ...summary, predictions: null, predictionsHidden: true };
    return { ...summary, predictions: data.predictions || null, champion: data.champion || null,
      sleeper1: data.sleeper1 || null, sleeper2: data.sleeper2 || null, sleeper1Hit: data.sleeper1Hit === true, sleeper2Hit: data.sleeper2Hit === true };
  });
  return { entries: page, nextCursor: snap.size > 50 ? snap.docs[49].id : null, predictionsHidden: hidden };
});
exports.deletePrivatePool = onCall(async req => {
  const uid = auth(req), { type, poolId } = req.data || {}, [collection, entries] = kind(type);
  const ref = db.doc(`${collection}/${id(poolId)}`);
  const pool = await ref.get();
  if (!pool.exists || pool.data().hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can delete this pool.');
  // Freeze joining/submissions before batched cleanup, including retries.
  await ref.update({ status: 'deleting', updatedAt: stamp() });
  for (;;) {
    const page = await db.collection(entries).where('poolId', '==', poolId).limit(200).get();
    if (page.empty) break;
    const batch = db.batch(); page.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
  }
  const invite = await inviteRef(type, poolId).get();
  const joinCode = invite.data()?.joinCode || pool.data().joinCode;
  const batch = db.batch(); batch.delete(ref); batch.delete(inviteRef(type, poolId));
  if (joinCode) batch.delete(codeRef(type, joinCode));
  await batch.commit();
  return { deleted: true };
});
module.exports.internal = { open, inviteRef, codeRef, kinds };
exports.getPrivatePoolEntry = onCall(async req => {
  const uid = auth(req), { type, poolId } = req.data || {}, [, entries] = kind(type);
  const snap = await db.doc(`${entries}/${id(poolId)}_${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return { ...data, id: snap.id, joinedAt: data.joinedAt?.toMillis?.() || null, submittedAt: data.submittedAt?.toMillis?.() || null };
});
