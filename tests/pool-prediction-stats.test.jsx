import React from 'react';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { generateSeededBracket } from '../src/lib/standardBracket';
import { setResult, locate, resolveParticipant, matchWinner } from '../src/lib/customBracket';
import { picksFromState } from '../src/lib/customScoring';
import { adaptLegacyPool, adaptLegacyEntry } from '../src/lib/legacyPoolAdapter';
import { buildPredictionStats } from '../src/lib/poolPredictionStats';
import PoolPredictionStats from '../src/components/pools/PoolPredictionStats';

function fill(state, choose = (a) => a) {
  for (const round of state.rounds) for (const id of round) {
    const locations = locate(state);
    if (matchWinner(state, locations, id) != null) continue;
    const a = resolveParticipant(state, locations, id, 'A'), b = resolveParticipant(state, locations, id, 'B');
    state = setResult(state, id, choose(a, b));
  }
  return state;
}
const base = () => generateSeededBracket(['A', 'B', 'C', 'D']);
const entry = (state, userId = 'member') => ({ userId, predictions: picksFromState(state), submittedAt: new Date() });
const props = (entries, extra = {}) => ({ structure: base(), entries, loaded: true, onInspect: vi.fn(), ...extra });

test('averages loss rounds and champion finishes across submitted brackets, with shared ranks', () => {
  const first = fill(base());
  const second = setResult(first, first.rounds.at(-1)[0], 'p2');
  const stats = buildPredictionStats(base(), [entry(first, 'one'), entry(second, 'two'), { userId: 'unsubmitted' }]);
  expect(stats.submitted).toBe(2);
  expect(stats.notSubmitted).toBe(1);
  expect(stats.rows.map(r => [r.pid, r.rank, r.averageFinish, r.finalPicks, r.championPicks])).toEqual([
    ['p1', 1, 2.5, 2, 1], ['p2', 1, 2.5, 2, 1], ['p3', 3, 1, 0, 0], ['p4', 3, 1, 0, 0],
  ]);
  // Official results and point weights cannot change prediction rankings.
  expect(buildPredictionStats(second, [entry(first), entry(second)]).rows).toEqual(stats.rows);
});

test('uses actual rounds with byes, and supports a two-entry final', () => {
  const state = generateSeededBracket(['A', 'B', 'C']);
  const stats = buildPredictionStats(state, [entry(fill(state))]);
  expect(stats.rows.map(r => [r.pid, r.averageFinish])).toEqual([['p1', 3], ['p2', 2], ['p3', 1]]);
  const final = generateSeededBracket(['A', 'B']);
  expect(buildPredictionStats(final, [entry(fill(final))]).rows.map(r => [r.averageFinish, r.finalPicks, r.championPicks])).toEqual([[2, 1, 1], [1, 1, 0]]);
});

test('later-round entrants follow their bracket round numbers', () => {
  const structure = { rounds: [['first'], ['final']], boxes: {
    first: { slotA: { type: 'named', participantId: 'a', name: 'A' }, slotB: { type: 'named', participantId: 'b', name: 'B' } },
    final: { slotA: { type: 'feed' }, slotB: { type: 'named', participantId: 'c', name: 'C' } },
  } };
  const stats = buildPredictionStats(structure, [{ predictions: { first: 'a', final: 'c' } }]);
  expect(stats.rows.map(r => [r.pid, r.averageFinish])).toEqual([['c', 3], ['a', 2], ['b', 1]]);
});

test('excludes incomplete, corrupt, stale and contradictory ballots from every denominator', () => {
  const full = entry(fill(base())), picks = full.predictions;
  const badFinal = { ...picks, [base().rounds.at(-1)[0]]: 'p3' };
  const entries = [full, { predictions: {} }, { predictions: { ...picks, removed: 'p1' } },
    { predictions: badFinal }, { dataError: true }, { submittedAt: new Date(), predictions: null }, { predictions: 'damaged' }];
  const stats = buildPredictionStats(base(), entries);
  expect(stats.submitted).toBe(1);
  expect(stats.excluded).toBe(6);
  expect(stats.rows[0].championPicks).toBe(1);
  expect(buildPredictionStats(base(), []).rows).toEqual([]);
  expect(buildPredictionStats({}, entries).unavailable).toBe(true);
});

test('private entries prevent statistics even if the viewer’s full predictions are present', () => {
  const own = entry(fill(base()));
  expect(buildPredictionStats(base(), Object.assign([own], { predictionsHidden: true })).rows).toEqual([]);
  expect(buildPredictionStats(base(), [own, { predictionsHidden: true }]).hidden).toBe(true);
});

test('legacy predictions use the same normalized participant identities', () => {
  const legacy = [
    [{ entry1: { name: 'A', seed: 1 }, entry2: { name: 'B', seed: 2 }, winner: 1 }],
  ];
  const pool = adaptLegacyPool({ bracketMatchups: legacy });
  const member = adaptLegacyEntry({ predictions: legacy });
  expect(buildPredictionStats(pool.bracketMatchups, [member]).rows.map(r => [r.name, r.averageFinish])).toEqual([['A', 2], ['B', 1]]);
});

test('UI explains averages, percentages, sample size, partial pages and excluded ballots', () => {
  const entries = Object.assign([entry(fill(base())), { predictions: {} }], { nextCursor: 'more' });
  const html = renderToStaticMarkup(<PoolPredictionStats {...props(entries)} />);
  expect(html).toContain('Partial analysis');
  expect(html).toContain('complete submitted bracket');
  expect(html).toContain('excluded because picks');
  expect(html).toContain('100.0%');
  expect(html).toContain('1 of 1');
  expect(html).toContain('3.00');
  expect(html).toContain('Equal averages share a rank');
});

test('UI withholds rankings during privacy, loading, errors, and empty submissions', () => {
  const entries = [entry(fill(base()))];
  const render = extra => renderToStaticMarkup(<PoolPredictionStats {...props(entries, extra)} />);
  expect(render({ predictionsOpen: true })).toContain('unlock after predictions close');
  expect(render({ entries: Object.assign(entries.slice(), { predictionsHidden: true }) })).not.toContain('<table');
  expect(render({ loaded: false })).toContain('Loading predictions');
  expect(render({ error: 'Failed' })).not.toContain('<table');
  expect(render({ entries: [] })).toContain('No complete submitted predictions');
});

test('entry buttons open the existing member-by-member prediction breakdown', () => {
  const onInspect = vi.fn(); let tree;
  act(() => { tree = create(<PoolPredictionStats {...props([entry(fill(base()))], { onInspect })} />); });
  try {
    act(() => tree.root.findAllByType('button')[0].props.onClick());
    expect(onInspect).toHaveBeenCalledWith({ pid: 'p1', name: 'A' });
  } finally { act(() => tree.unmount()); }
});
