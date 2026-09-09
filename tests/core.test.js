import { describe, test, expect } from 'vitest';
import { generateSeededBracket, structureFromState } from '../src/lib/standardBracket';
import { serialize } from '../src/lib/customBracketCodec';
import { locate, resolveParticipant, setResult, getChampion } from '../src/lib/customBracket';
import { hydrateState, picksFromState, buildLeaderboard, isEntryComplete } from '../src/lib/customScoring';
import { adaptLegacyPool, adaptLegacyEntry, normalizeSleeper } from '../src/lib/legacyPoolAdapter';
import { analyzeCustomPool, summarizeWinningScenarios } from '../src/lib/customElimination';
import { weeklyVotingOpen, standardWeeklyMatchups, weekKey } from '../src/lib/weeklyState';
import { predictionsOpen } from '../src/lib/poolLifecycle';
import { createWriteQueue } from '../src/lib/writeQueue';
import { readView } from '../src/lib/useViewNavigation';
const bracket = n => generateSeededBracket(Array.from({ length: n }, (_, i) => `Team ${i + 1}`));
function finish(input) { let st = input; for (const rd of st.rounds) for (const id of rd) { const loc = locate(st), pid = resolveParticipant(st, loc, id, 'A') || resolveParticipant(st, loc, id, 'B'); if (pid) { try { st = setResult(st, id, pid); } catch {} } } return st; }
describe('existing formats and scoring', () => {
  test.each([2, 3, 8, 16, 32, 64, 100])('a %i-entry bracket can be completed', n => { const st = finish(bracket(n)); expect(isEntryComplete(st)).toBe(true); expect(getChampion(st)).toBeTruthy(); });
  test.each([32, 64])('standard %i brackets enter the weekly catalog', n => { const data = { ...serialize(bracket(n)), type: 'standard', status: 'published' }; const rounds = standardWeeklyMatchups(data); expect(rounds[0]).toHaveLength(n / 2); expect(rounds.at(-1)).toHaveLength(1); expect(rounds[0].every(m => m.entry1.name && m.entry2.name)).toBe(true); });
  test('byes do not create an invalid weekly candidate', () => { expect(standardWeeklyMatchups({ ...serialize(bracket(31)), type: 'standard', status: 'published' })).toBe(null); });
  test('zero round weights are honored and tied scores remain tied', () => { const st = finish(bracket(4)), picks = picksFromState(st); const board = buildLeaderboard(st, [{ userId: 'a', picks }, { userId: 'b', picks }], [0, 2]); expect(board.map(e => e.total)).toEqual([2, 2]); });
  test('sleepers affect standings and elimination consistently', () => {
    const st = finish(bracket(16)), structure = structureFromState(st), picks = picksFromState(st);
    const sleeper = resolveParticipant(st, locate(st), st.rounds[2][0], 'A');
    const entries = [{ userId: 'a', predictions: picks, sleeper1: sleeper }, { userId: 'b', predictions: picks }];
    const pool = { enableSleepers: true, sleeper1Points: 10, sleeper2Points: 20 };
    const board = buildLeaderboard(st, entries.map(e => ({ ...e, picks: e.predictions })), [], pool);
    expect(board[0].total - board[1].total).toBe(10);
    const analysis = analyzeCustomPool(structure, picks, entries, [], { pool, deadlineMs: 1000 });
    expect(analysis.byUserId.a.status).toBe('clinched'); expect(analysis.byUserId.b.status).toBe('eliminated');
  });
  test('cleared modern results do not resurrect legacy winners', () => {
    const rounds = [[{ entry1: { name: 'A', seed: 1 }, entry2: { name: 'B', seed: 2 }, winner: 1 }]];
    expect(adaptLegacyPool({ bracketMatchups: rounds, results: rounds, customResults: {} }).customResults).toEqual({});
    expect(Object.keys(adaptLegacyPool({ bracketMatchups: rounds, results: rounds }).customResults)).toHaveLength(1);
    expect(adaptLegacyEntry({ predictions: rounds, sleeper1: '{"seed":2}' }).sleeper1).toBe('p2');
    expect(normalizeSleeper('p5')).toBe('p5');
  });
  test('a timed-out search never claims elimination or clinching', () => {
    const st = bracket(4), pred = picksFromState(finish(st));
    const result = analyzeCustomPool(structureFromState(st), {}, [{ userId: 'a', predictions: pred }], [], { deadlineMs: -1 });
    expect(result.analysisComplete).toBe(false); expect(result.byUserId.a.status).toBe('unknown');
    expect(summarizeWinningScenarios({ status: 'alive', scenariosTruncated: true, winningScenarios: [{ outcomes: { m1: 'p1' } }] }, {})).toBeNull();
  });
});
describe('deadlines, retries and navigation', () => {
  test('pool deadline uses exact boundary and handles Firestore timestamps', () => { expect(predictionsOpen({ status: 'open', lockDate: { seconds: 10 } }, 9999)).toBe(true); expect(predictionsOpen({ status: 'open', lockDate: { seconds: 10 } }, 10000)).toBe(false); expect(predictionsOpen({ status: 'locked' })).toBe(false); });
  test('weekly cutoff follows New York across DST', () => {
    const data = { weekId: 'one', startDate: new Date('2026-03-09T00:00:00Z'), currentRound: 0, matchups: [[{ entry1: {}, entry2: {} }]] };
    expect(weeklyVotingOpen(data, new Date('2026-03-10T03:59:59Z'))).toBe(true);
    expect(weeklyVotingOpen(data, new Date('2026-03-10T04:00:00Z'))).toBe(false);
    expect(weeklyVotingOpen(data, new Date('2026-03-08T15:00:00Z'))).toBe(false);
    expect(weekKey(data)).toBe('one');
  });
  test('a completed final does not accept votes', () => { expect(weeklyVotingOpen({ startDate: new Date(), matchups: [[{ entry1: {}, entry2: {}, winner: 1 }]] })).toBe(false); });
  test('failed writes do not reorder or poison later edits', async () => {
    const queue = createWriteQueue(), order = [];
    const a = queue('pool', async () => { order.push(1); throw new Error('offline'); });
    const b = queue('pool', async () => order.push(2));
    await expect(a).rejects.toThrow('offline'); await b; expect(order).toEqual([1, 2]);
  });
  test('pool and ranking bookmarks survive refresh; invalid views return home', () => { expect(readView('?view=pool-abc')).toBe('pool-abc'); expect(readView('?view=ranking-vote-abc')).toBe('ranking-vote-abc'); expect(readView('?view=garbage')).toBe('home'); });
});
