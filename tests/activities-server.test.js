import { beforeAll, beforeEach, describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('personal activity feed', () => {
  let api, db, Timestamp;
  const request = (uid, data) => ({ auth: uid ? { uid, token: {} } : null, data });
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = 'demo-im-tourn'; api = require('../functions/index.js');
    const admin = require('../functions/node_modules/firebase-admin/lib/firestore'); db = admin.getFirestore(); Timestamp = admin.Timestamp;
  });
  beforeEach(async () => { for (const name of ['brackets','customBrackets','submissions','bracketPools','poolEntries','rankings','rankingVotes']) await db.recursiveDelete(db.collection(name)); });
  test('authentication controls ownership even with a forged requested user ID', async () => {
    await db.doc('brackets/alice').set({ userId: 'alice', title: 'Private activity', createdAt: Timestamp.now(), matchups: 'heavy' });
    await expect(api.listMyActivities.run(request(null, { type: 'brackets' }))).rejects.toMatchObject({ code: 'unauthenticated' });
    const result = await api.listMyActivities.run(request('bob', { type: 'brackets', userId: 'alice' }));
    expect(result.items).toEqual([]);
    await expect(api.listMyActivities.run(request('bob', { type: 'brackets', cursor: 'alice' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('metadata pages keep every saved submission without transferring predictions', async () => {
    const batch = db.batch();
    for (let i=0;i<27;i++) batch.set(db.doc(`submissions/s${i}`), { userId: 'alice', title: 'Saved picks', submittedAt: Timestamp.fromMillis(1000), matchups: 'private-heavy-picks', upvotedBy: ['bob'] });
    await batch.commit(); const ids=[]; let cursor=null;
    do {
      const page = await api.listMyActivities.run(request('alice', { type: 'submissions', cursor }));
      expect(page.items.length).toBeLessThanOrEqual(12); expect(JSON.stringify(page)).not.toContain('private-heavy-picks'); expect(JSON.stringify(page)).not.toContain('bob');
      ids.push(...page.items.map(item=>item.id)); cursor=page.nextCursor;
    } while(cursor);
    expect(new Set(ids).size).toBe(27);
  });
  test('pool reminders respect deadlines and never expose invite codes or other picks', async () => {
    await db.doc('bracketPools/p').set({ hostId: 'host', name: 'Pool', status: 'open', lockDate: Timestamp.fromMillis(Date.now()+60000), joinCode: 'SECRET' });
    await db.doc('poolEntries/p_alice').set({ userId: 'alice', poolId: 'p', joinedAt: Timestamp.now(), predictions: 'secret' });
    const page = await api.listMyActivities.run(request('alice', { type: 'joinedPools' }));
    expect(page.items[0]).toMatchObject({ needsAttention: true, destination: 'pool-p' }); expect(JSON.stringify(page)).not.toContain('SECRET');
    await db.doc('bracketPools/p').update({ lockDate: Timestamp.fromMillis(Date.now()-1000) });
    expect((await api.listMyActivities.run(request('alice', { type: 'joinedPools' }))).items[0].needsAttention).toBe(false);
    await db.doc('bracketPools/p').delete();
    expect((await api.listMyActivities.run(request('alice', { type: 'joinedPools' }))).items).toEqual([]);
  });
  test('custom saved picks resolve their bracket parent and stay scoped to the account', async () => {
    await db.doc('customBrackets/b').set({ title: 'Custom bracket', status: 'published' });
    for (const uid of ['alice','bob']) await db.doc(`customBrackets/b/submissions/${uid}`).set({ userId: uid, createdAt: Timestamp.now(), picks: { final:'secret' } });
    const result = await api.listMyActivities.run(request('alice', { type: 'customSubmissions' }));
    expect(result.items).toHaveLength(1); expect(result.items[0]).toMatchObject({ title:'Custom bracket', destination:'saved-custom-bracket-b' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  test('saved activity payloads are bound to the authenticated account', async () => {
    await db.doc('submissions/alice-save').set({ userId:'alice', title:'Alice save', matchups:'alice-secret', submittedAt:Timestamp.now(), upvotedBy:['bob'] });
    await db.doc('customBrackets/b/submissions/alice').set({ userId:'alice', displayName:'Alice', picks:{final:'alice-secret'}, createdAt:Timestamp.now() });
    await expect(api.getMySavedActivity.run(request(null,{type:'standard',id:'alice-save'}))).rejects.toMatchObject({code:'unauthenticated'});
    await expect(api.getMySavedActivity.run(request('bob',{type:'standard',id:'alice-save'}))).rejects.toMatchObject({code:'not-found'});
    await expect(api.getMySavedActivity.run(request('bob',{type:'custom',id:'b',userId:'alice'}))).rejects.toMatchObject({code:'not-found'});
    const standard = await api.getMySavedActivity.run(request('alice',{type:'standard',id:'alice-save'}));
    expect(standard).toMatchObject({id:'alice-save',title:'Alice save',matchups:'alice-secret'});
    expect(JSON.stringify(standard)).not.toContain('upvotedBy');
    expect(await api.getMySavedActivity.run(request('alice',{type:'custom',id:'b'}))).toMatchObject({id:'alice',picks:{final:'alice-secret'}});
  });
});
