const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const S = require('./generated/scoring.cjs');
const details = data => Object.fromEntries(['title','description','category'].map(key => [key, typeof data[key] === 'string' ? data[key] : '']));
const version = snap => `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}`;
function fields(input) {
  const result = {};
  for (const [key, max] of [['title',200],['description',5000],['category',100]]) {
    if (typeof input?.[key] !== 'string' || input[key].length > max || (key === 'title' && !input[key].trim())) throw new HttpsError('invalid-argument', 'Enter a title and check the field lengths.');
    result[key] = input[key].trim();
  }
  return result;
}
exports.managePublishedBracket = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const { type, bracketId, action, expectedVersion, requestId } = req.data || {};
  if (!['custom','legacy'].includes(type) || typeof bracketId !== 'string' || !/^[\w-]{1,200}$/.test(bracketId) || !['load','save','revise'].includes(action)) throw new HttpsError('invalid-argument','Invalid bracket request.');
  const db = getFirestore(), source = db.doc(`${type === 'custom' ? 'customBrackets' : 'brackets'}/${bracketId}`);
  const values = action === 'load' ? null : fields(req.data.details);
  if (action === 'revise' && (typeof requestId !== 'string' || !/^[\w-]{16,80}$/.test(requestId))) throw new HttpsError('invalid-argument','Invalid revision request.');
  return db.runTransaction(async tx => {
    const snap = await tx.get(source);
    if (!snap.exists) throw new HttpsError('not-found','Bracket not found.');
    const data = snap.data();
    if (data[type === 'custom' ? 'hostId' : 'userId'] !== req.auth.uid) throw new HttpsError('permission-denied','Only the creator can edit this bracket.');
    if (type === 'custom' && !['published','locked','complete'].includes(data.status)) throw new HttpsError('failed-precondition','Open the draft editor to edit this bracket.');
    if (action === 'load') return { resetDraftId: data.resetDraftId || null, details: details(data), version: version(snap) };
    if (data.resetting) throw new HttpsError('failed-precondition','Resume the reset already in progress.');
    // A retry returns the same draft, even if the original was edited meanwhile.
    const target = action === 'revise' ? db.doc(`customBrackets/revision_${req.auth.uid}_${requestId}`) : null;
    if (target) {
      const existing = await tx.get(target);
      if (existing.exists) {
        if (existing.data().hostId !== req.auth.uid || existing.data().revisionOf !== bracketId || existing.data().revisionType !== type || !!existing.data().replaceOriginal !== (req.data.replaceOriginal === true)) throw new HttpsError('already-exists','Start a new revision request.');
        return { bracketId: target.id };
      }
    }
    if (expectedVersion !== version(snap)) throw new HttpsError('aborted','This bracket changed. Close and reopen the editor before saving.');
    if (action === 'save') {
      tx.update(source, { ...values, updatedAt: FieldValue.serverTimestamp() });
      return { saved: true };
    }
    let state;
    try { state = S.pickSource(type, data); } catch { throw new HttpsError('failed-precondition','This bracket cannot be copied because its structure is damaged.'); }
    tx.create(target, { ...S.serialize(state), ...values, hostId:req.auth.uid, hostName:data.hostName || data.userDisplayName || null,
      status:'draft', type:'custom', replaceOriginal:req.data.replaceOriginal === true, scoring:{byTier:{}}, revisionOf:bracketId, revisionType:type,
      createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() });
    return { bracketId: target.id };
  });
});
