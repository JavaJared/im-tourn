const {onCall,HttpsError} = require('firebase-functions/v2/https');
const {getFirestore,FieldPath,FieldValue,Timestamp} = require('firebase-admin/firestore');
const {summary} = require('./catalog').internal;
const {resolveUsernames} = require('./public-usernames').internal;
const {summary:postSummary}=require('./social-posts').internal;
const {rankFeed} = require('./feed-ranking.cjs');
const db = getFirestore();
const valid = id => typeof id === 'string' && /^[\w-]{1,200}$/.test(id);
const sources = {
  post:{collection:'bracketPosts',fields:['status','userId','title','category','caption','champion','bracketType','bracketId','createdAt','likeCount','commentCount'],status:'published'},
  legacy:{collection:'brackets',fields:['title','category','description','userId','size','createdAt']},
  custom:{collection:'customBrackets',fields:['title','category','description','hostId','participantCount','createdAt','status','type'],status:'published'},
  ranking:{collection:'rankings',fields:['title','category','description','hostId','entryCount','voteCount','createdAt','status'],status:'open'},
};
const profileCache = new Map();
async function preferences(uid) {
  const cached = profileCache.get(uid);
  if (cached?.expires > Date.now()) return cached.value;

  const result = {uid,friends:new Set(),categories:Object.create(null),completed:new Set(),hidden:new Set(),opened:new Set()};
  if (!uid) return result;
  const [friends,feedback,legacy,custom,rankings] = await Promise.all([
    db.collection('friendships').where('members','array-contains',uid).where('status','==','accepted').limit(100).get(),
    db.collection(`feedPreferences/${uid}/items`).orderBy('updatedAt','desc').limit(100).get(),
    db.collection('submissions').where('userId','==',uid).orderBy('submittedAt','desc').select('bracketId').limit(10).get(),
    db.collectionGroup('submissions').where('userId','==',uid).orderBy('createdAt','desc').select('createdAt').limit(10).get(),
    db.collection('rankingVotes').where('userId','==',uid).orderBy('submittedAt','desc').select('rankingId').limit(10).get(),
  ]);
  friends.docs.forEach(doc => (doc.data().members || []).filter(id=>id!==uid).forEach(id=>result.friends.add(id)));
  const refs = new Map();
  const add = (type,id) => { if(valid(id)){result.completed.add(`${type}:${id}`);refs.set(`${type}:${id}`,db.doc(`${sources[type].collection}/${id}`));} };
  legacy.docs.forEach(doc=>add('legacy',doc.data().bracketId));
  rankings.docs.forEach(doc=>add('ranking',doc.data().rankingId));
  custom.docs.forEach(doc=>{if(doc.ref.parent.parent?.parent.id==='customBrackets')add('custom',doc.ref.parent.parent.id);});
  const parents = refs.size ? await db.getAll(...refs.values(),{fieldMask:['category']}) : [];
  const categoryScore = (category,weight) => {const key=typeof category==='string'?category.toLowerCase():'other';result.categories[key]=(result.categories[key]||0)+weight;};
  parents.forEach(doc=>{if(doc.exists)categoryScore(doc.data().category,3);});
  feedback.docs.forEach(doc=>{const data=doc.data(),key=`${data.type}:${data.itemId}`;if(data.action==='hide')result.hidden.add(key);else result.opened.add(key);categoryScore(data.category,data.action==='hide'?-3:1);});
  if (profileCache.size >= 100) profileCache.delete(profileCache.keys().next().value);
  profileCache.set(uid,{value:result,expires:Date.now()+120000});
  return result;
}
function decode(cursor) {
  if(!cursor)return {asOf:Date.now(),positions:{}};
  try {
    if(typeof cursor!=='string'||cursor.length>3000)throw Error();
    const data=JSON.parse(Buffer.from(cursor,'base64url').toString());
    if(!Number.isSafeInteger(data.asOf)||data.asOf<0||data.asOf>Date.now()+60000||!data.positions||typeof data.positions!=='object')throw Error();
    for(const [type,value] of Object.entries(data.positions))if(!Object.hasOwn(sources,type)||(value!==null&&(!valid(value.id)||!Number.isSafeInteger(value.seconds)||value.seconds<0||value.seconds>253402300799||!Number.isInteger(value.nanoseconds)||value.nanoseconds<0||value.nanoseconds>=1e9)))throw Error();
    return data;
  }catch{throw new HttpsError('invalid-argument','Refresh your feed to continue.');}
}
exports.getForYouFeed=onCall(async req=>{
  const state=decode(req.data?.cursor);
  const profilePromise=preferences(req.auth?.uid).catch(error=>{console.error('Feed personalization unavailable',error);return null;});
  let postsUnavailable=false;
  const pages=await Promise.all(Object.entries(sources).map(async([type,source])=>{
    if(state.positions[type]===null)return [];
    let query=db.collection(source.collection).where('createdAt','<=',Timestamp.fromMillis(state.asOf)).orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc').select(...source.fields).limit(9);
    if(source.status)query=query.where('status','==',source.status);
    const after=state.positions[type];if(after)query=query.startAfter(new Timestamp(after.seconds,after.nanoseconds),after.id);
    const snap=await query.get().catch(error=>{if(type!=='post')throw error;console.error('Public posts unavailable',error);postsUnavailable=true;return null;});
    if(!snap){state.positions[type]=null;return [];}
    const page=snap.docs.slice(0,8),last=page.at(-1);
    state.positions[type]=snap.size>8?{id:last.id,seconds:last.data().createdAt.seconds,nanoseconds:last.data().createdAt.nanoseconds}:null;
    return page.map(doc=>({...(type==='post'?postSummary(doc.id,doc.data()):summary(type,doc.id,doc.data())),type}));
  }));
  const profile=await profilePromise;
  const candidates=pages.flat();
  // Always enforce per-item hiding, even beyond the recent preference sample.
  const hidden = new Set(profile?.hidden || []);
  if(req.auth && candidates.length) {
    const feedback=await db.getAll(...candidates.map(item=>db.doc(`feedPreferences/${req.auth.uid}/items/${item.type}-${item.id}`)),{fieldMask:['action']});
    feedback.forEach((doc,index)=>{if(doc.data()?.action==='hide')hidden.add(`${candidates[index].type}:${candidates[index].id}`);});
  }
  const items=rankFeed(candidates,{...(profile||{}),hidden},state.asOf);
  if(req.auth){const posts=items.filter(item=>item.type==='post');if(posts.length){const likes=await db.getAll(...posts.map(item=>db.doc(`bracketPosts/${item.id}/likes/${req.auth.uid}`)));posts.forEach((item,index)=>{item.liked=likes[index].exists;});}}
  let usernames={};try{usernames=await resolveUsernames(items.map(item=>item.userId||item.hostId));}catch{/* Existing username resolver can retry. */}
  return {items,usernames,postsUnavailable,personalizationUnavailable:!!req.auth&&!profile,nextCursor:Object.values(state.positions).some(value=>value!==null)?Buffer.from(JSON.stringify(state)).toString('base64url'):null};
});
exports.recordFeedFeedback=onCall(async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Sign in to personalize your feed.');
  const {type,itemId,action}=req.data||{};
  if(!Object.hasOwn(sources,type)||!valid(itemId)||!['open','hide'].includes(action))throw new HttpsError('invalid-argument','Invalid feed feedback.');
  const source=sources[type],ref=db.doc(`${source.collection}/${itemId}`),item=await ref.get();
  if(!item.exists||(source.status&&item.data().status!==source.status))throw new HttpsError('not-found','This item is no longer available.');
  const target=db.doc(`feedPreferences/${req.auth.uid}/items/${type}-${itemId}`);
  // One record per item: repeated clicks cannot amplify the same interest.
  await db.runTransaction(async tx=>{const old=await tx.get(target);if(old.data()?.action==='hide'&&action==='open')return;tx.set(target,{type,itemId,action,category:typeof item.data().category==='string'?item.data().category.slice(0,100):'Other',updatedAt:FieldValue.serverTimestamp()});});
  profileCache.delete(req.auth.uid);
  return {ok:true};
});
exports.internal={decode,preferences};
