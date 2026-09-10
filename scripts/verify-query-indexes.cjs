// Index deployment may finish before Firestore finishes building the indexes.
// Exercise each new query before the frontend readiness marker advances.
process.env.GCLOUD_PROJECT = process.env.FIREBASE_PROJECT_ID;
const api = require('../functions/index.js');
const auth = { uid: '__deployment_index_probe__', token: {} };
async function verify() {
  const probes = [
    ...['legacy','custom','ranking','draft'].map(type => () => api.browseCatalog.run({ data: { type } })),
    ...['hosted','joined'].map(mine => () => api.browseCatalog.run({ auth, data: { type: 'draft', mine } })),
    ...['bracket','prediction'].flatMap(poolType => ['hosted','joined'].map(type => () => api.listUserPools.run({ auth, data: { type, poolType } }))),
    () => api.listSubmissionSummaries.run({ data: { bracketId: '__deployment_index_probe__' } }),
  ];
  for (let attempt = 0; attempt < 60; attempt++) {
    try { for (const probe of probes) await probe(); console.log('Catalog query indexes are ready.'); return; }
    catch (error) {
      if (![9,'failed-precondition'].includes(error.code)) throw error;
      if (attempt === 59) throw Error('Indexes are still building. Retry the backend workflow after they are ready.');
      console.log('Waiting for Firestore query indexes to finish building…');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; });
