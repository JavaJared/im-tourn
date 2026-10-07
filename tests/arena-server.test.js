import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
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
  afterEach(()=>vi.restoreAllMocks());
  beforeEach(async()=>{
    for(const name of ['goatDebates','goatAccounts'])await db.recursiveDelete(db.collection(name));
    ({id:roomId}=await api.createGoatDebate.run(req(host,{title:'Best food',candidates:['A','B','C','D'],requestId:'create'})));
  });
  it('blocks direct client access to private records and forged account writes',async()=>{
    const env=await initializeTestEnvironment({projectId:'demo-im-tourn',firestore:{rules:readFileSync('firestore.rules','utf8')}});
    try {
      const client=env.authenticatedContext('alice').firestore();
      await assertFails(getDoc(doc(client,`goatDebates/${roomId}/reviewQueue/secret`)));
      await assertFails(getDoc(doc(client,'goatAccounts/alice')));
      await assertFails(setDoc(doc(client,'goatAccounts/alice'),{restricted:false}));
      await assertFails(setDoc(doc(client,`goatDebates/${roomId}/ballots/1_alice`),{candidateId:'c1'}));
    } finally {await env.cleanup();}
  });
  it('requires authenticated participation and admin creation',async()=>{
    await expect(act(null,'vote',{candidateId:'c1'})).rejects.toMatchObject({code:'unauthenticated'});
    await expect(api.createGoatDebate.run(req('alice',{title:'x',candidates:['a','b','c','d'],requestId:'new'}))).rejects.toMatchObject({code:'permission-denied'});
  });
  it('accepts one vote under concurrent requests with no credit requirement',async()=>{
    const results=await Promise.allSettled([act('alice','vote',{candidateId:'c1'}),act('alice','vote',{candidateId:'c2'})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const {room,personal}=await api.getGoatDebate.run(req('alice',{roomId}));
    expect(Object.values(room.votes).reduce((a,b)=>a+b,0)).toBe(1);expect(personal).not.toHaveProperty('credits');
  });
  it('nominations count exactly once on retry and exclude current players',async()=>{
    const args={candidateId:'c3',requestId:'same'};
    await Promise.all([act('alice','nominate',args),act('alice','nominate',args)]);
    expect((await db.doc(`goatDebates/${roomId}/supporters/1_alice`).get()).exists).toBe(true);
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
  it('ignores legacy credit balances, rejects stale rounds and settles once under concurrent reads',async()=>{
    await db.doc('goatAccounts/alice').set({day:new Date().toISOString().slice(0,10),balance:0});
    await act('alice','nominate',{candidateId:'c3'});
    await act('alice','comment',{body:'Still able to participate with no credits.'});
    await act('alice','vote',{candidateId:'c1'});
    await db.doc(`goatDebates/${roomId}`).update({endAt:Date.now()-1});
    await expect(act('bob','vote',{candidateId:'c2'})).rejects.toMatchObject({code:'failed-precondition'});
    await Promise.all([1,2].map(()=>api.getGoatDebate.run(req(null,{roomId}))));
    const room=(await db.doc(`goatDebates/${roomId}`).get()).data();expect(room.round).toBe(2);expect(room.stats.c1.wins).toBe(1);
    expect((await db.collection(`goatDebates/${roomId}/history`).get()).size).toBe(1);
  });
  it('merges concurrent normalized names, counts each user once and keeps pending names private',async()=>{
    const results=await Promise.all([act('alice','nominate',{name:'  New   Player  '}),act('bob','nominate',{name:'new player'})]);
    expect(results[0].candidateId).toBe(results[1].candidateId);
    const snap=await db.doc(`goatDebates/${roomId}`).get(), candidateId=results[0].candidateId;
    expect(snap.data().candidates).toHaveLength(5);expect(snap.data().nominations[candidateId]).toBe(2);
    const publicRoom=(await api.getGoatDebate.run(req(null,{roomId}))).room;
    expect(publicRoom.candidates).toHaveLength(4);expect(publicRoom.nominations[candidateId]).toBeUndefined();
    expect(JSON.stringify(await api.listGoatDebates.run(req(null,{})))).not.toContain('New Player');
    await expect(act('alice','nominate',{name:'Another player'})).rejects.toMatchObject({code:'already-exists'});
    expect((await db.doc(`goatDebates/${roomId}/supporters/1_alice`).get()).exists).toBe(true);
    await expect(api.manageGoatDebate.run(req('alice',{roomId,action:'approveCandidate',candidateId}))).rejects.toMatchObject({code:'permission-denied'});
    await api.manageGoatDebate.run(req(host,{roomId,action:'approveCandidate',candidateId}));
    const visible=(await api.getGoatDebate.run(req(null,{roomId}))).room;
    expect(visible.candidates).toHaveLength(5);expect(visible.nominations[candidateId]).toBe(2);
  });
  it('repeated existing names count as support and request retries do not duplicate support',async()=>{
    const input={name:'  c ',requestId:'name-retry'};
    await act('alice','nominate',input); await act('alice','nominate',input);
    const room=(await db.doc(`goatDebates/${roomId}`).get()).data();
    expect(room.candidates).toHaveLength(4);expect(room.nominations.c3).toBe(1);
    expect((await db.doc(`goatDebates/${roomId}/supporters/1_alice`).get()).exists).toBe(true);
  });
  it('rejects renominations of a defeated candidate by ID or normalized name',async()=>{
    await db.doc(`goatDebates/${roomId}`).update({chairEpoch:0,lossEpoch:{c3:0}});
    await expect(act('alice','nominate',{candidateId:'c3'})).rejects.toMatchObject({code:'failed-precondition'});
    await expect(act('alice','nominate',{name:'  C  '})).rejects.toMatchObject({code:'failed-precondition'});
    expect((await api.getGoatDebate.run(req('alice',{roomId}))).personal.nomination).toBeNull();
    await db.doc(`goatDebates/${roomId}`).update({chairEpoch:1});
    await act('alice','nominate',{name:'C'});
  });
  it('rejected names cannot be resubmitted with different capitalization',async()=>{
    const {candidateId}=await act('alice','nominate',{name:'New Name'});
    await api.manageGoatDebate.run(req(host,{roomId,action:'rejectCandidate',candidateId}));
    await expect(act('bob','nominate',{name:'new name'})).rejects.toMatchObject({code:'failed-precondition'});
  });
  it('upgrades existing rooms using saved results before accepting nominations',async()=>{
    const FieldValue=require('../functions/node_modules/firebase-admin/lib/firestore').FieldValue;
    await db.doc(`goatDebates/${roomId}`).update({lossEpoch:FieldValue.delete(),chairEpoch:FieldValue.delete(),round:4,defender:'c1'});
    await db.doc(`goatDebates/${roomId}/history/00000001`).set({round:1,matchup:['c1','c3'],winner:'c1',tied:false});
    await expect(act('alice','nominate',{name:'C',round:4})).rejects.toMatchObject({code:'failed-precondition'});
    expect((await db.doc(`goatDebates/${roomId}`).get()).data().lossEpoch).toEqual({c3:0});
  });

  it('accepts a new nomination while awaiting a challenger, but keeps voting paused',async()=>{
    await db.doc(`goatDebates/${roomId}`).update({status:'paused',endAt:null,matchup:['c1']});
    const {candidateId}=await act('alice','nominate',{name:'Fresh contender'});
    await expect(act('bob','vote',{candidateId:'c1'})).rejects.toMatchObject({code:'failed-precondition'});
    await api.manageGoatDebate.run(req(host,{roomId,action:'approveCandidate',candidateId}));
    const room=(await db.doc(`goatDebates/${roomId}`).get()).data();
    expect(room.matchup).toEqual(['c1',candidateId]);expect(room.status).toBe('paused');
  });

  it('automatically publishes passing comments, with no private moderation fields exposed',async()=>{
    const classifier=require('../functions/arena-moderation');
    const classify=vi.spyOn(classifier,'classify').mockResolvedValue({status:'approved',reason:'passed',categories:[],model:'test'});
    const args={body:'A has the strongest record.',requestId:'auto'};
    const result=await act('alice','comment',args);expect(result.status).toBe('approved');
    await act('alice','comment',args);expect(classify).toHaveBeenCalledTimes(1);
    const rows=(await api.listGoatDiscussion.run(req(null,{roomId}))).items;
    expect(rows).toHaveLength(1);expect(rows[0]).not.toHaveProperty('receiptId');expect(rows[0]).not.toHaveProperty('moderation');
    await expect(act('alice','comment',{body:'Too soon'})).rejects.toMatchObject({code:'resource-exhausted'});
  });
  it('flagged comments stay private without automatically restricting the account',async()=>{
    vi.spyOn(require('../functions/arena-moderation'),'classify').mockResolvedValue({status:'pending',reason:'flagged',categories:['harassment']});
    const result=await act('alice','comment',{body:'Flagged test fixture'});expect(result.status).toBe('pending');
    expect((await api.listGoatDiscussion.run(req(null,{roomId}))).items).toHaveLength(0);
    expect((await db.doc('goatAccounts/alice').get()).data().restricted).toBeUndefined();
  });
  it('a moderator removal during classification cannot be undone by the automatic result',async()=>{
    vi.spyOn(require('../functions/arena-moderation'),'classify').mockImplementation(async()=>{
      const queued=await db.collection(`goatDebates/${roomId}/reviewQueue`).get();
      await api.manageGoatDebate.run(req(host,{roomId,action:'remove',commentId:queued.docs[0].id}));
      return {status:'approved',reason:'passed'};
    });
    const result=await act('alice','comment',{body:'Removed while checking'});expect(result.status).toBe('removed');
    expect((await api.listGoatDiscussion.run(req(null,{roomId}))).items).toHaveLength(0);
  });
  it('admins can retry held comments after the provider becomes available',async()=>{
    const classify=vi.spyOn(require('../functions/arena-moderation'),'classify').mockResolvedValue({status:'pending',reason:'service-unavailable'});
    const result=await act('alice','comment',{body:'Initially held'});
    await expect(api.manageGoatDebate.run(req('alice',{roomId,action:'recheckComment',commentId:result.commentId}))).rejects.toMatchObject({code:'permission-denied'});
    classify.mockResolvedValue({status:'approved',reason:'passed'});
    await api.manageGoatDebate.run(req(host,{roomId,action:'recheckComment',commentId:result.commentId}));
    expect((await api.listGoatDiscussion.run(req(null,{roomId}))).items).toHaveLength(1);
  });
  it('admins can create more than two rooms without a credit balance',async()=>{
    await db.doc(`goatAccounts/${host}`).set({balance:0});
    for(let i=0;i<3;i++)await api.createGoatDebate.run(req(host,{title:'Another debate',candidates:['A','B','C','D'],requestId:`free-${i}`}));
    expect((await db.collection('goatDebates').get()).size).toBe(4);
  });

});
