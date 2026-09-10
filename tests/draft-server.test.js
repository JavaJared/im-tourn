import { beforeAll, beforeEach, describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('transactional draft controls', () => {
  let api, db, Timestamp;
  const request = (uid, data) => ({ auth: uid ? { uid, token: { name: uid } } : null, data });
  const act = (uid, draftId, action, data = {}) => api.draftAction.run(request(uid, { draftId, action, ...data }));
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = 'demo-im-tourn';
    api = require('../functions/index.js');
    const admin = require('../functions/node_modules/firebase-admin/lib/firestore');
    db = admin.getFirestore(); Timestamp = admin.Timestamp;
  });
  beforeEach(async () => {
    for (const name of ['drafts','draftInvites','draftInviteCodes']) await db.recursiveDelete(db.collection(name));
    await db.doc('_system/features').set({ draftsReady: true, draftsPublic: true });
  });
  const create = () => act('host', null, 'create', { title: 'Test draft', rounds: 2, timerSeconds: 30 });
  const started = async () => {
    const d = await create(); await act('alice', d.id, 'join', { joinCode: d.joinCode });
    await act('host', d.id, 'start'); return { ...d, ...(await db.doc(`drafts/${d.id}`).get()).data() };
  };
  test('deployment gate and authentication prevent premature draft writes', async () => {
    await expect(act(null, null, 'create', {})).rejects.toMatchObject({ code: 'unauthenticated' });
    await db.doc('_system/features').set({ draftsReady: true, draftsPublic: false });
    await expect(create()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('invites are private, identity comes from auth, and concurrent joins preserve everyone', async () => {
    const d = await create();
    expect((await db.doc(`drafts/${d.id}`).get()).data().joinCode).toBeUndefined();
    await expect(act('alice', d.id, 'invite')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(act('alice', d.id, 'join', { joinCode: 'AAAAAAAA' })).rejects.toMatchObject({ code: 'permission-denied' });
    await Promise.all(['alice','bob','alice'].map(uid => act(uid, d.id, 'join', { joinCode: d.joinCode, userId: 'forged' })));
    expect((await db.doc(`drafts/${d.id}`).get()).data().participantIds.sort()).toEqual(['alice','bob','host']);
    await expect(act('host', d.id, 'leave')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(act('alice', d.id, 'start')).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test('turn checks and retries cannot consume the next snake turn', async () => {
    const d = await started(), ref = db.doc(`drafts/${d.id}`);
    expect(d.draftOrder.map(p => p.userId)).toEqual([d.participants[0].userId, d.participants[1].userId, d.participants[1].userId, d.participants[0].userId]);
    await expect(act(d.draftOrder[1].userId, d.id, 'pick', { selection: 'Wrong turn', expectedPickIndex: 0 })).rejects.toMatchObject({ code: 'permission-denied' });
    await act(d.draftOrder[0].userId, d.id, 'pick', { selection: 'First', expectedPickIndex: 0 });
    const uid = d.draftOrder[1].userId;
    await Promise.all([1,2].map(() => act(uid, d.id, 'pick', { selection: 'Second', expectedPickIndex: 1 })));
    const saved = (await ref.get()).data(); expect(saved.currentPickIndex).toBe(2); expect(saved.picks).toHaveLength(2);
    await expect(act(uid, d.id, 'pick', { selection: 'Stale different choice', expectedPickIndex: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('only members can expire a timed turn, never early or without a timer', async () => {
    const d = await started(), ref = db.doc(`drafts/${d.id}`);
    await expect(act('host', d.id, 'skip', { expectedPickIndex: 0 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await ref.update({ currentPickDeadline: Timestamp.fromMillis(Date.now() - 1000) });
    await expect(act('outsider', d.id, 'skip', { expectedPickIndex: 0 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(act(d.draftOrder[0].userId, d.id, 'pick', { expectedPickIndex: 0, selection: 'Late' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await Promise.all([1,2].map(() => act('host', d.id, 'skip', { expectedPickIndex: 0 })));
    expect((await ref.get()).data().currentPickIndex).toBe(1);
    await ref.update({ timerSeconds: 0, currentPickDeadline: null });
    await expect(act('host', d.id, 'skip', { expectedPickIndex: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('completion and scoring require valid state and host authority', async () => {
    const d = await started();
    await expect(act('host', d.id, 'scores', { scores: { 0: 1 } })).rejects.toMatchObject({ code: 'failed-precondition' });
    for (const [index, turn] of d.draftOrder.entries()) await act(turn.userId, d.id, 'pick', { selection: `Pick ${index}`, expectedPickIndex: index });
    expect((await db.doc(`drafts/${d.id}`).get()).data().status).toBe('completed');
    await expect(act('alice', d.id, 'scores', { scores: { 0: 5 } })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(act('host', d.id, 'scores', { scores: { 99: 5 } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(act('host', d.id, 'scores', { scores: { 0: '5' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await act('host', d.id, 'scores', { scores: { 0: 5, 1: -2 } });
    expect((await db.doc(`drafts/${d.id}`).get()).data().scores).toEqual({ 0: 5, 1: -2 });
  });
});
