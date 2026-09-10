const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { randomInt, createHash } = require('node:crypto');
const db = getFirestore();
const fail = (code, message) => { throw new HttpsError(code, message); };
const codeRef = code => db.doc(`draftInviteCodes/${createHash('sha256').update(code).digest('hex')}`);
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('invalid-argument', 'Check the text fields.');
  return value.trim();
};
function snake(participants, rounds) {
  return Array.from({ length: rounds }, (_, r) => (r % 2 ? [...participants].reverse() : participants).map((p, i) => ({ round: r + 1, pickInRound: i + 1, userId: p.userId, userDisplayName: p.displayName }))).flat();
}
async function ready() {
  if (!(await db.doc('_system/features').get()).data()?.draftsReady) fail('failed-precondition', 'Drafts are awaiting verified deployment.');
}
function checked(data) {
  if (data?.schemaVersion !== 2 || !Array.isArray(data.participants) || !Array.isArray(data.draftOrder) || !Array.isArray(data.picks)) fail('failed-precondition', 'This older draft is read-only. Create a new draft.');
  return data;
}
exports.draftAction = onCall(async req => {
  if (!req.auth) fail('unauthenticated', 'Please sign in.');
  await ready();
  const uid = req.auth.uid, displayName = typeof req.auth.token?.name === 'string' ? req.auth.token.name.slice(0, 100) : 'Anonymous';
  const { action, draftId, ...input } = req.data || {};
  if (action === 'create') {
    const title = text(input.title, 160, true), description = text(input.description || '', 5000), category = text(input.category || '', 100);
    if (!Number.isInteger(input.rounds) || input.rounds < 1 || input.rounds > 20 || ![0,30,60,90,120].includes(input.timerSeconds)) fail('invalid-argument', 'Choose 1–20 rounds and a supported timer.');
    const ref = db.collection('drafts').doc();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const batch = db.batch();
    batch.create(codeRef(code), { draftId: ref.id });
    batch.create(db.doc(`draftInvites/${ref.id}`), { code, hostId: uid });
    batch.create(ref, { schemaVersion: 2, title, description, category, hostId: uid, hostDisplayName: displayName, rounds: input.rounds, timerSeconds: input.timerSeconds, status: 'open', participants: [{ userId: uid, displayName, order: 0 }], participantIds: [uid], participantCount: 1, draftOrder: [], picks: [], scores: null, currentPickIndex: 0, currentPickDeadline: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await batch.commit(); return { id: ref.id, joinCode: code };
  }
  if (typeof draftId !== 'string' || !/^[\w-]{1,200}$/.test(draftId)) fail('invalid-argument', 'Invalid draft.');
  const ref = db.doc(`drafts/${draftId}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) fail('not-found', 'Draft not found.');
    const d = checked(snap.data()), host = d.hostId === uid;
    const member = d.participants.some(p => p.userId === uid);
    const requireHost = () => { if (!host) fail('permission-denied', 'Only the host can do this.'); };
    const requireOpen = () => { if (d.status !== 'open') fail('failed-precondition', 'The draft has already started.'); };
    let update = {};
    if (action === 'invite') {
      requireHost(); const invite = await tx.get(db.doc(`draftInvites/${draftId}`));
      return { joinCode: invite.data()?.code || null };
    } else if (action === 'join') {
      if (member) return { joined: true };
      requireOpen();
      if (d.participants.length >= 16) fail('resource-exhausted', 'This draft is full.');
      const code = typeof input.joinCode === 'string' ? input.joinCode.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{8}$/.test(code)) fail('permission-denied', 'Enter the invitation code to join.');
      const invite = await tx.get(codeRef(code));
      if (invite.data()?.draftId !== draftId) fail('permission-denied', 'Incorrect invitation code.');
      update.participants = [...d.participants, { userId: uid, displayName, order: d.participants.length }];
    } else if (action === 'leave' || action === 'kick') {
      requireOpen(); if (action === 'kick') requireHost();
      const target = action === 'leave' ? uid : input.targetUserId;
      if (target === d.hostId) fail('failed-precondition', 'The host cannot leave or be removed. Delete the draft instead.');
      update.participants = d.participants.filter(p => p.userId !== target);
    } else if (action === 'start') {
      requireHost(); requireOpen();
      if (d.participants.length < 2) fail('failed-precondition', 'At least two participants are required.');
      const participants = [...d.participants];
      for (let i = participants.length - 1; i > 0; i--) { const j = randomInt(i + 1); [participants[i], participants[j]] = [participants[j], participants[i]]; }
      update = { participants: participants.map((p, order) => ({ ...p, order })), draftOrder: snake(participants, d.rounds), status: 'drafting', currentPickDeadline: d.timerSeconds ? Timestamp.fromMillis(Date.now() + d.timerSeconds * 1000) : null };
    } else if (action === 'pick' || action === 'skip') {
      if (!member) fail('permission-denied', 'Only participants can advance a draft.');
      const index = input.expectedPickIndex;
      if (!Number.isInteger(index) || index < 0) fail('invalid-argument', 'Refresh the current turn.');
      const selection = action === 'pick' ? text(input.selection, 100, true) : null;
      if (index !== d.currentPickIndex) {
        const old = d.picks.find(p => p.pickIndex === index);
        if (index < d.currentPickIndex && old && ((action === 'skip' && old.skipped) || (action === 'pick' && old.userId === uid && old.selection === selection))) return { alreadyApplied: true };
        fail('failed-precondition', 'The turn changed. Review the current pick.');
      }
      if (d.status !== 'drafting') fail('failed-precondition', 'The draft is not in progress.');
      const turn = d.draftOrder[index], deadline = d.currentPickDeadline?.toMillis?.();
      if (!turn) fail('failed-precondition', 'No more picks.');
      if (action === 'skip') {
        if (!d.timerSeconds || !deadline || Date.now() < deadline) fail('failed-precondition', 'The timer has not expired.');
      } else {
        if (turn.userId !== uid) fail('permission-denied', 'It is not your turn.');
        if (deadline && Date.now() >= deadline) fail('failed-precondition', 'The pick timer expired.');
      }
      const nextIndex = index + 1, complete = nextIndex === d.draftOrder.length;
      update = { picks: [...d.picks, { ...turn, pickIndex: index, selection, skipped: action === 'skip', pickedAt: new Date().toISOString() }], currentPickIndex: nextIndex, status: complete ? 'completed' : 'drafting', currentPickDeadline: !complete && d.timerSeconds ? Timestamp.fromMillis(Date.now() + d.timerSeconds * 1000) : null };
    } else if (action === 'scores') {
      requireHost(); if (d.status !== 'completed') fail('failed-precondition', 'Finish drafting before scoring.');
      if (!input.scores || typeof input.scores !== 'object' || Array.isArray(input.scores)) fail('invalid-argument', 'Invalid scores.');
      for (const [key, value] of Object.entries(input.scores)) if (!/^(0|[1-9]\d*)$/.test(key) || !d.picks.some(p => p.pickIndex === Number(key)) || !Number.isFinite(value) || Math.abs(value) > 1000000) fail('invalid-argument', 'Scores must be finite numbers for existing picks.');
      update.scores = input.scores;
    } else if (action === 'description') { requireHost(); update.description = text(input.description, 5000); }
    else if (action === 'delete') {
      requireHost(); const invite = await tx.get(db.doc(`draftInvites/${draftId}`));
      if (invite.data()?.code) tx.delete(codeRef(invite.data().code));
      tx.delete(db.doc(`draftInvites/${draftId}`)); tx.delete(ref); return { deleted: true };
    } else fail('invalid-argument', 'Unknown draft action.');
    if (update.participants) { update.participantIds = update.participants.map(p => p.userId); update.participantCount = update.participants.length; }
    tx.update(ref, { ...update, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
});
exports.resolveDraftInvite = onCall(async req => {
  await ready();
  const code = typeof req.data?.joinCode === 'string' ? req.data.joinCode.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{8}$/.test(code)) fail('invalid-argument', 'Enter an eight-character invitation code.');
  const invite = await codeRef(code).get(); return { id: invite.data()?.draftId || null };
});
exports.internal = { snake };
exports.featureReadiness = onCall(async () => ({ draftsReady: (await db.doc('_system/features').get()).data()?.draftsReady === true }));
