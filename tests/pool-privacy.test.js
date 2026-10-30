import { beforeAll, beforeEach, afterAll, describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { generateSeededBracket } from '../src/lib/standardBracket';
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
  test('prediction completion scores participants beyond the first browser page', async () => {
    await db.doc('predictionPools/p').set({ hostId: 'host', status: 'in_progress', categories: JSON.stringify([{ name: 'Winner', options: ['A','B'], points: 3 }]), results: '{}' });
    const batch = db.batch();
    for (let index = 0; index < 61; index++) {
      const uid = `user${String(index).padStart(3,'0')}`;
      batch.set(db.doc(`predictionEntries/p_${uid}`), { poolId: 'p', userId: uid, userDisplayName: uid, predictions: JSON.stringify({ 0: index === 60 ? 1 : 0 }), submittedAt: admin.Timestamp.now(), score: 0 });
    }
    await batch.commit();
    await expect(api.managePredictionResults.run(req('alice', { poolId: 'p', action: 'results', results: { 0: 1 } }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(api.managePredictionResults.run(req('host', { poolId: 'p', action: 'complete' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await api.managePredictionResults.run(req('host', { poolId: 'p', action: 'results', results: { 0: 1 } }));
    await api.managePredictionResults.run(req('host', { poolId: 'p', action: 'complete' }));
    expect((await db.doc('predictionPools/p').get()).data()).toMatchObject({ winnerId: 'user060', winnerScore: 3, status: 'completed' });
  });

  test('only the authenticated host can remove another member of their pool', async () => {
    await fixture();
    const data = { poolId: 'p', userId: 'alice', hostId: 'host' };
    for (const uid of [null, 'alice', 'outsider']) {
      await expect(api.removePoolParticipant.run(req(uid, data))).rejects.toMatchObject({ code: uid ? 'permission-denied' : 'unauthenticated' });
    }
    await expect(api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'host' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'missing' }))).rejects.toMatchObject({ code: 'not-found' });
    await expect(api.removePoolParticipant.run(req('host', { poolId: '../p', userId: 'alice' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice/other' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db.doc('poolEntries/p_alice').get()).exists).toBe(true);
  });
  test('removal is retry-safe, pool-scoped and prevents rejoining or direct write bypasses', async () => {
    await fixture();
    await db.doc('poolEntries/other_alice').set({ poolId: 'other', userId: 'alice' });
    const remove = () => api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' }));
    const results = await Promise.all([remove(), remove()]);
    expect(results).toEqual([{ removed: true }, { removed: true }]);
    expect((await db.doc('poolEntries/p_alice').get()).exists).toBe(false);
    expect((await db.doc('poolEntries/p_bob').get()).exists).toBe(true);
    expect((await db.doc('poolEntries/other_alice').get()).exists).toBe(true);
    const marker = await db.doc('bracketPools/p/removedParticipants/alice').get();
    expect(marker.data()).toMatchObject({ userId: 'alice', removedBy: 'host' });
    expect(marker.data().predictions).toBeUndefined();
    await expect(api.joinPrivatePool.run(req('alice', { type: 'bracket', poolId: 'p', joinCode: 'ABC234' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await api.getPrivatePoolEntry.run(req('alice', { type: 'bracket', poolId: 'p' }))).toBeNull();
    expect((await api.readPoolEntries.run(req('alice', { type: 'bracket', poolId: 'p' }))).entries).toEqual([]);
    expect((await api.readPoolEntries.run(req('host', { type: 'bracket', poolId: 'p' }))).entries.map(e => e.userId)).toEqual(['bob']);
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'poolEntries/p_alice'), { poolId: 'p', userId: 'alice', predictions: null, score: 0, joinedAt: serverTimestamp(), submittedAt: null }));
    await assertFails(updateDoc(doc(alice, 'poolEntries/p_alice'), { predictions: '{}', submittedAt: serverTimestamp() }));
    for (const uid of ['host', 'alice']) {
      const client = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(client, 'bracketPools/p/removedParticipants/alice')));
      await assertFails(deleteDoc(doc(client, 'bracketPools/p/removedParticipants/alice')));
    }
    await db.doc('bracketPools/p').update({ status: 'locked' });
    await assertFails(getDoc(doc(alice, 'poolEntries/p_bob')));
  });
  test('removal also works for a joined participant who has not submitted picks', async () => {
    await fixture('locked');
    await db.doc('poolEntries/p_alice').update({ predictions: null, submittedAt: null });
    await api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' }));
    expect((await db.doc('poolEntries/p_alice').get()).exists).toBe(false);
  });
  test('a concurrent join cannot undo removal', async () => {
    await fixture();
    await Promise.allSettled([
      api.joinPrivatePool.run(req('alice', { type: 'bracket', poolId: 'p', joinCode: 'ABC234' })),
      api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' })),
    ]);
    expect((await db.doc('poolEntries/p_alice').get()).exists).toBe(false);
    await expect(api.joinPrivatePool.run(req('alice', { type: 'bracket', poolId: 'p', joinCode: 'ABC234' }))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  async function scoredPool(status = 'completed', tied = false) {
    const state = generateSeededBracket(['A', 'B']), box = state.rounds[0][0];
    const winner = state.boxes[box].slotA.participantId;
    const loser = state.boxes[box].slotB.participantId;
    await db.doc('bracketPools/p').set({ hostId: 'host', status, bracketMatchups: JSON.stringify(state), customResults: { [box]: winner }, roundPoints: [3], winnerId: 'alice', winnerIds: ['alice'], winnerName: 'alice', winnerScore: 3 });
    for (const uid of ['alice', 'bob']) await db.doc(`poolEntries/p_${uid}`).set({ poolId: 'p', userId: uid, userDisplayName: uid, predictions: JSON.stringify({ [box]: uid === 'alice' || tied ? winner : loser }), submittedAt: admin.Timestamp.now(), score: 3 });
  }
  test('completed pools update winners atomically, including ties and no entries left', async () => {
    await scoredPool();
    await api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' }));
    expect((await db.doc('bracketPools/p').get()).data()).toMatchObject({ status: 'completed', winnerId: 'bob', winnerIds: ['bob'], winnerName: 'bob', winnerScore: 0 });
    expect((await db.doc('poolEntries/p_bob').get()).data().score).toBe(0);
    await api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'bob' }));
    expect((await db.doc('bracketPools/p').get()).data()).toMatchObject({ winnerId: null, winnerIds: [], winnerName: null, winnerScore: 0 });
    await db.doc('bracketPools/p/removedParticipants/alice').delete();
    await db.doc('bracketPools/p/removedParticipants/bob').delete();
    await scoredPool('completed', true);
    await api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' }));
    expect((await db.doc('bracketPools/p').get()).data()).toMatchObject({ winnerIds: ['bob'], winnerScore: 3 });
  });
  test('completed-pool winners include remaining submissions beyond the first browser page', async () => {
    await scoredPool();
    const source = (await db.doc('poolEntries/p_alice').get()).data();
    const batch = db.batch();
    for (let index = 0; index < 61; index++) batch.set(db.doc(`poolEntries/p_user${index}`), { ...source, userId: `user${index}`, userDisplayName: `user${index}`, predictions: index === 60 ? source.predictions : null });
    await batch.commit();
    await api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' }));
    expect((await db.doc('bracketPools/p').get()).data()).toMatchObject({ winnerIds: ['user60'], winnerScore: 3 });
  });
  test('incomplete completed-pool results abort removal without deleting the participant', async () => {
    await scoredPool();
    await db.doc('bracketPools/p').update({ customResults: {} });
    await expect(api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db.doc('poolEntries/p_alice').get()).exists).toBe(true);
    expect((await db.doc('bracketPools/p/removedParticipants/alice').get()).exists).toBe(false);
  });
  test('completion racing removal cannot declare a removed participant the winner', async () => {
    await scoredPool('in_progress');
    await Promise.all([
      api.managePoolResults.run(req('host', { poolId: 'p', action: 'complete' })),
      api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' })),
    ]);
    expect((await db.doc('bracketPools/p').get()).data()).toMatchObject({ winnerIds: ['bob'], winnerScore: 0 });
  }, 20000);
  test('pool deletion cleans private removal markers', async () => {
    await fixture();
    await api.removePoolParticipant.run(req('host', { poolId: 'p', userId: 'alice' }));
    await api.deletePrivatePool.run(req('host', { type: 'bracket', poolId: 'p' }));
    expect((await db.doc('bracketPools/p/removedParticipants/alice').get()).exists).toBe(false);
  });

});
