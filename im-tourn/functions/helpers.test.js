// Test suite for functions/helpers.js — run with `node helpers.test.js`.
// Requires the real module the cloud functions deploy with (no replication).

const {
  chooseWinnerFromVotes, resolveRound, forceFinish, championOf,
  freshenMatchups, initVotes, computeWeekStartMondayET, todayKeyET,
} = require('./helpers');

let passed = 0, failed = 0;
function assertTrue(cond, label) {
  if (cond) { passed += 1; console.log(`  ok  ${label}`); }
  else { failed += 1; console.log(`FAIL  ${label}`); }
}
const team = (seed, name) => ({ seed, name });

// A fresh 8-entry bracket (3 rounds: 4, 2, 1) with round 0 seeded.
function bracket8() {
  return [
    [
      { entry1: team(1, 'A'), entry2: team(8, 'H') },
      { entry1: team(4, 'D'), entry2: team(5, 'E') },
      { entry1: team(2, 'B'), entry2: team(7, 'G') },
      { entry1: team(3, 'C'), entry2: team(6, 'F') },
    ],
    [ { entry1: null, entry2: null }, { entry1: null, entry2: null } ],
    [ { entry1: null, entry2: null } ],
  ];
}

// ---- chooseWinnerFromVotes -------------------------------------------------
console.log('chooseWinnerFromVotes');
assertTrue(chooseWinnerFromVotes({ entry1: 5, entry2: 2 }) === 1, 'majority entry1 wins');
assertTrue(chooseWinnerFromVotes({ entry1: 1, entry2: 9 }) === 2, 'majority entry2 wins');
assertTrue([1, 2].includes(chooseWinnerFromVotes({ entry1: 3, entry2: 3 })), 'tie returns a valid side');
assertTrue([1, 2].includes(chooseWinnerFromVotes(undefined)), 'missing tally returns a valid side');
assertTrue([1, 2].includes(chooseWinnerFromVotes({})), 'empty tally returns a valid side');
{
  // Ties should be near-fair. 1000 flips; accept a very loose 35-65% band.
  let ones = 0;
  for (let i = 0; i < 1000; i += 1) if (chooseWinnerFromVotes({ entry1: 0, entry2: 0 }) === 1) ones += 1;
  assertTrue(ones > 350 && ones < 650, `tie random distribution sane (${ones}/1000 for entry1)`);
}

// ---- resolveRound ----------------------------------------------------------
console.log('resolveRound');
{
  const m = bracket8();
  const votes = { 'r0-m0': { entry1: 3, entry2: 1 }, 'r0-m1': { entry1: 0, entry2: 2 }, 'r0-m2': { entry1: 4, entry2: 0 }, 'r0-m3': { entry1: 1, entry2: 5 } };
  resolveRound(m, votes, 0);
  assertTrue(m[0][0].winner === 1 && m[0][1].winner === 2 && m[0][2].winner === 1 && m[0][3].winner === 2, 'winners set from tallies');
  assertTrue(m[1][0].entry1?.name === 'A' && m[1][0].entry2?.name === 'E', 'winners propagate to next-round slots (pair 0)');
  assertTrue(m[1][1].entry1?.name === 'B' && m[1][1].entry2?.name === 'F', 'winners propagate to next-round slots (pair 1)');
}
{
  const m = bracket8();
  m[0][0].winner = 2;                                        // pre-decided (e.g. by admin)
  resolveRound(m, { 'r0-m0': { entry1: 99, entry2: 0 } }, 0);
  assertTrue(m[0][0].winner === 2, 'existing winner is respected over tallies');
  assertTrue(m[1][0].entry1?.name === 'H', 'existing winner still propagates');
}
{
  const m = bracket8();
  resolveRound(m, {}, 0);                                    // no votes at all
  assertTrue(m[0].every((x) => x.winner === 1 || x.winner === 2), 'voteless round still fully decides');
}
{
  const m = [[ { entry1: team(1, 'A'), entry2: team(2, 'B') } ]];   // single-round bracket
  resolveRound(m, { 'r0-m0': { entry1: 0, entry2: 7 } }, 0);
  assertTrue(m[0][0].winner === 2, 'final round decides');
  assertTrue(m.length === 1, 'final round does not propagate anywhere');
}
{
  const m = bracket8();
  const out = resolveRound(m, {}, 5);
  assertTrue(out === m && m[0].every((x) => !x.winner), 'out-of-range round index is a no-op');
}

