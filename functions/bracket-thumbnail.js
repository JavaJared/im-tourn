const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {getFirestore}=require('firebase-admin/firestore');
const S=require('./generated/scoring.cjs');

// Only public bracket sources and deliberately published snapshots are previewable.
exports.getBracketThumbnail=onCall(async req=>{
  const {type,id}=req.data||{};
  if(!['legacy','custom','post'].includes(type)||typeof id!=='string'||! /^[\w-]{1,200}$/.test(id))
    throw new HttpsError('invalid-argument','Invalid bracket preview.');
  const collection={legacy:'brackets',custom:'customBrackets',post:'bracketPosts'}[type];
  const doc=await getFirestore().doc(`${collection}/${id}`).get(),data=doc.data();
  if(!data||(type==='custom'&&!['published','locked','complete'].includes(data.status))||(type==='post'&&data.status!=='published'))
    throw new HttpsError('not-found','This bracket is unavailable.');
  try {
    const state=type==='post'?JSON.parse(data.snapshot):S.pickSource(type,data);
    if(!Array.isArray(state.rounds)||state.rounds.length>32||!state.boxes||Object.keys(state.boxes).length>1024)throw Error();
    S.validateStructure(state);
    const {nameMap,seedMap}=S.structureFromState(state);
    return {state,nameMap,seedMap};
  } catch {throw new HttpsError('failed-precondition','Preview unavailable.');}
});
