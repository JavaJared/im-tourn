/**
 * standardBracket.js
 *
 * Bridges the classic "standard" bracket (seeded, single-elimination) onto the
 * positional engine in customBracket.js, so that after creation a standard
 * bracket IS an engine bracket — same document shape, same rendering, same
 * pools, same scoring. "Standard" is a generator preset, not a second system.
 *
 * Exports:
 *   generateSeededBracket(entries)      -> engine state (seeded, byes for non-pow2)
 *   convertLegacyMatchups(matchups)     -> { state, nameMap } from the old
 *                                          [{entry1, entry2, winner}] shape
 *   structureFromState(state)           -> { rounds, boxes, nameMap, seedMap,
 *                                          roundCount } for pool.bracketMatchups
 *
 * Seeding matches the app's existing order: seed i plays seed (n-1-i), with
 * recursive interleaving so the 1-seed and 2-seed can only meet in the final.
 * Non-power-of-2 counts are padded to the next power of two; the phantom
 * high seeds become byes, which the engine auto-advances past.
 *
 * Seeds ride on the NAMED slot objects (`seed` field). The codec copies slot
 * objects verbatim, so seeds survive serialize/deserialize untouched and the
 * engine ignores them entirely.
 */

import {
  SLOT,
  MAX_PARTICIPANTS,
  createBracket,
  addFirst,
  after,
  beside,
  locate,
  slotDisplay,
  resolveParticipant,
  validateForPublish,
} from './customBracket.js';

/**
 * Append `count` boxes per round for `numRounds` rounds using the engine's
 * public mutators. Round 0 boxes come from addFirst; each later round is
 * seeded with after(<a box in the previous round>) then extended with
 * beside(<last box in this round>).
 */
function buildEmptyRounds(numRounds, matchesInFirstRound) {
  let state = createBracket();
  let matches = matchesInFirstRound;
  for (let r = 0; r < numRounds; r += 1) {
    for (let m = 0; m < matches; m += 1) {
      if (r === 0) state = addFirst(state);
      else if (m === 0) state = after(state, state.rounds[r - 1][0]);
      else state = beside(state, state.rounds[r][state.rounds[r].length - 1]);
    }
    matches /= 2;
  }
  return state;
}

/* ------------------------------------------------------------------ *
 * Seeding
 * ------------------------------------------------------------------ */

/** Classic bracket seed order: for n=8 -> [0,7,3,4,1,6,2,5]. */
export function getSeedOrder(n) {
  if (n === 2) return [0, 1];
  const half = getSeedOrder(n / 2);
  return half.flatMap((seed) => [seed, n - 1 - seed]);
}

const nextPowerOfTwo = (n) => 2 ** Math.ceil(Math.log2(n));

/* ------------------------------------------------------------------ *
 * Generator: entries -> engine state
 * ------------------------------------------------------------------ */

/**
 * Build a complete, publish-ready engine state from an ordered entry list.
 * `entries` is an array of { name } (index = seed - 1; entries[0] is the
 * 1-seed). Accepts any count from 2 to MAX_PARTICIPANTS; non-power-of-2
 * counts get byes against the top seeds, exactly like a real tournament.
 */
export function generateSeededBracket(entries) {
  if (!Array.isArray(entries) || entries.length < 2) {
    throw new Error('At least 2 entries are required');
  }
  if (entries.length > MAX_PARTICIPANTS) {
    throw new Error(`Exceeds the ${MAX_PARTICIPANTS} player cap`);
  }
  const names = entries.map((e, i) => {
    const name = typeof e === 'string' ? e : e && e.name;
    if (!name || !String(name).trim()) throw new Error(`Entry ${i + 1} is missing a name`);
    return String(name).trim();
  });

  const padded = nextPowerOfTwo(names.length);
  const numRounds = Math.log2(padded);
  const seedOrder = getSeedOrder(padded);

  // Build the empty structure through the engine's own mutators, so any
  // invariants it enforces are respected.
  const state = buildEmptyRounds(numRounds, padded / 2);

  // Fill round 0. Slot objects are written directly (rather than through
  // setSlotName) so we can attach the seed; the shape matches what
  // setSlotName produces, plus the extra field.
  const firstRound = state.rounds[0];
  for (let m = 0; m < firstRound.length; m += 1) {
    const box = state.boxes[firstRound[m]];
    for (const [which, key] of [[0, 'slotA'], [1, 'slotB']]) {
      const seedIdx = seedOrder[m * 2 + which]; // 0-based seed
      if (seedIdx < names.length) {
        box[key] = {
          type: SLOT.NAMED,
          participantId: `p${seedIdx + 1}`,
          name: names[seedIdx],
          seed: seedIdx + 1,
        };
      } else {
        box[key] = { type: SLOT.BYE };
      }
    }
  }

  const { valid, errors } = validateForPublish(state);
  if (!valid) {
    const err = new Error('Generated bracket failed validation');
    err.errors = errors;
    throw err;
  }
  return state;
}