// ---- forceFinish + championOf ---------------------------------------------
console.log('forceFinish / championOf');
{
  const m = bracket8();
  const votes = {
    'r0-m0': { entry1: 3, entry2: 0 }, 'r0-m1': { entry1: 2, entry2: 0 },
    'r0-m2': { entry1: 0, entry2: 1 }, 'r0-m3': { entry1: 1, entry2: 0 },
    'r1-m0': { entry1: 5, entry2: 1 }, 'r1-m1': { entry1: 0, entry2: 4 },
    'r2-m0': { entry1: 2, entry2: 1 },
  };
  forceFinish(m, votes, 0);
  assertTrue(m.every((rd) => rd.every((x) => x.winner === 1 || x.winner === 2)), 'every match decided');
  assertTrue(m[1][0].entry1?.name === 'A' && m[1][1].entry2?.name === 'C', 'propagation flows through all rounds');
  assertTrue(championOf(m)?.name === 'A', 'champion follows the vote path (A over G/C line)');
}
{
  const m = bracket8();
  forceFinish(m, {}, 0);                                     // zero votes anywhere
  assertTrue(championOf(m) != null, 'voteless bracket still crowns a champion');
}
{
  const m = bracket8();
  // Rounds 0-1 already fully played; only the final remains.
  resolveRound(m, { 'r0-m0': { entry1: 1, entry2: 0 }, 'r0-m1': { entry1: 1, entry2: 0 }, 'r0-m2': { entry1: 1, entry2: 0 }, 'r0-m3': { entry1: 1, entry2: 0 } }, 0);
  resolveRound(m, { 'r1-m0': { entry1: 1, entry2: 0 }, 'r1-m1': { entry1: 0, entry2: 1 } }, 1);
  const w00 = m[0][0].winner, w10 = m[1][0].winner;
  forceFinish(m, { 'r2-m0': { entry1: 0, entry2: 3 } }, 2);
  assertTrue(m[0][0].winner === w00 && m[1][0].winner === w10, 'force-finish from round 2 leaves earlier rounds untouched');
  assertTrue(m[2][0].winner === 2, 'final decided from its tally');
  assertTrue(championOf(m)?.name === m[2][0].entry2.name, 'champion is the final winner entry');
}
{
  assertTrue(championOf(bracket8()) === null, 'unfinished bracket has no champion');
  assertTrue(championOf(null) === null, 'championOf(null) is null');
}

// ---- freshenMatchups + initVotes ------------------------------------------
console.log('freshenMatchups / initVotes');
{
  const src = bracket8();
  forceFinish(src, {}, 0);                                   // dirty it with winners + advanced entries
  const fresh = freshenMatchups(src);
  assertTrue(fresh.every((rd) => rd.every((x) => x.winner === undefined)), 'winners stripped');
  assertTrue(fresh[0][0].entry1?.name === 'A' && fresh[0][3].entry2?.name === 'F', 'round 0 entries preserved');
  assertTrue(fresh[1].every((x) => x.entry1 === null && x.entry2 === null) && fresh[2][0].entry1 === null, 'later rounds blanked');
  fresh[0][0].entry1.name = 'MUTATED';
  assertTrue(src[0][0].entry1.name === 'A', 'deep copy — no aliasing back to the source');
}
{
  const votes = initVotes(bracket8());
  assertTrue(Object.keys(votes).length === 7, 'a tally for every match (4+2+1)');
  assertTrue(votes['r2-m0'].entry1 === 0 && votes['r2-m0'].entry2 === 0, 'tallies start zeroed');
}

// ---- date helpers ----------------------------------------------------------
console.log('date helpers');
{
  // Sunday 2026-07-19 05:00 UTC = Sunday 01:00 ET (rollover window) -> Monday the 20th.
  const sunday = new Date(Date.UTC(2026, 6, 19, 5, 0, 0));
  assertTrue(computeWeekStartMondayET(sunday).toISOString().startsWith('2026-07-20'), 'Sunday rollover -> next-day Monday');
  // Monday 2026-07-20 12:00 ET -> that same Monday.
  const monday = new Date(Date.UTC(2026, 6, 20, 16, 0, 0));
  assertTrue(computeWeekStartMondayET(monday).toISOString().startsWith('2026-07-20'), 'Monday -> same-day Monday');
  // DST boundary week: Sunday 2026-03-08 (spring forward) 06:00 UTC = 01:00 ET -> Monday 3/9.
  const dstSunday = new Date(Date.UTC(2026, 2, 8, 6, 0, 0));
  assertTrue(computeWeekStartMondayET(dstSunday).toISOString().startsWith('2026-03-09'), 'DST-transition Sunday still lands on Monday');
  assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(todayKeyET()), 'todayKeyET shape YYYY-MM-DD');
  // 2026-07-19 03:00 UTC is still 2026-07-18 in ET (23:00) — key must use the ET date.
  const lateNight = new Date(Date.UTC(2026, 6, 19, 3, 0, 0));
  assertTrue(todayKeyET(lateNight) === '2026-07-18', 'todayKeyET uses the ET calendar date, not UTC');
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
