import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import CustomPoolDetail from '../src/components/CustomPoolDetail';
import PoolStandings from '../src/components/pools/PoolStandings';
import RemoveDialog from '../src/components/pools/RemovePoolParticipantDialog';
import { generateSeededBracket } from '../src/lib/standardBracket';

const fixture = vi.hoisted(() => ({ status: 'open', refresh: vi.fn(), remove: vi.fn(), updates: null }));
vi.mock('react-dom', () => ({ createPortal: children => children }));
vi.mock('../src/lib/useDialog', () => ({ useDialog: () => ({ current: null }) }));
vi.mock('../src/components/layout/UserLink', () => ({ default: ({ userId }) => <span>{userId}</span> }));
vi.mock('../src/components/layout/UsernameText', () => ({ default: ({ userId }) => <span>@{userId}</span> }));
vi.mock('../src/lib/usePoolAnalysis', () => ({ usePoolAnalysis: () => ({ analysis: null }) }));
vi.mock('../src/services/customBracketService', () => ({
  subscribeToPool: (_id, cb) => { cb({ id: 'pool', name: 'Pool', hostId: 'host', status: fixture.status, bracketMatchups: generateSeededBracket(['A', 'B']) }); return () => {}; },
  subscribeToPoolEntries: (_id, cb) => {
    fixture.updates = cb;
    cb(Object.assign([{ id: 'pool_host', userId: 'host' }, { id: 'pool_alice', userId: 'alice', predictionsHidden: true }], { predictionsHidden: true, nextCursor: 'more' }));
    return Object.assign(() => {}, { refresh: fixture.refresh });
  },
  startCustomPool: vi.fn(), recordCustomPoolWinner: vi.fn(), updateCustomPoolScores: vi.fn(), recalculateCustomPoolScoresManual: vi.fn(),
}));
vi.mock('../src/services/bracketService', () => ({
  removePoolParticipant: (...args) => fixture.remove(...args), joinBracketPool: vi.fn(), submitPoolPredictions: vi.fn(), lockPool: vi.fn(), completePool: vi.fn(), updatePoolDescription: vi.fn(), deletePool: vi.fn(), getPoolById: vi.fn(),
}));
let tree;
beforeEach(() => { fixture.status = 'open'; fixture.remove.mockReset().mockResolvedValue({ removed: true }); fixture.refresh.mockReset().mockResolvedValue(); vi.stubGlobal('document', { body: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() }); });
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; vi.unstubAllGlobals(); });
function mount(user = 'host') {
  act(() => { tree = create(<CustomPoolDetail poolId="pool" currentUserId={user} onNavigate={() => {}} />); });
  act(() => tree.root.findByProps({ id: 'pool-tab-leaderboard' }).props.onClick());
}
const removeButtons = () => tree.root.findByType(PoolStandings).findAllByType('button').filter(button => button.children[0] === 'Remove participant');
const dialog = () => tree.root.findByType(RemoveDialog);

test('only hosts see removal controls, including members with private or missing picks', () => {
  mount('alice'); expect(removeButtons()).toHaveLength(0);
  act(() => tree.unmount()); tree = null;
  mount(); expect(removeButtons()).toHaveLength(1);
  act(() => removeButtons()[0].props.onClick());
  expect(dialog().props.participant.userId).toBe('alice');
  expect(fixture.remove).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('cannot rejoin this pool');
  act(() => dialog().props.onCancel());
  expect(dialog().props.participant).toBeNull(); expect(fixture.remove).not.toHaveBeenCalled();
});

test('confirmation removes the chosen entry, refreshes results and retains pagination/privacy metadata', async () => {
  mount(); act(() => removeButtons()[0].props.onClick());
  await act(async () => dialog().props.onConfirm());
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith('pool', 'alice');
  expect(fixture.refresh).toHaveBeenCalled();
  expect(dialog().props.participant).toBeNull();
  const standings = tree.root.findByType(PoolStandings);
  expect(standings.props.entries.map(e => e.userId)).toEqual(['host']);
  expect(standings.props.partial).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('Other participants’ picks stay private');
});

test('failed removal keeps the participant and dialog available for retry', async () => {
  fixture.remove.mockRejectedValueOnce(new Error('Connection lost'));
  mount(); act(() => removeButtons()[0].props.onClick());
  await act(async () => dialog().props.onConfirm());
  expect(dialog().props.error).toBe('Connection lost');
  expect(tree.root.findByType(PoolStandings).props.entries).toHaveLength(2);
  await act(async () => dialog().props.onConfirm());
  expect(fixture.remove).toHaveBeenCalledTimes(2);
  expect(dialog().props.participant).toBeNull();
});

test('duplicate confirmations cannot send a second mutation while removing', async () => {
  let finish; fixture.remove.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  mount(); act(() => removeButtons()[0].props.onClick());
  let pending;
  act(() => { pending = dialog().props.onConfirm(); });
  expect(dialog().props.busy).toBe(true);
  act(() => dialog().props.onConfirm());
  act(() => dialog().props.onCancel());
  expect(dialog().props.participant.userId).toBe('alice');
  expect(fixture.remove).toHaveBeenCalledOnce();
  await act(async () => { finish({ removed: true }); await pending; });
  expect(dialog().props.participant).toBeNull();
});

test.each(['locked', 'in_progress', 'completed'])('hosts can remove entries from a %s pool', status => {
  fixture.status = status; mount(); expect(removeButtons()).toHaveLength(1);
});
