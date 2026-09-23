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
test('verified username is available on remount while server refreshes and another UID cannot reuse it', async () => {
  const storage = new Map();
  vi.stubGlobal('sessionStorage',{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)});
  try {
    server.mockResolvedValueOnce({username:'alice',needsUsername:false});
    await act(async()=>{tree=create(<Consumer user={{uid:'cached-alice'}}/>);});
    act(()=>tree.unmount());
    let finish;
    server.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    await act(async()=>{tree=create(<Consumer user={{uid:'cached-alice'}}/>);});
    expect(value.account.username).toBe('alice');
    await act(async()=>finish({username:null,needsUsername:true}));
    expect(value.account.needsUsername).toBe(true);
    expect(value.account.username).toBeNull();
    server.mockImplementationOnce(()=>new Promise(()=>{}));
    await act(async()=>tree.update(<Consumer user={{uid:'uncached-bob'}}/>));
    expect(value.account.username).toBeUndefined();
  } finally { vi.unstubAllGlobals(); }
});
