const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const db = getFirestore();
const sources = {
  draft: { collection: 'drafts', fields: ['title','description','category','hostId','hostDisplayName','rounds','timerSeconds','status','participantCount','createdAt','schemaVersion'] },
  legacy: { collection: 'brackets', fields: ['title','description','category','size','userDisplayName','createdAt'] },
  custom: { collection: 'customBrackets', fields: ['title','description','category','participantCount','roundCount','hostName','status','type','createdAt'], statuses: ['published','locked','complete'] },
  ranking: { collection: 'rankings', fields: ['title','description','category','hostId','hostDisplayName','entryCount','voteCount','status','createdAt'], statuses: ['open','closed'] },
};
const string = (value, fallback = '') => typeof value === 'string' ? value : fallback;
function summary(type, id, data) {
  const createdAtMs = data.createdAt?.toMillis?.() || 0;
  const common = { id, title: string(data.title, 'Untitled'), description: string(data.description).slice(0, 600), category: string(data.category, 'Other'), createdAtMs, createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : null };
  if (type === 'draft') return { ...common, hostId: string(data.hostId), hostDisplayName: string(data.hostDisplayName, 'Anonymous'), rounds: data.rounds, timerSeconds: data.timerSeconds, participantCount: data.participantCount || 0, status: data.status };
  if (type === 'ranking') return { ...common, hostId: string(data.hostId), hostDisplayName: string(data.hostDisplayName, 'Anonymous'), entryCount: Number.isFinite(data.entryCount) ? data.entryCount : 0, voteCount: Number.isFinite(data.voteCount) ? data.voteCount : 0, status: data.status };
  return { ...common, size: Number.isFinite(data[type === 'legacy' ? 'size' : 'participantCount']) ? data[type === 'legacy' ? 'size' : 'participantCount'] : 0,
    userDisplayName: string(data[type === 'legacy' ? 'userDisplayName' : 'hostName'], 'Anonymous'), isCustom: type === 'custom', origin: string(data.type, 'custom'), status: data.status || 'published' };
}
exports.browseCatalog = onCall(async req => {
  const { type, cursor } = req.data || {};
  if (!Object.hasOwn(sources, type)) throw new HttpsError('invalid-argument', 'Unknown catalog.');
  const source = sources[type], collection = db.collection(source.collection);
  let query = collection.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').select(...source.fields).limit(25);
  if (type === 'draft') {
    query = query.where('schemaVersion', '==', 2);
    if (req.data.mine) {
      if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
      if (!['hosted','joined'].includes(req.data.mine)) throw new HttpsError('invalid-argument', 'Invalid draft list.');
      query = req.data.mine === 'hosted' ? query.where('hostId', '==', req.auth.uid) : query.where('participantIds', 'array-contains', req.auth.uid);
    }
  }
  if (source.statuses) query = query.where('status', 'in', source.statuses);
  if (cursor) {
    if (typeof cursor !== 'string' || !/^[\w-]{1,200}$/.test(cursor)) throw new HttpsError('invalid-argument', 'Invalid page.');
    const last = await collection.doc(cursor).get();
    if (!last.exists) throw new HttpsError('failed-precondition', 'This list changed. Refresh it to continue.');
    query = query.startAfter(last);
  }
  const snap = await query.get(), page = snap.docs.slice(0, 24);
  return { items: page.map(doc => summary(type, doc.id, doc.data())), nextCursor: snap.size > 24 ? page.at(-1).id : null };
});
exports.internal = { summary };
exports.listUserPools = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const { type, poolType, cursor } = req.data || {};
  if (!['hosted','joined'].includes(type) || !['bracket','prediction'].includes(poolType)) throw new HttpsError('invalid-argument', 'Invalid pool list.');
  const pools = poolType === 'bracket' ? 'bracketPools' : 'predictionPools';
  const entries = poolType === 'bracket' ? 'poolEntries' : 'predictionEntries';
  const collection = db.collection(type === 'hosted' ? pools : entries);
  const ownerField = type === 'hosted' ? 'hostId' : 'userId';
  const dateField = type === 'hosted' ? 'createdAt' : 'joinedAt';
  const fields = ['name','description','hostId','hostDisplayName','status','bracketTitle','createdAt'];
  let query = collection.where(ownerField, '==', req.auth.uid).orderBy(dateField, 'desc').orderBy(FieldPath.documentId(), 'desc').select(...(type === 'hosted' ? fields : ['poolId','joinedAt'])).limit(25);
  if (cursor) {
    if (typeof cursor !== 'string' || !/^[\w-]{1,200}$/.test(cursor)) throw new HttpsError('invalid-argument', 'Invalid page.');
    const last = await collection.doc(cursor).get();
    if (!last.exists || last.data()[ownerField] !== req.auth.uid) throw new HttpsError('failed-precondition', 'Refresh this list to continue.');
    query = query.startAfter(last);
  }
  const snap = await query.get(), page = snap.docs.slice(0, 24);
  let documents = page;
  if (type === 'joined') {
    const ids = [...new Set(page.map(d => d.data().poolId).filter(id => typeof id === 'string' && /^[\w-]{1,200}$/.test(id)))];
    documents = ids.length ? (await db.collection(pools).where(FieldPath.documentId(), 'in', ids).select(...fields).get()).docs : [];
  }
  return { items: documents.map(doc => {
    const data = doc.data();
    return { id: doc.id, name: string(data.name, 'Untitled pool'), description: string(data.description).slice(0, 600), hostId: string(data.hostId), hostDisplayName: string(data.hostDisplayName, 'Anonymous'), status: string(data.status), bracketTitle: string(data.bracketTitle), createdAt: data.createdAt?.toMillis?.() || null };
  }), nextCursor: snap.size > 24 ? page.at(-1).id : null };
});
