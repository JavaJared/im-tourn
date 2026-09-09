import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import FillPage from '../src/pages/brackets/FillPage.jsx';
import {
  fillDraftKey,
  readFillDraft,
  saveFillDraft,
  selectFillWinner,
} from '../src/lib/fillDraft.js';

const mocks = vi.hoisted(() => ({ user: null, submit: vi.fn() }));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: mocks.user }),
}));
vi.mock('../src/services/bracketService', () => ({
  submitFilledBracket: mocks.submit,
}));
const bracket = () => ({
  id: 'bracket-one',
  title: 'Test bracket',
  matchups: [
    [
      { id: 'a', entry1: { name: 'A' }, entry2: { name: 'B' }, winner: null },
      { id: 'b', entry1: { name: 'C' }, entry2: { name: 'D' }, winner: null },
    ],
    [{ id: 'final', entry1: null, entry2: null, winner: null }],
  ],
});
let trees;
beforeEach(() => {
  trees = [];
  mocks.user = null;
  mocks.submit.mockReset();
  const data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  });
});
afterEach(() => {
  act(() => trees.forEach((tree) => tree.unmount()));
  vi.unstubAllGlobals();
});
function mount(props = {}) {
  let tree;
  act(() => {
    tree = create(
      createElement(FillPage, {
        bracket: bracket(),
        onSubmit: vi.fn(),
        onBack: vi.fn(),
        ...props,
      }),
    );
  });
  trees.push(tree);
  return tree;
}
const picks = (tree) =>
  tree.root.findAll(
    (node) => node.type === 'button' && node.props.className?.startsWith('matchup-entry'),
  );
const submit = (tree) => tree.root.findByProps({ className: 'submit-btn' });
function complete(tree) {
  for (const index of [0, 2, 4]) act(() => picks(tree)[index].props.onClick());
}

describe('legacy fill recovery', () => {
  it('restores a complete bracket after remount and clears it after guest export', async () => {
    const first = mount();
    complete(first);
    act(() => first.unmount());
    const onSubmit = vi.fn();
    const restored = mount({ onSubmit });
    expect(picks(restored).filter((p) => p.props['aria-pressed'])).toHaveLength(3);
    expect(submit(restored).props.disabled).toBe(false);
    await act(() => submit(restored).props.onClick());
    expect(onSubmit.mock.calls[0][0].champion.name).toBe('A');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(localStorage.getItem(fillDraftKey('bracket-one'))).toBeNull();
  });

  it('preserves picks on failed save, prevents duplicate requests, and allows retry', async () => {
    mocks.user = { uid: 'user-a', displayName: 'Tester' };
    let reject;
    mocks.submit.mockImplementationOnce(
      () =>
        new Promise((_, no) => {
          reject = no;
        }),
    );
    const onSubmit = vi.fn();
    const tree = mount({ onSubmit });
    complete(tree);
    let pending;
    act(() => {
      pending = submit(tree).props.onClick();
      submit(tree).props.onClick();
    });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(picks(tree).every((p) => p.props.disabled)).toBe(true);
    await act(async () => {
      reject(new Error('permission-denied'));
      await pending;
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ role: 'alert' }).children.join('')).toContain(
      'could not be submitted',
    );
    expect(localStorage.getItem(fillDraftKey('bracket-one', 'user-a'))).not.toBeNull();
    expect(picks(tree).filter((p) => p.props['aria-pressed'])).toHaveLength(3);
    mocks.submit.mockResolvedValueOnce('saved-id');
    await act(() => submit(tree).props.onClick());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(fillDraftKey('bracket-one', 'user-a'))).toBeNull();
  });

  it('isolates drafts when the account or bracket changes without unmounting the route', () => {
    const source = bracket();
    const props = { bracket: source, onSubmit: vi.fn(), onBack: vi.fn() };
    const tree = mount(props);
    complete(tree);
    mocks.user = { uid: 'user-a' };
    act(() => tree.update(createElement(FillPage, props)));
    expect(picks(tree).some((p) => p.props['aria-pressed'])).toBe(false);
    complete(tree);
    act(() =>
      tree.update(
        createElement(FillPage, {
          ...props,
          bracket: { ...source, id: 'other' },
        }),
      ),
    );
    expect(picks(tree).some((p) => p.props['aria-pressed'])).toBe(false);
    mocks.user = null;
    act(() => tree.update(createElement(FillPage, props)));
    expect(picks(tree).filter((p) => p.props['aria-pressed'])).toHaveLength(3);
  });

  it('keeps editing usable and reports when browser storage fails', () => {
    localStorage.setItem = () => {
      throw new Error('Quota exceeded');
    };
    const tree = mount();
    complete(tree);
    expect(submit(tree).props.disabled).toBe(false);
    expect(tree.root.findByProps({ role: 'status' }).children.join('')).toContain('could not save');
  });

  it('ignores corrupt, incompatible, and impossible saved picks', () => {
    const source = bracket().matchups;
    const key = 'draft';
    for (const value of [
      '{broken',
      JSON.stringify({
        source: JSON.stringify(source),
        picks: [[3, null], [null]],
      }),
      JSON.stringify({
        source: JSON.stringify(source),
        picks: [[null, null], [1]],
      }),
    ]) {
      localStorage.setItem(key, value);
      expect(readFillDraft(key, source)).toEqual({
        matchups: source,
        restored: false,
      });
    }
    saveFillDraft(key, source, selectFillWinner(source, 0, 0, 1));
    const changed = bracket().matchups;
    changed[0][0].entry1.name = 'New entrant';
    expect(readFillDraft(key, changed).restored).toBe(false);
  });

  it('clears downstream choices when an earlier winner changes, including after restoration', () => {
    const source = bracket().matchups;
    let chosen = selectFillWinner(source, 0, 0, 1);
    chosen = selectFillWinner(chosen, 0, 1, 2);
    chosen = selectFillWinner(chosen, 1, 0, 1);
    chosen = selectFillWinner(chosen, 0, 0, 2);
    saveFillDraft('draft', source, chosen);
    expect(readFillDraft('draft', source).matchups).toEqual(chosen);
    expect(chosen[1][0].winner).toBeNull();
    expect(chosen[1][0].entry1.name).toBe('B');
    expect(source[0][0].winner).toBeNull();
  });
});

it('does not allow a premature final pick to submit an unfinished bracket', () => {
  const tree = mount();
  act(() => picks(tree)[0].props.onClick());
  act(() => picks(tree)[4].props.onClick());
  expect(submit(tree).props.disabled).toBe(true);
});
it('does not navigate away from a new page when an earlier save finishes', async () => {
  mocks.user = { uid: 'user-a' };
  let resolve;
  mocks.submit.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const onSubmit = vi.fn();
  const tree = mount({ onSubmit });
  complete(tree);
  let pending;
  act(() => {
    pending = submit(tree).props.onClick();
  });
  act(() => tree.unmount());
  await act(async () => {
    resolve('saved-id');
    await pending;
  });
  expect(onSubmit).not.toHaveBeenCalled();
});
