const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {getFirestore,FieldValue,FieldPath,Timestamp}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const S=require('./generated/scoring.cjs');
const {resolveUsernames}=require('./public-usernames').internal;
const db=getFirestore();
const valid=id=>typeof id==='string'&&/^[\w-]{1,200}$/.test(id);
const count=value=>Number.isSafeInteger(value)&&value>0?value:0;
const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
function auth(req){if(!req.auth)throw new HttpsError('unauthenticated','Sign in to continue.');return req.auth.uid;}
function postRef(id){if(!valid(id))throw new HttpsError('invalid-argument','Invalid post.');return db.doc(`bracketPosts/${id}`);}
function published(doc){if(!doc.exists||doc.data().status!=='published')throw new HttpsError('not-found','This post is no longer available.');return doc.data();}
function summary(id,data){return {id,type:'post',userId:data.userId,title:text(data.title,200),category:text(data.category,100)||'Other',caption:text(data.caption,500),champion:text(data.champion,200),bracketType:data.bracketType,bracketId:data.bracketId,createdAtMs:data.createdAt?.toMillis?.()||0,likeCount:count(data.likeCount),commentCount:count(data.commentCount)};}
async function budget(tx,uid,kind,max,windowMs){
  const ref=db.doc(`socialWriteLimits/${uid}-${kind}`),old=(await tx.get(ref)).data(),window=Math.floor(Date.now()/windowMs);
  const used=old?.window===window?count(old.count):0;
  if(used>=max)throw new HttpsError('resource-exhausted','Please wait before trying again.');
  return ()=>tx.set(ref,{window,count:used+1});
}
exports.publishBracketPost=onCall(async req=>{
  const uid=auth(req),{type,bracketId,submissionId,caption='',publicConsent}=req.data||{};
  if(!['legacy','custom'].includes(type)||!valid(bracketId)||(type==='legacy'&&!valid(submissionId))||typeof caption!=='string'||caption.length>500||publicConsent!==true)throw new HttpsError('invalid-argument','Confirm that you want to post your saved picks publicly.');
  const sourceRef=db.doc(`${type==='legacy'?'brackets':'customBrackets'}/${bracketId}`);
  const savedRef=type==='legacy'?db.doc(`submissions/${submissionId}`):sourceRef.collection('submissions').doc(uid);
  return db.runTransaction(async tx=>{
    const [sourceDoc,savedDoc]=await tx.getAll(sourceRef,savedRef),source=sourceDoc.data(),saved=savedDoc.data();
    if(!source||(type==='custom'&&!['published','locked','complete'].includes(source.status)))throw new HttpsError('not-found','This bracket is unavailable.');
    if(!saved||saved.userId!==uid||(type==='legacy'&&saved.bracketId!==bracketId))throw new HttpsError('permission-denied','You can only post your own saved bracket.');
    const state=S.compatiblePickState(type,source,saved);
    if(!state)throw new HttpsError('failed-precondition','Save a completed bracket for the current version before posting.');
    const snapshot=JSON.stringify(state);
    if(Buffer.byteLength(snapshot)>500000)throw new HttpsError('failed-precondition','This bracket is too large to post.');
    // Same saved picks yield the same post, including retries after a lost response.
    const id=createHash('sha256').update(JSON.stringify([uid,type,bracketId,snapshot])).digest('hex');
    const ref=postRef(id),existing=await tx.get(ref);
    if(existing.exists){published(existing);return {id,alreadyPosted:true};}
    const spend=await budget(tx,uid,'posts',10,86400000);
    const {nameMap}=S.structureFromState(state);
    tx.create(ref,{status:'published',userId:uid,bracketType:type,bracketId,title:text(source.title,200)||'Bracket',category:text(source.category,100)||'Other',caption:caption.trim(),champion:text(nameMap[S.getChampion(state)],200),snapshot,createdAt:FieldValue.serverTimestamp(),likeCount:0,commentCount:0});spend();
    return {id};
  });
});
exports.getBracketPost=onCall(async req=>{
  const ref=postRef(req.data?.postId),data=published(await ref.get());
  const liked=req.auth?(await ref.collection('likes').doc(req.auth.uid).get()).exists:false;
  const state=JSON.parse(data.snapshot),{nameMap,seedMap}=S.structureFromState(state);
  return {...summary(ref.id,data),state,nameMap,seedMap,liked,usernames:await resolveUsernames([data.userId])};
});
exports.setBracketPostLike=onCall(async req=>{
  const uid=auth(req),ref=postRef(req.data?.postId),liked=req.data?.liked;
  if(typeof liked!=='boolean')throw new HttpsError('invalid-argument','Choose a like state.');
  return db.runTransaction(async tx=>{
    const likeRef=ref.collection('likes').doc(uid),[post,like]=await tx.getAll(ref,likeRef),data=published(post);
    if(like.exists===liked)return {liked,likeCount:count(data.likeCount)};
    const spend=await budget(tx,uid,'likes',120,3600000);
    const likeCount=Math.max(0,count(data.likeCount)+(liked?1:-1));
    if(liked)tx.create(likeRef,{createdAt:FieldValue.serverTimestamp()});else tx.delete(likeRef);
    tx.update(ref,{likeCount});spend();return {liked,likeCount};
  });
});
function decodeCursor(cursor){
  if(!cursor)return null;
  try{if(typeof cursor!=='string'||cursor.length>1000)throw Error();const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!valid(c.id)||!Number.isSafeInteger(c.seconds)||c.seconds<0||c.seconds>253402300799||!Number.isInteger(c.nanoseconds)||c.nanoseconds<0||c.nanoseconds>=1e9)throw Error();return c;}
  catch{throw new HttpsError('invalid-argument','Refresh the comments to continue.');}
}
exports.listBracketPostComments=onCall(async req=>{
  const ref=postRef(req.data?.postId);published(await ref.get());
  let query=ref.collection('comments').orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc').limit(21);
  const after=decodeCursor(req.data?.cursor);if(after)query=query.startAfter(new Timestamp(after.seconds,after.nanoseconds),after.id);
  const snap=await query.get(),docs=snap.docs.slice(0,20),last=docs.at(-1);
  // A deletion during the read must not expose comments from a removed post.
  published(await ref.get());
  const items=docs.map(doc=>({id:doc.id,userId:doc.data().userId,body:text(doc.data().body,1000),createdAtMs:doc.data().createdAt?.toMillis?.()||0}));
  return {items,usernames:await resolveUsernames(items.map(item=>item.userId)),nextCursor:snap.size>20?Buffer.from(JSON.stringify({id:last.id,seconds:last.data().createdAt.seconds,nanoseconds:last.data().createdAt.nanoseconds})).toString('base64url'):null};
});
exports.listUserBracketPosts=onCall(async req=>{
  const userId=req.data?.userId;if(!valid(userId))throw new HttpsError('invalid-argument','Invalid profile.');
  let query=db.collection('bracketPosts').where('status','==','published').where('userId','==',userId).orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc').select('status','userId','title','category','caption','champion','bracketType','bracketId','createdAt','likeCount','commentCount').limit(11);
  const after=decodeCursor(req.data?.cursor);if(after)query=query.startAfter(new Timestamp(after.seconds,after.nanoseconds),after.id);
  const snap=await query.get(),docs=snap.docs.slice(0,10),last=docs.at(-1),items=docs.map(doc=>summary(doc.id,doc.data()));
  if(req.auth&&items.length){const likes=await db.getAll(...docs.map(doc=>doc.ref.collection('likes').doc(req.auth.uid)));items.forEach((item,i)=>{item.liked=likes[i].exists;});}
  return {items,usernames:await resolveUsernames([userId]),nextCursor:snap.size>10?Buffer.from(JSON.stringify({id:last.id,seconds:last.data().createdAt.seconds,nanoseconds:last.data().createdAt.nanoseconds})).toString('base64url'):null};
});
exports.addBracketPostComment=onCall(async req=>{
  const uid=auth(req),ref=postRef(req.data?.postId),{body,requestId}=req.data||{};
  if(typeof body!=='string'||!body.trim()||body.length>1000||!valid(requestId))throw new HttpsError('invalid-argument','Enter a comment of 1–1,000 characters.');
  const id=createHash('sha256').update(JSON.stringify([uid,requestId])).digest('hex');
  return db.runTransaction(async tx=>{
    const commentRef=ref.collection('comments').doc(id),[post,old]=await tx.getAll(ref,commentRef),data=published(post);
    if(old.exists)return {id,commentCount:count(data.commentCount)};
    const spend=await budget(tx,uid,'comments',60,3600000);
    tx.create(commentRef,{userId:uid,body:body.trim(),createdAt:FieldValue.serverTimestamp()});
    tx.update(ref,{commentCount:count(data.commentCount)+1});spend();return {id,commentCount:count(data.commentCount)+1};
  });
});
exports.deleteBracketPostComment=onCall(async req=>{
  const uid=auth(req),ref=postRef(req.data?.postId),id=req.data?.commentId;
  if(!valid(id))throw new HttpsError('invalid-argument','Invalid comment.');
  return db.runTransaction(async tx=>{
    const commentRef=ref.collection('comments').doc(id),[post,comment]=await tx.getAll(ref,commentRef),data=published(post);
    if(comment.exists&&comment.data().userId!==uid&&data.userId!==uid)throw new HttpsError('permission-denied','You cannot remove this comment.');
    if(comment.exists){tx.delete(commentRef);tx.update(ref,{commentCount:Math.max(0,count(data.commentCount)-1)});}
    return {ok:true};
  });
});
exports.deleteBracketPost=onCall(async req=>{
  const uid=auth(req),ref=postRef(req.data?.postId);
  await db.runTransaction(async tx=>{
    const doc=await tx.get(ref);if(!doc.exists)return;
    if(doc.data().userId!==uid)throw new HttpsError('permission-denied','Only the author can remove this post.');
    // Keep a small tombstone so a retried publish cannot resurrect the post.
    tx.set(ref,{status:'deleted',userId:uid,deletedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});
exports.internal={summary,decodeCursor};
