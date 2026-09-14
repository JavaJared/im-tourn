import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readView, useViewNavigation } from '../src/lib/useViewNavigation';
import BracketUrlPage from '../src/pages/brackets/BracketUrlPage';

const mocks = vi.hoisted(() => ({ get: vi.fn(), server: vi.fn(), user: { uid: 'alice' } }));
vi.mock('../src/services/bracketService', () => ({ getBracketById: mocks.get }));
vi.mock('../src/services/server', () => ({ callServer: mocks.server }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: mocks.user }) }));
vi.mock('../src/app/pages', () => ({
  FillPage: ({ bracket }) => createElement('article', { 'data-id': bracket.id }, bracket.title),
  PDFPage: ({ bracket }) => createElement('article', { 'data-id': bracket.id }, bracket.title),
}));
let tree;
const bracket = id => ({ id, title: id, matchups: [[{ entry1: { name: 'A' }, entry2: { name: 'B' }, winner: 1 }]] });
beforeEach(() => { mocks.get.mockReset(); mocks.server.mockReset(); mocks.user = { uid: 'alice' }; });
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; vi.unstubAllGlobals(); });

test('bookmark URLs retain resource IDs and reject invalid views', () => {
  for (const view of ['fill-bracket-a', 'saved-bracket-b', 'local-bracket-123', 'pool-p', 'custom-bracket-c', 'saved-custom-bracket-c']) expect(readView('?view=' + view)).toBe(view);
  expect(readView('?view=fill-bracket-')).toBe('home');
  expect(readView('?view=fill-bracket-../bad')).toBe('home');
});
test('Back and Forward restore distinct bracket and pool URLs without adding history entries', () => {
  let nav, current;
  const entries = ['https://imtourn.com/?view=pool-original'];
  let index = 0;
  const listeners = new Map();
  const win = { location: new URL(entries[0]), scrollTo: vi.fn(), addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  win.history = { pushState: vi.fn((_state, _title, url) => { entries.splice(++index); entries.push(String(url)); win.location = new URL(url); }) };
  vi.stubGlobal('window', win);
  const Probe = () => { [current, nav] = useViewNavigation(); return null; };
  act(() => { tree = create(createElement(Probe)); });
  expect(current).toBe('pool-original');
  act(() => nav('fill-bracket-a')); act(() => nav('fill-bracket-b'));
  act(() => { win.location = new URL(entries[--index]); listeners.get('popstate')(); });
  expect(current).toBe('fill-bracket-a');
  act(() => { win.location = new URL(entries[--index]); listeners.get('popstate')(); });
  expect(current).toBe('pool-original');
  act(() => { win.location = new URL(entries[++index]); listeners.get('popstate')(); });
  expect(current).toBe('fill-bracket-a');
  expect(win.history.pushState).toHaveBeenCalledTimes(2);
});
test('a cold bookmark fetches its bracket without session state', async () => {
  mocks.get.mockResolvedValue(bracket('a'));
  await act(async () => { tree = create(createElement(BracketUrlPage, { id: 'a', mode: 'fill' })); });
  expect(mocks.get).toHaveBeenCalledWith('a');
  expect(tree.root.findByType('article').props['data-id']).toBe('a');
});
test('switching resource IDs ignores late responses from the previous bracket', async () => {
  let resolveA;
  mocks.get.mockImplementation(id => id === 'a' ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve(bracket('b')));
  await act(async () => { tree = create(createElement(BracketUrlPage, { id: 'a', mode: 'fill' })); });
  await act(async () => tree.update(createElement(BracketUrlPage, { id: 'b', mode: 'fill' })));
  await act(async () => resolveA(bracket('a')));
  expect(tree.root.findByType('article').props['data-id']).toBe('b');
});
test('saved bookmarks require login and fetch through the owner-checked endpoint', async () => {
  mocks.user = null;
  await act(async () => { tree = create(createElement(BracketUrlPage, { id: 's', mode: 'saved' })); });
  expect(mocks.server).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Log in');
  mocks.user = { uid: 'alice' }; mocks.server.mockResolvedValue(bracket('s'));
  await act(async () => tree.update(createElement(BracketUrlPage, { id: 's', mode: 'saved' })));
  expect(mocks.server).toHaveBeenCalledWith('getMySavedActivity', { type: 'standard', id: 's' });
  expect(tree.root.findByType('article').props['data-id']).toBe('s');
});
test('missing records stay on the URL and offer retry and a way out', async () => {
  const back = vi.fn(); mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce(bracket('a'));
  await act(async () => { tree = create(createElement(BracketUrlPage, { id: 'a', mode: 'fill', onBack: back })); });
  expect(tree.root.findByProps({ role: 'alert' }).children).toContain('This bracket is no longer available.');
  await act(async () => tree.root.findAllByType('button').find(b => b.children.includes('Retry')).props.onClick());
  expect(tree.root.findByType('article').props['data-id']).toBe('a');
});
test('guest result bookmarks restore their own snapshot rather than the latest export', async () => {
  vi.stubGlobal('localStorage', { getItem: key => key === 'local-bracket:a' ? JSON.stringify(bracket('a')) : null });
  await act(async () => { tree = create(createElement(BracketUrlPage, { id: 'a', mode: 'local', fallback: { ...bracket('b'), localId: 'b' } })); });
  expect(tree.root.findByType('article').props['data-id']).toBe('a');
  expect(mocks.server).not.toHaveBeenCalled();
});
