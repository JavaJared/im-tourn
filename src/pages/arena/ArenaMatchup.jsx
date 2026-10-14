import { Crown, Check } from 'lucide-react';
export default function ArenaMatchup({ room, vote, disabled, onVote }) {
  const total = room.matchup.reduce((sum, id) => sum + (room.votes[id] || 0), 0);
  return <div className="arena-matchup">{room.matchup.map((id, index) => {
    const count = room.votes[id] || 0, share = total ? Math.round(count / total * 100) : 0, selected = vote === id;
    return <button className={`arena-candidate${selected ? ' selected' : ''}`} key={id} disabled={disabled || !!vote} aria-pressed={selected} onClick={() => onVote(id)}>
      <span className="arena-contender-role">{room.defender === id && <Crown size={16} aria-hidden="true"/>}{room.defender === id ? 'GOAT Chair' : 'Challenger'}</span>
      <strong>{room.candidates.find(c => c.id === id)?.name || 'Unknown candidate'}</strong>
      <span className="arena-vote-action">{selected ? <><Check size={18} aria-hidden="true"/>Your vote</> : vote || disabled ? 'Results' : 'Vote for this contender'}</span>
      <span className="arena-result"><span>{count} votes</span><b>{share}%</b></span>
      <span className="arena-result-track" aria-hidden="true"><span style={{width:`${share}%`}}/></span>
      {index === 0 && room.matchup.length === 2 && <span className="arena-versus" aria-hidden="true">VS</span>}
    </button>;
  })}</div>;
}
