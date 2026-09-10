import { analyzeCustomPool } from '../lib/customElimination';

self.onmessage = ({ data }) => {
  try {
    const { structure, results, entries, roundPoints, pool } = data;
    self.postMessage({ analysis: analyzeCustomPool(structure, results, entries, roundPoints, { pool }) });
  } catch {
    self.postMessage({ error: 'Winning-path analysis is unavailable for this pool. Scores and predictions are still available.' });
  }
};
