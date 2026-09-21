const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
const { retirePoolSleepers } = require('../functions/retire-sleepers');
(async () => {
  let count = 0;
  while (true) {
    const page = await getFirestore().collection('bracketPools').where('enableSleepers', '==', true).limit(50).get();
    if (page.empty) break;
    for (const pool of page.docs) if (await retirePoolSleepers(pool.ref)) count++;
  }
  console.log(`Retired sleeper scoring in ${count} pools.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
