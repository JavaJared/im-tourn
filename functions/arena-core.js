const DAY = 86400000;
const canonical = name => name.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const balance = (wallet, now) => wallet?.day === new Date(now).toISOString().slice(0, 10) ? wallet.balance : 10;
function settle(room, now, choose) {
  const next = structuredClone(room), round = room.round;
  const [a, b] = room.matchup, av = room.votes[a] || 0, bv = room.votes[b] || 0;
  const winner = av === bv ? a : av > bv ? a : b;
  const decisive = av !== bv;
  const history = { round, matchup: room.matchup, votes: room.votes, winner: av + bv ? winner : null, tied: av === bv && av > 0, endedAt: room.endAt };
  if (decisive) {
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
    const eligible = room.candidates.filter(c => c.id !== winner && round - (room.lastPlayed[c.id] ?? -99) >= 2);
    const most = Math.max(0, ...eligible.map(c => room.nominations[c.id] || 0));
    const leaders = eligible.filter(c => (room.nominations[c.id] || 0) === most);
    const challenger = most > 0 ? leaders[choose(leaders.length)] : eligible[0];
    next.matchup = challenger ? [winner, challenger.id] : [winner];
  }
  next.status = next.matchup.length === 2 ? 'active' : 'paused';
  next.pauseReason = next.status === 'paused' ? 'No eligible challenger. An administrator needs to add candidates or resume after the cooldown.' : '';
  next.endAt = next.status === 'active' ? now + DAY : null;
  for (const id of next.matchup) next.lastPlayed[id] = next.round;
  return { next, history };
}
module.exports = { DAY, canonical, balance, settle };
