// functions/helpers.js
//
// Pure helpers for the weekly bracket automation. No Firebase imports —
// everything here is deterministic-in, deterministic-out (except the
// documented random tie-break), so it can be unit tested directly with
// `node helpers.test.js` and required unchanged by the cloud functions.
//
// Data model (matches src/services/bracketService.js):
//   matchups : array of rounds; each round is an array of matches
//              { entry1, entry2, winner? } where winner is 1 or 2 and each
//              entry is { name, seed, ... } or null (not yet advanced).
//   votes    : { "r{round}-m{match}": { entry1: <count>, entry2: <count> } }

/**
 * Decide a match from its vote tally. Majority wins; a missing tally or a
 * tie is decided by fair coin flip (per the locked spec: force-finished
 * matchups break ties at random).
 * @returns {1|2}
 */
function chooseWinnerFromVotes(matchVotes) {
  const v1 = matchVotes?.entry1 ?? 0;
  const v2 = matchVotes?.entry2 ?? 0;
  if (v1 > v2) return 1;
  if (v2 > v1) return 2;
  return Math.random() < 0.5 ? 1 : 2;
}

/**
 * Close round `roundIndex`: assign a winner to every match in the round
 * that doesn't already have one (using vote tallies), and propagate each
 * winner's entry into its slot in the next round (when one exists).
 * Mutates `matchups` in place and returns it.
 */
function resolveRound(matchups, votes, roundIndex) {
  const round = matchups[roundIndex];
  if (!round) return matchups;
  round.forEach((match, matchIndex) => {
    if (!match.winner) {
      match.winner = chooseWinnerFromVotes(votes?.[`r${roundIndex}-m${matchIndex}`]);
    }
    if (roundIndex < matchups.length - 1) {
      const nextRoundMatchIndex = Math.floor(matchIndex / 2);
      const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
      const winningEntry = match.winner === 1 ? match.entry1 : match.entry2;
      matchups[roundIndex + 1][nextRoundMatchIndex][entrySlot] = winningEntry;
    }
  });
  return matchups;
}

/**
 * Force-finish the bracket from `fromRound` through the final, deciding
 * every remaining match from current tallies (ties random). Used by the
 * Sunday rollover on brackets that didn't complete during the week.
 * Mutates and returns `matchups`.
 */
function forceFinish(matchups, votes, fromRound = 0) {
  for (let r = Math.max(0, fromRound); r < matchups.length; r += 1) {
    resolveRound(matchups, votes, r);
  }
  return matchups;
}

/** The champion entry ({ name, seed, ... }) of a finished bracket, else null. */
function championOf(matchups) {
  const finalMatch = matchups?.[matchups.length - 1]?.[0];
  if (!finalMatch?.winner) return null;
  return finalMatch.winner === 1 ? finalMatch.entry1 : finalMatch.entry2;
}

/**
 * Prepare a catalog bracket's matchups for a fresh week: deep copy, strip
 * every winner, keep round 0's entries, and blank the entries of every
 * later round (they refill as rounds resolve).
 */
function freshenMatchups(matchups) {
  const fresh = JSON.parse(JSON.stringify(matchups));
  fresh.forEach((round, r) => {
    round.forEach((match) => {
      delete match.winner;
      if (r > 0) { match.entry1 = null; match.entry2 = null; }
    });
  });
  return fresh;
}

/** Zeroed vote tallies for every match in `matchups`. */
function initVotes(matchups) {
  const votes = {};
  matchups.forEach((round, roundIndex) => {
    round.forEach((_match, matchIndex) => {
      votes[`r${roundIndex}-m${matchIndex}`] = { entry1: 0, entry2: 0 };
    });
  });
  return votes;
}

/**
 * The Monday that starts the bracket week containing-or-after `now`,
 * evaluated in America/New_York and DST-safe (no hardcoded offsets):
 * run on Sunday (the rollover schedule) this returns the *next* day;
 * run on Monday it returns that same day. Returned as UTC midnight of the
 * ET calendar date — display-precision, which is all startDate needs.
 */
function computeWeekStartMondayET(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[get('weekday')];
  const daysForward = (8 - dayOfWeek) % 7;   // Sun -> 1, Mon -> 0, Tue -> 6, ...
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10) - 1;
  const day = parseInt(get('day'), 10);
  return new Date(Date.UTC(year, month, day + daysForward, 0, 0, 0, 0));
}

/** Today's date in ET as "YYYY-MM-DD" — used for idempotency stamps. */
function todayKeyET(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

module.exports = {
  chooseWinnerFromVotes,
  resolveRound,
  forceFinish,
  championOf,
  freshenMatchups,
  initVotes,
  computeWeekStartMondayET,
  todayKeyET,
};
