import { beforeAll, beforeEach, describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
run('bounded metadata catalogs', () => {
  let api, db, Timestamp;
  beforeAll(() => {
    process.env.GCLOUD_PROJECT = 'demo-im-tourn'; api = require('../functions/index.js');
    const admin = require('../functions/node_modules/firebase-admin/lib/firestore'); db = admin.getFirestore(); Timestamp = admin.Timestamp;
  });
  beforeEach(async () => { for (const name of ['brackets','customBrackets','rankings']) await db.recursiveDelete(db.collection(name)); });
  test('pages have stable ties and do not transfer heavy content', async () => {
    const batch = db.batch();
    for (let i = 0; i < 51; i++) batch.set(db.doc(`brackets/catalog${String(i).padStart(3,'0')}`), { title: `B${i}`, createdAt: Timestamp.fromMillis(1000), matchups: 'heavy private payload', description: i === 0 ? {} : 'Good' });
    await batch.commit();
    const ids = []; let cursor = null;
    do {
      const page = await api.browseCatalog.run({ data: { type: 'legacy', cursor } });
      expect(page.items.length).toBeLessThanOrEqual(24);
      expect(JSON.stringify(page)).not.toContain('heavy private payload');
      page.items.forEach(item => expect(typeof item.description).toBe('string'));
      ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(51); expect(new Set(ids).size).toBe(51);
  });
  test('draft custom brackets and malformed metadata cannot leak or break cards', async () => {
    await db.doc('customBrackets/hidden').set({ title: 'Secret', status: 'draft', createdAt: Timestamp.now() });
    await db.doc('customBrackets/public').set({ title: {}, description: [], status: 'published', createdAt: Timestamp.now(), participantCount: 'bad', structure: 'heavy' });
    const result = await api.browseCatalog.run({ data: { type: 'custom' } });
    expect(result.items).toHaveLength(1); expect(result.items[0]).toMatchObject({ id: 'public', title: 'Untitled', size: 0, description: '' });
    await expect(api.browseCatalog.run({ data: { type: '__proto__' } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