/* ------------------------------------------------------------------ *
 * Legacy converter: old matchups array -> engine state
 * ------------------------------------------------------------------ */

/**
 * Convert the legacy default-bracket shape — an array of rounds, each an
 * array of { entry1, entry2, winner } where winner is 1 | 2 and later-round
 * entries are positional copies — into engine state.
 *
 * Returns { state, nameMap } where nameMap is { pid: name } (the shape pools
 * carry). Winners are resolved positionally in round order using the
 * engine's own resolution, so propagated entry copies in later rounds are
 * ignored rather than trusted.
 */
export function convertLegacyMatchups(matchups) {
  if (!Array.isArray(matchups) || matchups.length === 0) {
    throw new Error('matchups must be a non-empty array of rounds');
  }

  let state = createBracket();
  matchups.forEach((round, r) => {
    round.forEach((_m, p) => {
      if (r === 0) state = addFirst(state);
      else if (p === 0) state = after(state, state.rounds[r - 1][0]);
      else state = beside(state, state.rounds[r][state.rounds[r].length - 1]);
    });
  });

  // Name round-0 slots. Participant ids follow seed when present, else
  // first-round position, and are stable for a given input.
  const nameMap = {};
  const pidFor = (entry, fallbackIdx) => {
    const n = entry.seed != null ? entry.seed : fallbackIdx + 1;
    return `p${n}`;
  };
  const firstRound = matchups[0];
  const round0Ids = state.rounds[0];
  firstRound.forEach((match, m) => {
    const box = state.boxes[round0Ids[m]];
    for (const [key, entry, idx] of [
      ['slotA', match.entry1, m * 2],
      ['slotB', match.entry2, m * 2 + 1],
    ]) {
      if (entry && entry.name != null) {
        const pid = pidFor(entry, idx);
        box[key] = {
          type: SLOT.NAMED,
          participantId: pid,
          name: entry.name,
          ...(entry.seed != null ? { seed: entry.seed } : {}),
        };
        nameMap[pid] = entry.name;
      } else {
        box[key] = { type: SLOT.BYE };
      }
    }
  });

  // Apply winners in round order so positional feeds resolve as we go.
  // winner: 1 -> the participant occupying slot A, 2 -> slot B.
  const loc = locate(state);
  matchups.forEach((round, r) => {
    round.forEach((match, p) => {
      if (match.winner !== 1 && match.winner !== 2) return;
      const boxId = state.rounds[r][p];
      const slot = match.winner === 1 ? 'A' : 'B';
      // Byes auto-advance; the engine rejects explicit results on bye boxes.
      const a = slotDisplay(state, loc, boxId, 'A').type;
      const b = slotDisplay(state, loc, boxId, 'B').type;
      if (a === SLOT.BYE || b === SLOT.BYE) return;
      const pid = resolveParticipant(state, loc, boxId, slot);
      if (pid == null) return; // upstream undecided or malformed doc; skip
      state.boxes[boxId].result = { winnerId: pid };
    });
  });

  return { state, nameMap };
}

/* ------------------------------------------------------------------ *
 * Pool structure
 * ------------------------------------------------------------------ */

/**
 * Pure equivalent of customBracketService.getCustomStructureForPool, for
 * when the engine state is already in hand (e.g. just generated). Produces
 * the { rounds, boxes, nameMap, seedMap, roundCount } snapshot pools store
 * in bracketMatchups.
 */
export function structureFromState(state) {
  const boxes = {};
  const nameMap = {};
  const seedMap = {};
  for (const id of Object.keys(state.boxes)) {
    const b = state.boxes[id];
    boxes[id] = { slotA: b.slotA, slotB: b.slotB };
    for (const k of ['slotA', 'slotB']) {
      const s = b[k];
      if (s.type === SLOT.NAMED) {
        nameMap[s.participantId] = s.name;
        if (s.seed != null) seedMap[s.participantId] = s.seed;
      }
    }
  }
  return {
    rounds: state.rounds.map((r) => [...r]),
    boxes,
    nameMap,
    seedMap,
    roundCount: state.rounds.length,
  };
}
