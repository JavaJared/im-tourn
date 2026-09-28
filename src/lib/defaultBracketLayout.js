import { generateSeededBracket } from './standardBracket';
import { MAX_PARTICIPANTS, SLOT } from './customBracket';

// Reuse the seeded generator's balanced topology and bye placement, leaving
// real participant slots empty so placeholder names cannot be published.
export function generateDefaultBracketLayout(count) {
  if (!Number.isInteger(count) || count < 2 || count > MAX_PARTICIPANTS) {
    throw new Error(`Choose a whole number from 2 to ${MAX_PARTICIPANTS}.`);
  }
  const state = generateSeededBracket(Array.from({ length: count }, (_, i) => `Entry ${i + 1}`));
  for (const id of state.rounds[0]) {
    for (const key of ['slotA', 'slotB']) {
      if (state.boxes[id][key].type === SLOT.NAMED) state.boxes[id][key] = { type: SLOT.OPEN };
    }
  }
  return state;
}
