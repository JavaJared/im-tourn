import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import useAccountUsername from '../src/contexts/useAccountUsername';
const server = vi.hoisted(() => vi.fn());
vi.mock('../src/services/server', () => ({callServer:server}));
let tree, value;
function Consumer({user}) { value = useAccountUsername(user); return null; }
beforeEach(() => server.mockReset());
afterEach(() => { if (tree) act(() => tree.unmount()); });
test('new accounts remain in setup until a successful username claim', async () => {
  server.mockResolvedValueOnce({username:null,needsUsername:true});
  await act(async () => { tree = create(<Consumer user={{uid:'new'}} />); });
  expect(value.account.needsUsername).toBe(true);
  server.mockRejectedValueOnce(new Error('Taken'));
  await act(async () => { await expect(value.updateUsername('taken')).rejects.toThrow('Taken'); });
  expect(value.account.needsUsername).toBe(true);
  server.mockResolvedValueOnce({username:'chosen',needsUsername:false});
  await act(async () => { await value.updateUsername('chosen'); });
  expect(value.account.username).toBe('chosen');
});
test('existing defaults load automatically; stale account requests cannot leak across logins', async () => {
  let finish;
  server.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { tree = create(<Consumer user={{uid:'alice'}} />); });
  server.mockResolvedValueOnce({username:'user_bob',needsUsername:false});
  await act(async () => { tree.update(<Consumer user={{uid:'bob'}} />); });
  await act(async () => { finish({username:'alice',needsUsername:false}); });
  expect(value.account.username).toBe('user_bob');
});
