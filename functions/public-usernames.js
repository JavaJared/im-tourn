const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const validId = value => typeof value === 'string' && /^[\w-]{1,200}$/.test(value);
async function resolveUsernames(ids) {
  const unique = [...new Set(ids.filter(validId))];
  if (!unique.length) return {};
  const accounts = await getFirestore().getAll(...unique.map(id => getFirestore().doc(`accountProfiles/${id}`)));
  return Object.fromEntries(accounts.map(account => {
    const username = account.data()?.username;
    return [account.id, typeof username === 'string' && /^[a-z][a-z0-9_]{2,23}$/.test(username) ? username : null];
  }));
}
// Public author labels are already visible in catalogs. Return only current
// usernames for explicitly supplied IDs, never private account fields or a directory.
exports.getPublicUsernames = onCall(async req => {
  const ids = req.data?.userIds;
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every(validId)) throw new HttpsError('invalid-argument', 'Provide up to 50 valid user IDs.');
  return { usernames: await resolveUsernames(ids) };
});
exports.internal = { resolveUsernames };

// Feed avatars use the same signed-in visibility as profile headers. Keep the
// response bounded to the requested authors and never include private fields.
async function resolveFeedAuthors(ids, signedIn) {
  const unique = [...new Set(ids.filter(validId))].slice(0, 50);
  if (!unique.length) return { usernames: {}, photos: {} };
  const accounts = await getFirestore().getAll(...unique.map(id => getFirestore().doc(`accountProfiles/${id}`)), { fieldMask: signedIn ? ['username', 'photoURL'] : ['username'] });
  const usernames = {}, photos = {};
  for (const account of accounts) {
    const data = account.data() || {};
    usernames[account.id] = typeof data.username === 'string' && /^[a-z][a-z0-9_]{2,23}$/.test(data.username) ? data.username : null;
    if (signedIn && typeof data.photoURL === 'string' && data.photoURL.startsWith('https://firebasestorage.googleapis.com/')) photos[account.id] = data.photoURL;
  }
  return { usernames, photos };
}
exports.internal.resolveFeedAuthors = resolveFeedAuthors;
