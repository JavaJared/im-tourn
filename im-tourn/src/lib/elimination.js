// src/lib/elimination.js
//
// Strict mathematical elimination analysis for bracket pools.
//
// Given a pool's current state (partial results) and all participant entries,
// determines for each entry whether it is:
//   - 'alive'     : at least one remaining outcome of undecided matchups
//                   results in this entry finishing tied for 1st or better
//   - 'eliminated': no remaining outcome lets this entry reach 1st place
//   - 'clinched' : this entry finishes tied for 1st or better under every
//                   possible remaining outcome
//
// The algorithm also collects the full set of winning outcome scenarios for
// each alive entry, which feeds into the "What needs to happen" UI. The
// structure of the returned data is intentionally shaped so a future
// probability layer can be dropped on top without changing this module:
// each scenario is a list of decided matchup outcomes, and a probability
// can be assigned by multiplying per-matchup probabilities across the list.
//
// Assumptions about the input (matching the bracketService data model):
//   - pool.bracketMatchups: 2D array matchups[roundIndex][matchIndex]
//       each match: { entry1, entry2, winner }
//       entry1/entry2: { name, seed } (seed is identity)
//       winner: 1 | 2 | null
//   - pool.results: same shape as bracketMatchups, with winners progressively
//       set by the host. Future-round matches may have null entries until
//       their feeders resolve. May be null if the pool hasn't started.
//   - pool.roundPoints: array, points[roundIndex] -> points per correct pick
//   - pool.enableSleepers, pool.sleeper1Points, pool.sleeper2Points
//   - entry.predictions: same 2D matchups shape (participant's full bracket)
//   - entry.sleeper1, entry.sleeper2: { name, seed } or null
//   - entry.score: current score (recomputed, used as a sanity anchor)
//
// Complexity: the search space is the set of possible tournament completions,
// which is structured by the bracket tree. We enumerate over possible
// "champions of each subtree" rather than 2^n independent matchups, and prune
// aggressively using max-possible-score bounds.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute elimination status for every entry in a pool.
 *
 * @param {Object} pool - pool document
 * @param {Array}  entries - pool entries (with parsed predictions/sleepers)
 * @param {Object} [options]
 * @param {number} [options.maxScenariosPerEntry=5000] - cap on scenarios
 *        stored per alive entry to keep memory bounded. Does not affect the
 *        alive/eliminated/clinched determination itself.
 * @returns {Object} {
 *   byUserId: { [userId]: EntryStatus },
 *   analysisComplete: boolean,   // false if any entry's search was truncated
 *   undecidedMatchupCount: number
 * }
 *
 * EntryStatus = {
 *   status: 'alive' | 'eliminated' | 'clinched',
 *   currentScore: number,
 *   maxPossibleScore: number,
 *   minPossibleScore: number,
 *   winningScenarios: Scenario[] | null,  // null if eliminated
 *   scenariosTruncated: boolean,
 * }
 *
 * Scenario = {
 *   // Map of matchup key "r{round}-m{index}" -> seed of the winning entry.
 *   // Only includes matchups that were decided inside this scenario; does
 *   // not repeat matchups whose results were already set by the host.
 *   outcomes: { [matchupKey: string]: number },  // seed
 *   finalScore: number,
 *   minOpponentScore: number,  // useful for margin displays
 * }
 */
