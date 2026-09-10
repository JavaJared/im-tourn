import { expect, test } from 'vitest';
import { validateLegacyMatchups, validateStructure } from '../src/lib/recordValidation';
import { convertLegacyMatchups, structureFromState } from '../src/lib/standardBracket';
const rounds = [[{ entry1: { name: 'A', seed: 1 }, entry2: { name: 'B', seed: 2 }, winner: 1 }]];
test('valid legacy data remains usable through the unified structure adapter', () => {
  expect(validateLegacyMatchups(rounds)).toBe(rounds);
  const structure = structureFromState(convertLegacyMatchups(rounds).state);
  expect(validateStructure(structure)).toBe(structure);
});
test('malformed nested records are rejected before React or the engine uses them', () => {
  expect(() => validateLegacyMatchups([[{ entry1: { name: {} }, winner: null }]])).toThrow();
  expect(() => validateStructure({ rounds: [['missing']], boxes: {} })).toThrow();
  const structure = structureFromState(convertLegacyMatchups(rounds).state);
  structure.nameMap.p1 = { invalid: true };
  expect(() => validateStructure(structure)).toThrow();
});
