import { beforeAll, beforeEach, afterAll, describe, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getMetadata } from 'firebase/storage';
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('Firestore and Storage trust boundaries', () => {
  let env;
  beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-im-tourn', firestore: { rules: readFileSync('firestore.rules', 'utf8') }, storage: { rules: readFileSync('storage.rules', 'utf8') } }); });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c => {
      const db = c.firestore();
      await setDoc(doc(db, 'bracketPools/open'), { hostId: 'host', status: 'open', lockDate: Timestamp.fromMillis(Date.now() + 60000) });
      await setDoc(doc(db, 'bracketPools/closed'), { hostId: 'host', status: 'open', lockDate: Timestamp.fromMillis(Date.now() - 60000) });
      await setDoc(doc(db, 'poolEntries/open_alice'), { poolId: 'open', userId: 'alice', predictions: null, score: 0, joinedAt: Timestamp.now(), submittedAt: null });
      await setDoc(doc(db, 'poolEntries/closed_alice'), { poolId: 'closed', userId: 'alice', predictions: '{}', score: 0, joinedAt: Timestamp.now(), submittedAt: null });
      await setDoc(doc(db, 'rankings/r'), { hostId: 'host', status: 'draft', entryCount: 3, voteCount: 0, consensusRanking: null });
      await setDoc(doc(db, 'customBrackets/b'), { hostId: 'host', status: 'published', createdAt: Timestamp.now() });
      await setDoc(doc(db, 'tierLists/t'), { ownerId: 'alice', items: [], placements: {}, createdAt: Timestamp.now() });
    });
  });
  afterAll(async () => env.cleanup());
  const db = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
  test('public brackets and pools stay readable', async () => { await assertSucceeds(getDoc(doc(db(), 'customBrackets/b'))); await assertSucceeds(getDoc(doc(db(), 'bracketPools/open'))); });
  test('standard creation is allowed only for its owner', async () => {
    const value = { hostId: 'alice', status: 'published', type: 'standard', participantCount: 32, roundCount: 5 };
    await assertSucceeds(setDoc(doc(db('alice'), 'customBrackets/new'), value));
    await assertFails(setDoc(doc(db('bob'), 'customBrackets/forged'), value));
  });
  test('published bracket structure stays frozen but live results work', async () => {
    await assertFails(updateDoc(doc(db('host'), 'customBrackets/b'), { boxes: {} }));
    await assertSucceeds(updateDoc(doc(db('host'), 'customBrackets/b'), { status: 'locked', results: { m1: 'p1' }, updatedAt: serverTimestamp() }));
  });
  test('entrant can submit only before the server deadline', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), 'poolEntries/open_alice'), { predictions: '{}', submittedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('alice'), 'poolEntries/closed_alice'), { predictions: '{}', submittedAt: serverTimestamp() }));
  });
  test('entrant cannot forge scores, identity, pool, or join duplicates', async () => {
    for (const change of [{ score: 999 }, { poolId: 'other' }, { userId: 'bob' }, { sleeper1Hit: true }]) await assertFails(updateDoc(doc(db('alice'), 'poolEntries/open_alice'), change));
    await assertFails(setDoc(doc(db('alice'), 'poolEntries/duplicate'), { poolId: 'open', userId: 'alice', predictions: null, score: 0, joinedAt: serverTimestamp(), submittedAt: null }));
  });
  test('host can score but cannot change entrant picks', async () => { await assertSucceeds(updateDoc(doc(db('host'), 'poolEntries/closed_alice'), { score: 4 })); await assertFails(updateDoc(doc(db('host'), 'poolEntries/closed_alice'), { predictions: 'forged' })); });
  test('weekly ballots and ranking totals cannot be written from clients', async () => {
    await assertFails(setDoc(doc(db('alice'), 'weeklyBracket/current'), { votes: '{}' }));
    await assertFails(setDoc(doc(db('alice'), 'weeklyVotes/alice_round0'), { userId: 'alice' }));
    await assertFails(updateDoc(doc(db('alice'), 'rankings/r'), { voteCount: 999 }));
    await assertFails(updateDoc(doc(db('host'), 'rankings/r'), { consensusRanking: '[]' }));
    await assertFails(setDoc(doc(db('alice'), 'rankingVotes/r_alice'), { userId: 'alice' }));
  });
  test('disabled draft APIs cannot be bypassed', async () => { await assertFails(setDoc(doc(db('alice'), 'drafts/x'), { hostId: 'alice' })); });
  test('tier lists remain private to the owner', async () => { await assertSucceeds(getDoc(doc(db('alice'), 'tierLists/t'))); await assertFails(getDoc(doc(db('bob'), 'tierLists/t'))); await assertSucceeds(updateDoc(doc(db('alice'), 'tierLists/t'), { placements: {}, updatedAt: serverTimestamp() })); });
  test('saved fills use canonical user IDs and remain updatable', async () => {
    const value = { userId: 'alice', displayName: 'Alice', picks: { m1: 'p1' }, champion: 'p1', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('alice'), 'customBrackets/b/submissions/alice'), value));
    await assertSucceeds(setDoc(doc(db('alice'), 'customBrackets/b/submissions/alice'), value));
    await assertFails(setDoc(doc(db('alice'), 'customBrackets/b/submissions/bob'), value));
  });
  test('feedback is private and validated', async () => {
    const value = { userId: 'alice', type: 'bug', subject: 'Problem', description: 'Details', email: '', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('alice'), 'feedback/f'), value));
    await assertFails(getDoc(doc(db('alice'), 'feedback/f')));
    await assertFails(setDoc(doc(db('alice'), 'feedback/long'), { ...value, subject: 'x'.repeat(201) }));
  });
  test('ranking image writes require the parent host, including deletion', async () => {
    const path = 'rankings/r/entries/a.jpg', bytes = new Uint8Array([1, 2, 3]), meta = { contentType: 'image/jpeg' };
    await assertSucceeds(uploadBytes(ref(env.authenticatedContext('host').storage(), path), bytes, meta));
    await assertFails(uploadBytes(ref(env.authenticatedContext('alice').storage(), path), bytes, meta));
    await assertFails(deleteObject(ref(env.authenticatedContext('alice').storage(), path)));
    await assertSucceeds(deleteObject(ref(env.authenticatedContext('host').storage(), path)));
  });
  test('tier images are readable and writable only by the matching list owner', async () => {
    const path = 'tierLists/alice/t/item.jpg', bytes = new Uint8Array([1, 2, 3]), meta = { contentType: 'image/jpeg' };
    const alice = env.authenticatedContext('alice').storage();
    const bob = env.authenticatedContext('bob').storage();
    await assertSucceeds(uploadBytes(ref(alice, path), bytes, meta));
    await assertSucceeds(getMetadata(ref(alice, path)));
    await assertFails(getMetadata(ref(bob, path)));
    await assertFails(getMetadata(ref(env.unauthenticatedContext().storage(), path)));
    await assertFails(uploadBytes(ref(bob, path), bytes, meta));
    await assertFails(uploadBytes(ref(bob, 'tierLists/bob/t/item.jpg'), bytes, meta));
    await assertFails(deleteObject(ref(bob, path)));
    await assertSucceeds(deleteObject(ref(alice, path)));
  });
  test('even owners cannot upload oversized images or non-image content', async () => {
    const storage = env.authenticatedContext('host').storage();
    await assertFails(uploadBytes(ref(storage, 'rankings/r/entries/large.jpg'), new Uint8Array(2 * 1024 * 1024), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(storage, 'rankings/r/entries/document.pdf'), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' }));
  });

});
