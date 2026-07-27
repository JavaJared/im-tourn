// functions/index.js
//
// Scheduled Cloud Functions for the weekly bracket automation.
//
// Two scheduled jobs (both America/New_York, DST-safe by construction):
//
//   - advanceWeeklyBracketDaily: Tuesdays-Saturdays 00:00 ET
//       Closes the voting round that just ended and opens the next.
//       Monday's voting (round 0) closes at midnight Mon->Tue; Friday's
//       voting (the final) closes at midnight Fri->Sat, when this job
//       decides the final's winner without advancing further.
//
//   - rolloverWeeklyBracket: Sundays 00:00 ET
//       Force-finishes any not-yet-complete bracket from current vote
//       tallies (random tie-breaks), archives it to `weeklyArchive`,
//       wipes the per-user `weeklyVotes` docs, then selects a random
//       32-entry bracket from the catalog (avoiding an immediate repeat
//       of last week's pick) and installs it as `weeklyBracket/current`.
//
// Both jobs are idempotent: each stamps the current doc with the ET date
// of its last run and exits early if re-invoked the same day, and each
// checks bracket state before doing anything destructive.
//
// Deploy (from the functions/ directory):
//   npm install
//   firebase deploy --only functions
//
// Requires the Firebase Blaze plan. Expected cost at 6 runs/week: <$0.01/mo.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {
  resolveRound, forceFinish, championOf, freshenMatchups, initVotes,
  computeWeekStartMondayET, todayKeyET,
  voteDocVotes, computeVoteDelta, applyVoteDelta,
} = require('./helpers');

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 120, maxInstances: 1 });

const WEEKLY_BRACKET_COLLECTION = 'weeklyBracket';
const WEEKLY_VOTES_COLLECTION = 'weeklyVotes';
const WEEKLY_ARCHIVE_COLLECTION = 'weeklyArchive';
const BRACKETS_COLLECTION = 'brackets';

const parseField = (v) => (typeof v === 'string' ? JSON.parse(v) : (v || null));

