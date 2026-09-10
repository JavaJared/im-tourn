const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
getFirestore().doc('_system/backendRelease').set({ version: 3, commit: process.env.GITHUB_SHA || null, readyAt: new Date() }).then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
