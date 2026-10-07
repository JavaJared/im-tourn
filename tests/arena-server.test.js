import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createRequire } from 'node:module';
vi.setConfig({testTimeout:30000,hookTimeout:30000});
const require=createRequire(import.meta.url);
const run=process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('GOAT Arena transactions',()=>{
  let api,db,roomId;
  const host='VBbDwj6gkVgW7gBcs3vTmt0ulLF2';
  const req=(user,data)=>({auth:user?{uid:user,token:{}}:null,data});
  const act=(user,action,extra={})=>api.actOnGoatDebate.run(req(user,{roomId,round:1,requestId:crypto.randomUUID(),action,...extra}));
  beforeAll(()=>{process.env.GCLOUD_PROJECT='demo-im-tourn';api=require('../functions/index.js');db=require('../functions/node_modules/firebase-admin/lib/firestore').getFirestore();});
  beforeEach(async()=>{
    for(const name of ['goatDebates','goatAccounts'])await db.recursiveDelete(db.collection(name));
    ({id:roomId}=await api.createGoatDebate.run(req(host,{title:'Best food',candidates:['A','B','C','D'],requestId:'create'})));
  });
  it('blocks direct client access to private records and forged credit writes',async()=>{
    const env=await initializeTestEnvironment({projectId:'demo-im-tourn',firestore:{rules:readFileSync('firestore.rules','utf8')}});
    try {
      const client=env.authenticatedContext('alice').firestore();
      await assertFails(getDoc(doc(client,`goatDebates/${roomId}/reviewQueue/secret`)));
      await assertFails(getDoc(doc(client,'goatAccounts/alice')));
      await assertFails(setDoc(doc(client,'goatAccounts/alice'),{balance:999}));
      await assertFails(setDoc(doc(client,`goatDebates/${roomId}/ballots/1_alice`),{candidateId:'c1'}));
    } finally {await env.cleanup();}
  });
  it('requires authenticated participation and admin creation',async()=>{
    await expect(act(null,'vote',{candidateId:'c1'})).rejects.toMatchObject({code:'unauthenticated'});
    await expect(api.createGoatDebate.run(req('alice',{title:'x',candidates:['a','b','c','d'],requestId:'new'}))).rejects.toMatchObject({code:'permission-denied'});
  });
  it('accepts one vote under concurrent requests and never charges for voting',async()=>{
    const results=await Promise.allSettled([act('alice','vote',{candidateId:'c1'}),act('alice','vote',{candidateId:'c2'})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const {room,personal}=await api.getGoatDebate.run(req('alice',{roomId}));
    expect(Object.values(room.votes).reduce((a,b)=>a+b,0)).toBe(1);expect(personal.credits).toBe(10);
  });
  it('nominations are charged exactly once on retry and exclude current players',async()=>{
    const args={candidateId:'c3',requestId:'same'};
    await Promise.all([act('alice','nominate',args),act('alice','nominate',args)]);
    expect((await db.doc('goatAccounts/alice').get()).data().balance).toBe(8);
    await expect(act('bob','nominate',{candidateId:'c1'})).rejects.toMatchObject({code:'failed-precondition'});
    await expect(act('alice','nominate',{candidateId:'c4'})).rejects.toMatchObject({code:'already-exists'});
  });
  it('holds comments privately, exposes only approved comments and enforces restrictions',async()=>{
    const result=await act('alice','comment',{body:'A is my pick.'});expect(result.status).toBe('pending');
    expect((await api.listGoatDiscussion.run(req(null,{roomId}))).items).toHaveLength(0);
    await expect(api.manageGoatDebate.run(req('alice',{roomId,action:'approve',commentId:result.commentId}))).rejects.toMatchObject({code:'permission-denied'});
    await api.manageGoatDebate.run(req(host,{roomId,action:'approve',commentId:result.commentId}));
    expect((await api.listGoatDiscussion.run(req(null,{roomId}))).items).toHaveLength(1);
    await api.manageGoatDebate.run(req(host,{roomId,action:'restrict',commentId:result.commentId}));
    await expect(act('alice','vote',{candidateId:'c1'})).rejects.toMatchObject({code:'permission-denied'});
    await api.manageGoatDebate.run(req(host,{roomId,action:'restore',userId:'alice'}));
    await act('alice','vote',{candidateId:'c1'});
  });
  it('paginates comments with tied timestamps and history without dropping records',async()=>{
    const batch=db.batch();
    for(let i=0;i<35;i++)batch.set(db.doc(`goatDebates/${roomId}/comments/comment${String(i).padStart(2,'0')}`),{body:'Comment',userId:'alice',createdAt:100,round:1});
    batch.set(db.doc(`goatDebates/${roomId}/history/00000001`),{round:1,matchup:['c1','c2'],votes:{},winner:null});await batch.commit();
    const first=await api.listGoatDiscussion.run(req(null,{roomId}));
    const second=await api.listGoatDiscussion.run(req(null,{roomId,cursor:first.nextCursor}));
    expect(first.items).toHaveLength(30);expect(second.items).toHaveLength(5);
    expect(new Set([...first.items,...second.items].map(c=>c.id)).size).toBe(35);
    expect((await api.listGoatDiscussion.run(req(null,{roomId,history:true}))).items).toHaveLength(1);
  });
  it('rejects overspending and stale rounds, then settles once under concurrent reads',async()=>{
    await db.doc('goatAccounts/alice').set({day:new Date().toISOString().slice(0,10),balance:1});
    await expect(act('alice','nominate',{candidateId:'c3'})).rejects.toMatchObject({code:'resource-exhausted'});
    await act('alice','vote',{candidateId:'c1'});
    await db.doc(`goatDebates/${roomId}`).update({endAt:Date.now()-1});
    await expect(act('bob','vote',{candidateId:'c2'})).rejects.toMatchObject({code:'failed-precondition'});
    await Promise.all([1,2].map(()=>api.getGoatDebate.run(req(null,{roomId}))));
    const room=(await db.doc(`goatDebates/${roomId}`).get()).data();expect(room.round).toBe(2);expect(room.stats.c1.wins).toBe(1);
    expect((await db.collection(`goatDebates/${roomId}/history`).get()).size).toBe(1);
  });
});
