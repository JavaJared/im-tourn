import { beforeAll, beforeEach, afterAll, describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
const require = createRequire(import.meta.url);
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('protected pool invitations and predictions', () => {
  let api, db, admin, env, migrate;
  const req = (uid, data) => ({ auth: uid ? { uid, token: { name: uid } } : null, data });
  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = 'demo-im-tourn';
    api = require('../functions/index.js');
    admin = require('../functions/node_modules/firebase-admin/lib/firestore');
    db = admin.getFirestore();
    migrate = require('../scripts/migrate-pool-invites.cjs').migratePoolInvites;
    env = await initializeTestEnvironment({ projectId: 'demo-im-tourn', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  });
  afterAll(async () => env.cleanup());
  beforeEach(async () => {
    for (const name of ['bracketPools', 'predictionPools', 'poolEntries', 'predictionEntries', 'poolInvites', 'poolInviteCodes', 'poolJoinAttempts']) await db.recursiveDelete(db.collection(name));
  });
  const fixture = async (status = 'open') => {
    await db.doc('bracketPools/p').set({ hostId: 'host', name: 'Pool', status, joinCode: 'ABC234', lockDate: admin.Timestamp.fromMillis(Date.now() + 60000) });
    for (const uid of ['alice', 'bob']) await db.doc(`poolEntries/p_${uid}`).set({ poolId: 'p', userId: uid, userDisplayName: uid, predictions: '{"m1":"p1"}', champion: 'secret champion', sleeper1: 'secret sleeper', score: 0, joinedAt: admin.Timestamp.now(), submittedAt: admin.Timestamp.now() });
  };
  test('new pools never put their invite code on the public document', async () => {
    const result = await api.createPrivatePool.run(req('host', { type: 'prediction', pool: { name: 'New pool', categories: [{ name: 'Winner', options: ['A', 'B'] }] } }));
    expect(result.joinCode).toMatch(/^[A-Z0-9]{8}$/);
    expect((await db.doc(`predictionPools/${result.id}`).get()).data().joinCode).toBeUndefined();
    await expect(api.getPoolInvite.run(req('alice', { type: 'prediction', poolId: result.id }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await api.getPoolInvite.run(req('host', { type: 'prediction', poolId: result.id }))).toEqual({ joinCode: result.joinCode });
  });
  test('join is authenticated, code-checked, identity-bound and idempotent under concurrency', async () => {
    await fixture();
    await expect(api.joinPrivatePool.run(req(null, { type: 'bracket', poolId: 'p', joinCode: 'ABC234' }))).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(api.joinPrivatePool.run(req('carol', { type: 'bracket', poolId: 'p' }))).rejects.toMatchObject({ code: 'permission-denied' });
    await Promise.all([1, 2].map(() => api.joinPrivatePool.run(req('carol', { type: 'bracket', poolId: 'p', joinCode: 'ABC234', userId: 'forged' }))));
    expect((await db.doc('poolEntries/p_carol').get()).data().userId).toBe('carol');
    expect((await db.doc('poolEntries/p_forged').get()).exists).toBe(false);
    await db.doc('bracketPools/p').update({ status: 'locked' });
    await expect(api.joinPrivatePool.run(req('dave', { type: 'bracket', poolId: 'p', joinCode: 'ABC234' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('participants and hosts receive only redacted summaries while picks are open', async () => {
    await fixture();
    for (const uid of ['host', 'alice']) {
      const page = await api.readPoolEntries.run(req(uid, { type: 'bracket', poolId: 'p' }));
      const bob = page.entries.find(e => e.userId === 'bob');
      expect(bob.predictions).toBeNull(); expect(bob.champion).toBeUndefined(); expect(bob.sleeper1).toBeUndefined(); expect(bob.predictionsHidden).toBe(true);
    }
    expect((await api.readPoolEntries.run(req('outsider', { type: 'bracket', poolId: 'p' }))).entries).toEqual([]);
    expect((await api.getPrivatePoolEntry.run(req('alice', { type: 'bracket', poolId: 'p' }))).predictions).toContain('m1');
  });
  test('predictions reveal to participants at the server deadline, but never to outsiders', async () => {
    await fixture();
    await db.doc('bracketPools/p').update({ lockDate: admin.Timestamp.fromMillis(Date.now() - 1000) });
    const page = await api.readPoolEntries.run(req('alice', { type: 'bracket', poolId: 'p' }));
    expect(page.entries.find(e => e.userId === 'bob').predictions).toContain('m1');
    expect((await api.readPoolEntries.run(req('outsider', { type: 'bracket', poolId: 'p' }))).entries).toHaveLength(0);
  });
  test('direct Firestore reads cannot bypass pre-lock privacy and pools cannot reopen', async () => {
    await fixture();
    const alice = env.authenticatedContext('alice').firestore(), host = env.authenticatedContext('host').firestore();
    await assertSucceeds(getDoc(doc(alice, 'poolEntries/p_alice')));
    await assertFails(getDoc(doc(alice, 'poolEntries/p_bob')));
    await assertFails(getDoc(doc(host, 'poolEntries/p_bob')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'poolEntries/p_alice')));
    await db.doc('bracketPools/p').update({ status: 'locked' });
    await assertSucceeds(getDoc(doc(alice, 'poolEntries/p_bob')));
    await assertFails(updateDoc(doc(host, 'bracketPools/p'), { status: 'open' }));
  });
  test('pagination has stable boundaries and never returns more than 50 entries', async () => {
    await fixture('locked');
    const batch = db.batch();
    for (let i = 0; i < 60; i++) batch.set(db.doc(`poolEntries/p_u${String(i).padStart(2, '0')}`), { poolId: 'p', userId: `u${i}`, predictions: null, score: 0 });
    await batch.commit();
    const first = await api.readPoolEntries.run(req('host', { type: 'bracket', poolId: 'p' }));
    const second = await api.readPoolEntries.run(req('host', { type: 'bracket', poolId: 'p', cursor: first.nextCursor }));
    expect(first.entries).toHaveLength(50); expect(second.entries).toHaveLength(12); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.entries, ...second.entries].map(e => e.id)).size).toBe(62);
  });
  test('migration preserves old codes, is repeatable, and hides private records', async () => {
    await fixture();
    expect(await migrate(db, admin.FieldValue)).toBe(1);
    expect(await migrate(db, admin.FieldValue)).toBe(0);
    expect((await db.doc('bracketPools/p').get()).data().joinCode).toBeUndefined();
    expect(await api.resolvePoolInvite.run(req(null, { type: 'bracket', joinCode: 'ABC234' }))).toEqual({ id: 'p' });
    expect(await api.getPoolInvite.run(req('host', { type: 'bracket', poolId: 'p' }))).toEqual({ joinCode: 'ABC234' });
    await assertFails(getDoc(doc(env.authenticatedContext('host').firestore(), 'poolInvites/bracket_p')));
  });
  test('a conflicting old code stops migration without deleting that pool’s public code', async () => {
    await fixture();
    await db.doc('bracketPools/second').set({ hostId: 'other', status: 'open', joinCode: 'ABC234' });
    await expect(migrate(db, admin.FieldValue)).rejects.toThrow('Conflicting legacy invitation');
    expect((await db.doc('bracketPools/second').get()).data().joinCode).toBe('ABC234');
  });
});
