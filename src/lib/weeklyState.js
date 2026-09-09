import { timestampMillis } from './poolLifecycle';
import { deserialize } from './customBracketCodec';

export function weekKey(data) {
  return data?.weekId || `legacy-${timestampMillis(data?.startDate) || 0}`;
}
export function dateKeyET(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function weeklyVotingOpen(data, now = new Date()) {
  if (!data) return false;
  const round = data.currentRound || 0;
  const matches = data.matchups?.[round];
  if (!matches?.length || matches.some(m => m.winner || !m.entry1 || !m.entry2)) return false;
  const start = timestampMillis(data.startDate);
  if (!Number.isFinite(start)) return false;
  // startDate encodes the Monday calendar date at UTC midnight.
  const day = new Date(start).toISOString().slice(0, 10);
  const end = new Date(`${day}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + round + 1);
  const today = dateKeyET(now);
  return today >= day && today < end.toISOString().slice(0, 10);
}
export function standardWeeklyMatchups(data) {
  if (data.type !== 'standard' || ![32, 64].includes(data.participantCount) || data.status !== 'published') return null;
  const state = deserialize(data);
  if (state.rounds.length !== Math.log2(data.participantCount)) return null;
  const rounds = state.rounds.map((ids, r) => ids.map(id => {
    const box = state.boxes[id];
    const entry = slot => slot?.type === 'named' ? { name: slot.name, seed: Number(String(slot.participantId).replace(/^p/, '')) || null } : null;
    return { entry1: r ? null : entry(box.slotA), entry2: r ? null : entry(box.slotB) };
  }));
  return rounds[0].every(m => m.entry1 && m.entry2) ? rounds : null;
}
