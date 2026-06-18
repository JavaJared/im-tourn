/**
 * customBracketCodec.js
 *
 * Pure translation between engine state and the Firestore document for the
 * positional model. Results and scores are split into their own top-level maps
 * so the published/locked freeze rule can allow them while freezing structure.
 *
 * Doc shape:
 *   rounds:   [{ ids: [boxId, ...] }, ...]    // structure (no nested arrays — Firestore-safe)
 *   boxes:    { [id]: { slotA, slotB } }     // stored editable slots
 *   results:  { [id]: winnerId }             // live play
 *   scores:   { [id]: { a, b } }             // live play
 *   participants: { [pid]: { name } }, participantCount, roundCount  // denormalized
 */
import { SLOT, locate, slotDisplay, countNamed } from './customBracket.js';

export const DOC_VERSION = 2;
const matchNumber = (id) => { const m = /^m(\d+)$/.exec(id); return m ? parseInt(m[1], 10) : 0; };

export function serialize(state) {
  const boxes = {}, results = {}, scores = {}, participants = {};
  const loc = locate(state);
  for (const id of Object.keys(state.boxes)) {
    const b = state.boxes[id];
    boxes[id] = { slotA: b.slotA, slotB: b.slotB };
    if (b.result && b.result.winnerId != null) results[id] = b.result.winnerId;
    if (b.score && b.score.a != null && b.score.b != null) scores[id] = { a: b.score.a, b: b.score.b };
    for (const slot of ['A', 'B']) {
      const d = slotDisplay(state, loc, id, slot);
      if (d.type === SLOT.NAMED) participants[d.participantId] = { name: d.name ?? '' };
    }
  }
  return {
    version: DOC_VERSION,
    rounds: state.rounds.map((r) => ({ ids: [...r] })),
    boxes, results, scores, participants,
    participantCount: countNamed(state),
    roundCount: state.rounds.length,
  };
}

export function deserialize(data) {
  const boxesIn = data.boxes || {}, results = data.results || {}, scores = data.scores || {};
  const boxes = {}; let maxId = 0;
  for (const id of Object.keys(boxesIn)) {
    const b = boxesIn[id];
    boxes[id] = {
      id, slotA: b.slotA, slotB: b.slotB,
      result: results[id] != null ? { winnerId: results[id] } : null,
      score: scores[id] ? { a: scores[id].a, b: scores[id].b } : null,
    };
    const n = matchNumber(id); if (n > maxId) maxId = n;
  }
  const rounds = (data.rounds || []).map((r) => (Array.isArray(r) ? [...r] : [...((r && r.ids) || [])]));
  return { rounds, boxes, _nextId: maxId + 1, _lastCreated: [] };
}
