const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const S = require('./generated/scoring.cjs');
const { initVotes } = require('./helpers');
const db = getFirestore();
const stamp = () => FieldValue.serverTimestamp();
const parse = (v, fallback = null) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; } };
function requireAuth(req) { if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.'); return req.auth.uid; }
function id(value) { if (typeof value !== 'string' || !value || value.length > 200 || value.includes('/')) throw new HttpsError('invalid-argument', 'Invalid document ID.'); return value; }
function requireHost(data, uid) { if (data.hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can do this.'); }
function isBallot(ballot, ids) { return Array.isArray(ballot) && ballot.length === ids.length && new Set(ballot).size === ids.length && ballot.every(x => ids.includes(x)); }
function belongsToWeek(ballot, data) {
  if (ballot.weekId) return ballot.weekId === S.weekKey(data);
  return !data.weekId && (ballot.submittedAt?.toMillis?.() || 0) >= (data.startDate?.toMillis?.() || Infinity);
}
function tallyRound(data, ballotDocs, replacement = null) {
  const round = data.currentRound || 0;
  const tallies = parse(data.votes, {});
  data.matchups[round].forEach((_, m) => { tallies[`r${round}-m${m}`] = { entry1: 0, entry2: 0 }; });
  const seen = new Set();
  for (const b of [...(replacement ? [replacement] : []), ...ballotDocs]) {
    if (!belongsToWeek(b, data) || seen.has(b.userId) || b.roundIndex !== round) continue;
    seen.add(b.userId);
    const votes = parse(b.votes, {});
    data.matchups[round].forEach((_, m) => {
      const key = `r${round}-m${m}`, side = votes[key];
      if (side === 1 || side === 2) tallies[key][`entry${side}`] += 1;
    });
  }
  return tallies;
}
exports.castWeeklyVotes = onCall(async req => {
  const uid = requireAuth(req), { weekId, roundIndex, votes } = req.data || {};
  const current = db.doc('weeklyBracket/current');
  return db.runTransaction(async tx => {
    const snap = await tx.get(current);
    if (!snap.exists) throw new HttpsError('not-found', 'No weekly bracket.');
    const data = { ...snap.data(), matchups: parse(snap.data().matchups, []) };
    if (weekId !== S.weekKey(data) || roundIndex !== (data.currentRound || 0) || !S.weeklyVotingOpen(data)) throw new HttpsError('failed-precondition', 'This round has closed. Refresh to see the current round.');
    const keys = data.matchups[roundIndex].map((_, m) => `r${roundIndex}-m${m}`);
    if (!votes || typeof votes !== 'object' || Object.keys(votes).length !== keys.length || !keys.every(k => votes[k] === 1 || votes[k] === 2)) throw new HttpsError('invalid-argument', 'Pick one side in every matchup.');
    const voteRef = db.doc(`weeklyVotes/${data.weekId ? `${data.weekId}_${uid}` : uid}_round${roundIndex}`);
    const ballots = await tx.get(db.collection('weeklyVotes').where('roundIndex', '==', roundIndex));
    const canonical = ballots.docs.filter(d => d.id === `${data.weekId ? `${data.weekId}_${d.data().userId}` : d.data().userId}_round${roundIndex}`).map(d => d.data());
    const old = canonical.find(b => b.userId === uid && belongsToWeek(b, data));
    if (old) return { alreadySubmitted: true }; // retries never count a ballot twice
    const ballot = { userId: uid, weekId, roundIndex, votes: JSON.stringify(votes), submittedAt: stamp(), countedVersion: 2 };
    tx.set(voteRef, ballot);
    tx.update(current, { votes: JSON.stringify(tallyRound(data, canonical, ballot)), updatedAt: stamp() });
    return { alreadySubmitted: false };
  });
});
exports.setSubmissionUpvote = onCall(async req => {
  const uid = requireAuth(req), { submissionId, liked } = req.data || {};
  if (typeof liked !== 'boolean') throw new HttpsError('invalid-argument', 'liked must be boolean.');
  const ref = db.doc(`submissions/${id(submissionId)}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Submission not found.');
    const voters = new Set(Array.isArray(snap.data().upvotedBy) ? snap.data().upvotedBy.filter(uid => typeof uid === 'string') : []);
    if (liked) voters.add(uid); else voters.delete(uid);
    tx.update(ref, { upvotedBy: [...voters], upvotes: voters.size });
    return { upvotes: voters.size, liked };
  });
});
exports.castRankingVote = onCall(async req => {
  const uid = requireAuth(req), { rankingId, ranking, comparisonsMade } = req.data || {};
  const ref = db.doc(`rankings/${id(rankingId)}`);
  return db.runTransaction(async tx => {
    const [snap, entrySnap, voteSnap] = await Promise.all([
      tx.get(ref), tx.get(db.collection('rankingEntries').where('rankingId', '==', rankingId)), tx.get(db.collection('rankingVotes').where('rankingId', '==', rankingId)),
    ]);
    if (!snap.exists || snap.data().status !== 'open') throw new HttpsError('failed-precondition', 'This ranking is not open.');
    const ids = entrySnap.docs.map(d => d.id);
    if (ids.length !== snap.data().entryCount || !isBallot(ranking, ids)) throw new HttpsError('invalid-argument', 'Rank each entry exactly once.');
    // Ignore invalid historical votes and duplicate noncanonical documents.
    const ballots = voteSnap.docs.filter(d => d.id === `${rankingId}_${d.data().userId}` && d.data().userId !== uid).map(d => parse(d.data().ranking)).filter(b => isBallot(b, ids));
    ballots.push(ranking);
    const consensus = S.computeConsensus(ballots);
    tx.set(db.doc(`rankingVotes/${rankingId}_${uid}`), { rankingId, userId: uid, userDisplayName: String(req.auth.token.name || 'Anonymous').slice(0, 100), ranking: JSON.stringify(ranking), comparisonsMade: Number.isSafeInteger(comparisonsMade) && comparisonsMade >= 0 ? comparisonsMade : 0, submittedAt: stamp() });
    tx.update(ref, { voteCount: ballots.length, consensusRanking: JSON.stringify(consensus), updatedAt: stamp() });
    return { voteCount: ballots.length };
  });
});
exports.managePoolResults = onCall(async req => {
  const uid = requireAuth(req), { poolId, action, boxId, winnerId } = req.data || {};
  if (!['pick', 'recalculate', 'complete'].includes(action)) throw new HttpsError('invalid-argument', 'Unknown action.');
  const ref = db.doc(`bracketPools/${id(poolId)}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Pool not found.');
    requireHost(snap.data(), uid);
    const raw = snap.data();
    if (raw.status !== 'in_progress' && !(action === 'recalculate' && raw.status === 'completed')) throw new HttpsError('failed-precondition', 'Start the pool before recording results.');
    const pool = S.adaptLegacyPool({ ...raw, bracketMatchups: parse(raw.bracketMatchups), results: parse(raw.results) });
    let state = S.hydrateState(pool.bracketMatchups, pool.customResults || {});
    if (action === 'pick') { try { state = S.setResult(state, id(boxId), winnerId); } catch (e) { throw new HttpsError('invalid-argument', e.message); } }
    if (action === 'complete' && (!S.isEntryComplete(state) || !S.getChampion(state))) throw new HttpsError('failed-precondition', 'Record every result, including the final, before completing the pool.');
    const entries = await tx.get(db.collection('poolEntries').where('poolId', '==', poolId));
    const normalized = entries.docs.filter(d => d.id === `${poolId}_${d.data().userId}`).flatMap(d => { try { const predictions = parse(d.data().predictions); if (!predictions || typeof predictions !== 'object') return []; const entry = S.adaptLegacyEntry({ id: d.id, ...d.data(), predictions }); if (Object.values(entry.predictions).some(value => value !== null && typeof value !== 'string')) return []; return [entry]; } catch { return []; } }).filter(e => e.predictions);
    const board = S.buildLeaderboard(state, normalized.map(e => ({ ...e, picks: e.predictions, displayName: e.userDisplayName })), pool.roundPoints || [], pool);
    for (const e of board) tx.update(db.doc(`poolEntries/${e.id}`), { score: e.total, sleeper1Hit: e.sleeper1Hit, sleeper2Hit: e.sleeper2Hit });
    const updates = { customResults: S.picksFromState(state), updatedAt: stamp() };
    if (action === 'complete' || raw.status === 'completed') {
      const winners = board.filter(e => e.total === board[0]?.total);
      Object.assign(updates, { status: 'completed', winnerId: winners[0]?.userId || null, winnerIds: winners.map(e => e.userId), winnerName: winners.map(e => e.displayName || 'Anonymous').join(' & ') || null, winnerScore: winners[0]?.total || 0 });
    }
    tx.update(ref, updates);
    return { completed: updates.status === 'completed', winner: board[0] || null };
  });
});
module.exports.internal = { parse, belongsToWeek, tallyRound, isBallot };
// Prediction-pool scores are computed from all canonical entries, never from a
// paginated browser leaderboard. Results and scores commit together.
exports.managePredictionResults = onCall(async req => {
  const uid = requireAuth(req), { poolId, action, results } = req.data || {};
  if (!['results','complete'].includes(action)) throw new HttpsError('invalid-argument', 'Unknown action.');
  const ref = db.doc(`predictionPools/${id(poolId)}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Pool not found.');
    const pool = snap.data(); requireHost(pool, uid);
    if (pool.status !== 'in_progress') throw new HttpsError('failed-precondition', 'Start the pool before recording results.');
    const categories = parse(pool.categories, []), official = action === 'results' ? results : parse(pool.results, {});
    if (!Array.isArray(categories) || !categories.length || !official || typeof official !== 'object' || Array.isArray(official)) throw new HttpsError('invalid-argument', 'Invalid categories or results.');
    for (const [key, value] of Object.entries(official)) {
      const index = Number(key), category = categories[index];
      if (!/^(0|[1-9]\d*)$/.test(key) || !category || !Array.isArray(category.options) || (value !== null && (!Number.isInteger(value) || value < 0 || value >= category.options.length))) throw new HttpsError('invalid-argument', 'Choose a valid result for each category.');
    }
    if (action === 'complete' && !categories.every((_, index) => Number.isInteger(official[index]))) throw new HttpsError('failed-precondition', 'Record every category result before completing the pool.');
    const entries = await tx.get(db.collection('predictionEntries').where('poolId','==',poolId));
    const board = [];
    for (const doc of entries.docs) {
      const entry = doc.data(), predictions = parse(entry.predictions);
      if (doc.id !== `${poolId}_${entry.userId}` || !entry.submittedAt || !predictions || typeof predictions !== 'object' || Array.isArray(predictions)) continue;
      let score = 0;
      categories.forEach((category, index) => {
        if (Number.isInteger(official[index]) && predictions[index] === official[index]) score += Number.isFinite(category.points) && category.points >= 0 ? category.points : 1;
      });
      tx.update(doc.ref, { score }); board.push({ userId: entry.userId, userDisplayName: typeof entry.userDisplayName === 'string' ? entry.userDisplayName : 'Anonymous', score });
    }
    board.sort((a,b) => b.score - a.score || a.userId.localeCompare(b.userId));
    const update = { results: JSON.stringify(official), updatedAt: stamp() };
    if (action === 'complete') {
      const winners = board.filter(entry => entry.score === board[0]?.score);
      Object.assign(update, { status: 'completed', winnerId: winners[0]?.userId || null, winnerIds: winners.map(entry => entry.userId), winnerName: winners.map(entry => entry.userDisplayName).join(' & ') || null, winnerScore: winners[0]?.score || 0 });
    }
    tx.update(ref, update); return { winner: board[0] || null };
  });
});
