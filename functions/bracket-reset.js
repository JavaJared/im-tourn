const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const S=require('./generated/scoring.cjs');
const fail=(code,message)=>{throw new HttpsError(code,message);};
const valid=id=>typeof id==='string'&&/^[\w-]{1,200}$/.test(id);
const ver=snap=>`${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}`;
const sourceRef=(db,d)=>db.doc(`${d.revisionType==='legacy'?'brackets':'customBrackets'}/${d.revisionOf}`);
async function ownedDraft(tx,db,uid,id){
 const snap=await tx.get(db.doc(`customBrackets/${id}`)),d=snap.data();
 if(!d||d.hostId!==uid||!d.replaceOriginal||!valid(d.revisionOf)||!['custom','legacy'].includes(d.revisionType))fail('permission-denied','Only the creator can reset this bracket.');
 return {snap,d};
}
const jobRef=(db,id)=>db.doc(`_bracketResets/${id}`);
exports.resetPublishedBracket=onCall({timeoutSeconds:120},async req=>{
 if(!req.auth)fail('unauthenticated','Please sign in.');
 const {draftId,action,confirmation,expectedVersion}=req.data||{},uid=req.auth.uid;
 if(!valid(draftId)||!['preview','begin','continue'].includes(action))fail('invalid-argument','Invalid reset request.');
 const db=getFirestore(),job=jobRef(db,draftId);
 if(action==='preview'){
  const {snap,d,original}=await db.runTransaction(async tx=>{const {snap,d}=await ownedDraft(tx,db,uid,draftId);const original=await tx.get(sourceRef(db,d));return {snap,d,original};});
  const existing=await job.get();
  if(existing.exists)return {started:true,done:existing.data().done,view:existing.data().view};
  if(!original.exists||original.data()[d.revisionType==='legacy'?'userId':'hostId']!==uid)fail('permission-denied','Original bracket unavailable.');
  const picks=d.revisionType==='legacy'?db.collection('submissions').where('bracketId','==',d.revisionOf):original.ref.collection('submissions');
  const [a,b,c]=await Promise.all([picks.count().get(),db.collection('bracketPools').where('bracketId','==',d.revisionOf).count().get(),db.collection('bracketPosts').where('bracketId','==',d.revisionOf).count().get()]);
  return {title:original.data().title||'Untitled bracket',picks:a.data().count,pools:b.data().count,posts:c.data().count,version:ver(snap)};
 }
 if(action==='begin')return db.runTransaction(async tx=>{
  const old=await tx.get(job);if(old.exists){if(old.data().uid!==uid)fail('permission-denied','Not your reset.');return {done:old.data().done,view:old.data().view};}
  const {snap,d}=await ownedDraft(tx,db,uid,draftId),ref=sourceRef(db,d),original=await tx.get(ref),data=original.data();
  if(!data||data[d.revisionType==='legacy'?'userId':'hostId']!==uid)fail('permission-denied','Original bracket unavailable.');
  if(data.resetting)fail('failed-precondition','Another reset is already running.');
  if(d.status!=='draft'||expectedVersion!==ver(snap))fail('aborted','The draft changed. Review the reset again.');
  if(confirmation!==(data.title||'Untitled bracket'))fail('invalid-argument','Type the original bracket title exactly.');
  let state;try{state=S.pickSource('custom',d);if(!S.validateForPublish(state).valid)throw Error();}catch{fail('failed-precondition','Finish all entries and matchups before replacing the original.');}
  const target={...S.serialize(state),title:d.title,description:d.description||'',category:d.category||'',status:'published',structureVersion:(data.structureVersion||0)+1};
  const view=`${d.revisionType==='legacy'?'fill-bracket-':'custom-bracket-'}${d.revisionOf}`;
  tx.create(job,{uid,sourcePath:ref.path,sourceId:d.revisionOf,sourceType:d.revisionType,target,phase:'pools',done:false,view,createdAt:FieldValue.serverTimestamp()});
  tx.update(ref,{resetting:true,resetDraftId:draftId});tx.update(snap.ref,{resetting:true});
  return {done:false};
 });
 // Each call commits a bounded batch. Transaction retries and repeated calls are safe.
 return db.runTransaction(async tx=>{
  const js=await tx.get(job),j=js.data();if(!j||j.uid!==uid)fail('permission-denied','Reset unavailable.');
  if(j.done)return {done:true,view:j.view};
  const source=db.doc(j.sourcePath),original=await tx.get(source);
  if(!original.exists||!original.data().resetting)fail('failed-precondition','Reset lock is missing.');
  if(j.phase==='pools'){
   const pools=await tx.get(db.collection('bracketPools').where('bracketId','==',j.sourceId).limit(1));
   if(pools.empty){tx.update(job,{phase:'posts'});return {done:false};}
   const p=pools.docs[0],entries=await tx.get(db.collection('poolEntries').where('poolId','==',p.id).limit(150));
   if(!entries.empty){tx.update(p.ref,{status:'deleting'});entries.docs.forEach(e=>tx.delete(e.ref));return {done:false};}
   const invite=db.doc(`poolInvites/bracket_${p.id}`),inv=await tx.get(invite),code=inv.data()?.joinCode||p.data().joinCode;
   tx.delete(p.ref);tx.delete(invite);if(code)tx.delete(db.doc(`poolInviteCodes/${createHash('sha256').update(`bracket:${code}`).digest('hex')}`));
   return {done:false};
  }
  if(j.phase==='posts'){
   const posts=await tx.get(db.collection('bracketPosts').where('bracketId','==',j.sourceId).limit(1));
   if(posts.empty){tx.update(job,{phase:'picks'});return {done:false};}
   const p=posts.docs[0],comments=await tx.get(p.ref.collection('comments').limit(100)),likes=await tx.get(p.ref.collection('likes').limit(100));
   if(comments.empty&&likes.empty)tx.delete(p.ref);else{tx.update(p.ref,{status:'deleting'});[...comments.docs,...likes.docs].forEach(d=>tx.delete(d.ref));}return {done:false};
  }
  const query=j.sourceType==='legacy'?db.collection('submissions').where('bracketId','==',j.sourceId):source.collection('submissions');
  const picks=await tx.get(query.limit(150));
  if(!picks.empty){picks.docs.forEach(d=>tx.delete(d.ref));return {done:false};}
  // Cleanup finished: publish and unlock atomically. Legacy URLs become aliases.
  const draft=db.doc(`customBrackets/${draftId}`);
  if(j.sourceType==='legacy'){
   tx.update(draft,{...j.target,resetting:false,replaceOriginal:false,updatedAt:FieldValue.serverTimestamp()});
   tx.set(db.doc(`bracketRedirects/${j.sourceId}`),{customId:draftId});tx.delete(source);
  }else{
   tx.update(source,{...j.target,resetting:false,resetDraftId:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()});
   tx.update(draft,{status:'replaced',resetting:false});
  }
  tx.delete(db.doc(`_bracketConsensus/${j.sourceType}-${j.sourceId}`));
  tx.update(job,{done:true,target:FieldValue.delete(),completedAt:FieldValue.serverTimestamp()});return {done:true,view:j.view};
 });
});
