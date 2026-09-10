const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateLegacyMatchups(value) {
  const entry = e => e == null || (object(e) && typeof e.name === 'string' && (e.seed == null || typeof e.seed === 'string' || Number.isFinite(e.seed)));
  if (!Array.isArray(value) || !value.length || !value.every(round => Array.isArray(round) && round.every(match => object(match) && entry(match.entry1) && entry(match.entry2) && [null, undefined, 1, 2].includes(match.winner)))) throw Error('This bracket contains damaged matchup data.');
  return value;
}
export function validateStructure(value) {
  if (!object(value) || !Array.isArray(value.rounds) || !object(value.boxes)) throw Error('This bracket contains damaged structure data.');
  const ids = value.rounds.flat();
  if (!value.rounds.every(Array.isArray) || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !Object.hasOwn(value.boxes, id)) || Object.keys(value.boxes).some(id => !ids.includes(id))) throw Error('This bracket contains damaged rounds.');
  for (const box of Object.values(value.boxes)) {
    if (!object(box)) throw Error('This bracket contains a damaged matchup.');
    for (const slot of [box.slotA, box.slotB]) if (!object(slot) || !['open','named','bye','feed'].includes(slot.type) || (slot.name != null && typeof slot.name !== 'string')) throw Error('This bracket contains a damaged participant.');
  }
  if (value.nameMap && (!object(value.nameMap) || Object.values(value.nameMap).some(name => typeof name !== 'string'))) throw Error('This bracket contains damaged participant names.');
  return value;
}
