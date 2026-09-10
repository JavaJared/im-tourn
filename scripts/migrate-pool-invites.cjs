// Run only after the compatible frontend is live. Existing invitation codes are
// preserved; each public-field removal commits atomically with its private copy.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const requireFunctions = createRequire(resolve(__dirname, '../functions/package.json'));
async function migratePoolInvites(db, FieldValue) {
  let migrated = 0;
  for (const [type, collection] of [['bracket', 'bracketPools'], ['prediction', 'predictionPools']]) {
    let cursor = null;
    for (;;) {
      let query = db.collection(collection).orderBy('__name__').limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const original of page.docs) {
        await db.runTransaction(async tx => {
          const snap = await tx.get(original.ref), data = snap.data();
          if (!data?.joinCode) return;
          const joinCode = data.joinCode;
          if (typeof joinCode !== 'string' || !/^[A-Z0-9]{6,8}$/.test(joinCode) || typeof data.hostId !== 'string') throw new Error(`Invalid legacy invitation on ${collection}/${snap.id}; nothing was removed from this pool.`);
          const invite = db.doc(`poolInvites/${type}_${snap.id}`);
          const hash = createHash('sha256').update(`${type}:${joinCode}`).digest('hex');
          const index = db.doc(`poolInviteCodes/${hash}`);
          const [saved, registered] = await Promise.all([tx.get(invite), tx.get(index)]);
          if ((saved.exists && saved.data().joinCode !== joinCode) || (registered.exists && registered.data().poolId !== snap.id)) throw new Error(`Conflicting legacy invitation on ${collection}/${snap.id}; resolve it before migration.`);
          tx.set(invite, { type, poolId: snap.id, hostId: data.hostId, joinCode });
          tx.set(index, { type, poolId: snap.id });
          tx.update(original.ref, { joinCode: FieldValue.delete(), privacyVersion: 1 });
        });
        if (original.data().joinCode) migrated++;
      }
      cursor = page.docs.at(-1);
    }
  }
  return migrated;
}
if (require.main === module) {
  const { initializeApp } = requireFunctions('firebase-admin/app');
  const { getFirestore, FieldValue } = requireFunctions('firebase-admin/firestore');
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  migratePoolInvites(getFirestore(), FieldValue).then(count => console.log(`Protected invitations for ${count} existing pools.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { migratePoolInvites };
