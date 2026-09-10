// Called only after the gated workflow tests and verifies the deployed rules.
const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
getFirestore().doc('_system/features').set({ draftsReady: true, commit: process.env.GITHUB_SHA || null, verifiedAt: new Date() }, { merge: true }).catch(error => { console.error(error); process.exitCode = 1; });
