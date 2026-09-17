import { beforeEach, expect, test, vi } from 'vitest';
import { getDocs, getDoc, orderBy } from 'firebase/firestore';
import { getUserCreatedRankings, getUserVotedRankings } from '../src/services/rankingService';
vi.mock('../src/services/server', () => ({ callServer: vi.fn() }));
vi.mock('../src/firebase', () => ({ db: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
 collection: (...args) => args, query: (...args) => args, where: (...args) => args,
 doc: (_db, collection, id) => ({ collection, id }), getDocs: vi.fn(), getDoc: vi.fn(),
 orderBy: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(), updateDoc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn(), writeBatch: vi.fn()
}));
const record = (id, data) => ({ id, data: () => data, exists: () => true });
beforeEach(() => vi.clearAllMocks());
test('created rankings include legacy records without dates and sort newest first without an index-dependent order', async () => {
 getDocs.mockResolvedValue({ docs: [record('legacy', { title: 'Legacy' }), record('new', { createdAt: { toDate: () => new Date(100) }, consensusRanking: 'large' })] });
 const rows = await getUserCreatedRankings('alice');
 expect(rows.map(r => r.id)).toEqual(['new', 'legacy']);
 expect(rows[1].createdAt).toBeNull();
 expect(rows[0]).not.toHaveProperty('consensusRanking');
 expect(orderBy).not.toHaveBeenCalled();
});
test('malformed, duplicate and deleted vote references do not hide valid rankings', async () => {
 getDocs.mockResolvedValue({ docs: [undefined, null, {}, '', ' ', 'bad/path', 'valid', 'valid', 'deleted'].map((rankingId, i) => record(String(i), { rankingId })) });
 getDoc.mockImplementation(async ({ id }) => id === 'deleted' ? { exists: () => false } : record(id, { title: 'Valid ranking' }));
 expect((await getUserVotedRankings('alice')).map(r => r.id)).toEqual(['valid']);
 expect(getDoc).toHaveBeenCalledTimes(2);
});
test('read failures propagate instead of pretending the voter has no history', async () => {
 getDocs.mockResolvedValue({ docs: [record('vote', { rankingId: 'valid' })] });
 getDoc.mockRejectedValueOnce(new Error('offline'));
 await expect(getUserVotedRankings('alice')).rejects.toThrow('offline');
});