export function analyzePool(pool, entries, options = {}) {
  const maxScenariosPerEntry = options.maxScenariosPerEntry ?? 5000;

  const submittedEntries = entries.filter((e) => e.predictions);
  if (submittedEntries.length === 0) {
    return { byUserId: {}, analysisComplete: true, undecidedMatchupCount: 0 };
  }

  const bracket = pool.bracketMatchups;
  const results = pool.results || bracket;
  const roundPoints = pool.roundPoints || defaultRoundPoints(bracket.length);

  // Identify undecided matchups in the bracket tree. We work with matchups
  // in round order because downstream rounds depend on upstream winners.
  const undecided = collectUndecidedMatchups(results);

  // Determine the set of participants (teams) that could still appear in
  // each undecided matchup, walking the bracket tree from current known
  // state. This gives us, for each undecided matchup, the list of possible
  // winners (i.e. seeds) we need to branch on.
  const possibleMatchupOutcomes = buildPossibleOutcomes(results, undecided);

  // For each entry, compute current score and max/min possible score (cheap
  // bounds that allow trivial elimination of many entries without search).
  const entryContexts = submittedEntries.map((entry) =>
    buildEntryContext(entry, pool, results, roundPoints, possibleMatchupOutcomes)
  );

  // Cheap pre-pass: any entry whose max < some entry's min is eliminated
  // trivially. Any entry whose min >= every other entry's max has clinched.
  const globalMaxOfMins = Math.max(...entryContexts.map((c) => c.minPossibleScore));
  const globalMinOfMaxes = Math.min(...entryContexts.map((c) => c.maxPossibleScore));

  // For each entry, run the full search to determine alive/eliminated/clinched
  // and collect winning scenarios if alive.
  let analysisComplete = true;
  const byUserId = {};
  for (const ctx of entryContexts) {
    // Fast path: max possible score can't beat the best guaranteed floor
    // of another entry => eliminated, no search needed.
    if (ctx.maxPossibleScore < globalMaxOfMins) {
      byUserId[ctx.entry.userId] = {
        status: 'eliminated',
        currentScore: ctx.currentScore,
        maxPossibleScore: ctx.maxPossibleScore,
        minPossibleScore: ctx.minPossibleScore,
        winningScenarios: null,
        scenariosTruncated: false,
      };
      continue;
    }

    // Fast path: min guaranteed score already exceeds every other entry's max
    // => clinched outright, no search needed.
    if (ctx.minPossibleScore >= globalMinOfMaxes && ctx.minPossibleScore > 0) {
      // Technically we need a stricter check: this entry's min must be >= every
      // OTHER entry's max.
      let clinchedFast = true;
      for (const other of entryContexts) {
        if (other.entry.userId === ctx.entry.userId) continue;
        if (ctx.minPossibleScore < other.maxPossibleScore) {
          clinchedFast = false;
          break;
        }
      }
      if (clinchedFast) {
        byUserId[ctx.entry.userId] = {
          status: 'clinched',
          currentScore: ctx.currentScore,
          maxPossibleScore: ctx.maxPossibleScore,
          minPossibleScore: ctx.minPossibleScore,
          // A "clinched" participant wins under every scenario, so we don't
          // enumerate. Populate as empty (meaning: unconditional).
          winningScenarios: [],
          scenariosTruncated: false,
        };
        continue;
      }
    }

    // Full search: enumerate possible tournament completions and test.
    const searchResult = searchWinningScenarios(
      ctx,
      entryContexts,
      results,
      roundPoints,
      possibleMatchupOutcomes,
      undecided,
      pool,
      maxScenariosPerEntry
    );

    if (searchResult.truncated) analysisComplete = false;

    if (searchResult.winningScenarios.length === 0) {
      byUserId[ctx.entry.userId] = {
        status: 'eliminated',
        currentScore: ctx.currentScore,
        maxPossibleScore: ctx.maxPossibleScore,
        minPossibleScore: ctx.minPossibleScore,
        winningScenarios: null,
        scenariosTruncated: false,
      };
    } else if (searchResult.allScenariosWinning) {
      byUserId[ctx.entry.userId] = {
        status: 'clinched',
        currentScore: ctx.currentScore,
        maxPossibleScore: ctx.maxPossibleScore,
        minPossibleScore: ctx.minPossibleScore,
        winningScenarios: [],
        scenariosTruncated: searchResult.truncated,
      };
    } else {
      byUserId[ctx.entry.userId] = {
        status: 'alive',
        currentScore: ctx.currentScore,
        maxPossibleScore: ctx.maxPossibleScore,
        minPossibleScore: ctx.minPossibleScore,
        winningScenarios: searchResult.winningScenarios,
        scenariosTruncated: searchResult.truncated,
      };
    }
  }

  return {
    byUserId,
    analysisComplete,
    undecidedMatchupCount: undecided.length,
  };
}

/**
 * Decide whether the "What needs to happen" full-path view should be shown.
 * Gated by: bracket has reached quarterfinals OR >=75% of the submitted
 * participants are eliminated. Either gate unlocks the deeper UI.
 */
