const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { randomUUID } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
initializeApp();
setGlobalOptions({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 120, maxInstances: 3 });
const db = getFirestore();
const H = require('./helpers');
const S = require('./generated/scoring.cjs');
const api = require('./api');
const { parse, tallyRound } = api.internal;
for (const [key, value] of Object.entries(api)) if (key !== 'internal') exports[key] = value;
for (const [key, value] of Object.entries(require('./pool-privacy'))) if (key !== 'internal') exports[key] = value;
const current = db.doc('weeklyBracket/current');
const stamp = () => FieldValue.serverTimestamp();
const unpack = snap => ({ ...snap.data(), matchups: parse(snap.data().matchups, []), votes: parse(snap.data().votes, {}) });
function archive(tx, data) {
  const champion = H.championOf(data.matchups);
  if (champion) tx.set(db.doc(`weeklyArchive/${S.weekKey(data)}`), { title: data.title || '', category: data.category || '', champion, startDate: data.startDate, archivedAt: stamp() });
}
function validMatchups(m) { return Array.isArray(m) && [5, 6].includes(m.length) && m.every((r, i) => Array.isArray(r) && r.length === 2 ** (m.length - 1 - i)) && m[0].every(x => x.entry1?.name && x.entry2?.name); }
function install(data, today) {
  const matchups = H.freshenMatchups(data.matchups);
  return { title: String(data.title || 'Weekly bracket').slice(0, 200), category: data.category || '', matchups: JSON.stringify(matchups), votes: JSON.stringify(H.initVotes(matchups)), startDate: Timestamp.fromDate(H.computeWeekStartMondayET()), weekId: randomUUID(), currentRound: 0, sourceBracketId: data.id || data.sourceBracketId || null, lastRolloverDayET: today, updatedAt: stamp() };
}
async function currentTallies(tx, data) {
  const ballots = await tx.get(db.collection('weeklyVotes').where('roundIndex', '==', data.currentRound || 0));
  return tallyRound(data, ballots.docs.filter(d => d.id === `${data.weekId ? `${data.weekId}_${d.data().userId}` : d.data().userId}_round${data.currentRound || 0}`).map(d => d.data()));
}
exports.advanceWeeklyBracketDaily = onSchedule({ schedule: '0 0 * * 2-6', timeZone: 'America/New_York' }, async () => {
  await db.runTransaction(async tx => {
    const snap = await tx.get(current); if (!snap.exists) return;
    const data = unpack(snap), today = H.todayKeyET();
    if (!validMatchups(data.matchups) || data.lastAdvancedDayET === today || H.championOf(data.matchups)) return;
    const start = data.startDate?.toDate?.(); if (!start) return;
    const close = new Date(start); close.setUTCDate(close.getUTCDate() + (data.currentRound || 0) + 1);
    if (today < close.toISOString().slice(0, 10)) return;
    const votes = await currentTallies(tx, data);
    H.resolveRound(data.matchups, votes, data.currentRound || 0);
    tx.update(current, { matchups: JSON.stringify(data.matchups), votes: JSON.stringify(votes), currentRound: Math.min((data.currentRound || 0) + 1, data.matchups.length - 1), lastAdvancedDayET: today, updatedAt: stamp() });
  });
});
exports.rolloverWeeklyBracket = onSchedule({ schedule: '0 0 * * 0', timeZone: 'America/New_York' }, async () => {
  const [legacy, modern] = await Promise.all([db.collection('brackets').where('size', 'in', [32, 64]).get(), db.collection('customBrackets').where('status', '==', 'published').get()]);
  const candidates = [...legacy.docs.map(d => ({ id: d.id, ...d.data(), matchups: parse(d.data().matchups) })), ...modern.docs.map(d => ({ id: d.id, ...d.data(), matchups: S.standardWeeklyMatchups(d.data()) }))].filter(d => validMatchups(d.matchups));
  if (!candidates.length) { console.warn('No valid weekly candidates; retaining current bracket and votes.'); return; }
  await db.runTransaction(async tx => {
    const snap = await tx.get(current), today = H.todayKeyET();
    const data = snap.exists ? unpack(snap) : null;
    if (data?.lastRolloverDayET === today) return;
    const eligible = candidates.filter(c => c.id !== data?.sourceBracketId);
    const list = eligible.length ? eligible : candidates;
    const picked = list[Math.floor(Math.random() * list.length)];
    if (data && validMatchups(data.matchups)) {
      const votes = await currentTallies(tx, data);
      H.forceFinish(data.matchups, votes, data.currentRound || 0); // also closes a 64-entry Saturday final
      archive(tx, data);
    }
    tx.set(current, { ...install(picked, today), autoSelected: true, autoSelectedAt: stamp() });
    // Ballots are week-scoped. Never delete old votes during a rollover.
  });
});
// Compatibility for already-open clients during the functions -> UI -> rules rollout.
// Recompute from canonical ballots: retries, out-of-order deliveries and old-week
// deletions cannot add or subtract a vote in a different week.
exports.tallyWeeklyVote = onDocumentWritten('weeklyVotes/{voteId}', async event => {
  if (event.data.after.data()?.countedVersion === 2 || event.data.before.data()?.countedVersion === 2) return;
  await db.runTransaction(async tx => {
    const snap = await tx.get(current); if (!snap.exists) return;
    const data = unpack(snap);
    if (!validMatchups(data.matchups) || H.championOf(data.matchups)) return;
    const votes = await currentTallies(tx, data);
    tx.update(current, { votes: JSON.stringify(votes), updatedAt: stamp() });
  });
});
exports.manageWeeklyBracket = onCall(async req => {
  if (!req.auth || !(req.auth.token.admin === true || req.auth.uid === 'VBbDwj6gkVgW7gBcs3vTmt0ulLF2')) throw new HttpsError('permission-denied', 'Administrator access required.');
  const { action, bracket, roundIndex, matchIndex, winner } = req.data || {};
  if (!['set', 'clear', 'advance', 'pick'].includes(action)) throw new HttpsError('invalid-argument', 'Unknown action.');
  if (action === 'set' && !validMatchups(bracket?.matchups)) throw new HttpsError('invalid-argument', 'Choose a valid 32- or 64-entry bracket.');
  await db.runTransaction(async tx => {
    const snap = await tx.get(current), data = snap.exists ? unpack(snap) : null;
    if (action === 'set' || action === 'clear') {
      if (data && validMatchups(data.matchups)) archive(tx, data);
      if (action === 'clear') tx.delete(current); else tx.set(current, install(bracket, H.todayKeyET()));
      return;
    }
    if (!data || !validMatchups(data.matchups)) throw new HttpsError('failed-precondition', 'No current bracket.');
    const votes = await currentTallies(tx, data), round = data.currentRound || 0;
    if (action === 'pick') {
      if (roundIndex !== round || !data.matchups[round]?.[matchIndex] || ![1, 2].includes(winner)) throw new HttpsError('invalid-argument', 'Only the current round can be decided.');
      data.matchups[round][matchIndex].winner = winner;
    } else H.resolveRound(data.matchups, votes, round);
    tx.update(current, { matchups: JSON.stringify(data.matchups), votes: JSON.stringify(votes), currentRound: action === 'advance' ? Math.min(round + 1, data.matchups.length - 1) : round, lastAdvancedDayET: H.todayKeyET(), updatedAt: stamp() });
  });
  return { success: true };
});

// The workflow writes this marker only after every function deploy succeeds.
const { onRequest } = require('firebase-functions/v2/https');
exports.repairReadiness = onRequest(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const release = await db.doc('_system/backendRelease').get();
  const ready = release.data()?.version === 2;
  res.status(ready ? 200 : 503).json({ version: ready ? 2 : null });
});
