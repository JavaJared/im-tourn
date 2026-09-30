// Builder-only guidance: never mutates participants, results, or bracket structure.
export function builderSeedNumbers(state) {
  if (!state?.rounds?.length) return {};
  const entries = [], seen = new Set();
  const visit = (r, p, seed, depth) => {
    const id = state.rounds[r]?.[p];
    if (!id || seen.has(id) || !state.boxes[id]) return;
    seen.add(id);
    for (const [which, slot] of [[0, 'A'], [1, 'B']]) {
      const rank = which === 0 ? seed : 2 ** (depth + 1) + 1 - seed;
      if (r > 0 && state.rounds[r - 1]?.[2 * p + which]) {
        visit(r - 1, 2 * p + which, rank, depth + 1);
      } else {
        const value = state.boxes[id]['slot' + slot];
        if (value?.type === 'open' || value?.type === 'named') {
          entries.push({ key: id + ':' + slot, rank, seed: value.seed });
        }
      }
    }
  };
  // Start at the final, then include any disconnected custom matchups.
  for (let r = state.rounds.length - 1; r >= 0; r--) {
    state.rounds[r].forEach((_, p) => visit(r, p, 1, 0));
  }
  const stored = entries.map(entry => entry.seed);
  const hasSeeds = stored.length > 0 && stored.every(seed => Number.isInteger(seed) && seed > 0)
    && new Set(stored).size === stored.length;
  if (!hasSeeds) entries.sort((a, b) => a.rank - b.rank);
  return Object.fromEntries(entries.map((entry, i) => [entry.key, hasSeeds ? entry.seed : i + 1]));
}
