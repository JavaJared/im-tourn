// Index deployment may finish before Firestore finishes building the indexes.
// Exercise each new query before the frontend readiness marker advances.
process.env.GCLOUD_PROJECT = process.env.FIREBASE_PROJECT_ID;
const api = require('../functions/index.js');
const auth = { uid: 'deployment-index-probe-user', token: {} };
async function verify() {
  const friends = require('../functions/friends').internal;
  const probes = [
    () => api.getForYouFeed.run({ data: {} }),
    () => api.getForYouFeed.run({ auth, data: {} }),
    ...['legacy','custom','ranking'].flatMap(type => ['created','filled'].map(mode => () => friends.activityQuery(type,mode,auth.uid).query.get())),
    () => api.listFriends.run({auth, data:{}}),
    ...Object.keys(require('../functions/activities').internal.sources).map(type => () => api.listMyActivities.run({ auth, data: { type } })),
    ...['legacy','custom','ranking','draft'].map(type => () => api.browseCatalog.run({ data: { type } })),
    ...['hosted','joined'].map(mine => () => api.browseCatalog.run({ auth, data: { type: 'draft', mine } })),
    ...['bracket','prediction'].flatMap(poolType => ['hosted','joined'].map(type => () => api.listUserPools.run({ auth, data: { type, poolType } }))),
    // Firestore reserves IDs wrapped in double underscores; use a valid synthetic
    // ID so the probe tests the query instead of failing validation first.
    () => api.listSubmissionSummaries.run({ data: { bracketId: 'deployment-index-probe-0001' } }),
    () => api.getUserProfile.run({ auth, data: { profileId: auth.uid } }),
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
