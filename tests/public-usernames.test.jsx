import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import UserLink from '../src/components/layout/UserLink';
import { rememberUsername, subscribeUsername } from '../src/services/publicUsernames';
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../src/services/server', () => ({ callServer: (...args) => mocks.call(...args) }));
let tree;
const unsubscribes = [];
beforeEach(() => { vi.useFakeTimers(); mocks.call.mockReset(); });
afterEach(() => { if (tree) { act(() => tree.unmount()); tree = null; } unsubscribes.splice(0).forEach(fn => fn()); vi.useRealTimers(); });
test('labels batch requests, ignore old display names, and retain profile links', async () => {
  mocks.call.mockResolvedValue({usernames:{label_alice:'new_alice',label_bob:'bob_user'}});
  await act(async () => { tree = create(<><UserLink userId="label_alice" name="Old Real Name" /><UserLink userId="label_alice" name="I’m Tourn user" /><UserLink userId="label_bob" /></>); });
  expect(JSON.stringify(tree.toJSON())).not.toContain('Old Real Name');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith('getPublicUsernames',{userIds:['label_alice','label_bob']});
  expect(tree.root.findAllByType('a').map(a=>a.children.join(''))).toEqual(['@new_alice','@new_alice','@bob_user']);
  expect(tree.root.findAllByType('a')[0].props.href).toBe('/?view=profile-label_alice');
  await act(async () => rememberUsername('label_alice','renamed_alice'));
  expect(tree.root.findAllByType('a')[0].children).toEqual(['@renamed_alice']);
});
test('failed lookups never expose snapshot names and retry on refresh', async () => {
  mocks.call.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({usernames:{retry_user:'restored'}});
  await act(async () => { tree = create(<UserLink userId="retry_user" name="Private old name" />); });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(tree.root.findByType('a').children).toEqual(['Username unavailable']);
  await act(async () => vi.advanceTimersByTimeAsync(60001));
  expect(tree.root.findByType('a').children).toEqual(['@restored']);
});
test('batch lookup respects server limit and deduplicates subscribers', async () => {
  mocks.call.mockResolvedValue({usernames:{}});
  for (let i=0;i<105;i++) unsubscribes.push(subscribeUsername(`batch_${i}`,()=>{}));
  unsubscribes.push(subscribeUsername('batch_0',()=>{}));
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.call.mock.calls.map(([,data])=>data.userIds.length)).toEqual([50,50,5]);
});
test('a stale lookup cannot overwrite an immediately saved username', async () => {
  let resolve;
  mocks.call.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const notify=vi.fn();unsubscribes.push(subscribeUsername('racing_user',notify));
  await vi.advanceTimersByTimeAsync(1);
  rememberUsername('racing_user','new_name');
  resolve({usernames:{racing_user:'old_name'}});
  await vi.advanceTimersByTimeAsync(1);
  expect(notify).toHaveBeenLastCalledWith('new_name');
});
