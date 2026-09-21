const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { createHash } = require('node:crypto');
const db = getFirestore();
function normalizeUsername(value) {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Choose a username.');
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) throw new HttpsError('invalid-argument', 'Use 3–24 letters, numbers, or underscores, starting with a letter.');
  return username;
}
const reserved = new Set(['admin','administrator','support','moderator','imtourn','im_tourn','system','official']);
const publicAccount = data => ({ username: data.username, usernameIsDefault: data.usernameIsDefault === true, needsUsername: false });
async function ensureAccount(user, cutoffMillis) {
  const ref = db.doc(`accountProfiles/${user.uid}`);
  const existing = await ref.get();
  if (existing.data()?.username) return publicAccount(existing.data());
  const created = Date.parse(user.metadata.creationTime);
  if (!Number.isFinite(created) || created >= cutoffMillis) return { username: null, needsUsername: true, usernameIsDefault: false };
  // Reserved namespace avoids competing with chosen usernames. Retry collisions
  // transactionally rather than assuming truncated hashes are always unique.
  for (let attempt = 0; attempt < 10; attempt++) {
    const username = 'user_' + createHash('sha256').update(`${user.uid}:${attempt}`).digest('hex').slice(0, 18);
    const result = await db.runTransaction(async tx => {
      const owner = db.doc(`usernames/${username}`);
      const [profile, claimed] = await Promise.all([tx.get(ref), tx.get(owner)]);
      if (profile.data()?.username) return publicAccount(profile.data());
      if (claimed.exists && claimed.data().uid !== user.uid) return null;
      tx.set(owner, { uid: user.uid });
      tx.set(ref, { username, usernameIsDefault: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { username, usernameIsDefault: true, needsUsername: false };
    });
    if (result) return result;
  }
  throw new HttpsError('aborted', 'Could not assign a username. Please retry.');
}
async function changeUsername(uid, input) {
  const username = normalizeUsername(input);
  return db.runTransaction(async tx => {
    const ref = db.doc(`accountProfiles/${uid}`), owner = db.doc(`usernames/${username}`);
    const [profile, claimed] = await Promise.all([tx.get(ref), tx.get(owner)]);
    const previous = profile.data() || {};
    if (previous.username === username && claimed.data()?.uid === uid) return publicAccount(previous);
    if (reserved.has(username) || username.startsWith('user_')) throw new HttpsError('invalid-argument', 'That username is reserved. Please choose another.');
    if (claimed.exists && claimed.data().uid !== uid) throw new HttpsError('already-exists', 'That username is taken. Please choose another.');
    const day = new Date().toISOString().slice(0, 10), count = previous.changeDay === day ? previous.changeCount || 0 : 0;
    if (count >= 5) throw new HttpsError('resource-exhausted', 'You can change your username up to five times per day. Try again tomorrow.');
    const oldRef = previous.username ? db.doc(`usernames/${previous.username}`) : null;
    const old = oldRef ? await tx.get(oldRef) : null;
    tx.set(owner, { uid });
    tx.set(ref, { username, usernameIsDefault: false, changeDay: day, changeCount: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (old?.data()?.uid === uid) tx.delete(oldRef);
    return { username, usernameIsDefault: false, needsUsername: false };
  });
}
const authenticated = req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to choose your username.');
  return req.auth.uid;
};
exports.getAccountUsername = onCall(async req => {
  const uid = authenticated(req);
  const existing = await db.doc(`accountProfiles/${uid}`).get();
  if (existing.data()?.username) return publicAccount(existing.data());
  const launch = await db.doc('_system/usernameLaunch').get();
  const cutoff = launch.data()?.cutoff?.toMillis();
  if (!Number.isFinite(cutoff)) throw new HttpsError('unavailable', 'Username setup is being prepared. Please retry shortly.');
  return ensureAccount(await getAuth().getUser(uid), cutoff);
});
exports.setAccountUsername = onCall(req => changeUsername(authenticated(req), req.data?.username));
exports.internal = { normalizeUsername, ensureAccount, changeUsername };
