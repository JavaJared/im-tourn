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
  test('weekly votes commit once and reject wrong weeks, rounds, and partial ballots', async () => {
    const votes = await weekly(), data = { weekId: 'week', roundIndex: 0, votes };
    await Promise.all([1, 2].map(() => api.castWeeklyVotes.run(req('alice', data))));
    const current = (await db.doc('weeklyBracket/current').get()).data(); expect(JSON.parse(current.votes)['r0-m0'].entry1).toBe(1);
    for (const change of [{ weekId: 'old' }, { roundIndex: 1 }, { votes: { 'r0-m0': 1 } }]) await expect(api.castWeeklyVotes.run(req('bob', { ...data, ...change }))).rejects.toBeTruthy();
  });
  test('a delayed old-week deletion cannot change current tallies', async () => {
    const votes = await weekly(); await api.castWeeklyVotes.run(req('alice', { weekId: 'week', roundIndex: 0, votes }));
    const missing = { data: () => undefined };
    await api.tallyWeeklyVote.run({ data: { before: { data: () => ({ userId: 'old', weekId: 'last-week', votes: JSON.stringify(votes) }) }, after: missing } });
    expect(JSON.parse((await db.doc('weeklyBracket/current').get()).data().votes)['r0-m0'].entry1).toBe(1);
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
});
