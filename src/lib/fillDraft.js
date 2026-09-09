// Apply a pick with the legacy bracket's existing propagation rules.
export function selectFillWinner(matchups, roundIndex, matchIndex, entryNum) {
  const newMatchups = matchups.map((round) => round.map((match) => ({ ...match })));
  const match = newMatchups[roundIndex][matchIndex];
  const selectedEntry = entryNum === 1 ? match.entry1 : match.entry2;

  if (!selectedEntry) return matchups;

  match.winner = entryNum;

  for (let r = roundIndex + 1; r < newMatchups.length; r++) {
    for (let m = 0; m < newMatchups[r].length; m++) {
      if (r === roundIndex + 1) {
        const entrySlot = matchIndex % 2 === 0 ? 'entry1' : 'entry2';
        newMatchups[r][Math.floor(matchIndex / 2)][entrySlot] = selectedEntry;
        newMatchups[r][Math.floor(matchIndex / 2)].winner = null;
      } else {
        newMatchups[r][m].entry1 = null;
        newMatchups[r][m].entry2 = null;
        newMatchups[r][m].winner = null;
      }
    }
  }

  for (let r = roundIndex + 1; r < newMatchups.length; r++) {
    for (let m = 0; m < newMatchups[r].length; m++) {
      const prevRound = newMatchups[r - 1];
      const match1 = prevRound[m * 2];
      const match2 = prevRound[m * 2 + 1];
      if (match1?.winner)
        newMatchups[r][m].entry1 = match1.winner === 1 ? match1.entry1 : match1.entry2;
      if (match2?.winner)
        newMatchups[r][m].entry2 = match2.winner === 1 ? match2.entry1 : match2.entry2;
    }
  }

  return newMatchups;
}

export function fillDraftKey(bracketId, userId) {
  return `im-tourn:fill:v1:${JSON.stringify([bracketId, userId || null])}`;
}

// Store choices only. Entrants are always reconstructed from the source bracket.
export function readFillDraft(key, source) {
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    if (
      !draft ||
      draft.source !== JSON.stringify(source) ||
      !Array.isArray(draft.picks) ||
      draft.picks.length !== source.length
    )
      return { matchups: source, restored: false };
    let matchups = source;
    for (let r = 0; r < source.length; r++) {
      const picks = draft.picks[r];
      if (!Array.isArray(picks) || picks.length !== source[r].length)
        throw new Error('Invalid draft');
      for (let m = 0; m < picks.length; m++) {
        const winner = picks[m];
        if (winner !== null && winner !== 1 && winner !== 2) throw new Error('Invalid pick');
        if (winner !== null) {
          if (!matchups[r][m][`entry${winner}`]) throw new Error('Missing entrant');
          matchups = selectFillWinner(matchups, r, m, winner);
        }
      }
    }
    return { matchups, restored: true };
  } catch {
    return { matchups: source, restored: false };
  }
}

export function saveFillDraft(key, source, matchups) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        source: JSON.stringify(source),
        picks: matchups.map((round) => round.map((match) => match.winner ?? null)),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearFillDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable. */
  }
}
