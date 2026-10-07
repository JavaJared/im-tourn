const DAY = 86400000;
const canonical = name => name.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/[‘’]/g, "'").trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
function eligibilityReason(room, candidate, allowPending = false) {
  if (candidate.status === 'rejected') return 'This candidate was not approved.';
  if (candidate.status === 'pending' && !allowPending) return 'Awaiting review';
  if (room.matchup.includes(candidate.id)) return 'In the current matchup';
  if (room.lossEpoch?.[candidate.id] === (room.chairEpoch || 0)) return 'Eligible when the GOAT Chair changes hands';
  if (room.round - (room.lastPlayed[candidate.id] ?? -99) < 2) return 'Resting for two matchups';
  return '';
}
function restoreEligibility(history) {
  let defender = null, chairEpoch = 0;
  const lossEpoch = {};
  for (const h of history) {
    if (h.winner && !h.tied) {
      if (defender && defender !== h.winner) chairEpoch++;
      const loser = h.matchup.find(id => id !== h.winner);
      if (loser) lossEpoch[loser] = chairEpoch;
    }
    defender = h.winner || h.matchup[0];
  }
  return { chairEpoch, lossEpoch };
}
function settle(room, now, choose) {
  const next = structuredClone(room), round = room.round;
  const [a, b] = room.matchup, av = room.votes[a] || 0, bv = room.votes[b] || 0;
  const winner = av === bv ? a : av > bv ? a : b;
  const decisive = av !== bv;
  const history = { round, matchup: room.matchup, votes: room.votes, winner: av + bv ? winner : null, tied: av === bv && av > 0, endedAt: room.endAt };
  next.chairEpoch = room.chairEpoch || 0;
  next.lossEpoch = { ...room.lossEpoch };
  if (decisive) {
    if (room.defender && room.defender !== winner) next.chairEpoch++;
    next.lossEpoch[winner === a ? b : a] = next.chairEpoch;
    const stats = next.stats[winner] || { wins: 0, streak: 0, longest: 0 };
    stats.wins++; stats.streak = room.defender === winner ? stats.streak + 1 : 1;
    stats.longest = Math.max(stats.longest, stats.streak); next.stats[winner] = stats;
    for (const id of Object.keys(next.stats)) if (id !== winner) next.stats[id].streak = 0;
  }
  next.defender = winner;
  next.round++;
  next.votes = {}; next.nominations = {};
  // No participation means a fresh day for the same pair, never a phantom chair win.
  if (!av && !bv) next.matchup = room.matchup;
  else {
    const eligible = room.candidates.filter(c => !eligibilityReason({ ...next, round, matchup: room.matchup }, c));
    const most = Math.max(0, ...eligible.map(c => room.nominations[c.id] || 0));
    const leaders = eligible.filter(c => (room.nominations[c.id] || 0) === most);
    const challenger = most > 0 ? leaders[choose(leaders.length)] : eligible[0];
    next.matchup = challenger ? [winner, challenger.id] : [winner];
  }
  next.status = next.matchup.length === 2 ? 'active' : 'paused';
  next.pauseReason = next.status === 'paused' ? 'No eligible challenger. An administrator needs to add or approve a new challenger.' : '';
  next.endAt = next.status === 'active' ? now + DAY : null;
  for (const id of next.matchup) next.lastPlayed[id] = next.round;
  return { next, history };
}
module.exports = { DAY, canonical, settle, eligibilityReason, restoreEligibility };