export function shouldShowWinningPaths(pool, analysis, entries) {
  if (!analysis || !pool?.bracketMatchups) return false;

  const totalRounds = pool.bracketMatchups.length;
  // Quarterfinals: round index such that 4 matches remain in that round.
  // For a 64-bracket (6 rounds) that's round index 3 (8 matches down to 4).
  // For a 32-bracket (5 rounds) it's round index 2. We express this
  // generically as the round containing <= 4 matchups.
  const qfRoundIndex = pool.bracketMatchups.findIndex((round) => round.length <= 4);
  const results = pool.results || pool.bracketMatchups;

  // Check if any matchups in the quarterfinals round (or later) have been
  // decided, OR any matchup beyond QF has resolved. That's the signal that
  // the tournament is "at the quarterfinals" from a gameplay standpoint.
  let reachedQF = false;
  if (qfRoundIndex >= 0) {
    for (let r = qfRoundIndex; r < totalRounds; r++) {
      for (const m of results[r] || []) {
        if (m?.winner) {
          reachedQF = true;
          break;
        }
      }
      if (reachedQF) break;
    }
  }
  if (reachedQF) return true;

  // Fallback: 75% of submitted entries eliminated.
  const submitted = entries.filter((e) => e.predictions);
  if (submitted.length === 0) return false;
  const eliminated = submitted.filter(
    (e) => analysis.byUserId[e.userId]?.status === 'eliminated'
  ).length;
  return eliminated / submitted.length >= 0.75;
}

/**
 * Produce a human-friendly summary of an alive entry's winning scenarios.
 * Combines:
 *   - "Required" matchups: decided the same way in ALL winning scenarios
 *   - "Root for" per matchup: which seed (and by how much) favors this entry
 *
 * @param {Object} status - one entry from analyzePool().byUserId
 * @param {Object} pool
 * @returns {{
 *   required: Array<{matchupKey, round, matchIndex, requiredSeed, teamName}>,
 *   rootFor: Array<{matchupKey, round, matchIndex, perOutcome: [{seed, teamName, scenarioCount}]}>,
 *   totalScenarios: number
 * } | null}
 */
