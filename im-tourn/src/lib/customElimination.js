/**
 * customElimination.js — strict elimination analysis for *custom* (free-form)
 * bracket pools. A faithful port of lib/elimination.js's semantics onto the
 * free-form engine (boxes + positional feeds) instead of the seeded
 * results[round][match] grid.
 *
 * For each pool entrant (with submitted predictions) we determine:
 *   - 'alive'      : at least one remaining completion of the bracket leaves
 *                    them finishing tied for 1st or better,
 *   - 'eliminated' : no remaining completion reaches 1st,
 *   - 'clinched'   : they finish tied for 1st or better under *every* remaining
 *                    completion (a guaranteed tie counts — co-clinch).
 *
 * "Tied for 1st or better" == no opponent finishes strictly ahead, matching the
 * default analyzer's `iWin` rule.
 *
 * Guards against combinatorial blowup (identical to the default):
 *   - maxUndecidedForFullSearch (14): above this we skip the search and fall
 *     back to cheap max/current bounds, marking analysisComplete = false.
 *   - deadlineMs (2000): wall-clock budget; on overrun we stop and mark
 *     analysisComplete = false.
 *   - maxScenariosPerEntry (5000): per-entrant cap on stored winning scenarios.
 */
import { locate, matchWinner, resolveParticipant, setResult } from './customBracket';
import { hydrateState, scoreEntry } from './customScoring';

const ptsFor = (rp, r) => (rp && rp[r] != null ? rp[r] : r + 1);

/**
 * @param {Object} structure  pool.bracketMatchups ({ rounds, boxes, nameMap })
 * @param {Object} resultsMap  official results ({ boxId: winnerPid })
 * @param {Array}  entries     pool entries (need .userId and .predictions)
 * @param {Array}  roundPoints points per round index
 * @returns {{ byUserId: Object, analysisComplete: boolean, undecidedMatchupCount: number }}
 */
export function analyzeCustomPool(structure, resultsMap, entries, roundPoints, options = {}) {
  const maxScenariosPerEntry = options.maxScenariosPerEntry ?? 5000;
  const maxUndecided = options.maxUndecidedForFullSearch ?? 14;
  const deadlineMs = options.deadlineMs ?? 2000;
  const deadline = Date.now() + deadlineMs;

  const submitted = entries.filter((e) => e.predictions);
  if (!structure || submitted.length === 0) {
    return { byUserId: {}, analysisComplete: true, undecidedMatchupCount: 0 };
  }

  const official = hydrateState(structure, resultsMap || {});
  const loc = locate(official);
  const boxIds = Object.keys(official.boxes);

  // Undecided = every box with no resolved winner (byes auto-resolve, so they
  // never appear here). Ordered by round so upstream feeders decide first.
  const undecided = boxIds
    .filter((id) => matchWinner(official, loc, id) == null)
    .sort((a, b) => loc[a].r - loc[b].r || loc[a].p - loc[b].p);

  // Locked base score from already-decided boxes.
  const base = {};
  for (const e of submitted) base[e.userId] = scoreEntry(official, e.predictions, roundPoints).total;

  const out = { byUserId: {}, analysisComplete: true, undecidedMatchupCount: undecided.length };

  // ---- Fallback: too many undecided -> cheap bounds only -----------------
  if (undecided.length > maxUndecided) {
    const eliminatedPids = new Set();
    for (const id of boxIds) {
      const w = matchWinner(official, loc, id);
      if (w == null) continue;
      for (const side of ['A', 'B']) {
        const p = resolveParticipant(official, loc, id, side);
        if (p != null && p !== w) eliminatedPids.add(p);
      }
    }
    const maxPossible = {};
    for (const e of submitted) {
      let mx = base[e.userId];
      for (const id of undecided) {
        const pick = e.predictions[id];
        if (pick != null && !eliminatedPids.has(pick)) mx += ptsFor(roundPoints, loc[id].r); // pick could still be right
      }
      maxPossible[e.userId] = mx;
    }
    for (const e of submitted) {
      let elim = false;
      for (const o of submitted) {
        if (o.userId === e.userId) continue;
        if (maxPossible[e.userId] < base[o.userId]) { elim = true; break; } // can't catch their locked score
      }
      out.byUserId[e.userId] = {
        status: elim ? 'eliminated' : 'alive',
        currentScore: base[e.userId],
        maxPossibleScore: maxPossible[e.userId],
        winningScenarios: elim ? null : [],
        scenariosTruncated: !elim,
      };
    }
    out.analysisComplete = false;
    return out;
  }

  // ---- Full search: one DFS over all completions, classify everyone ------
  const totals = { ...base };
  const won = {}, lost = {};
  const scenarios = {};          // userId -> [{ outcomes }]
  const scnTrunc = {};           // userId -> hit the per-entry cap
  for (const e of submitted) scenarios[e.userId] = [];
  const outcome = {};            // boxId -> winnerPid along the current path
  let deadlineHit = false, timeCheck = 0;

  const recurse = (working, idx) => {
    if (deadlineHit) return;
    if (idx === undecided.length) {
      if (((++timeCheck) & 0xff) === 0 && Date.now() > deadline) { deadlineHit = true; return; }
      let mx = -Infinity;
      for (const e of submitted) if (totals[e.userId] > mx) mx = totals[e.userId];
      for (const e of submitted) {
        if (totals[e.userId] === mx) {               // tied for 1st or better -> a win
          won[e.userId] = true;
          if (scenarios[e.userId].length < maxScenariosPerEntry) scenarios[e.userId].push({ outcomes: { ...outcome } });
          else scnTrunc[e.userId] = true;
        } else {
          lost[e.userId] = true;
        }
      }
      return;
    }
    const id = undecided[idx];
    const pA = resolveParticipant(working, loc, id, 'A');
    const pB = resolveParticipant(working, loc, id, 'B');
    const cands = [];
    if (pA != null) cands.push(pA);
    if (pB != null && pB !== pA) cands.push(pB);
    const pts = ptsFor(roundPoints, loc[id].r);
    for (const pid of cands) {
      const gained = [];
      for (const e of submitted) if (e.predictions[id] === pid) { totals[e.userId] += pts; gained.push(e.userId); }
      outcome[id] = pid;
      recurse(setResult(working, id, pid), idx + 1);
      for (const u of gained) totals[u] -= pts;
      delete outcome[id];
      if (deadlineHit) return;
    }
  };
  recurse(official, 0);

  for (const e of submitted) {
    const w = !!won[e.userId], l = !!lost[e.userId];
    let status, scns;
    if (!w) { status = 'eliminated'; scns = null; }
    else if (!l) { status = 'clinched'; scns = []; }     // won every completion
    else { status = 'alive'; scns = scenarios[e.userId]; }
    out.byUserId[e.userId] = {
      status,
      currentScore: base[e.userId],
      winningScenarios: scns,
      scenariosTruncated: status === 'alive' && (deadlineHit || !!scnTrunc[e.userId]),
    };
  }
  if (deadlineHit) out.analysisComplete = false;
  return out;
}

