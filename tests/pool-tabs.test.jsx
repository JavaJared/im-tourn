import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import CustomPoolDetail from '../src/components/CustomPoolDetail';
import PoolTabs from '../src/components/pools/PoolTabs';
import Board from '../src/components/pools/PoolBoard';
import { generateSeededBracket } from '../src/lib/standardBracket';

const fixture = vi.hoisted(() => ({ pool: null, entries: [] }));
vi.mock('../src/services/customBracketService', () => ({
  subscribeToPool: (_id, cb) => { cb(fixture.pool); return () => {}; },
  subscribeToPoolEntries: (_id, cb) => { cb(fixture.entries); return Object.assign(() => {}, { refresh: vi.fn() }); },
  startCustomPool: vi.fn(), recordCustomPoolWinner: vi.fn(), updateCustomPoolScores: vi.fn(), recalculateCustomPoolScoresManual: vi.fn(),
}));
vi.mock('../src/services/bracketService', () => ({
  joinBracketPool: vi.fn(), submitPoolPredictions: vi.fn(), lockPool: vi.fn(), completePool: vi.fn(), updatePoolDescription: vi.fn(), deletePool: vi.fn(), getPoolById: vi.fn(),
}));
vi.mock('../src/lib/usePoolAnalysis', () => ({ usePoolAnalysis: () => ({ analysis: null }) }));
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; });
function mount(user = 'guest', status = 'in_progress') {
  fixture.pool = { name: 'Test pool', hostId: 'host', status, joinCode: 'SECRET', bracketMatchups: generateSeededBracket(['A', 'B']), roundPoints: [7], description: 'House rules' };
  fixture.entries = [{ id: 'mine', userId: user }];
  act(() => { tree = create(<CustomPoolDetail poolId="pool-one" currentUserId={user} onNavigate={() => {}} />); });
}
const select = key => act(() => tree.root.findByProps({ id: `pool-tab-${key}` }).props.onClick());
const text = () => JSON.stringify(tree.toJSON());
test('participants have all four sections and never see host controls or invite codes', () => {
  mount();
  expect(tree.root.findAllByProps({ role: 'tab' }).map(t => t.children[0])).toEqual(['My Picks', 'Official Results', 'Standings', 'Rules']);
  expect(tree.root.findAllByType('details')).toHaveLength(0);
  expect(text()).not.toContain('SECRET');
  select('results');
  expect(tree.root.findByType(Board).props.editable).toBe(false);
  expect(tree.root.findByType(Board).props.sc).toBe(null);
  select('rules');
  expect(text()).toContain('House rules');
  expect(text()).toContain('Points per correct pick');
  expect(tree.root.findByProps({ role: 'tabpanel' }).props['aria-labelledby']).toBe('pool-tab-rules');
});
test('host explicitly enables results editing and switching sections ends editing', () => {
  mount('host');
  const controls = tree.root.findByType('details');
  expect(JSON.stringify(controls.findByType('summary').children)).toContain('Host controls');
  select('results');
  expect(tree.root.findByType(Board).props.editable).toBe(false);
  const edit = controls.findAllByType('button').find(b => b.children.includes('Edit official results'));
  act(() => edit.props.onClick());
  expect(tree.root.findByType(Board).props.editable).toBe(true);
  expect(tree.root.findByType(Board).props.sc.editable).toBe(true);
  select('bracket'); select('results');
  expect(tree.root.findByType(Board).props.editable).toBe(false);
});
test('unsaved picks survive switching tabs', () => {
  mount('guest', 'open');
  const board = tree.root.findByType(Board);
  const id = board.props.state.rounds[0][0];
  const pid = board.props.state.boxes[id].slotA.participantId;
  act(() => board.props.onPick(id, pid));
  const before = tree.root.findByType(Board).props.state;
  select('rules'); select('bracket');
  expect(tree.root.findByType(Board).props.state).toBe(before);
  expect(before.boxes[id].result.winnerId).toBe(pid);
});
test('tab keyboard navigation wraps and supports Home and End', () => {
  const change = vi.fn(), preventDefault = vi.fn(), focus = Array.from({ length: 4 }, () => vi.fn());
  act(() => { tree = create(<PoolTabs activeTab="bracket" onChange={change} />); });
  const event = key => ({ key, preventDefault, currentTarget: { parentElement: { querySelectorAll: () => focus.map(fn => ({ focus: fn })) } } });
  act(() => tree.root.findAllByType('button')[0].props.onKeyDown(event('ArrowLeft')));
  expect(change).toHaveBeenLastCalledWith('rules'); expect(focus[3]).toHaveBeenCalled();
  act(() => tree.root.findAllByType('button')[2].props.onKeyDown(event('Home')));
  expect(change).toHaveBeenLastCalledWith('bracket');
  act(() => tree.root.findAllByType('button')[0].props.onKeyDown(event('End')));
  expect(change).toHaveBeenLastCalledWith('rules');
});
