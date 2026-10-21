import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ data: {}, exists: true, remove: vi.fn() }));
vi.mock('../src/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => `${collection}/${id}`,
  runTransaction: (_db, callback) => callback({ get: async () => ({ exists: () => mocks.exists, data: () => mocks.data }), delete: mocks.remove }),
}));
import { deleteBracketDraft } from '../src/services/bracketDraftService';
beforeEach(() => { mocks.exists = true; mocks.data = { hostId:'alice', status:'draft' }; mocks.remove.mockReset(); });
test('deletes only the revision draft, leaving its published original untouched', async () => {
  mocks.data.revisionOf = 'original'; mocks.data.replaceOriginal = true;
  await deleteBracketDraft('draft', 'alice');
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('customBrackets/draft');
});
test.each([{hostId:'bob'}, {status:'published'}, {resetting:true}])('refuses changed or inaccessible draft %s', async changes => {
  Object.assign(mocks.data, changes);
  await expect(deleteBracketDraft('draft','alice')).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
});
test('already deleted draft succeeds without touching other documents', async () => {
  mocks.exists = false; await deleteBracketDraft('draft','alice'); expect(mocks.remove).not.toHaveBeenCalled();
});
