const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
const { randomBytes, createHash } = require('node:crypto');
const { summary } = require('./catalog').internal;
const db = getFirestore();
const stamp = () => FieldValue.serverTimestamp();
const validId = value => typeof value === 'string' && /^[\w-]{1,200}$/.test(value);
const name = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : 'I’m Tourn user';
function uidOf(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to use Friends.');
  return req.auth.uid;
}
function pairRef(a, b) {
  return db.doc(`friendships/${createHash('sha256').update(JSON.stringify([a, b].sort())).digest('hex')}`);
}
async function accepted(uid, friendId) {
  if (!validId(friendId) || friendId === uid) throw new HttpsError('invalid-argument', 'Choose a friend.');
  const snap = await pairRef(uid, friendId).get();
  if (snap.data()?.status !== 'accepted') throw new HttpsError('permission-denied', 'An accepted friend request is required. Refresh your friends list.');
  return snap.data();
}
async function canView(uid, profileId) {
  if (uid === profileId) return;
  await accepted(uid, profileId);
}
exports.getFriendProfile = onCall(async req => {
  const uid = uidOf(req), profileRef = db.doc(`friendProfiles/${uid}`);
  return db.runTransaction(async tx => {
    const profile = await tx.get(profileRef);
    const code = profile.data()?.code || randomBytes(12).toString('hex').toUpperCase();
    if (!profile.exists) {
      const codeRef = db.doc(`friendCodes/${code}`);
      if ((await tx.get(codeRef)).exists) throw new HttpsError('aborted', 'Please try again.');
      tx.create(codeRef, { uid });
    }
    const displayName = name(req.auth.token?.name);
    tx.set(profileRef, { code, displayName }, { merge: true });
    return { code, displayName };
  });
});
exports.sendFriendRequest = onCall(async req => {
  const uid = uidOf(req), code = String(req.data?.code || '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{24}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter a valid friend code.');
  const target = (await db.doc(`friendCodes/${code}`).get()).data()?.uid;
  if (!validId(target)) throw new HttpsError('not-found', 'That friend code was not found.');
  if (uid === target) throw new HttpsError('invalid-argument', 'You cannot add yourself.');
  return db.runTransaction(async tx => {
    const ref = pairRef(uid, target), quota = db.doc(`friendRequestLimits/${uid}`);
    const [old, limit, profile] = await Promise.all([tx.get(ref), tx.get(quota), tx.get(db.doc(`friendProfiles/${target}`))]);
    const previous = old.data();
    if (previous?.status === 'accepted') return { message: 'You are already friends.' };
    if (previous?.status === 'pending') return { message: previous.requester === uid ? 'Your request is already pending.' : 'This person has already requested you. Accept their incoming request.' };
    if (previous?.updatedAt?.toMillis() > Date.now() - 86400000) throw new HttpsError('resource-exhausted', 'Please wait a day before sending another request to this person.');
    const day = new Date().toISOString().slice(0, 10), count = limit.data()?.day === day ? limit.data().count : 0;
    if (count >= 20) throw new HttpsError('resource-exhausted', 'You have reached today’s friend request limit.');
    tx.set(quota, { day, count: count + 1 });
    tx.set(ref, { members: [uid, target].sort(), requester: uid, status: 'pending', names: { [uid]: name(req.auth.token?.name), [target]: name(profile.data()?.displayName) }, updatedAt: stamp() });
    return { message: 'Friend request sent.' };
  });
});
exports.respondToFriend = onCall(async req => {
  const uid = uidOf(req), { friendId, action } = req.data || {};
  if (!validId(friendId) || friendId === uid || !['accept','decline','cancel','remove'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid friend action.');
  await db.runTransaction(async tx => {
    const ref = pairRef(uid, friendId), snap = await tx.get(ref), data = snap.data();
    if (!data) throw new HttpsError('not-found', 'This request is no longer available.');
    const recipient = data.requester !== uid;
    const permitted = action === 'remove' ? data.status === 'accepted' : data.status === 'pending' && (action === 'cancel' ? !recipient : recipient);
    if (!permitted) throw new HttpsError('failed-precondition', 'This request changed. Refresh the list.');
    tx.update(ref, { status: action === 'accept' ? 'accepted' : 'inactive', updatedAt: stamp() });
  });
  return { success: true };
});
exports.listFriends = onCall(async req => {
  const uid = uidOf(req), cursor = req.data?.cursor;
  let query = db.collection('friendships').where('members', 'array-contains', uid).orderBy(FieldPath.documentId()).limit(26);
  if (cursor) {
    if (!/^[a-f0-9]{64}$/.test(cursor)) throw new HttpsError('invalid-argument', 'Invalid friends page.');
    query = query.startAfter(cursor);
  }
  const snap = await query.get(), page = snap.docs.slice(0,25);
  const items = page.filter(doc => ['accepted','pending'].includes(doc.data().status)).map(doc => {
    const data = doc.data(), friendId = data.members.find(id => id !== uid);
    return { id: doc.id, friendId, displayName: name(data.names?.[friendId]), status: data.status, incoming: data.requester !== uid };
  });
  return { items, nextCursor: snap.size > 25 ? page.at(-1).id : null };
});

const sourceOf = (type, mode) => {
  if (!['legacy','custom','ranking'].includes(type) || !['created','filled'].includes(mode)) throw new HttpsError('invalid-argument', 'Invalid friend activity filter.');
  if (mode === 'created') return { collection: { legacy:'brackets', custom:'customBrackets', ranking:'rankings' }[type], owner: type === 'legacy' ? 'userId' : 'hostId' };
  return { collection: type === 'ranking' ? 'rankingVotes' : 'submissions', owner:'userId', group: type === 'custom' };
};
const publicParent = (type, data) => !!data && (type === 'legacy' || (type === 'custom' ? ['published','locked','complete'] : ['open','closed']).includes(data.status));
const fields = ['title','description','category','hostId','hostName','hostDisplayName','userDisplayName','size','participantCount','entryCount','voteCount','status','type','createdAt','bracketId','rankingId','userId'];
function activityQuery(type, mode, friendId) {
  const source = sourceOf(type, mode);
  let query = (source.group ? db.collectionGroup(source.collection) : db.collection(source.collection)).where(source.owner, '==', friendId);
  // Reuse the existing collection-group index; all saved custom fills write createdAt.
  if (source.group) query = query.orderBy('createdAt','desc');
  return { source, query: query.orderBy(FieldPath.documentId(), source.group ? 'desc' : 'asc').select(...fields).limit(13) };
}
exports.listFriendActivities = onCall(async req => {
  const uid = uidOf(req), { friendId, type, mode = 'created', cursor } = req.data || {};
  await canView(uid, friendId);
  let { source, query } = activityQuery(type, mode, friendId);
  if (cursor) {
    const valid = source.group ? typeof cursor === 'string' && /^(?:[\w-]{1,200}\/[\w-]{1,200}\/)*submissions\/[\w-]{1,200}$/.test(cursor) : validId(cursor);
    if (!valid) throw new HttpsError('invalid-argument', 'Invalid activity page.');
    const last = await db.doc(source.group ? cursor : `${source.collection}/${cursor}`).get();
    if (!last.exists || last.data()[source.owner] !== friendId) throw new HttpsError('failed-precondition', 'Refresh this activity list.');
    query = query.startAfter(last);
  }
  const snap = await query.get(), page = snap.docs.slice(0,12);
  const parentCollection = { legacy:'brackets', custom:'customBrackets', ranking:'rankings' }[type];
  const parentId = doc => mode === 'created' ? doc.id : type === 'custom' ? (doc.ref.parent.parent?.parent.id === 'customBrackets' ? doc.ref.parent.parent.id : null) : doc.data()[type === 'ranking' ? 'rankingId' : 'bracketId'];
  const ids = [...new Set(page.map(parentId).filter(validId))];
  const parents = new Map(mode === 'created' ? page.map(d => [d.id, d.data()]) : ids.length ? (await db.getAll(...ids.map(id => db.doc(`${parentCollection}/${id}`)), { fieldMask: fields })).filter(d => d.exists).map(d => [d.id,d.data()]) : []);
  const items = page.flatMap(doc => {
    const id = parentId(doc), parent = parents.get(id);
    if (!publicParent(type, parent)) return [];
    return [{ ...summary(type, id, parent), id: mode === 'filled' && !source.group ? doc.id : id, bracketId: id, activityId: source.group ? doc.ref.path : doc.id, activityType: type }];
  });
  // Revoked relationships must not receive a completed response from a slow query.
  await canView(uid, friendId);
  return { items, nextCursor: snap.size > 12 ? (source.group ? page.at(-1).ref.path : page.at(-1).id) : null };
});
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
exports.getFriendActivity = onCall(async req => {
  const uid = uidOf(req), { friendId, type, activityId } = req.data || {};
  await canView(uid, friendId);
  const source = sourceOf(type, 'filled');
  const valid = source.group ? typeof activityId === 'string' && /^customBrackets\/[\w-]{1,200}\/submissions\/[\w-]{1,200}$/.test(activityId) : validId(activityId);
  if (!valid) throw new HttpsError('invalid-argument', 'Invalid saved activity.');
  const snap = await db.doc(source.group ? activityId : `${source.collection}/${activityId}`).get(), data = snap.data();
  if (!data || data.userId !== friendId) throw new HttpsError('not-found', 'This saved activity is unavailable.');
  const parentId = type === 'custom' ? snap.ref.parent.parent.id : data[type === 'ranking' ? 'rankingId' : 'bracketId'];
  if (!validId(parentId)) throw new HttpsError('not-found', 'The original activity is unavailable.');
  const parent = (await db.doc(`${{legacy:'brackets',custom:'customBrackets',ranking:'rankings'}[type]}/${parentId}`).get()).data();
  if (!publicParent(type, parent)) throw new HttpsError('not-found', 'The original activity is no longer published.');
  let sections;
  if (type === 'ranking') {
    const ranking = parse(data.ranking);
    if (!Array.isArray(ranking) || ranking.length > 32) throw new HttpsError('failed-precondition', 'This saved ranking is malformed.');
    const entries = await db.collection('rankingEntries').where('rankingId','==',parentId).limit(33).get();
    const labels = new Map(entries.docs.map(d => [d.id, name(d.data().text)]));
    sections = [{ title:'Ranked choices', choices:ranking.map(id => labels.get(id) || 'Removed entry') }];
  } else if (type === 'legacy') {
    const rounds = parse(data.matchups);
    if (!Array.isArray(rounds) || rounds.length > 10 || rounds.some(r => !Array.isArray(r) || r.length > 512)) throw new HttpsError('failed-precondition', 'This saved bracket is malformed.');
    sections = rounds.map((round, i) => ({ title:`Round ${i + 1}`, choices: round.map(m => [1,2].includes(m?.winner) ? name(m[`entry${m.winner}`]?.name) : 'No pick saved') }));
  } else {
    const rounds = parent.rounds, boxes = parent.boxes || {}, labels = {};
    if (!Array.isArray(rounds) || rounds.length > 32) throw new HttpsError('failed-precondition', 'This bracket is malformed.');
    for (const box of Object.values(boxes)) for (const slot of ['slotA','slotB']) if (box?.[slot]?.type === 'named') labels[box[slot].participantId] = name(box[slot].name);
    sections = rounds.map((r, i) => ({ title:`Round ${i + 1}`, choices: (Array.isArray(r) ? r : Array.isArray(r?.ids) ? r.ids : []).slice(0,512).map(id => labels[data.picks?.[id]] || 'No pick saved') }));
  }
  await canView(uid, friendId);
  return { title: name(parent.title), sections };
});

exports.getUserProfile = onCall(async req => {
  const viewerId = uidOf(req), profileId = req.data?.profileId || viewerId;
  if (!validId(profileId)) throw new HttpsError('invalid-argument', 'Invalid profile.');
  await canView(viewerId, profileId);

  const [profileSnap, legacyCreated, customCreated, rankingCreated, legacyFilled, customFilled, rankingFilled, joined] = await Promise.all([
    db.doc(`friendProfiles/${profileId}`).get(),
    db.collection('brackets').where('userId', '==', profileId).select('title').limit(201).get(),
    db.collection('customBrackets').where('hostId', '==', profileId).where('status', 'in', ['published', 'locked', 'complete']).select('title').limit(201).get(),
    db.collection('rankings').where('hostId', '==', profileId).where('status', 'in', ['open', 'closed']).select('title').limit(201).get(),
    db.collection('submissions').where('userId', '==', profileId).select('bracketId').limit(201).get(),
    db.collectionGroup('submissions').where('userId', '==', profileId).select('createdAt').limit(201).get(),
    db.collection('rankingVotes').where('userId', '==', profileId).select('rankingId').limit(201).get(),
    db.collection('poolEntries').where('userId', '==', profileId).select('poolId', 'score', 'submittedAt').limit(201).get(),
  ]);

  const profileData = profileSnap.data() || {};
  let displayName = name(profileData.displayName);
  if (displayName === 'I’m Tourn user') {
    const candidate = legacyCreated.docs[0]?.data()?.userDisplayName || rankingCreated.docs[0]?.data()?.hostDisplayName;
    displayName = name(candidate);
  }

  const joinedEntries = joined.docs.filter(doc => validId(doc.data().poolId));
  const poolIds = [...new Set(joinedEntries.map(doc => doc.data().poolId))].slice(0, 100);
  const poolRefs = poolIds.map(id => db.doc(`bracketPools/${id}`));
  const pools = poolRefs.length ? await db.getAll(...poolRefs) : [];
  const completed = pools.filter(pool => pool.exists && pool.data().status === 'completed');
  const rankRows = [];
  let poolsWon = 0;
  for (const pool of completed) {
    const poolData = pool.data();
    const mine = joinedEntries.find(entry => entry.data().poolId === pool.id);
    if (!mine) continue;
    const entries = await db.collection('poolEntries').where('poolId', '==', pool.id).select('userId', 'score').limit(201).get();
    const score = Number.isFinite(mine.data().score) ? mine.data().score : null;
    if (score == null || !entries.docs.length) continue;
    const rank = 1 + entries.docs.filter(entry => Number.isFinite(entry.data().score) && entry.data().score > score).length;
    rankRows.push(rank);
    if (poolData.winnerId === profileId || (Array.isArray(poolData.winnerIds) && poolData.winnerIds.includes(profileId))) poolsWon += 1;
  }
  const averageFinalRank = rankRows.length ? Math.round((rankRows.reduce((sum, rank) => sum + rank, 0) / rankRows.length) * 10) / 10 : null;
  return {
    id: profileId,
    displayName,
    isSelf: viewerId === profileId,
    stats: {
      createdBrackets: legacyCreated.size + customCreated.size,
      createdRankings: rankingCreated.size,
      // Collection-group queries include the root `submissions` collection;
      // count only nested custom-bracket fills here so legacy submissions are
      // not counted twice.
      filledBrackets: legacyFilled.size + customFilled.docs.filter(doc => doc.ref.parent.parent?.parent?.id === 'customBrackets').length,
      filledRankings: rankingFilled.size,
      poolsJoined: joinedEntries.length,
      completedPools: rankRows.length,
      averageFinalRank,
      highestFinalRank: rankRows.length ? Math.min(...rankRows) : null,
      poolsWon,
    },
  };
});
exports.internal = { pairRef, activityQuery, canView };
