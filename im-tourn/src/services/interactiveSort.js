// src/services/interactiveSort.js
//
// Interactive merge sort driven by user head-to-head comparisons.
//
// Why merge sort?
//   - Best guaranteed comparison count for general comparison sorts: O(n log n)
//   - Deterministic — we can show a reliable progress bar
//   - State is simple to serialize, so users can save progress and resume
//
// For n=32 entries, worst case is ~120 comparisons; typical is ~100.
// For n=25 entries, worst case is ~88.
// For n=16 entries, worst case is ~49.
//
// The state is a plain object — no classes, no mutation of inputs. Every
// operation returns a new state object, which makes persistence and React
// state updates straightforward.

/**
 * Initialize the sort state for a list of entry IDs.
 * @param {string[]} entryIds - IDs of the entries to be ranked.
 * @returns {object} The initial sort state.
 */
export function initSort(entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length < 2) {
    throw new Error('Need at least 2 entries to sort');
  }

  // Shuffle the initial order so that the first few comparisons aren't
  // biased by how the creator listed the entries. (Merge sort is stable,
  // so a biased input order would make "ties" resolve in creator-order.)
  const shuffled = [...entryIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Each entry starts as its own "run" of length 1.
  const runs = shuffled.map(id => [id]);

  const state = {
    runs,
    currentMerge: null,
    comparisonsMade: 0,
    estimatedTotal: estimateComparisons(entryIds.length),
    history: [], // for undo
    finalRanking: null,
  };

  return advanceToNextMerge(state);
}

/**
 * Estimate the worst-case number of comparisons for merge sort on n items.
 * This is used for the progress bar.
 */
export function estimateComparisons(n) {
  if (n <= 1) return 0;
  // Worst case for merge sort: n * ceil(log2(n)) - 2^ceil(log2(n)) + 1
  // This is a known formula; for practical purposes we use a slight
  // overestimate so the progress bar never exceeds 100%.
  const logN = Math.ceil(Math.log2(n));
  return n * logN - Math.pow(2, logN) + 1;
}

/**
 * If there's no current merge in progress, pick the next two runs to merge.
 * If only one run remains, the sort is complete.
 */
function advanceToNextMerge(state) {
  if (state.currentMerge) return state;

  if (state.runs.length === 1) {
    // Done! The single remaining run is the final ranking.
    return {
      ...state,
      finalRanking: [...state.runs[0]],
      currentMerge: null,
    };
  }

  if (state.runs.length < 2) {
    // Edge case: zero runs somehow (shouldn't happen with valid input).
    return state;
  }

  // Take the first two runs and start merging them.
  const [left, right, ...restRuns] = state.runs;
  return {
    ...state,
    runs: restRuns,
    currentMerge: {
      left,
      right,
      leftIdx: 0,
      rightIdx: 0,
      merged: [],
    },
  };
}

/**
 * Get the current matchup (the two entry IDs the user should choose between).
 * Returns null if sorting is complete.
 */
export function getCurrentMatchup(state) {
  if (state.finalRanking) return null;
  if (!state.currentMerge) return null;

  const { left, right, leftIdx, rightIdx } = state.currentMerge;
  if (leftIdx >= left.length || rightIdx >= right.length) return null;

  return {
    a: left[leftIdx],
    b: right[rightIdx],
  };
}

/**
 * Record the user's choice: which entry (a or b) they preferred.
 * Returns the new state.
 *
 * @param {object} state - current sort state
 * @param {'a'|'b'} choice - 'a' means left[leftIdx] was preferred
 */