/** Delete every doc in weeklyVotes, in batches under the 500-write limit. */
async function wipeVotes() {
  const snap = await db.collection(WEEKLY_VOTES_COLLECTION).get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = db.batch();
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

/** Archive the given current-bracket data (with whatever champion it has). */
async function archiveBracket(data, matchups) {
  const champ = championOf(matchups);
  await db.collection(WEEKLY_ARCHIVE_COLLECTION).add({
    title: data.title ?? null,
    category: data.category ?? null,
    champion: champ ? { name: champ.name ?? null, seed: champ.seed ?? null } : null,
    startDate: data.startDate ?? null,
    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return champ;
}

// ---------------------------------------------------------------------------
// Daily advance: Tue-Sat 00:00 ET
// ---------------------------------------------------------------------------
exports.advanceWeeklyBracketDaily = onSchedule(
  { schedule: '0 0 * * 2-6', timeZone: 'America/New_York' },
  async () => {
    const ref = db.collection(WEEKLY_BRACKET_COLLECTION).doc('current');
    const snap = await ref.get();
    if (!snap.exists) { logger.info('No current weekly bracket; nothing to advance.'); return; }

    const data = snap.data();
    const today = todayKeyET();
    if (data.lastAdvancedDayET === today) {
      logger.info(`Already advanced today (${today}); skipping.`);
      return;
    }

    const matchups = parseField(data.matchups);
    const votes = parseField(data.votes) || {};
    if (!Array.isArray(matchups) || matchups.length === 0) {
      logger.warn('Current weekly bracket has no matchups; skipping.');
      return;
    }
    const currentRound = data.currentRound || 0;
    const finalRound = matchups.length - 1;

    if (currentRound >= finalRound) {
      // Saturday's run: close the final without advancing past it.
      const finalMatch = matchups[finalRound][0];
      if (finalMatch?.winner) { logger.info('Final already decided; nothing to do.'); return; }
      resolveRound(matchups, votes, finalRound);
      await ref.update({
        matchups: JSON.stringify(matchups),
        lastAdvanced: admin.firestore.FieldValue.serverTimestamp(),
        lastAdvancedDayET: today,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const champ = championOf(matchups);
      logger.info(`Closed the final; champion: ${champ?.name ?? 'unknown'}.`);
      return;
    }

    resolveRound(matchups, votes, currentRound);
    await ref.update({
      matchups: JSON.stringify(matchups),
      currentRound: currentRound + 1,
      lastAdvanced: admin.firestore.FieldValue.serverTimestamp(),
      lastAdvancedDayET: today,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Advanced weekly bracket from round ${currentRound} to ${currentRound + 1}.`);
  }
);

// ---------------------------------------------------------------------------
// Weekly rollover: Sun 00:00 ET
// ---------------------------------------------------------------------------
exports.rolloverWeeklyBracket = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'America/New_York' },
  async () => {
    const ref = db.collection(WEEKLY_BRACKET_COLLECTION).doc('current');
    const snap = await ref.get();
    const today = todayKeyET();

    let previousSourceId = null;
    if (snap.exists) {
      const data = snap.data();
      if (data.lastRolloverDayET === today) {
        logger.info(`Already rolled over today (${today}); skipping.`);
        return;
      }
      previousSourceId = data.sourceBracketId ?? null;
      const matchups = parseField(data.matchups);
      if (Array.isArray(matchups) && matchups.length > 0) {
        const votes = parseField(data.votes) || {};
        forceFinish(matchups, votes, data.currentRound || 0);   // no-ops on already-decided matches
        const champ = await archiveBracket(data, matchups);
        logger.info(`Archived "${data.title ?? 'untitled'}" with champion ${champ?.name ?? 'none'}.`);
      } else {
        logger.warn('Current weekly bracket had no matchups; archived nothing.');
      }
    } else {
      logger.info('No current weekly bracket to archive.');
    }

    const wiped = await wipeVotes();
    logger.info(`Wiped ${wiped} vote doc(s).`);

    // Pick a random 32-entry bracket, avoiding last week's when possible.
    const catalogSnap = await db.collection(BRACKETS_COLLECTION).where('size', '==', 32).get();
    let candidates = catalogSnap.docs;
    if (candidates.length === 0) {
      logger.error('No 32-entry brackets in the catalog; leaving current bracket in place.');
      return;
    }
    if (candidates.length > 1 && previousSourceId) {
      const filtered = candidates.filter((d) => d.id !== previousSourceId);
      if (filtered.length > 0) candidates = filtered;
    }
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const pickedData = picked.data();
    const pickedMatchups = parseField(pickedData.matchups);
    if (!Array.isArray(pickedMatchups) || pickedMatchups.length === 0) {
      logger.error(`Picked bracket ${picked.id} has no usable matchups; aborting selection.`);
      return;
    }

    const fresh = freshenMatchups(pickedMatchups);
    await ref.set({
      title: pickedData.title ?? null,
      category: pickedData.category ?? null,
      matchups: JSON.stringify(fresh),
      votes: JSON.stringify(initVotes(fresh)),
      startDate: admin.firestore.Timestamp.fromDate(computeWeekStartMondayET()),
      currentRound: 0,
      sourceBracketId: picked.id,
      autoSelected: true,
      autoSelectedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRolloverDayET: today,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Selected new weekly bracket "${pickedData.title ?? picked.id}" from ${candidates.length} candidate(s).`);
  }
);

// ---------------------------------------------------------------------------
// Vote tallying trigger
//
// Firestore security rules (post-hardening) allow only admins to write
// weeklyBracket/current, so clients can no longer update the vote tallies
// themselves. Instead, each user writes only their own weeklyVotes doc
// (which rules DO allow, bound to their uid) and this trigger — running
// with admin privileges — folds every vote-doc change into the tally.
//
// Runs on create (count the votes), update (re-count the changed matches),
// and delete (subtract them, e.g. a user retracting). The read-modify-write
// happens inside a transaction, which also fixes the long-standing race
// where two simultaneous voters could overwrite each other's tally update.
// Counts clamp at zero so the rollover's mass-delete of last week's vote
// docs can never drive the fresh week's tallies negative.
// ---------------------------------------------------------------------------
exports.tallyWeeklyVote = onDocumentWritten('weeklyVotes/{voteId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const delta = computeVoteDelta(voteDocVotes(before), voteDocVotes(after));
  if (Object.keys(delta).length === 0) return;

  const ref = db.collection(WEEKLY_BRACKET_COLLECTION).doc('current');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;                       // no bracket (e.g. mid-rollover) — nothing to tally
    const data = snap.data();
    let tallies;
    try { tallies = typeof data.votes === 'string' ? JSON.parse(data.votes) : (data.votes || {}); }
    catch (e) { tallies = {}; }
    tx.update(ref, {
      votes: JSON.stringify(applyVoteDelta(tallies, delta)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  logger.info(`Tallied vote change for ${event.params.voteId} (${Object.keys(delta).length} matchup(s)).`);
});
