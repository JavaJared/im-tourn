const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
const fail = (code, message) => { throw new HttpsError(code, message); };
const validId = id => typeof id === 'string' && /^[\w-]{1,200}$/.test(id);
const version = snap => `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}`;

exports.deletePublishedBracket = onCall({ timeoutSeconds: 120 }, async req => {
  if (!req.auth) fail('unauthenticated', 'Sign in to delete your bracket.');
  const { bracketId, type, action, confirmation, expectedVersion } = req.data || {};
  if (!validId(bracketId) || !['custom','legacy'].includes(type) || !['preview','begin','continue'].includes(action)) fail('invalid-argument', 'Invalid deletion request.');
  const uid = req.auth.uid, db = getFirestore();
  const source = db.doc(`${type === 'legacy' ? 'brackets' : 'customBrackets'}/${bracketId}`);
  const job = db.doc(`_bracketDeletions/${type}_${bracketId}`);
  const picksQuery = type === 'legacy' ? db.collection('submissions').where('bracketId','==',bracketId) : source.collection('submissions');
  const checkOwner = snap => {
    const data = snap.data();
    if (!data || data[type === 'legacy' ? 'userId' : 'hostId'] !== uid) fail('permission-denied', 'Only the creator can delete this bracket.');
    return data;
  };
  if (action === 'preview') {
    const existing = await job.get();
    if (existing.exists) {
      if (existing.data().uid !== uid) fail('permission-denied', 'Not your deletion.');
      return { started:true, done:existing.data().done };
    }
    const snapshot = await source.get(), data = checkOwner(snapshot);
    if (data.resetting) fail('failed-precondition', 'Finish the bracket reset before deleting it.');
    if (type === 'custom' && !['published','locked','complete'].includes(data.status)) fail('failed-precondition', 'This bracket is not published. Refresh your activities.');
    const [picks,pools,posts] = await Promise.all([
      picksQuery.count().get(),
      db.collection('bracketPools').where('bracketId','==',bracketId).count().get(),
      db.collection('bracketPosts').where('bracketId','==',bracketId).count().get(),
    ]);
    return { title:data.title || 'Untitled bracket', version:version(snapshot), picks:picks.data().count, pools:pools.data().count, posts:posts.data().count };
  }
  return db.runTransaction(async tx => {
    const existing = await tx.get(job), state = existing.data();
    if (state && state.uid !== uid) fail('permission-denied', 'Not your deletion.');
    if (state?.done) return { done:true };
    if (action === 'begin' && state) return { done:false };
    const snapshot = await tx.get(source), data = checkOwner(snapshot);
    if (action === 'begin') {
      if (data.resetting) fail('failed-precondition', 'Finish the bracket reset before deleting it.');
      if (type === 'custom' && !['published','locked','complete'].includes(data.status)) fail('failed-precondition', 'This bracket is not published.');
      if (expectedVersion !== version(snapshot)) fail('aborted', 'The bracket changed. Close this dialog and review deletion again.');
      if (confirmation !== (data.title || 'Untitled bracket')) fail('invalid-argument', 'Type the bracket title exactly.');
      tx.create(job, { uid, phase:'pools', done:false, createdAt:FieldValue.serverTimestamp() });
      // Existing reset guards prevent new picks, pools, posts and edits during cleanup.
      tx.update(source, { resetting:true, deleting:true });
      return { done:false };
    }
    if (!state || !data.resetting || !data.deleting) fail('failed-precondition', 'Deletion has not started.');
    if (state.phase === 'pools') {
      const pools = await tx.get(db.collection('bracketPools').where('bracketId','==',bracketId).limit(1));
      if (pools.empty) { tx.update(job,{phase:'posts'}); return {done:false}; }
      const pool = pools.docs[0];
      const entries = await tx.get(db.collection('poolEntries').where('poolId','==',pool.id).limit(150));
      if (!entries.empty) { tx.update(pool.ref,{status:'deleting'}); entries.docs.forEach(entry => tx.delete(entry.ref)); return {done:false}; }
      const removals = await tx.get(pool.ref.collection('removedParticipants').limit(150));
      if (!removals.empty) { tx.update(pool.ref,{status:'deleting'}); removals.docs.forEach(record => tx.delete(record.ref)); return {done:false}; }
      const invite = db.doc(`poolInvites/bracket_${pool.id}`), invitation = await tx.get(invite);
      const code = invitation.data()?.joinCode || pool.data().joinCode;
      tx.delete(pool.ref); tx.delete(invite);
      if (code) tx.delete(db.doc(`poolInviteCodes/${createHash('sha256').update(`bracket:${code}`).digest('hex')}`));
      return {done:false};
    }
    if (state.phase === 'posts') {
      const posts = await tx.get(db.collection('bracketPosts').where('bracketId','==',bracketId).limit(1));
      if (posts.empty) { tx.update(job,{phase:'picks'}); return {done:false}; }
      const post = posts.docs[0], comments = await tx.get(post.ref.collection('comments').limit(100)), likes = await tx.get(post.ref.collection('likes').limit(100));
      if (comments.empty && likes.empty) tx.delete(post.ref);
      else { tx.update(post.ref,{status:'deleting'}); [...comments.docs,...likes.docs].forEach(record => tx.delete(record.ref)); }
      return {done:false};
    }
    const picks = await tx.get(picksQuery.limit(150));
    if (!picks.empty) { picks.docs.forEach(record => tx.delete(record.ref)); return {done:false}; }
    tx.delete(source);
    tx.delete(db.doc(`_bracketConsensus/${type}-${bracketId}`));
    tx.update(job,{done:true,completedAt:FieldValue.serverTimestamp()});
    return {done:true};
  });
});