/**
 * Summarize an alive entry's winning scenarios into "what needs to happen":
 *   - required : boxes decided the same single way in EVERY winning scenario
 *   - rootFor  : boxes whose outcome varies, with the per-winner distribution
 */
export function summarizeWinningScenarios(status, nameMap) {
  if (!status || status.status !== 'alive' || !status.winningScenarios || status.winningScenarios.length === 0) return null;
  const scenarios = status.winningScenarios;
  const name = (pid) => (nameMap && nameMap[pid]) || pid;

  const keys = new Set();
  for (const s of scenarios) for (const k of Object.keys(s.outcomes)) keys.add(k);

  const required = [], rootFor = [];
  for (const key of keys) {
    const counts = new Map();
    let appears = 0;
    for (const s of scenarios) {
      if (key in s.outcomes) { appears += 1; const w = s.outcomes[key]; counts.set(w, (counts.get(w) || 0) + 1); }
    }
    if (appears === scenarios.length && counts.size === 1) {
      const pid = [...counts.keys()][0];
      required.push({ boxId: key, winnerPid: pid, winnerName: name(pid) });
    } else {
      const perOutcome = [...counts.entries()]
        .map(([pid, c]) => ({ winnerPid: pid, winnerName: name(pid), scenarioCount: c }))
        .sort((a, b) => b.scenarioCount - a.scenarioCount);
      rootFor.push({ boxId: key, perOutcome });
    }
  }
  const byBox = (a, b) => a.boxId.localeCompare(b.boxId);
  required.sort(byBox);
  rootFor.sort(byBox);
  return { required, rootFor, totalScenarios: scenarios.length, truncated: !!status.scenariosTruncated };
}

/**
 * Gate for the "what needs to happen" UI: show once the bracket has reached its
 * quarterfinal-equivalent round (the first round with <= 4 matchups has a
 * host-recorded result at or beyond it) OR >= 75% of entrants are eliminated.
 */
export function shouldShowWinningPaths(structure, resultsMap, analysis, entries) {
  if (!analysis || !structure?.rounds) return false;
  const official = hydrateState(structure, resultsMap || {});
  const loc = locate(official);
  const qfRound = structure.rounds.findIndex((rd) => rd.length <= 4);
  if (qfRound >= 0) {
    for (const id of Object.keys(official.boxes)) {
      if (loc[id].r >= qfRound && official.boxes[id].result != null) return true; // an actual game decided at QF+
    }
  }
  const submitted = entries.filter((e) => e.predictions);
  if (submitted.length === 0) return false;
  const elim = submitted.filter((e) => analysis.byUserId[e.userId]?.status === 'eliminated').length;
  return elim / submitted.length >= 0.75;
}
