import { beforeAll, beforeEach, describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('accepted friends and shared activity', () => {
  let api, db, Timestamp, pairRef;
  const request = (uid, data = {}) => ({auth:uid ? {uid,token:{name:uid.toUpperCase()}} : null, data});
  const call = (endpoint, uid, data) => api[endpoint].run(request(uid,data));
  const connect = async () => {
    const profile = await call('getFriendProfile','bob');
    await call('sendFriendRequest','alice',{code:profile.code});
    await call('respondToFriend','bob',{friendId:'alice',action:'accept'});
  };
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = 'demo-im-tourn'; api = require('../functions/index.js');
    const admin = require('../functions/node_modules/firebase-admin/lib/firestore'); db=admin.getFirestore(); Timestamp=admin.Timestamp;
    pairRef = require('../functions/friends').internal.pairRef;
  });
  beforeEach(async () => {for (const name of ['accountProfiles','usernames','friendships','friendProfiles','friendCodes','friendRequestLimits','brackets','customBrackets','submissions','rankings','rankingVotes','rankingEntries','bracketPools','poolEntries']) await db.recursiveDelete(db.collection(name));});
  test('codes are stable, do not expose emails, and require sign-in',async()=>{
    await expect(call('getFriendProfile',null)).rejects.toMatchObject({code:'unauthenticated'});
    const one = await call('getFriendProfile','alice');
    expect(await call('getFriendProfile','alice')).toEqual(one);
    expect(one.code).toMatch(/^[A-F0-9]{24}$/);
    expect(Object.keys(one).sort()).toEqual(['code','displayName']);
    await expect(call('sendFriendRequest','alice',{code:one.code})).rejects.toMatchObject({code:'invalid-argument'});
  });
  test('only the recipient can accept; duplicate and reciprocal requests stay pending',async()=>{
    const a=await call('getFriendProfile','alice'), b=await call('getFriendProfile','bob');
    await call('sendFriendRequest','alice',{code:b.code});
    await call('sendFriendRequest','alice',{code:b.code});
    await call('sendFriendRequest','bob',{code:a.code});
    expect((await pairRef('alice','bob').get()).data().status).toBe('pending');
    await expect(call('respondToFriend','alice',{friendId:'bob',action:'accept'})).rejects.toMatchObject({code:'failed-precondition'});
    await expect(call('respondToFriend','eve',{friendId:'bob',action:'accept'})).rejects.toMatchObject({code:'not-found'});
    await call('respondToFriend','bob',{friendId:'alice',action:'accept'});
    expect((await call('listFriends','alice')).items[0]).toMatchObject({friendId:'bob',status:'accepted'});
    expect((await call('listFriends','eve')).items).toEqual([]);
  });
  test('pending requests, strangers, and removed friends cannot read history or saved choices',async()=>{
    const b=await call('getFriendProfile','bob'); await call('sendFriendRequest','alice',{code:b.code});
    const query={friendId:'bob',type:'legacy',mode:'filled'};
    await expect(call('listFriendActivities','alice',query)).rejects.toMatchObject({code:'permission-denied'});
    await call('respondToFriend','bob',{friendId:'alice',action:'accept'});
    await call('respondToFriend','alice',{friendId:'bob',action:'remove'});
    await expect(call('listFriendActivities','alice',query)).rejects.toMatchObject({code:'permission-denied'});
    await expect(call('getFriendActivity','alice',{friendId:'bob',type:'legacy',activityId:'s'})).rejects.toMatchObject({code:'permission-denied'});
    await expect(call('sendFriendRequest','alice',{code:b.code})).rejects.toMatchObject({code:'resource-exhausted'});
  });
  test('request decline/cancel and daily limit are enforced on the server',async()=>{
    const b=await call('getFriendProfile','bob'); await call('sendFriendRequest','alice',{code:b.code});
    await expect(call('respondToFriend','bob',{friendId:'alice',action:'cancel'})).rejects.toMatchObject({code:'failed-precondition'});
    await call('respondToFriend','bob',{friendId:'alice',action:'decline'});
    expect((await call('listFriends','bob')).items).toEqual([]);
    const c=await call('getFriendProfile','carol'); await call('sendFriendRequest','alice',{code:c.code});
    await call('respondToFriend','alice',{friendId:'carol',action:'cancel'});
    await db.doc('friendRequestLimits/alice').set({day:new Date().toISOString().slice(0,10),count:20});
    const d=await call('getFriendProfile','dave');
    await expect(call('sendFriendRequest','alice',{code:d.code})).rejects.toMatchObject({code:'resource-exhausted'});
  });
  test('created pages are bounded, include missing dates, exclude unpublished content, and never return picks',async()=>{
    await connect(); const batch=db.batch();
    for(let i=0;i<27;i++) batch.set(db.doc(`customBrackets/b${String(i).padStart(2,'0')}`),{hostId:'bob',title:`B${i}`,status:i===0?'draft':'published',boxes:'heavy',joinCode:'SECRET'});
    await batch.commit(); let cursor=null; const ids=[];
    do {const page=await call('listFriendActivities','alice',{friendId:'bob',type:'custom',mode:'created',cursor}); expect(page.items.length).toBeLessThanOrEqual(12); expect(JSON.stringify(page)).not.toContain('SECRET'); expect(JSON.stringify(page)).not.toContain('heavy'); ids.push(...page.items.map(i=>i.id)); cursor=page.nextCursor;} while(cursor);
    expect(new Set(ids).size).toBe(26);
    await expect(call('listFriendActivities','alice',{friendId:'bob',type:'pool',mode:'filled'})).rejects.toMatchObject({code:'invalid-argument'});
  });
  test('custom fills retain distinct IDs, resolve saved choices, and ignore private pool entries',async()=>{
    await connect();
    for(const id of ['one','two']) {
      await db.doc(`customBrackets/${id}`).set({title:id,status:'published',rounds:[{ids:['m1']}],boxes:{m1:{slotA:{type:'named',participantId:'p1',name:'Winner'},slotB:{type:'named',participantId:'p2',name:'Loser'}}}});
      await db.doc(`customBrackets/${id}/submissions/bob`).set({userId:'bob',picks:{m1:'p1'},createdAt:Timestamp.now()});
    }
    await db.doc('poolEntries/private').set({userId:'bob',picks:'PRIVATE',createdAt:Timestamp.now()});
    const page=await call('listFriendActivities','alice',{friendId:'bob',type:'custom',mode:'filled'});
    expect(new Set(page.items.map(i=>i.id)).size).toBe(2);
    expect(JSON.stringify(page)).not.toContain('PRIVATE'); expect(JSON.stringify(page)).not.toContain('picks');
    expect((await call('getFriendActivity','alice',{friendId:'bob',type:'custom',activityId:page.items[0].activityId})).sections[0].choices).toEqual(['Winner']);
    await expect(call('getFriendActivity','alice',{friendId:'bob',type:'custom',activityId:'poolEntries/private'})).rejects.toMatchObject({code:'invalid-argument'});
  });
  test('ranked choices preserve order and saved lookups cannot impersonate another owner',async()=>{
    await connect();
    await db.doc('rankings/r').set({title:'Ranking',hostId:'bob',status:'open'});
    await db.doc('rankingEntries/a').set({rankingId:'r',text:'Alpha'}); await db.doc('rankingEntries/b').set({rankingId:'r',text:'Beta'});
    await db.doc('rankingVotes/r_bob').set({rankingId:'r',userId:'bob',ranking:JSON.stringify(['b','a']),submittedAt:Timestamp.now()});
    const result=await call('getFriendActivity','alice',{friendId:'bob',type:'ranking',activityId:'r_bob'});
    expect(result.sections[0].choices).toEqual(['Beta','Alpha']);
    await db.doc('rankingVotes/r_eve').set({rankingId:'r',userId:'eve',ranking:'[]'});
    await expect(call('getFriendActivity','alice',{friendId:'bob',type:'ranking',activityId:'r_eve'})).rejects.toMatchObject({code:'not-found'});
    await db.doc('rankings/r').update({status:'draft'});
    expect((await call('listFriendActivities','alice',{friendId:'bob',type:'ranking',mode:'filled'})).items).toEqual([]);
    await expect(call('getFriendActivity','alice',{friendId:'bob',type:'ranking',activityId:'r_bob'})).rejects.toMatchObject({code:'not-found'});
  });
  test('legacy saved choices have readable winners; foreign cursors are rejected',async()=>{
    await connect(); await db.doc('brackets/b').set({userId:'bob',title:'Legacy'});
    await db.doc('submissions/s').set({userId:'bob',bracketId:'b',matchups:JSON.stringify([[{entry1:{name:'A'},entry2:{name:'B'},winner:2}]] )});
    await db.doc('submissions/foreign').set({userId:'eve',bracketId:'b'});
    expect((await call('getFriendActivity','alice',{friendId:'bob',type:'legacy',activityId:'s'})).sections[0].choices).toEqual(['B']);
    await expect(call('listFriendActivities','alice',{friendId:'bob',type:'legacy',mode:'filled',cursor:'foreign'})).rejects.toMatchObject({code:'failed-precondition'});
    await db.doc('brackets/b').delete();
    expect((await call('listFriendActivities','alice',{friendId:'bob',type:'legacy',mode:'filled'})).items).toEqual([]);
  });
  test('profiles expose counts and completed pool finishes only to the owner or friend', async () => {
    await connect();
    await db.doc('friendProfiles/bob').set({ displayName: 'Bob' });
    await db.doc('brackets/created').set({ userId: 'bob', title: 'Created bracket' });
    await db.doc('customBrackets/created').set({ hostId: 'bob', title: 'Custom bracket', status: 'published' });
    await db.doc('rankings/created').set({ hostId: 'bob', title: 'Ranking', status: 'open' });
    await db.doc('submissions/saved').set({ userId: 'bob', bracketId: 'created' });
    await db.doc('customBrackets/created/submissions/bob').set({ userId: 'bob', createdAt: Timestamp.now() });
    await db.doc('rankingVotes/ranking_bob').set({ userId: 'bob', rankingId: 'created' });
    await db.doc('bracketPools/pool').set({ status: 'completed', winnerIds: ['alice'], winnerId: 'alice' });
    await db.doc('poolEntries/pool_bob').set({ userId: 'bob', poolId: 'pool', score: 7, submittedAt: Timestamp.now() });
    await db.doc('poolEntries/pool_alice').set({ userId: 'alice', poolId: 'pool', score: 9, submittedAt: Timestamp.now() });
    const profile = await call('getUserProfile', 'alice', { profileId: 'bob' });
    expect(profile).toMatchObject({ displayName: 'Bob', isSelf: false, stats: { createdBrackets: 2, createdRankings: 1, filledBrackets: 2, filledRankings: 1, poolsJoined: 1, completedPools: 1, averageFinalRank: 2, highestFinalRank: 2, poolsWon: 0 } });
    await call('respondToFriend', 'alice', { friendId: 'bob', action: 'remove' });
    const publicProfile = await call('getUserProfile', 'alice', { profileId: 'bob' });
    expect(publicProfile).toMatchObject({ relationship: 'none', canViewPrivate: false, canSendFriendRequest: true, stats: { createdBrackets: 2, createdRankings: 1 } });
    expect(publicProfile.stats).not.toHaveProperty('filledBrackets');
    expect(publicProfile.stats).not.toHaveProperty('poolsJoined');
  });
  test('profile request states and public creations work without friendship', async () => {
    await call('getFriendProfile', 'bob');
    await db.doc('customBrackets/public').set({hostId:'bob',title:'Public',status:'published'});
    await db.doc('customBrackets/private').set({hostId:'bob',title:'Secret draft',status:'draft'});
    expect((await call('getUserProfile','alice',{profileId:'bob'})).relationship).toBe('none');
    const page = await call('listFriendActivities','alice',{friendId:'bob',type:'custom'});
    expect(page.items.map(item => item.title)).toEqual(['Public']);
    expect(page.items[0].userId).toBe('bob');
    await call('sendFriendRequest','alice',{friendId:'bob'});
    expect((await call('getUserProfile','alice',{profileId:'bob'})).relationship).toBe('outgoing');
    expect((await call('getUserProfile','bob',{profileId:'alice'})).relationship).toBe('incoming');
    await expect(call('listFriendActivities','alice',{friendId:'bob',type:'custom',mode:'filled'})).rejects.toMatchObject({code:'permission-denied'});
    await call('respondToFriend','bob',{friendId:'alice',action:'accept'});
    expect(await call('getUserProfile','alice',{profileId:'bob'})).toMatchObject({relationship:'accepted',canViewPrivate:true,canSendFriendRequest:false});
  });

  test('usernames are unique under concurrent and case-insensitive claims', async () => {
    const { changeUsername } = require('../functions/usernames').internal;
    const results = await Promise.allSettled([changeUsername('alice','Jared'),changeUsername('bob','jared')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.code).toBe('already-exists');
    const owner = (await db.doc('usernames/jared').get()).data().uid;
    expect((await db.doc(`accountProfiles/${owner}`).get()).data().username).toBe('jared');
    expect((await changeUsername(owner, '  @JARED  ')).username).toBe('jared');
    await changeUsername(owner,'new_name');
    expect((await db.doc('usernames/jared').get()).exists).toBe(false);
    expect((await db.doc('usernames/new_name').get()).data().uid).toBe(owner);
    await expect(api.setAccountUsername.run(request(null,{username:'other'}))).rejects.toMatchObject({code:'unauthenticated'});
    await api.setAccountUsername.run(request('eve',{username:'eve_name',uid:owner}));
    expect((await db.doc(`accountProfiles/${owner}`).get()).data().username).toBe('new_name');
  });
  test('existing users receive stable defaults while new users must choose', async () => {
    const { ensureAccount, changeUsername } = require('../functions/usernames').internal;
    const cutoff = Date.parse('2026-09-21T12:00:00Z');
    const old = {uid:'old',metadata:{creationTime:'2026-09-20T00:00:00Z'}};
    const first = await ensureAccount(old,cutoff);
    expect(first).toMatchObject({usernameIsDefault:true,needsUsername:false});
    expect(first.username).toMatch(/^user_[a-f0-9]{18}$/);
    expect(await ensureAccount(old,cutoff)).toEqual(first);
    expect(await ensureAccount({uid:'new',metadata:{creationTime:'2026-09-21T12:00:00Z'}},cutoff)).toMatchObject({needsUsername:true,username:null});
    await changeUsername('old','chosen_name');
    expect((await ensureAccount(old,cutoff)).username).toBe('chosen_name');
    for (const username of ['a','bad name','123name','admin','user_fake','éclair','a'.repeat(25)]) await expect(changeUsername('new',username)).rejects.toMatchObject({code:'invalid-argument'});
  });
  test('friends can be requested by their current username', async () => {
    await call('getFriendProfile','bob');
    await api.setAccountUsername.run(request('bob',{username:'bob_tourn'}));
    await call('sendFriendRequest','alice',{username:'@BOB_TOURN'});
    expect((await pairRef('alice','bob').get()).data().status).toBe('pending');
    await expect(call('sendFriendRequest','alice',{username:'missing_user'})).rejects.toMatchObject({code:'not-found'});
    expect((await call('getUserProfile','alice',{profileId:'bob'})).username).toBe('bob_tourn');
  });

});