export function recordChoice(state, choice) {
  if (state.finalRanking) return state; // already done
  if (!state.currentMerge) return state;

  const { left, right, leftIdx, rightIdx, merged } = state.currentMerge;

  // Push the winner onto the merged array and advance its pointer.
  let newMerged;
  let newLeftIdx = leftIdx;
  let newRightIdx = rightIdx;

  if (choice === 'a') {
    newMerged = [...merged, left[leftIdx]];
    newLeftIdx = leftIdx + 1;
  } else if (choice === 'b') {
    newMerged = [...merged, right[rightIdx]];
    newRightIdx = rightIdx + 1;
  } else {
    throw new Error(`Invalid choice: ${choice}`);
  }

  // Save this step in history so we can undo.
  const historyEntry = {
    currentMerge: state.currentMerge,
    runs: state.runs,
  };

  let newState = {
    ...state,
    comparisonsMade: state.comparisonsMade + 1,
    history: [...state.history, historyEntry],
    currentMerge: {
      left,
      right,
      leftIdx: newLeftIdx,
      rightIdx: newRightIdx,
      merged: newMerged,
    },
  };

  // Check if one side is exhausted. If so, drain the other side
  // (no more comparisons needed — those items are all "worse" than
  // everything already in merged, or rather, they come after in the
  // stable order because the other run won every remaining comparison).
  //
  // Wait — that's not right. If left runs out, the remaining right
  // items are appended because they are already in their own sorted
  // order relative to each other, and they lost no comparisons, so
  // they come AFTER everything in merged. Let me re-check...
  //
  // Actually: merged contains the items picked so far in sorted order.
  // If leftIdx reaches left.length, it means left is done contributing.
  // The remaining right items (from rightIdx onward) should be appended
  // to merged in their existing order, because right is already sorted
  // relative to itself. Same if right runs out. This is standard merge.
  const cm = newState.currentMerge;
  if (cm.leftIdx >= cm.left.length) {
    // Drain remaining right
    const drained = [...cm.merged, ...cm.right.slice(cm.rightIdx)];
    newState = finishCurrentMerge(newState, drained);
  } else if (cm.rightIdx >= cm.right.length) {
    // Drain remaining left
    const drained = [...cm.merged, ...cm.left.slice(cm.leftIdx)];
    newState = finishCurrentMerge(newState, drained);
  }

  return advanceToNextMerge(newState);
}

/**
 * When a merge finishes, push the merged run to the END of the runs queue
 * (so we complete all merges at the current "level" before moving up a level,
 * which is what gives merge sort its O(n log n) guarantee).
 */
function finishCurrentMerge(state, mergedRun) {
  return {
    ...state,
    runs: [...state.runs, mergedRun],
    currentMerge: null,
  };
}

/**
 * Undo the last choice. Returns the new state, or the same state if there's
 * nothing to undo.
 */
export function undoLastChoice(state) {
  if (state.history.length === 0) return state;
  if (state.finalRanking) {
    // Can't undo past completion in this simple implementation.
    // (We would need to also clear finalRanking and restore runs.)
    // For now, block undo after completion.
    return state;
  }

  const newHistory = [...state.history];
  const lastEntry = newHistory.pop();

  return {
    ...state,
    comparisonsMade: Math.max(0, state.comparisonsMade - 1),
    history: newHistory,
    currentMerge: lastEntry.currentMerge,
    runs: lastEntry.runs,
  };
}

/**
 * Serialize state for localStorage persistence.
 * (The state is already a plain object, so JSON is fine. We just drop
 * the history to save space — undo is session-only.)
 */
export function serializeState(state) {
  return JSON.stringify({
    runs: state.runs,
    currentMerge: state.currentMerge,
    comparisonsMade: state.comparisonsMade,
    estimatedTotal: state.estimatedTotal,
    finalRanking: state.finalRanking,
  });
}

/**
 * Deserialize state from localStorage.
 */
export function deserializeState(str) {
  try {
    const parsed = JSON.parse(str);
    return {
      ...parsed,
      history: [], // history is session-only
    };
  } catch {
    return null;
  }
}

/**
 * Progress as a number between 0 and 1.
 */
export function getProgress(state) {
  if (state.finalRanking) return 1;
  if (state.estimatedTotal === 0) return 1;
  return Math.min(1, state.comparisonsMade / state.estimatedTotal);
}

/**
 * Is the sort complete?
 */
export function isComplete(state) {
  return state.finalRanking !== null;
}

// ============ CONSENSUS AGGREGATION ============
//
// Given a list of user rankings (each ranking is an array of entry IDs in
// order from best to worst), compute a consensus ranking using Borda count.
//
// Borda count: for a ranking of n items, the item in position i (0-indexed)
// gets (n - 1 - i) points. Sum across all voters; sort by total descending.
//
// This is simple, well-understood, Condorcet-compatible in most cases, and
// handles the situation where different voters have the same items but in
// different orders. It does NOT handle the case where different voters have
// DIFFERENT items — but in our feature, all voters rank the same fixed set
// from the pool, so that's fine.

/**
 * @param {string[][]} rankings - array of user rankings
 * @returns {Array<{id: string, score: number}>} - sorted consensus (best first)
 */
export function computeConsensus(rankings) {
  if (!rankings || rankings.length === 0) return [];

  const scores = new Map();

  for (const ranking of rankings) {
    const n = ranking.length;
    for (let i = 0; i < n; i++) {
      const id = ranking[i];
      const points = n - 1 - i;
      scores.set(id, (scores.get(id) || 0) + points);
    }
  }

  const result = Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);

  return result;
}
