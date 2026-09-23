const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
const { pairRef } = require('./friends').internal;
const { resolveUsernames } = require('./public-usernames').internal;
const S = require('./generated/scoring.cjs');
const db = getFirestore();
const valid = value => typeof value === 'string' && /^[\w-]{1,200}$/.test(value);
const user = req => { if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to use notifications.'); return req.auth.uid; };
const inbox = uid => db.collection(`notificationInboxes/${uid}/items`);
function parentRef(type, id) {
  if (!['legacy','custom'].includes(type) || !valid(id)) throw new HttpsError('invalid-argument', 'Invalid bracket.');
  return db.doc(`${type === 'legacy' ? 'brackets' : 'customBrackets'}/${id}`);
}
function available(type, data) {
  if (!data || (type === 'custom' && data.status !== 'published')) throw new HttpsError('not-found', 'This bracket is no longer open for picks.');
}
exports.sendBracketNotification = onCall(async req => {
  const uid = user(req), {friendId, type, bracketId} = req.data || {};
  if (!valid(friendId) || uid === friendId) throw new HttpsError('invalid-argument', 'Choose a friend.');
  const parent = parentRef(type, bracketId), friendship = pairRef(uid, friendId);
  const id = createHash('sha256').update(JSON.stringify([uid,type,bracketId])).digest('hex');
  const notification = inbox(friendId).doc(id), limit = db.doc(`bracketShareLimits/${uid}`);
  return db.runTransaction(async tx => {
    const [pair, bracket, prior, usage] = await Promise.all([tx.get(friendship),tx.get(parent),tx.get(notification),tx.get(limit)]);
    if (pair.data()?.status !== 'accepted') throw new HttpsError('permission-denied', 'You can only send brackets to accepted friends.');
    const source = bracket.data(); available(type, source);
    if (prior.exists) return {alreadySent:true};
    let base; try { base = S.pickSource(type,source); } catch { throw new HttpsError('failed-precondition', 'This bracket is unavailable.'); }
    let query = type === 'legacy' ? db.collection('submissions').where('bracketId','==',bracketId) : parent.collection('submissions');
    query = query.where('userId','==',friendId).orderBy(type === 'legacy' ? 'submittedAt' : 'createdAt','desc').select('userId',type === 'legacy' ? 'matchups' : 'picks').limit(100);
    const picks = await tx.get(query);
    if (picks.docs.some(doc => S.compatiblePickState(type,source,doc.data(),base))) throw new HttpsError('failed-precondition', 'This friend has already completed this bracket.');
    const hour = Math.floor(Date.now()/3600000), count = usage.data()?.hour === hour ? usage.data().count : 0;
    if (count >= 20) throw new HttpsError('resource-exhausted', 'You can send up to 20 brackets per hour. Try again later.');
    tx.set(limit,{hour,count:count+1});
    tx.create(notification,{kind:'bracket-share',senderId:uid,type,bracketId,title:typeof source.title === 'string' ? source.title.slice(0,200) : 'Untitled bracket',read:false,createdAt:FieldValue.serverTimestamp()});
    return {sent:true};
  });
});
exports.listBracketNotifications = onCall(async req => {
  const uid = user(req), collection = inbox(uid), {cursor,countOnly} = req.data || {};
  const countPromise = collection.where('read','==',false).count().get();
  if (countOnly) return {unreadCount:(await countPromise).data().count};
  let query = collection.orderBy('createdAt','desc').limit(26);
  if (cursor) {
    if (!valid(cursor)) throw new HttpsError('invalid-argument','Invalid page.');
    const last = await collection.doc(cursor).get();
    if (!last.exists) throw new HttpsError('failed-precondition','Refresh notifications.');
    query = query.startAfter(last);
  }
  const [snap,count] = await Promise.all([query.get(),countPromise]), page = snap.docs.slice(0,25);
  const usernames = await resolveUsernames(page.map(doc=>doc.data().senderId));
  return {items:page.map(doc=>({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toMillis() || null,username:usernames[doc.data().senderId] || null})),unreadCount:count.data().count,nextCursor:snap.size>25?page.at(-1).id:null};
});
exports.readBracketNotification = onCall(async req => {
  const uid = user(req), {notificationId,open} = req.data || {};
  if (!valid(notificationId)) throw new HttpsError('invalid-argument','Invalid notification.');
  const ref = inbox(uid).doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found','Notification unavailable.');
  const data = snap.data();
  if (open) available(data.type,(await parentRef(data.type,data.bracketId).get()).data());
  await ref.update({read:true});
  return {view:open ? `${data.type === 'custom' ? 'custom-bracket' : 'fill-bracket'}-${data.bracketId}` : null};
});
