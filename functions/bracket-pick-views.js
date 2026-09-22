const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const S=require('./generated/scoring.cjs');
const {canView}=require('./friends').internal;
const db=getFirestore();
const valid=value=>typeof value==='string'&&/^[\w-]{1,200}$/.test(value);
const millis=value=>value?.toMillis?.()||0;
exports.getBracketPickView=onCall(async req=>{
  const {type,bracketId,mode,friendId}=req.data||{};
  if(!['legacy','custom'].includes(type)||!valid(bracketId)||!['mine','friend','community'].includes(mode)) throw new HttpsError('invalid-argument','Invalid bracket view.');
  if(mode!=='community'&&!req.auth) throw new HttpsError('unauthenticated','Sign in to view saved picks.');
  const uid=mode==='friend'?friendId:req.auth?.uid;
  if(mode==='friend'){if(!valid(uid)) throw new HttpsError('invalid-argument','Choose a friend.');await canView(req.auth.uid,uid);}
  const parent=await db.doc(`${type==='legacy'?'brackets':'customBrackets'}/${bracketId}`).get(),source=parent.data();
  if(!source||(type==='custom'&&!['published','locked','complete'].includes(source.status))) throw new HttpsError('not-found','This bracket is unavailable.');
  let base;try{base=S.pickSource(type,source);}catch{throw new HttpsError('failed-precondition','This bracket has invalid structure.');}
  const collection=type==='legacy'?db.collection('submissions'):parent.ref.collection('submissions');
  let query=type==='legacy'?collection.where('bracketId','==',bracketId):collection;
  if(mode!=='community') query=query.where('userId','==',uid);
  const dateField=type==='legacy'?'submittedAt':'createdAt';
  query=query.orderBy(dateField,'desc').select('userId',dateField,type==='legacy'?'matchups':'picks');
  const fingerprint=createHash('sha256').update(JSON.stringify(base)).digest('hex');
  const cache=db.doc(`_bracketConsensus/${type}-${bracketId}`);
  if(mode==='community') {
    const cached=(await cache.get()).data();
    if(cached?.fingerprint===fingerprint&&millis(cached.updatedAt)>Date.now()-60000) return JSON.parse(cached.result);
  }
  const limit=mode==='community'?2000:100;
  const snap=await query.limit(limit+1).get();
  const seen=new Set(),states=[];
  for(const doc of snap.docs.slice(0,limit)) {
    const data=doc.data();if(!valid(data.userId)||seen.has(data.userId))continue;
    const state=S.compatiblePickState(type,source,data,base);if(!state)continue;
    seen.add(data.userId);
    if(mode!=='community') {
      if(mode==='friend')await canView(req.auth.uid,uid);
      const {nameMap,seedMap}=S.structureFromState(state);
      return {found:true,state,nameMap,seedMap,savedAt:millis(data[dateField]),...(type==='legacy'?{matchups:typeof data.matchups==='string'?JSON.parse(data.matchups):data.matchups}:{picks:data.picks})};
    }
    states.push(state);
  }
  if(mode!=='community'){if(mode==='friend')await canView(req.auth.uid,uid);return {found:false};}
  const result={...S.consensusBracket(base,states),partial:snap.size>limit,computedAt:Date.now()};
  await cache.set({fingerprint,result:JSON.stringify(result),updatedAt:FieldValue.serverTimestamp()});
  return result;
});