export function summarizeWinningScenarios(status, pool) {
  if (!status || status.status !== 'alive' || !status.winningScenarios) return null;
  const scenarios = status.winningScenarios;
  if (scenarios.length === 0) return null;

  const results = pool.results || pool.bracketMatchups;

  // Find the set of matchup keys that appear in at least one scenario.
  const allKeys = new Set();
  for (const s of scenarios) {
    for (const k of Object.keys(s.outcomes)) allKeys.add(k);
  }

  const required = [];
  const rootFor = [];

  for (const key of allKeys) {
    // Distribution of outcomes across winning scenarios for this matchup
    const counts = new Map();
    let appearsInCount = 0;
    for (const s of scenarios) {
      if (key in s.outcomes) {
        appearsInCount += 1;
        const seed = s.outcomes[key];
        counts.set(seed, (counts.get(seed) || 0) + 1);
      }
    }

    const { round, matchIndex } = parseMatchupKey(key);

    // If the matchup appears in every scenario with the same single outcome,
    // it's a hard requirement.
    if (appearsInCount === scenarios.length && counts.size === 1) {
      const requiredSeed = [...counts.keys()][0];
      const teamName = lookupTeamName(results, round, matchIndex, requiredSeed);
      required.push({
        matchupKey: key,
        round,
        matchIndex,
        requiredSeed,
        teamName: teamName || `seed ${requiredSeed}`,
      });
      continue;
    }

    // Otherwise, expose the distribution so we can render a "root for" view.
    const perOutcome = [];
    for (const [seed, count] of counts.entries()) {
      perOutcome.push({
        seed,
        teamName: lookupTeamName(results, round, matchIndex, seed) || `seed ${seed}`,
        scenarioCount: count,
      });
    }
    perOutcome.sort((a, b) => b.scenarioCount - a.scenarioCount);

    rootFor.push({
      matchupKey: key,
      round,
      matchIndex,
      perOutcome,
    });
  }

  // Sort required by round ascending, then by match index.
  required.sort((a, b) => a.round - b.round || a.matchIndex - b.matchIndex);
  rootFor.sort((a, b) => a.round - b.round || a.matchIndex - b.matchIndex);

  return {
    required,
    rootFor,
    totalScenarios: scenarios.length,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function defaultRoundPoints(rounds) {
  const out = [];
  for (let i = 0; i < rounds; i++) out.push(Math.pow(2, i));
  return out;
}

function matchupKey(round, matchIndex) {
  return `r${round}-m${matchIndex}`;
}

function parseMatchupKey(key) {
  const m = key.match(/^r(\d+)-m(\d+)$/);
  return { round: Number(m[1]), matchIndex: Number(m[2]) };
}

function lookupTeamName(results, round, matchIndex, seed) {
  // Walk all rounds looking for a match that contains this seed in either
  // entry slot — since entries propagate forward, the earliest round they
  // appear in will have their full info including name.
  for (let r = 0; r < results.length; r++) {
    for (const m of results[r] || []) {
      if (m?.entry1?.seed === seed) return m.entry1.name;
      if (m?.entry2?.seed === seed) return m.entry2.name;
    }
  }
  return null;
}

function collectUndecidedMatchups(results) {
  const out = [];
  for (let r = 0; r < results.length; r++) {
    const round = results[r] || [];
    for (let m = 0; m < round.length; m++) {
      if (!round[m]?.winner) {
        out.push({ round: r, matchIndex: m });
      }
    }
  }
  return out;
}

/**
 * For every undecided matchup, determine the list of seeds that could
 * possibly be its two slots. We do this by walking forward from the last
 * decided round: an undecided R(k+1) matchup's entries are the two possible
 * winners of its two feeder matchups from R(k).
 *
 * Returns a map matchupKey -> { possibleEntry1: [seed...], possibleEntry2: [seed...] }
 * Where possibleEntry1 is the list of seeds that could fill the first slot,
 * etc. A decided feeder returns a single-element list.
 */
function buildPossibleOutcomes(results, undecided) {
  const out = new Map();

  // For round 0 undecided matches, both entries are known (they're the seed
  // pairings), so we just list them.
  for (const { round, matchIndex } of undecided) {
    const m = results[round][matchIndex];
    const slot1 = possibleSeedsForSlot(results, round, matchIndex, 1);
    const slot2 = possibleSeedsForSlot(results, round, matchIndex, 2);
    out.set(matchupKey(round, matchIndex), {
      possibleEntry1Seeds: slot1,
      possibleEntry2Seeds: slot2,
    });
    // Suppress unused-var lint on m — kept for clarity during debug.
    void m;
  }

  return out;
}

function possibleSeedsForSlot(results, round, matchIndex, slot) {
  const match = results[round][matchIndex];
  const entry = slot === 1 ? match?.entry1 : match?.entry2;
  if (entry) return [entry.seed];

  // Entry is not yet populated — walk back to the feeder matchup.
  if (round === 0) return []; // shouldn't happen: round 0 entries are always set

  const feederRound = round - 1;
  const feederMatchIndex = matchIndex * 2 + (slot === 1 ? 0 : 1);
  const feeder = results[feederRound][feederMatchIndex];
  if (!feeder) return [];

  if (feeder.winner) {
    const winnerEntry = feeder.winner === 1 ? feeder.entry1 : feeder.entry2;
    return winnerEntry ? [winnerEntry.seed] : [];
  }

  // Feeder is undecided: possible winners are the two possible entries of it.
  return [
    ...possibleSeedsForSlot(results, feederRound, feederMatchIndex, 1),
    ...possibleSeedsForSlot(results, feederRound, feederMatchIndex, 2),
  ];
}

/**
 * Build per-entry score context: current score, max possible score (if every
 * remaining matchup goes their way), min possible score (if every remaining
 * matchup goes against them). Used for bounds-based pruning.
 *
 * NOTE: max/min here are loose bounds. They assume favorable sleeper outcomes
 * can independently co-occur with favorable matchup outcomes, which is true
 * in most brackets but could be mildly overcounted if a sleeper's advance
 * is inconsistent with a chosen matchup outcome. That's acceptable: we only
 * use these as pruning bounds, never as final verdicts.
 */
function buildEntryContext(entry, pool, results, roundPoints, possibleOutcomes) {
  // Current score: points from already-decided matchups where this entry's
  // prediction matches the actual winner.
  let currentScore = 0;
  let maxScore = 0;
  let minScore = 0;

  for (let r = 0; r < results.length; r++) {
    const pointsForRound = roundPoints[r] ?? Math.pow(2, r);
    const round = results[r] || [];
    for (let m = 0; m < round.length; m++) {
      const match = round[m];
      if (match?.winner) {
        const predMatch = entry.predictions?.[r]?.[m];
        const predWinnerSeed = predictedWinnerSeed(predMatch);
        const actualWinnerSeed = match.winner === 1 ? match.entry1?.seed : match.entry2?.seed;
        if (predWinnerSeed != null && predWinnerSeed === actualWinnerSeed) {
          currentScore += pointsForRound;
          maxScore += pointsForRound;
          minScore += pointsForRound;
        }
      } else {
        // Undecided matchup: find the entry's predicted champion for this slot.
        // If the predicted winner could possibly win this matchup (given what's
        // possible), add its point value to maxScore. Otherwise zero. minScore
        // gets zero either way unless the predicted winner is the only possible
        // outcome.
        const predMatch = entry.predictions?.[r]?.[m];
        const predWinnerSeed = predictedWinnerSeed(predMatch);
        if (predWinnerSeed == null) continue;

        const possible = possibleOutcomes.get(matchupKey(r, m));
        const allPossibleSeeds = new Set([
          ...(possible?.possibleEntry1Seeds || []),
          ...(possible?.possibleEntry2Seeds || []),
        ]);
        if (allPossibleSeeds.has(predWinnerSeed)) {
          maxScore += pointsForRound;
          if (allPossibleSeeds.size === 1) {
            minScore += pointsForRound;
          }
        }
      }
    }
  }

  // Sleeper bonuses (only if enabled).
  let currentSleeper1 = 0;
  let currentSleeper2 = 0;
  let maxSleeper = 0;
  let minSleeper = 0;
  if (pool.enableSleepers) {
    const s1Points = pool.sleeper1Points || 0;
    const s2Points = pool.sleeper2Points || 0;

    // Current: whether sleepers have already hit.
    if (entry.sleeper1 && didSeedMakeRound(results, entry.sleeper1.seed, 2)) {
      currentSleeper1 = s1Points;
    }
    if (entry.sleeper2 && didSeedMakeRound(results, entry.sleeper2.seed, 3)) {
      currentSleeper2 = s2Points;
    }
    currentScore += currentSleeper1 + currentSleeper2;

    // Max possible: sleeper adds points if the sleeper's seed could still
    // reach the target round. Evaluated via possible-outcome set.
    const s1Possible =
      entry.sleeper1 && seedCouldReachRound(results, possibleOutcomes, entry.sleeper1.seed, 2);
    const s2Possible =
      entry.sleeper2 && seedCouldReachRound(results, possibleOutcomes, entry.sleeper2.seed, 3);
    const s1Guaranteed =
      entry.sleeper1 && seedMustReachRound(results, possibleOutcomes, entry.sleeper1.seed, 2);
    const s2Guaranteed =
      entry.sleeper2 && seedMustReachRound(results, possibleOutcomes, entry.sleeper2.seed, 3);

    if (s1Possible) maxSleeper += s1Points;
    if (s2Possible) maxSleeper += s2Points;
    if (s1Guaranteed) minSleeper += s1Points;
    if (s2Guaranteed) minSleeper += s2Points;

    maxScore += maxSleeper - currentSleeper1 - currentSleeper2; // avoid double count
    minScore += minSleeper - currentSleeper1 - currentSleeper2;

    // Tighten: maxScore should never be below currentScore; minScore should
    // never exceed currentScore remaining opportunities. Clamp for safety.
    maxScore = Math.max(maxScore, currentScore);
    minScore = Math.min(minScore, currentScore);
  }

  return {
    entry,
    currentScore,
    maxPossibleScore: maxScore,
    minPossibleScore: minScore,
  };
}

function predictedWinnerSeed(predMatch) {
  if (!predMatch || !predMatch.winner) return null;
  return predMatch.winner === 1 ? predMatch.entry1?.seed : predMatch.entry2?.seed;
}

function didSeedMakeRound(results, seed, targetRoundIndex) {
  if (seed == null) return false;
  const round = results[targetRoundIndex] || [];
  for (const m of round) {
    if (m?.entry1?.seed === seed || m?.entry2?.seed === seed) return true;
  }
  return false;
}

function seedCouldReachRound(results, possibleOutcomes, seed, targetRoundIndex) {
  if (seed == null) return false;
  // Already there?
  if (didSeedMakeRound(results, seed, targetRoundIndex)) return true;
  // Check each matchup in the target round: could this seed end up in either slot?
  const round = results[targetRoundIndex] || [];
  for (let m = 0; m < round.length; m++) {
    const match = round[m];
    if (match?.entry1?.seed === seed || match?.entry2?.seed === seed) return true;
    // Check possible outcomes for this matchup's slots
    const key = matchupKey(targetRoundIndex, m);
    const po = possibleOutcomes.get(key);
    if (po) {
      if (po.possibleEntry1Seeds.includes(seed)) return true;
      if (po.possibleEntry2Seeds.includes(seed)) return true;
    }
  }
  return false;
}

function seedMustReachRound(results, possibleOutcomes, seed, targetRoundIndex) {
  // Seed is guaranteed to reach a round iff:
  //   - it's already there, OR
  //   - every undecided matchup between its current position and the target
  //     round has this seed as the only possible winner (i.e. its path is
  //     guaranteed by the structure).
  // Cheap conservative check: already there = yes; otherwise no. This is a
  // safe lower bound for pruning (it under-promises, which is fine).
  return didSeedMakeRound(results, seed, targetRoundIndex);
}

/**
 * Core search: enumerate possible completions of the tournament and for each
 * completion compute all participants' final scores, recording the ones
 * where `targetEntry` finishes tied-for-first or better.
 *
 * We search by walking undecided matchups in round order (earliest first)
 * and branching on the possible winner of each. This ensures parent matchups
 * are decided before child matchups — so child matchups' possible entries
 * are known as we recurse.
 */
function searchWinningScenarios(
  targetCtx,
  allCtxs,
  baseResults,
  roundPoints,
  possibleOutcomes,
  undecided,
  pool,
  maxScenarios
) {
  // Sort undecided by round ascending so earlier rounds get decided first.
  const ordered = [...undecided].sort(
    (a, b) => a.round - b.round || a.matchIndex - b.matchIndex
  );

  const winningScenarios = [];
  let totalScenariosExplored = 0;
  let truncated = false;
  let allScenariosWinning = true; // flipped to false if any losing scenario found

  // Mutable working state: a deep copy of the results grid where we fill in
  // winners as we branch. We do NOT mutate the input.
  const working = cloneResults(baseResults);
  const outcomeStack = {}; // matchupKey -> winning seed, for the current path

  const recurse = (idx) => {
    if (truncated) return;

    if (idx === ordered.length) {
      // Terminal: compute every entry's final score.
      totalScenariosExplored += 1;
      const scoresByUserId = computeFinalScoresAllEntries(
        allCtxs,
        working,
        roundPoints,
        pool
      );

      const myScore = scoresByUserId[targetCtx.entry.userId];
      let iWin = true;
      let minOpponentScore = Infinity;
      for (const ctx of allCtxs) {
        if (ctx.entry.userId === targetCtx.entry.userId) continue;
        const s = scoresByUserId[ctx.entry.userId];
        if (s > myScore) {
          iWin = false;
        }
        if (s < minOpponentScore) minOpponentScore = s;
      }

      if (iWin) {
        if (winningScenarios.length < maxScenarios) {
          winningScenarios.push({
            outcomes: { ...outcomeStack },
            finalScore: myScore,
            minOpponentScore:
              minOpponentScore === Infinity ? myScore : minOpponentScore,
          });
        } else {
          truncated = true;
        }
      } else {
        allScenariosWinning = false;
      }
      return;
    }

    const { round, matchIndex } = ordered[idx];
    const key = matchupKey(round, matchIndex);

    // Compute possible winners given currently-filled working state.
    // (We use working rather than the static possibleOutcomes map because
    // earlier branches in this recursion path determine what's in the slots.)
    const match = working[round][matchIndex];
    const slot1Seed = match.entry1?.seed;
    const slot2Seed = match.entry2?.seed;

    // If the slot isn't filled yet, it should be because the feeder hasn't
    // been resolved at this point in the recursion. Since we order by round,
    // that shouldn't happen — but guard anyway.
    const possibleWinners = [];
    if (slot1Seed != null) possibleWinners.push({ seed: slot1Seed, winner: 1, entry: match.entry1 });
    if (slot2Seed != null) possibleWinners.push({ seed: slot2Seed, winner: 2, entry: match.entry2 });

    for (const pw of possibleWinners) {
      match.winner = pw.winner;
      outcomeStack[key] = pw.seed;

      // Propagate into next round's slot (just like bracketService does).
      if (round + 1 < working.length) {
        const nextRoundMatchIndex = Math.floor(matchIndex / 2);
        const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
        working[round + 1][nextRoundMatchIndex][entrySlot] = pw.entry;
      }

      recurse(idx + 1);

      // Undo: clear the winner and the downstream slot we filled.
      match.winner = null;
      delete outcomeStack[key];
      if (round + 1 < working.length) {
        const nextRoundMatchIndex = Math.floor(matchIndex / 2);
        const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
        // Only clear if we actually populated it — i.e. if the baseResults
        // didn't already have it filled from a decided feeder upstream.
        const baseNext = baseResults[round + 1]?.[nextRoundMatchIndex]?.[entrySlot];
        working[round + 1][nextRoundMatchIndex][entrySlot] = baseNext || null;
      }

      if (truncated) return;
    }
  };

  recurse(0);

  // If we never explored any scenario at all, treat as trivially "all winning"
  // (no undecided matchups means the outcome is fixed — already decided).
  if (totalScenariosExplored === 0) {
    // Compute the single fixed outcome.
    const scoresByUserId = computeFinalScoresAllEntries(
      allCtxs,
      baseResults,
      roundPoints,
      pool
    );
    const myScore = scoresByUserId[targetCtx.entry.userId];
    let iWin = true;
    for (const ctx of allCtxs) {
      if (ctx.entry.userId === targetCtx.entry.userId) continue;
      if (scoresByUserId[ctx.entry.userId] > myScore) {
        iWin = false;
        break;
      }
    }
    return {
      winningScenarios: iWin ? [{ outcomes: {}, finalScore: myScore, minOpponentScore: 0 }] : [],
      allScenariosWinning: iWin,
      truncated: false,
    };
  }

  return {
    winningScenarios,
    allScenariosWinning: winningScenarios.length > 0 && allScenariosWinning,
    truncated,
  };
}

function cloneResults(results) {
  // Deep-enough clone: preserve match objects' own keys but not reference
  // the same objects as the input, so mutating `winner` and slots doesn't
  // leak.
  return results.map((round) => round.map((match) => ({ ...match })));
}

function computeFinalScoresAllEntries(allCtxs, finalizedResults, roundPoints, pool) {
  const out = {};
  for (const ctx of allCtxs) {
    out[ctx.entry.userId] = computeEntryFinalScore(
      ctx.entry,
      finalizedResults,
      roundPoints,
      pool
    );
  }
  return out;
}

function computeEntryFinalScore(entry, finalizedResults, roundPoints, pool) {
  let score = 0;
  for (let r = 0; r < finalizedResults.length; r++) {
    const pointsForRound = roundPoints[r] ?? Math.pow(2, r);
    const round = finalizedResults[r] || [];
    for (let m = 0; m < round.length; m++) {
      const match = round[m];
      if (!match?.winner) continue;
      const predMatch = entry.predictions?.[r]?.[m];
      const predSeed = predictedWinnerSeed(predMatch);
      const actualSeed = match.winner === 1 ? match.entry1?.seed : match.entry2?.seed;
      if (predSeed != null && predSeed === actualSeed) {
        score += pointsForRound;
      }
    }
  }

  if (pool.enableSleepers) {
    const s1Points = pool.sleeper1Points || 0;
    const s2Points = pool.sleeper2Points || 0;
    if (entry.sleeper1 && didSeedMakeRound(finalizedResults, entry.sleeper1.seed, 2)) {
      score += s1Points;
    }
    if (entry.sleeper2 && didSeedMakeRound(finalizedResults, entry.sleeper2.seed, 3)) {
      score += s2Points;
    }
  }

  return score;
}
