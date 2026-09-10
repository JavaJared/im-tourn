const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const db = getFirestore();
const sources = {
  brackets: ['brackets','userId','createdAt',['title','category']],
  custom: ['customBrackets','hostId','createdAt',['title','status']],
  submissions: ['submissions','userId','submittedAt',['title','bracketId']],
  customSubmissions: ['submissions','userId','createdAt',[]],
  hostedPools: ['bracketPools','hostId','createdAt',['name','status','lockDate']],
  joinedPools: ['poolEntries','userId','joinedAt',['poolId','submittedAt']],
  rankings: ['rankings','hostId','createdAt',['title','status']],
  rankingVotes: ['rankingVotes','userId','submittedAt',['rankingId']],
};
const millis = value => value?.toMillis?.() || 0;
const title = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback;
const validId = value => typeof value === 'string' && /^[\w-]{1,200}$/.test(value);
exports.listMyActivities = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to view your activities.');
  const { type, cursor } = req.data || {};
  if (!Object.hasOwn(sources, type)) throw new HttpsError('invalid-argument', 'Unknown activity type.');
  const [collectionName, ownerField, dateField, fields] = sources[type], uid = req.auth.uid;
  const collection = type === 'customSubmissions' ? db.collectionGroup(collectionName) : db.collection(collectionName);
  let query = collection.where(ownerField, '==', uid).orderBy(dateField,'desc').orderBy(FieldPath.documentId(),'desc').select(...fields,dateField).limit(13);
  if (cursor) {
    const validPath = type === 'customSubmissions' && typeof cursor === 'string' && /^(customBrackets\/[\w-]{1,200}\/)?submissions\/[\w-]{1,200}$/.test(cursor);
    if (!(type === 'customSubmissions' ? validPath : validId(cursor))) throw new HttpsError('invalid-argument', 'Invalid activity page.');
    const last = await (type === 'customSubmissions' ? db.doc(cursor) : collection.doc(cursor)).get();
    if (!last.exists || last.data()[ownerField] !== uid) throw new HttpsError('failed-precondition', 'Refresh your activities to continue.');
    query = query.startAfter(last);
  }
  const snap = await query.get(), page = snap.docs.slice(0,12);
  const parentType = type === 'joinedPools' ? ['bracketPools','poolId',['name','status','lockDate','hostId']] : type === 'rankingVotes' ? ['rankings','rankingId',['title','status']] : type === 'customSubmissions' ? ['customBrackets',null,['title','status']] : null;
  const parentId = doc => type === 'customSubmissions' ? (doc.ref.parent.parent?.parent.id === 'customBrackets' ? doc.ref.parent.parent.id : null) : doc.data()[parentType?.[1]];
  const parents = new Map();
  if (parentType) {
    const ids = [...new Set(page.map(parentId).filter(validId))];
    if (ids.length) (await db.collection(parentType[0]).where(FieldPath.documentId(),'in',ids).select(...parentType[2]).get()).docs.forEach(doc => parents.set(doc.id,doc.data()));
  }
  const items = page.flatMap(doc => {
    const data = doc.data(), parent = parentType ? parents.get(parentId(doc)) : data;
    if (parentType && !parent) return []; // Deleted or unrelated parents cannot produce broken links.
    const common = { id: type === 'customSubmissions' ? doc.ref.path : doc.id, createdAtMs: millis(data[dateField]), needsAttention: false };
    if (type === 'brackets') return [{ ...common, title: title(data.title,'Untitled bracket'), category: 'brackets', label: 'Created bracket', action: 'Fill bracket', bracketId: doc.id }];
    if (type === 'custom') return [{ ...common, title: title(data.title,'Untitled bracket'), category: 'brackets', label: data.status === 'draft' ? 'Unpublished bracket' : 'Created bracket', needsAttention: data.status === 'draft', action: data.status === 'draft' ? 'Continue editing' : 'Open bracket', destination: `custom-bracket-${doc.id}` }];
    if (type === 'submissions') return [{ ...common, title: title(data.title,'Saved bracket'), category: 'saved', label: 'Submitted bracket', action: 'View saved bracket', submissionId: doc.id }];
    if (type === 'customSubmissions') return [{ ...common, title: title(parent.title,'Saved bracket'), category: 'saved', label: 'Saved bracket', action: 'Open saved picks', destination: `custom-bracket-${parentId(doc)}` }];
    if (type === 'hostedPools' || type === 'joinedPools') {
      if (type === 'joinedPools' && parent.hostId === uid) return [];
      const open = parent.status === 'open' && (!millis(parent.lockDate) || millis(parent.lockDate) > Date.now());
      const needsAttention = type === 'joinedPools' ? open && !data.submittedAt : ['locked','in_progress'].includes(parent.status);
      return [{ ...common, title: title(parent.name,'Untitled pool'), category: 'pools', label: type === 'hostedPools' ? 'Hosting a pool' : data.submittedAt ? 'Predictions submitted' : open ? 'Predictions needed' : 'Predictions closed', status: typeof parent.status === 'string' ? parent.status : '', needsAttention, action: type === 'hostedPools' ? 'Manage pool' : needsAttention ? 'Make predictions' : 'View pool', destination: `pool-${type === 'hostedPools' ? doc.id : data.poolId}` }];
    }
    return [{ ...common, title: title(parent.title,'Untitled ranking'), category: 'rankings', label: type === 'rankings' ? 'Created ranking' : 'Voted in ranking', status: typeof parent.status === 'string' ? parent.status : '', action: 'View ranking', destination: `ranking-${type === 'rankings' ? doc.id : data.rankingId}` }];
  });
  return { items, nextCursor: snap.size > 12 ? (type === 'customSubmissions' ? page.at(-1).ref.path : page.at(-1).id) : null };
});
exports.internal = { sources };
