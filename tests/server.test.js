import { beforeAll, beforeEach, describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { generateSeededBracket, structureFromState } from '../src/lib/standardBracket';
import { picksFromState } from '../src/lib/customScoring';
import { serialize } from '../src/lib/customBracketCodec';
import { setResult } from '../src/lib/customBracket';
import { standardWeeklyMatchups, dateKeyET } from '../src/lib/weeklyState';
const require = createRequire(import.meta.url);
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('server transactions against the Firestore emulator', () => {
  let api, db, admin;
  const req = (uid, data) => ({ auth: uid ? { uid, token: { name: uid } } : null, data });
  beforeAll(() => { process.env.GCLOUD_PROJECT = 'demo-im-tourn'; api = require('../functions/index.js'); admin = require('../functions/node_modules/firebase-admin/lib/firestore'); db = admin.getFirestore(); });
  beforeEach(async () => {
    for (const name of ['bracketPools', 'poolEntries', 'weeklyBracket', 'weeklyVotes', 'rankings', 'rankingVotes', 'rankingEntries', 'submissions']) await db.recursiveDelete(db.collection(name));
  });
  test('published bracket edits enforce ownership, concurrency and preserve original picks', async () => {
    const original = { ...serialize(generateSeededBracket(['A','B','C','D'])), hostId:'alice', status:'published', title:'Original', description:'', category:'Movies' };
    await db.doc('customBrackets/edit-source').set(original);
    await db.doc('customBrackets/edit-source/submissions/bob').set({userId:'bob',picks:{m1:'p1'}});
    const args = {type:'custom',bracketId:'edit-source',action:'load'};
    await expect(api.managePublishedBracket.run(req(null,args))).rejects.toMatchObject({code:'unauthenticated'});
    await expect(api.managePublishedBracket.run(req('bob',args))).rejects.toMatchObject({code:'permission-denied'});
    const loaded = await api.managePublishedBracket.run(req('alice',args));
    const details = {...loaded.details,title:'Updated'};
    await api.managePublishedBracket.run(req('alice',{...args,action:'save',details,expectedVersion:loaded.version}));
    await expect(api.managePublishedBracket.run(req('alice',{...args,action:'save',details,expectedVersion:loaded.version}))).rejects.toMatchObject({code:'aborted'});
    const current = await api.managePublishedBracket.run(req('alice',args));
    const revision = {...args,action:'revise',details,expectedVersion:current.version,requestId:'idempotent-revision-123'};
    const [a,b] = await Promise.all([1,2].map(()=>api.managePublishedBracket.run(req('alice',revision))));
    expect(a.bracketId).toBe(b.bracketId);
    expect((await db.doc('customBrackets/'+a.bracketId).get()).data()).toMatchObject({status:'draft',hostId:'alice',title:'Updated',results:{},scores:{},boxes:original.boxes});
    expect((await db.doc('customBrackets/edit-source').get()).data()).toMatchObject({...original,title:'Updated'});
    expect((await db.doc('customBrackets/edit-source/submissions/bob').get()).exists).toBe(true);
  });
  test('legacy owners can edit details and revise without modifying saved matchups', async () => {
    const matchups = [[{entry1:{name:'A',seed:1},entry2:{name:'B',seed:2},winner:1}]];
    const source = {userId:'alice',title:'Legacy',description:'',category:'Movies',matchups:JSON.stringify(matchups)};
    await db.doc('brackets/edit-legacy').set(source);
    const args = {type:'legacy',bracketId:'edit-legacy',action:'load'};
    await expect(api.managePublishedBracket.run(req('bob',args))).rejects.toMatchObject({code:'permission-denied'});
    const loaded = await api.managePublishedBracket.run(req('alice',args));
    await expect(api.managePublishedBracket.run(req('alice',{...args,action:'save',expectedVersion:loaded.version,details:{...loaded.details,title:''}}))).rejects.toMatchObject({code:'invalid-argument'});
    const result=await api.managePublishedBracket.run(req('alice',{...args,action:'revise',expectedVersion:loaded.version,details:loaded.details,requestId:'legacy-revision-123'}));
    expect((await db.doc('customBrackets/'+result.bracketId).get()).data()).toMatchObject({status:'draft',hostId:'alice',participantCount:2,results:{}});
    expect((await db.doc('brackets/edit-legacy').get()).data()).toEqual(source);
  });
  test('reset confirmation, ownership, batched cleanup and resume preserve only the new structure', async () => {
    for (const name of ['_bracketResets','customBrackets','bracketPosts']) await db.recursiveDelete(db.collection(name));
    const source={...serialize(generateSeededBracket(['A','B','C','D'])),title:'Original',hostId:'alice',status:'published'};
    await db.doc('customBrackets/reset-source').set(source);
    const draft={...serialize(generateSeededBracket(['New A','New B'])),hostId:'alice',status:'draft',title:'Updated',replaceOriginal:true,revisionOf:'reset-source',revisionType:'custom'};
    await db.doc('customBrackets/reset-draft').set(draft);
    const batch=db.batch();
    for(let i=0;i<170;i++)batch.set(db.doc(`customBrackets/reset-source/submissions/u${i}`),{userId:`u${i}`,picks:{}});
    batch.set(db.doc('bracketPools/reset-pool'),{bracketId:'reset-source',hostId:'bob',status:'open'});
    for(let i=0;i<170;i++)batch.set(db.doc(`poolEntries/reset-pool_u${i}`),{poolId:'reset-pool',userId:`u${i}`});
    batch.set(db.doc('poolInvites/bracket_reset-pool'),{joinCode:'RESET123'});
    batch.set(db.doc('bracketPosts/reset-post'),{bracketId:'reset-source',status:'published'});
    batch.set(db.doc('bracketPosts/reset-post/comments/one'),{body:'Old comment'});
    batch.set(db.doc('bracketPosts/reset-post/likes/one'),{userId:'bob'});
    batch.set(db.doc('bracketPools/unrelated'),{bracketId:'other',status:'open'});await batch.commit();
    const call=(uid,data)=>api.resetPublishedBracket.run(req(uid,{draftId:'reset-draft',...data}));
    await expect(call('bob',{action:'preview'})).rejects.toMatchObject({code:'permission-denied'});
    const preview=await call('alice',{action:'preview'});expect(preview).toMatchObject({picks:170,pools:1,posts:1});
    await expect(call('alice',{action:'begin',expectedVersion:preview.version,confirmation:'Wrong'})).rejects.toMatchObject({code:'invalid-argument'});
    expect((await db.doc('customBrackets/reset-source').get()).data().resetting).toBeUndefined();
    await call('alice',{action:'begin',expectedVersion:preview.version,confirmation:'Original'});
    expect((await db.doc('customBrackets/reset-source').get()).data().resetting).toBe(true);
    expect(await call('alice',{action:'preview'})).toMatchObject({started:true});
    let result;for(let i=0;i<20;i++){result=await call('alice',{action:'continue'});if(result.done)break;}
    expect(result).toEqual({done:true,view:'custom-bracket-reset-source'});
    expect(await call('alice',{action:'continue'})).toEqual(result);
    const updated=(await db.doc('customBrackets/reset-source').get()).data();
    expect(updated).toMatchObject({title:'Updated',participantCount:2,structureVersion:1,resetting:false,status:'published'});
    expect((await db.collection('customBrackets/reset-source/submissions').get()).empty).toBe(true);
    expect((await db.collection('poolEntries').where('poolId','==','reset-pool').get()).empty).toBe(true);
    for(const path of ['bracketPools/reset-pool','bracketPosts/reset-post','bracketPosts/reset-post/comments/one','bracketPosts/reset-post/likes/one','poolInvites/bracket_reset-pool'])expect((await db.doc(path).get()).exists).toBe(false);
    expect((await db.doc('bracketPools/unrelated').get()).exists).toBe(true);
  });
  test('legacy reset preserves old URLs through a modern bracket alias', async () => {
    await db.doc('brackets/reset-old').set({userId:'alice',title:'Old',matchups:'[]'});
    await db.doc('customBrackets/reset-old-draft').set({...serialize(generateSeededBracket(['A','B','C'])),hostId:'alice',title:'New',status:'draft',replaceOriginal:true,revisionOf:'reset-old',revisionType:'legacy'});
    const call=data=>api.resetPublishedBracket.run(req('alice',{draftId:'reset-old-draft',...data}));
    const p=await call({action:'preview'});await call({action:'begin',confirmation:'Old',expectedVersion:p.version});
    let result;for(let i=0;i<10;i++){result=await call({action:'continue'});if(result.done)break;}
    expect(result).toEqual({done:true,view:'fill-bracket-reset-old'});
    expect((await db.doc('brackets/reset-old').get()).exists).toBe(false);
    expect((await db.doc('bracketRedirects/reset-old').get()).data()).toEqual({customId:'reset-old-draft'});
    expect((await db.doc('customBrackets/reset-old-draft').get()).data()).toMatchObject({status:'published',participantCount:3,replaceOriginal:false});
  });
  test('unauthenticated calls and nonhost pool mutations are rejected', async () => {
    await expect(api.castRankingVote.run(req(null, {}))).rejects.toMatchObject({ code: 'unauthenticated' });
    await db.doc('bracketPools/p').set({ hostId: 'host', status: 'in_progress' });
    await expect(api.managePoolResults.run(req('intruder', { poolId: 'p', action: 'complete' }))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test('simultaneous repeat upvotes are idempotent', async () => {
    await db.doc('submissions/s').set({ upvotes: 0, upvotedBy: [] });
    await Promise.all([1, 2].map(() => api.setSubmissionUpvote.run(req('alice', { submissionId: 's', liked: true }))));
    expect((await db.doc('submissions/s').get()).data().upvotes).toBe(1);
    await api.setSubmissionUpvote.run(req('alice', { submissionId: 's', liked: false }));
    await api.setSubmissionUpvote.run(req('alice', { submissionId: 's', liked: false }));
    expect((await db.doc('submissions/s').get()).data().upvotes).toBe(0);
  });
  test('ranking retries, duplicate items and concurrent voters preserve aggregates', async () => {
    await db.doc('rankings/r').set({ hostId: 'host', status: 'open', entryCount: 3, voteCount: 0 });
    const ids = ['r_0', 'r_1', 'r_2']; for (const [index, id] of ids.entries()) await db.doc(`rankingEntries/${id}`).set({ rankingId: 'r', index });
    await expect(api.castRankingVote.run(req('alice', { rankingId: 'r', ranking: ['r_0','r_1','r_1','r_2'] }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await Promise.all(['alice','bob'].map(uid => api.castRankingVote.run(req(uid, { rankingId: 'r', ranking: ids }))));
    await api.castRankingVote.run(req('alice', { rankingId: 'r', ranking: ids }));
    const result = (await db.doc('rankings/r').get()).data();
    expect(result.voteCount).toBe(2); expect(JSON.parse(result.consensusRanking)[0]).toEqual({ id: 'r_0', score: 4 });
    await db.doc('rankings/r').update({ status: 'closed' });
    await expect(api.castRankingVote.run(req('carol', { rankingId: 'r', ranking: ids }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  async function weekly() {
    const matchups = standardWeeklyMatchups({ ...serialize(generateSeededBracket(Array.from({ length: 32 }, (_, i) => `Team ${i}`))), type: 'standard', status: 'published' });
    await db.doc('weeklyBracket/current').set({ weekId: 'week', currentRound: 0, startDate: admin.Timestamp.fromDate(new Date(`${dateKeyET()}T00:00:00Z`)), matchups: JSON.stringify(matchups), votes: '{}' });
    return Object.fromEntries(matchups[0].map((m, i) => [`r0-m${i}`, 1]));
  }
  // Emulator transaction contention includes retry backoff; retain every assertion
  // while allowing more than the default five seconds on shared CI runners.
  test('weekly votes commit once and reject wrong weeks, rounds, and partial ballots', async () => {
    const votes = await weekly(), data = { weekId: 'week', roundIndex: 0, votes };
    await Promise.all([1, 2].map(() => api.castWeeklyVotes.run(req('alice', data))));
    const current = (await db.doc('weeklyBracket/current').get()).data(); expect(JSON.parse(current.votes)['r0-m0'].entry1).toBe(1);
    for (const change of [{ weekId: 'old' }, { roundIndex: 1 }, { votes: { 'r0-m0': 1 } }]) await expect(api.castWeeklyVotes.run(req('bob', { ...data, ...change }))).rejects.toBeTruthy();
  }, 20000);
  test('a delayed old-week deletion cannot change current tallies', async () => {
    const votes = await weekly(); await api.castWeeklyVotes.run(req('alice', { weekId: 'week', roundIndex: 0, votes }));
    const missing = { data: () => undefined };
    await api.tallyWeeklyVote.run({ data: { before: { data: () => ({ userId: 'old', weekId: 'last-week', votes: JSON.stringify(votes) }) }, after: missing } });
    expect(JSON.parse((await db.doc('weeklyBracket/current').get()).data().votes)['r0-m0'].entry1).toBe(1);
  });
  test('host scores atomically choose winners and recalculate standings', async () => {
    const state=generateSeededBracket(['A','B']),boxId=state.rounds[0][0];
    await db.doc('bracketPools/p').set({hostId:'host',status:'in_progress',bracketMatchups:JSON.stringify(structureFromState(state)),roundPoints:[3],customResults:{}});
    await db.doc('poolEntries/p_alice').set({poolId:'p',userId:'alice',predictions:JSON.stringify({[boxId]:'p1'}),score:0});
    const data={poolId:'p',action:'scores',fields:{[`${boxId}:a`]:10,[`${boxId}:b`]:2}};
    await expect(api.managePoolResults.run(req('intruder',data))).rejects.toMatchObject({code:'permission-denied'});
    await api.managePoolResults.run(req('host',data));
    expect((await db.doc('bracketPools/p').get()).data()).toMatchObject({customScores:{[boxId]:{a:10,b:2}},customResults:{[boxId]:'p1'}});
    expect((await db.doc('poolEntries/p_alice').get()).data().score).toBe(3);
    await api.managePoolResults.run(req('host',{...data,fields:{[`${boxId}:b`]:11}}));
    expect((await db.doc('poolEntries/p_alice').get()).data().score).toBe(0);
  });
  test('completion requires the final and declares all tied submitted entries', async () => {
    let st = generateSeededBracket(['A', 'B']); const structure = structureFromState(st), boxId = st.rounds[0][0]; st = setResult(st, boxId, 'p1');
    await db.doc('bracketPools/p').set({ hostId: 'host', status: 'in_progress', bracketMatchups: JSON.stringify(structure), roundPoints: [3], customResults: {} });
    for (const uid of ['alice','bob']) await db.doc(`poolEntries/p_${uid}`).set({ poolId: 'p', userId: uid, userDisplayName: uid, predictions: JSON.stringify(picksFromState(st)), score: 999 });
    await db.doc('poolEntries/p_empty').set({ poolId: 'p', userId: 'empty', predictions: null, score: 10000 });
    await expect(api.managePoolResults.run(req('host', { poolId: 'p', action: 'complete' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await api.managePoolResults.run(req('host', { poolId: 'p', action: 'pick', boxId, winnerId: 'p1' }));
    await api.managePoolResults.run(req('host', { poolId: 'p', action: 'complete' }));
    const pool = (await db.doc('bracketPools/p').get()).data(); expect(pool.winnerIds.sort()).toEqual(['alice','bob']); expect(pool.winnerScore).toBe(3);
    expect((await db.doc('poolEntries/p_alice').get()).data().score).toBe(3);
  });
  test('sleeper retirement recalculates scores and winners atomically and is idempotent', async () => {
    const { retirePoolSleepers } = require('../functions/retire-sleepers');
    const state = generateSeededBracket(['A','B']);
    const id = state.rounds[0][0], winner = state.boxes[id].slotA.participantId;
    const ref = db.doc('bracketPools/retire');
    await ref.set({status:'completed',enableSleepers:true,sleeper1Points:10,bracketMatchups:JSON.stringify(structureFromState(state)),customResults:{[id]:winner},roundPoints:[1],winnerId:'alice',winnerIds:['alice'],winnerScore:11});
    for (const uid of ['alice','bob']) await db.doc(`poolEntries/retire_${uid}`).set({poolId:'retire',userId:uid,predictions:JSON.stringify({[id]:winner}),score:uid==='alice'?11:1,sleeper1Hit:uid==='alice'});
    expect(await retirePoolSleepers(ref)).toBe(true);
    expect((await ref.get()).data()).toMatchObject({enableSleepers:false,winnerIds:['alice','bob'],winnerScore:1});
    expect((await db.doc('poolEntries/retire_alice').get()).data()).toMatchObject({score:1,retiredSleeperScore:11,sleeper1Hit:false});
    expect(await retirePoolSleepers(ref)).toBe(false);
    expect((await db.doc('poolEntries/retire_alice').get()).data().retiredSleeperScore).toBe(11);
  });

});
