import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
const require = createRequire(import.meta.url);
const { settle, canonical, nextEasternMidnight, alignSchedule, SCHEDULE_VERSION } = require('../functions/arena-core');
const fixture = () => ({ round: 1, matchup: ['a','b'], votes: {a:5,b:2}, nominations: {}, candidates: ['a','b','c','d'].map(id => ({id,name:id})), stats: {}, lastPlayed: {a:1,b:1}, defender: null, endAt: 100, status: 'active' });
describe('GOAT matchup lifecycle', () => {
  it('awards only a decided win and schedules the next Eastern midnight', () => {
    const {next, history} = settle(fixture(), 200, () => 0);
    expect(next.matchup).toEqual(['a','c']); expect(next.stats.a).toEqual({ wins:1, streak:1, longest:1 }); expect(next.endAt).toBe(nextEasternMidnight(200)); expect(history.winner).toBe('a');
  });
  it('zero votes rerun the pair without a chair win', () => {
    const room=fixture(); room.votes={}; const {next,history}=settle(room,200,()=>0);
    expect(next.matchup).toEqual(['a','b']); expect(next.stats).toEqual({}); expect(history.winner).toBeNull();
  });
  it('ties retain the incumbent without awarding a win', () => {
    const room=fixture(); room.votes={a:3,b:3}; room.defender='a'; const {next,history}=settle(room,200,()=>0);
    expect(next.defender).toBe('a'); expect(next.stats).toEqual({}); expect(history.tied).toBe(true);
  });
  it('selects among tied nomination leaders, excluding current participants', () => {
    const room=fixture(); room.nominations={b:99,c:4,d:4}; const {next}=settle(room,200,n=>{expect(n).toBe(2);return 1;}); expect(next.matchup).toEqual(['a','d']);
  });
  it('a deposed chair loses its streak; absent reserves pause the room', () => {
    const room=fixture(); room.candidates=room.candidates.slice(0,2); room.votes={b:9}; room.defender='a'; room.stats={a:{wins:5,streak:5,longest:5}};
    const {next}=settle(room,200,()=>0); expect(next.status).toBe('paused'); expect(next.endAt).toBeNull(); expect(next.stats.a.streak).toBe(0); expect(next.stats.b.wins).toBe(1);
  });
  it('does not mutate the prior round', () => { const room=fixture(), original=structuredClone(room); settle(room,200,()=>0); expect(room).toEqual(original); });
  it('normalizes candidate spacing, width, and capitalization', () => { expect(canonical('  JORDAN  ')).toBe(canonical('Jordan')); expect(canonical('Ａ B')).toBe('a b'); });
});

describe('defeated challenger eligibility', () => {
  it('blocks a defeated candidate throughout the same reign, including after two rounds', () => {
    const room = fixture();
    Object.assign(room, { round: 5, defender: 'a', chairEpoch: 2, lossEpoch: { c: 2 }, lastPlayed: { a: 5, b: 5, c: 1 }, nominations: { c: 99 } });
    expect(settle(room, 200, () => 0).next.matchup).toEqual(['a', 'd']);
  });
  it('a new chair unlocks past losers but blocks the newly defeated incumbent', () => {
    const room = fixture();
    Object.assign(room, { round: 5, defender: 'a', chairEpoch: 2, lossEpoch: { c: 2 }, lastPlayed: { a: 5, b: 5, c: 1 }, nominations: { c: 99 }, votes: { b: 10 } });
    const next = settle(room, 200, () => 0).next;
    expect(next.chairEpoch).toBe(3); expect(next.lossEpoch.a).toBe(3); expect(next.matchup).toEqual(['b','c']);
  });
  it('ties and empty voting do not unlock past losers or add new losses', () => {
    const room = fixture(); Object.assign(room, { defender: 'a', chairEpoch: 2, lossEpoch: { c: 2 }, votes: { a: 3, b: 3 } });
    const next = settle(room, 200, () => 0).next;
    expect(next.lossEpoch).toEqual({c:2}); expect(next.chairEpoch).toBe(2);
  });
  it('pending and rejected candidates never become automatic challengers', () => {
    const room = fixture(); room.candidates[2].status='pending'; room.candidates[3].status='rejected'; room.nominations={c:50};
    expect(settle(room,200,()=>0).next.status).toBe('paused');
  });
  it('reconstructs eligibility from pre-update matchup history', () => {
    const {restoreEligibility}=require('../functions/arena-core');
    expect(restoreEligibility([{matchup:['a','b'],winner:'a'}, {matchup:['a','c'],winner:'a'}, {matchup:['a','d'],winner:'d'}])).toEqual({chairEpoch:1,lossEpoch:{b:0,c:0,a:1}});
  });
});


describe('Eastern midnight schedule', () => {
  it.each([
    ['2026-10-07T18:24:00-04:00', '2026-10-08T04:00:00Z'],
    ['2026-01-07T10:00:00-05:00', '2026-01-08T05:00:00Z'],
    ['2026-03-08T00:00:00-05:00', '2026-03-09T04:00:00Z'],
    ['2026-11-01T00:00:00-04:00', '2026-11-02T05:00:00Z'],
    ['2026-12-31T23:59:59-05:00', '2027-01-01T05:00:00Z'],
    ['2026-10-08T00:00:00-04:00', '2026-10-09T04:00:00Z'],
  ])('maps %s to %s', (now, expected) => {
    expect(nextEasternMidnight(Date.parse(now))).toBe(Date.parse(expected));
  });
  it('aligns a legacy room once without moving an already aligned deadline', () => {
    const now = Date.parse('2026-10-07T18:00:00-04:00');
    const room = fixture(), patch = alignSchedule(room, now);
    expect(patch).toEqual({ scheduleVersion: SCHEDULE_VERSION, endAt: Date.parse('2026-10-08T04:00:00Z') });
    expect(alignSchedule({ ...room, ...patch }, now + 86400000)).toEqual({});
    expect(alignSchedule({ status: 'paused' }, now).endAt).toBeNull();
  });
  it('a delayed rollover awards one result and still ends at midnight', () => {
    const now = Date.parse('2026-10-12T11:00:00-04:00');
    const { next } = settle(fixture(), now, () => 0);
    expect(next.round).toBe(2); expect(next.stats.a.wins).toBe(1);
    expect(next.endAt).toBe(Date.parse('2026-10-13T04:00:00Z'));
  });
});
