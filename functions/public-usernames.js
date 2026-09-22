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
