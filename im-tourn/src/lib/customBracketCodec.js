/**
 * customBracketCodec.js
 *
 * Pure (Firebase-free) translation between the engine `state` and the
 * persisted Firestore document. Kept separate from the service so the
 * doc-shape logic is unit-testable without touching Firebase.
 *
 * Doc shape:
 *   matches:  { [id]: { slotA, slotB, feedsInto } }   // structure only
 *   results:  { [id]: winnerId }                        // live play
 *   scores:   { [id]: { a, b } }                        // live play
 *   participants: { [pid]: { name } }                   // denormalized
 *   rootMatchId, participantCount                       // denormalized
 *
 * `tier` and `_nextMatchId` are intentionally NOT persisted: tiers are
 * recomputed on read (they go stale the instant the structure changes),
 * and the id counter is re-derived from the existing ids on load.
 */

export const DOC_VERSION = 1;

const matchNumber = (id) => {
  const m = /^m(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : 0;
};

/** Engine state -> plain object ready to merge into the Firestore document. */
export function serialize(state) {
  const matches = {};
  const results = {};
  const scores = {};
  const participants = {};
  let namedSlots = 0;

  for (const id of Object.keys(state.matches)) {
    const m = state.matches[id];
    matches[id] = {
      slotA: m.slotA,
      slotB: m.slotB,
      feedsInto: m.feedsInto ?? null,
    };
    if (m.result && m.result.winnerId != null) {
      results[id] = m.result.winnerId;
    }
    if (m.score && m.score.a != null && m.score.b != null) {
      scores[id] = { a: m.score.a, b: m.score.b };
    }
    for (const key of ['slotA', 'slotB']) {
      const s = m[key];
      if (s.type === 'named') {
        participants[s.participantId] = { name: s.name ?? '' };
        namedSlots += 1;
      }
    }
  }

  return {
    version: DOC_VERSION,
    matches,
    results,
    scores,
    participants,
    rootMatchId: state.rootId ?? null,
    participantCount: namedSlots,
  };
}

/** Firestore document data -> engine state. */
export function deserialize(data) {
  const matchesIn = data.matches || {};
  const results = data.results || {};
  const scores = data.scores || {};
  const matches = {};
  let maxId = 0;

  for (const id of Object.keys(matchesIn)) {
    const m = matchesIn[id];
    matches[id] = {
      id,
      slotA: m.slotA,
      slotB: m.slotB,
      feedsInto: m.feedsInto ?? null,
      result: results[id] != null ? { winnerId: results[id] } : null,
      score: scores[id] ? { a: scores[id].a, b: scores[id].b } : null,
    };
    const n = matchNumber(id);
    if (n > maxId) maxId = n;
  }

  let rootId = data.rootMatchId ?? null;
  if (rootId == null) {
    for (const id of Object.keys(matches)) {
      if (matches[id].feedsInto === null) {
        rootId = id;
        break;
      }
    }
  }

  return {
    matches,
    rootId,
    _nextMatchId: maxId + 1,
    _lastCreated: [],
  };
}
