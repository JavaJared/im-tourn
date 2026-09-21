// One-time, idempotent migration used by the backend deployment workflow.
// Scores and winner metadata change atomically with each pool's settings.
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const S = require('./generated/scoring.cjs');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
async function retirePoolSleepers(ref) {
  const db = getFirestore();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), raw = snap.data();
    if (!raw?.enableSleepers) return false;
    const pool = S.adaptLegacyPool({ ...raw, bracketMatchups: parse(raw.bracketMatchups), results: parse(raw.results) });
    S.validateStructure(pool.bracketMatchups);
    if (!pool.bracketMatchups.rounds.flat().length) throw Error(`Cannot migrate empty bracket ${ref.path}`);
    const state = S.hydrateState(pool.bracketMatchups, pool.customResults || {});
    const entries = await tx.get(db.collection('poolEntries').where('poolId', '==', ref.id));
    const submitted = entries.docs.filter(doc => doc.id === `${ref.id}_${doc.data().userId}` && doc.data().predictions).map(doc => {
      const entry = S.adaptLegacyEntry({ ...doc.data(), id: doc.id, predictions: parse(doc.data().predictions) });
      if (!entry.predictions || typeof entry.predictions !== 'object' || Object.values(entry.predictions).some(value => value !== null && typeof value !== 'string')) throw Error(`Cannot migrate malformed predictions in ${doc.ref.path}`);
      return { ...entry, picks: entry.predictions, displayName: entry.userDisplayName };
    });
    const board = S.buildLeaderboard(state, submitted, pool.roundPoints || [], { ...pool, enableSleepers: false });
    for (const entry of board) tx.update(db.doc(`poolEntries/${entry.id}`), {
      retiredSleeperScore: Number.isFinite(entry.score) ? entry.score : null,
      score: entry.total, sleeper1Hit: false, sleeper2Hit: false,
    });
    const updates = { enableSleepers: false, sleeper1Points: 0, sleeper2Points: 0,
      sleeperRetirement: { previousPoints: [raw.sleeper1Points || 0, raw.sleeper2Points || 0], previousWinnerIds: raw.winnerIds || [], previousWinnerId: raw.winnerId || null, previousWinnerScore: raw.winnerScore ?? null, migratedAt: FieldValue.serverTimestamp() } };
    if (raw.status === 'completed') {
      const winners = board.filter(entry => entry.total === board[0]?.total);
      Object.assign(updates, { winnerId: winners[0]?.userId || null, winnerIds: winners.map(entry => entry.userId), winnerName: winners.map(entry => entry.displayName || 'Anonymous').join(' & ') || null, winnerScore: winners[0]?.total || 0 });
    }
    tx.update(ref, updates);
    return true;
  });
}
module.exports = { retirePoolSleepers };
