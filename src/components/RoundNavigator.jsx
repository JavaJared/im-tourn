import { useEffect, useRef, useState } from 'react';
import './roundNavigator.css';

export function nextUnanswered(rounds, after) {
  const matches = rounds.flatMap((round, r) => round.map(match => ({ ...match, round: r })));
  const start = matches.findIndex(match => match.id === after);
  for (let step = 1; step <= matches.length; step++) {
    const match = matches[(start + step) % matches.length];
    if (match.ready && !match.answered) return match;
  }
  return null;
}

// Presentation only: callers retain selection, scoring and save logic.
export default function RoundNavigator({ rounds, children, editable = true, label = r => 'Round ' + (r + 1) }) {
  const [round, setRound] = useState(0);
  const [overview, setOverview] = useState(false);
  const [target, setTarget] = useState(null);
  const [jumpCount, setJumpCount] = useState(0);
  const root = useRef(null);
  const activeRound = Math.min(round, Math.max(0, rounds.length - 1));
  const next = nextUnanswered(rounds, target);
  const remaining = rounds.flat().filter(match => !match.answered).length;
  const jump = () => { if (next) { setRound(next.round); setOverview(false); setTarget(next.id); setJumpCount(value => value + 1); } };
  useEffect(() => {
    if (!target) return;
    const card = [...(root.current?.querySelectorAll('[data-mobile-match]') || [])].find(el => el.dataset.mobileMatch === target);
    card?.focus();
    card?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }, [target, jumpCount]);
  return <section ref={root} className={'round-navigator ' + (overview ? 'round-overview' : 'round-cards')}>
    <div className="round-navigation" aria-label="Bracket round navigation">
      <div className="round-navigation-buttons">
        <label>Round <select aria-label="Choose round" value={activeRound} onChange={e => { setRound(Number(e.target.value)); setOverview(false); }}>{rounds.map((_, r) => <option key={r} value={r}>{label(r)}</option>)}</select></label>
        {editable && <button className="round-next-unanswered" type="button" disabled={!next} onClick={jump}>Next unanswered</button>}
      </div>
      <button className="round-mode-toggle" type="button" aria-pressed={overview} onClick={() => setOverview(value => !value)}>{overview ? 'Matchup cards' : 'Full bracket overview'}</button>
      <p aria-live="polite">{label(activeRound)} · {rounds[activeRound]?.filter(match => match.answered).length || 0} of {rounds[activeRound]?.length || 0} decided{editable && (remaining === 0 ? ' · All matchups answered' : !next ? ' · Waiting for earlier matchups' : '')}</p>
    </div>
    {children({
      roundProps: r => ({ 'data-mobile-round': true, 'data-active-round': r === activeRound }),
      matchProps: id => ({ 'data-mobile-match': id, tabIndex: -1 }),
    })}
  </section>;
}

export const legacyRounds = matchups => matchups.map((round, r) => round.map((match, m) => ({
  id: r + '-' + m, ready: !!match.entry1 && !!match.entry2, answered: match.winner === 1 || match.winner === 2,
})));
