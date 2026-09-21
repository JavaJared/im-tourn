const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore');
const { getAuth } = requireFunctions('firebase-admin/auth');
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
const { ensureAccount } = require('../functions/usernames').internal;
(async () => {
  const ref = getFirestore().doc('_system/usernameLaunch');
  const cutoff = await getFirestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data().cutoff.toMillis();
    const time = Timestamp.now(); tx.create(ref, { cutoff: time }); return time.toMillis();
  });
  if (process.argv.includes('--initialize-only') || (await ref.get()).data()?.backfilledAt) return;
  let pageToken, count = 0;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const user of page.users) { await ensureAccount(user, cutoff); count++; }
    pageToken = page.pageToken;
  } while (pageToken);
  await ref.update({ backfilledAt: Timestamp.now() });
  console.log(`Checked usernames for ${count} existing accounts.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
