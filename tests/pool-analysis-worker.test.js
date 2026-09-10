import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import { usePoolAnalysis } from '../src/lib/usePoolAnalysis';
let state, tree;
const workers = [];
class WorkerStub {
  constructor() { workers.push(this); }
  postMessage = vi.fn();
  terminate = vi.fn();
}
function Harness({ input }) { state = usePoolAnalysis(input); return null; }
afterEach(() => { if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); workers.length = 0; });
test('changing results terminates obsolete analysis and does not show its result', () => {
  vi.stubGlobal('Worker', WorkerStub);
  act(() => { tree = create(createElement(Harness, { input: { results: {} } })); });
  const first = workers[0];
  act(() => first.onmessage({ data: { analysis: { byUserId: { alice: 'alive' } } } }));
  expect(state.analysis.byUserId.alice).toBe('alive');
  act(() => tree.update(createElement(Harness, { input: { results: { final: 'bob' } } })));
  expect(first.terminate).toHaveBeenCalledOnce(); expect(first.onmessage).toBeNull();
  expect(state.analysis).toBeNull(); expect(state.loading).toBe(true);
  act(() => tree.update(createElement(Harness, { input: null })));
  expect(workers[1].terminate).toHaveBeenCalledOnce(); expect(state.loading).toBe(false);
});
test('unsupported workers report an optional-analysis error without blocking the page', () => {
  vi.stubGlobal('Worker', class { constructor() { throw Error('unavailable'); } });
  act(() => { tree = create(createElement(Harness, { input: {} })); });
  expect(state.loading).toBe(false); expect(state.analysis).toBeNull(); expect(state.error).toContain('Scores and predictions');
});
