/**
 * legacyPoolAdapter.js — read-time migration for pre-consolidation pools.
 *
 * Old pools store bracketMatchups / results / entry predictions as the legacy
 * rounds array ([{entry1, entry2, winner}]). New pools store the engine
 * structure. Rather than rewriting Firestore docs (which viewers lack
 * permission to do, and which risks live data), these adapters convert legacy
 * docs into engine shape at read time, so every pool — old or new — flows
 * through the one unified pool UI.
 *
 * Determinism is what makes this safe: convertLegacyMatchups assigns box ids
 * (m1, m2, ... in round/position order) and participant ids (from seeds, else
 * first-round position) purely from the input structure. A pool's
 * bracketMatchups, its results array, and each entry's predictions array all
 * share the same structure and round-0 entries, so the three conversions
 * yield identical box/participant ids and line up with each other.
 *
 * Writes on an adapted pool use the NEW fields (customResults, picks-map
 * predictions), which take precedence on subsequent reads — so a legacy pool
 * incrementally becomes a new-format pool as it's used, with the legacy
 * fields left untouched as a historical record.
 */
import { getChampion } from './customBracket.js';
import { picksFromState } from './customScoring.js';
import { convertLegacyMatchups, structureFromState } from './standardBracket.js';

/** Legacy pools carry bracketMatchups as an ARRAY of rounds; engine pools carry an object. */
export function isLegacyPool(pool) {
  return !!pool && Array.isArray(pool.bracketMatchups);
}

/** Legacy entries carry predictions as an ARRAY of rounds; new entries carry a picks map. */
export function isLegacyEntry(entry) {
  return !!entry && Array.isArray(entry.predictions);
}

/** Legacy rounds array (with winners) -> { boxId: winnerPid } results map. */
export function legacyResultsToMap(matchupsWithWinners) {
  const { state } = convertLegacyMatchups(matchupsWithWinners);
  return picksFromState(state);
}

/**
 * Convert a legacy pool doc into engine shape. Non-legacy pools pass through
 * unchanged. Any customResults already written (post-migration recording)
 * win over results converted from the legacy array.
 */
export function adaptLegacyPool(pool) {
  if (!isLegacyPool(pool)) return pool;
  const { state } = convertLegacyMatchups(pool.bracketMatchups);
  const structure = structureFromState(state);

  let customResults = pool.customResults || {};
  if (Array.isArray(pool.results) && pool.results.length) {
    customResults = { ...legacyResultsToMap(pool.results), ...customResults };
  }

  return {
    ...pool,
    bracketType: 'custom',        // route to the unified pool UI
    bracketMatchups: structure,   // { rounds, boxes, nameMap, seedMap, roundCount }
    customResults,
    _legacy: true,                // breadcrumb for debugging/telemetry
  };
}

/**
 * Convert a legacy entry doc: predictions rounds-array -> picks map, and
 * champion recomputed as a participant id (legacy stored a display name).
 * Non-legacy entries pass through unchanged.
 */
/**
 * Normalize a sleeper pick to a participant id string. Handles: null, a pid
 * string ('p5'), a legacy participant object ({name, seed}), or either of
 * those JSON-stringified (legacy storage stringified sleeper objects).
 * Legacy pids follow the converter's rule: p<seed> (seeds were always set
 * by legacy pool creation).
 */
export function normalizeSleeper(value) {
  if (value == null) return null;
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { /* plain pid string */ }
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.seed != null) return `p${v.seed}`;
  return null;
}

export function adaptLegacyEntry(entry) {
  if (!isLegacyEntry(entry)) return entry;
  const { state } = convertLegacyMatchups(entry.predictions);
  return {
    ...entry,
    predictions: picksFromState(state),
    champion: getChampion(state),
    sleeper1: normalizeSleeper(entry.sleeper1),
    sleeper2: normalizeSleeper(entry.sleeper2),
    _legacy: true,
  };
}
