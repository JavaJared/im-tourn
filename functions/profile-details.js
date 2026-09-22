const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { randomUUID } = require('node:crypto');

function validateDetails(data = {}) {
  if (!data || typeof data !== 'object') throw new HttpsError('invalid-argument', 'Provide your profile details.');
  if (typeof data.bio !== 'string' || data.bio.length > 300) throw new HttpsError('invalid-argument', 'Bio must be 300 characters or fewer.');
  const photo = data.photo;
  if (photo !== undefined && photo !== null && (typeof photo !== 'string' || photo.length > 350000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo))) {
    throw new HttpsError('invalid-argument', 'Choose a smaller JPEG photo.');
  }
  const bytes = typeof photo === 'string' ? Buffer.from(photo, 'base64') : null;
  if (bytes && (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9)) {
    throw new HttpsError('invalid-argument', 'The profile photo is not a JPEG image.');
  }
  return { bio: data.bio.trim(), bytes, changePhoto: photo !== undefined };
}

exports.updateProfileDetails = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to edit your profile.');
  const { bio, bytes, changePhoto } = validateDetails(req.data);
  const uid = req.auth.uid;
  const db = getFirestore(), account = db.doc(`accountProfiles/${uid}`);
  // Rate limiting is server-side, and the account ID always comes from authentication.
  await db.runTransaction(async tx => {
    const previous = (await tx.get(account)).data();
    if (previous?.profileEditAt?.toMillis() > Date.now() - 5000) throw new HttpsError('resource-exhausted', 'Wait a few seconds, then retry.');
    tx.set(account, { profileEditAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  let uploaded, photoURL = null, photoPath = null;
  try {
    if (bytes) {
      const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'i-m-tourn.firebasestorage.app');
      photoPath = `profilePhotos/${uid}/${randomUUID()}.jpg`;
      uploaded = bucket.file(photoPath);
      const token = randomUUID();
      await uploaded.save(bytes, { resumable: false, metadata: { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000,immutable', metadata: { firebaseStorageDownloadTokens: token } } });
      photoURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(photoPath)}?alt=media&token=${token}`;
    }
    const oldPath = await db.runTransaction(async tx => {
      const old = (await tx.get(account)).data();
      tx.set(account, { bio, ...(changePhoto ? { photoURL, photoPath } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return old?.photoPath;
    });
    // Each replacement has its own URL, so failed saves never replace the current photo.
    if (changePhoto && typeof oldPath === 'string' && oldPath.startsWith(`profilePhotos/${uid}/`)) {
      await getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'i-m-tourn.firebasestorage.app').file(oldPath).delete({ ignoreNotFound: true }).catch(error => console.warn('Old profile photo cleanup failed', error.code));
    }
    return { bio, ...(changePhoto ? { photoURL } : {}) };
  } catch (error) {
    if (uploaded) await uploaded.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  }
});
exports.internal = { validateDetails };
