import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MyRankingsPage } from '../src/pages/rankings/MyRankingsPage';
import { getUserCreatedRankings, getUserVotedRankings } from '../src/services/rankingService';
const auth = vi.hoisted(() => ({ currentUser: { uid: 'alice' } }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../src/services/rankingService', () => ({ getUserCreatedRankings: vi.fn(), getUserVotedRankings: vi.fn() }));
let tree;
const text = () => JSON.stringify(tree.toJSON());
const click = async label => act(async () => tree.root.findAllByType('button').find(b => b.children.join('').startsWith(label)).props.onClick());
beforeEach(() => {
 auth.currentUser = { uid: 'alice' };
 getUserCreatedRankings.mockResolvedValue([{ id: 'own', hostId: 'alice', title: 'My ranking' }]);
 getUserVotedRankings.mockResolvedValue([{ id: 'own', hostId: 'alice', title: 'My ranking' }]);
 vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.restoreAllMocks(); vi.clearAllMocks(); });
const mount = async () => act(async () => { tree = create(<MyRankingsPage onNavigate={() => {}} />); });
test('a vote request failure preserves created rankings and offers retry instead of an empty history', async () => {
 getUserVotedRankings.mockRejectedValueOnce(new Error('offline'));
 await mount();
 expect(text()).toContain('My ranking');
 await click('Voted In');
 expect(text()).toContain("We couldn't load your");
 expect(text()).not.toContain("You haven't voted");
 await click('Retry');
 expect(text()).toContain('My ranking');
 expect(tree.root.findAllByType('button').some(b => b.children.join('') === 'Voted In (1)')).toBe(true);
});
test('created request failure does not hide votes on the user’s own ranking', async () => {
 getUserCreatedRankings.mockRejectedValueOnce(new Error('index unavailable'));
 await mount();
 expect(text()).not.toContain("You haven't created");
 await click('Voted In');
 expect(text()).toContain('My ranking');
});
test('late responses from the previous account cannot replace the current account', async () => {
 let finish;
 getUserCreatedRankings.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 await mount();
 auth.currentUser = { uid: 'bob' };
 getUserCreatedRankings.mockResolvedValue([]);
 getUserVotedRankings.mockResolvedValue([]);
 await act(async () => tree.update(<MyRankingsPage onNavigate={() => {}} />));
 await act(async () => finish([{ id: 'old', title: 'Alice private history' }]));
 expect(text()).not.toContain('Alice private history');
 expect(text()).toContain("You haven't created");
});
