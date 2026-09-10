import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { usePagedCatalog } from '../src/lib/usePagedCatalog';
const call = vi.hoisted(() => vi.fn());
vi.mock('../src/services/server', () => ({ callServer: call }));
let state, tree;
function Harness(props) { state = usePagedCatalog(['legacy', 'custom'], props); return null; }
beforeEach(() => { call.mockReset(); });
afterEach(() => { if (tree) act(() => tree.unmount()); });
const mount = async props => act(async () => { tree = create(createElement(Harness, props)); });
test('partial failures keep successful cards and retry without skipping the failed source', async () => {
  call.mockImplementation(async (_, { type, cursor }) => {
    if (type === 'custom') throw Error('offline');
    return { items: [{ id: cursor ? 'second' : 'first' }], nextCursor: cursor ? null : 'first' };
  });
  await mount({});
  expect(state.items.map(x => x.id)).toEqual(['first']); expect(state.error).toBeTruthy();
  call.mockImplementation(async (_, { type, cursor }) => ({ items: [{ id: type === 'custom' ? 'custom-first' : 'second' }], nextCursor: null }));
  await act(async () => state.loadMore());
  expect(call.mock.calls.at(-1)[1]).toMatchObject({ type: 'custom', cursor: null });
  expect(state.items.map(x => x.id)).toEqual(['first', 'second', 'custom-first']);
  expect(state.hasMore).toBe(false); expect(state.error).toBe('');
});
test('a malformed page releases loading state and can be retried', async () => {
  call.mockResolvedValue({ items: null });
  await mount({});
  expect(state.loading).toBe(false); expect(state.error).toBeTruthy();
  call.mockResolvedValue({ items: [{ id: 'ok' }, null], nextCursor: null });
  await act(async () => state.loadMore());
  expect(state.items).toHaveLength(2); expect(state.error).toBe('');
});
test('an old account response cannot populate the new account list', async () => {
  const pending = [];
  call.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  await mount({ scope: 'alice' });
  call.mockResolvedValue({ items: [{ id: 'bob-pool' }], nextCursor: null });
  await act(async () => tree.update(createElement(Harness, { scope: 'bob' })));
  await act(async () => pending.forEach(resolve => resolve({ items: [{ id: 'alice-pool' }], nextCursor: null })));
  expect(state.items.every(item => item.id === 'bob-pool')).toBe(true);
});
