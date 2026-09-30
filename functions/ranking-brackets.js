const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
const { generateSeededBracket, serialize } = require('./generated/scoring.cjs');
const { createHandler } = require('./ranking-bracket-core');
exports.createBracketFromRanking = onCall(createHandler({
  db: getFirestore(), stamp: () => FieldValue.serverTimestamp(), HttpsError,
  hash: value => createHash('sha256').update(value).digest('hex'),
  generateSeededBracket, serialize,
}));
