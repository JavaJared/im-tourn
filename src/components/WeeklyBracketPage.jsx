import { weeklyVotingOpen, weekKey } from '../lib/weeklyState';
// src/components/WeeklyBracketPage.jsx
//
// Revamped Weekly Bracket experience.
//
//   VOTING  — one matchup at a time as a full-width VS card (Rankings-style).
//             After each pick, a cinematic transition plays: the card flies
//             down into its slot on the bracket map, a pulse travels along
//             the bracket to the next matchup, and that box zooms up into
//             the next card. After the last pick: review on the bracket map,
//             tap any box to change a pick, then one Submit (same one-shot
//             vote model as before; the tallyWeeklyVote cloud function folds
//             the vote doc into the shared tallies server-side).
//
//   RESULTS — the same card layout, browsable with arrows/dots, now showing
//             vote percentages, plus a full-bracket toggle. Tapping a box on
//             the full bracket jumps to that matchup's card.
//
// Self-contained: no dependence on the old weekly CSS. Styles live in
// weekly-vote.css. Animations are pure CSS transforms/transitions and are
// skipped entirely for prefers-reduced-motion users.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeWeeklyBracket,
  submitWeeklyVote,
  hasUserVotedForRound,
  getUserVotesForRound,
} from '../services/bracketService';

// Transition phase durations (ms). One knob for tests and tuning.
const PHASE_MS = { out: 120, travel: 140, in: 120 };

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Bracket geometry (shared by the mini-map and the fly-to-slot animation)
// ---------------------------------------------------------------------------
const DIMS = {
  compact: { COL_W: 150, BOX_W: 112, BOX_H: 26, ROW_H: 36 },
  expanded: { COL_W: 196, BOX_W: 172, BOX_H: 48, ROW_H: 60 },
};

function bracketGeometry(matchups, dims = DIMS.compact) {
  const rounds = matchups.length;
  const rows = Math.max(...matchups.map((r) => r.length));
  const width = rounds * dims.COL_W;
  const height = rows * dims.ROW_H;
  const center = (r, m) => ({
    x: r * dims.COL_W + (dims.COL_W - dims.BOX_W) / 2 + dims.BOX_W / 2,
    y: (m + 0.5) * (height / matchups[r].length),
  });
  return { rounds, width, height, center, dims };
}

/** Smooth travel path between two matchup boxes, riding the connector lane. */
function travelPath(geo, r1, m1, r2, m2) {
  const { BOX_W, COL_W } = geo.dims;
  const a = geo.center(r1, m1), b = geo.center(r2, m2);
  const ax = a.x + BOX_W / 2, bx = b.x + BOX_W / 2;
  const lane = Math.max(ax, bx) + (COL_W - BOX_W) / 2.5;
  return `M ${ax} ${a.y} C ${lane} ${a.y} ${lane} ${a.y} ${lane} ${(a.y + b.y) / 2} S ${lane} ${b.y} ${bx} ${b.y}`;
}

// ---------------------------------------------------------------------------
// Bracket map — compact (voting mini-map) or expanded (full results bracket
// with both entries and their vote percentages in every matchup)
// ---------------------------------------------------------------------------
function BracketMap({ matchups, votes, activeRound, userVotes, currentIdx, pulse, onTapBox, expanded }) {
  const dims = expanded ? DIMS.expanded : DIMS.compact;
  const geo = useMemo(() => bracketGeometry(matchups, dims), [matchups, dims]);
  const { BOX_W, BOX_H } = dims;
  const trunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

  // Percentages for a matchup, from the shared tallies (null when no votes / hidden).
  const pctFor = (r, m) => {
    const t = votes?.[`r${r}-m${m}`];
    if (!t) return null;
    const total = (t.entry1 || 0) + (t.entry2 || 0);
    if (total === 0) return null;
    return { p1: Math.round(((t.entry1 || 0) / total) * 100), p2: Math.round(((t.entry2 || 0) / total) * 100) };
  };

  return (
    <svg
      className={`wv-map ${expanded ? 'wv-map-expanded' : ''}`}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* connectors */}
      {matchups.map((round, r) => (r < matchups.length - 1
        ? round.map((_, m) => {
          const a = geo.center(r, m), b = geo.center(r + 1, Math.floor(m / 2));
          const x1 = a.x + BOX_W / 2, x2 = b.x - BOX_W / 2, mid = (x1 + x2) / 2;
          return (
            <path key={`c${r}-${m}`}
              d={`M ${x1} ${a.y} C ${mid} ${a.y} ${mid} ${b.y} ${x2} ${b.y}`}
              className="wv-map-connector" />
          );
        })
        : null))}
      {/* travel pulse */}
      {pulse && (
        <path d={travelPath(geo, pulse.r1, pulse.m1, pulse.r2, pulse.m2)}
          pathLength="1" className="wv-map-pulse" />
      )}
      {/* boxes */}
      {matchups.map((round, r) => round.map((match, m) => {
        const c = geo.center(r, m);
        const left = c.x - BOX_W / 2, top = c.y - BOX_H / 2;
        const isActive = r === activeRound && m === currentIdx;
        const pickedSide = r === activeRound ? userVotes?.[`r${r}-m${m}`] : null;
        const decided = !!match.winner;
        const tappable = onTapBox && r === activeRound;
        const cls = [
          'wv-map-box', decided ? 'decided' : '', pickedSide ? 'picked' : '',
          isActive ? 'active' : '', tappable ? 'tappable' : '',
        ].filter(Boolean).join(' ');

        if (!expanded) {
          return (
            <g role={tappable ? "button" : undefined} tabIndex={tappable ? 0 : undefined} aria-label={`Round ${r + 1}, matchup ${m + 1}`} onKeyDown={e => { if (tappable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onTapBox(m); } }} key={`b${r}-${m}`} onClick={tappable ? () => onTapBox(m) : undefined}>
              <rect x={left} y={top} width={BOX_W} height={BOX_H} rx="5" className={cls} />
              {match.entry1 && match.entry2 && (
                <text x={c.x} y={c.y + 3.5} textAnchor="middle" className={`wv-map-label ${isActive ? 'active' : ''}`}>
                  {match.entry1.seed} v {match.entry2.seed}
                </text>
              )}
            </g>
          );
        }

        // ---- expanded: two entry rows with percentage fills ----
        const pcts = pctFor(r, m);
        const rowH = BOX_H / 2;
        const row = (entry, side, y) => {
          const isWin = match.winner === side, isLoss = decided && !isWin;
          const p = pcts ? (side === 1 ? pcts.p1 : pcts.p2) : null;
          return (
            <g key={side}>
              {p != null && p > 0 && (
                <rect x={left} y={y} width={(BOX_W * p) / 100} height={rowH} className={`wv-map-fill ${isWin ? 'win' : ''}`} />
              )}
              {pickedSide === side && (
                <rect x={left + 1} y={y + 2} width="3" height={rowH - 4} rx="1.5" className="wv-map-pickbar" />
              )}
              {entry ? (
                <>
                  <text x={left + 9} y={y + rowH / 2 + 3.5} className="wv-map-seedtxt">{entry.seed}</text>
                  <text x={left + 28} y={y + rowH / 2 + 3.5}
                    className={`wv-map-entry ${isWin ? 'win' : ''} ${isLoss ? 'loss' : ''}`}>
                    {trunc(entry.name, p != null ? 13 : 17)}
                  </text>
                </>
              ) : (
                <text x={left + 9} y={y + rowH / 2 + 3.5} className="wv-map-entry loss">TBD</text>
              )}
              {p != null && (
                <text x={left + BOX_W - 6} y={y + rowH / 2 + 3.5} textAnchor="end"
                  className={`wv-map-pct ${isWin ? 'win' : ''}`}>
                  {p}%
                </text>
              )}
            </g>
          );
        };
        return (
          <g role={tappable ? "button" : undefined} tabIndex={tappable ? 0 : undefined} aria-label={`Round ${r + 1}, matchup ${m + 1}`} onKeyDown={e => { if (tappable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onTapBox(m); } }} key={`b${r}-${m}`} onClick={tappable ? () => onTapBox(m) : undefined}>
            <rect x={left} y={top} width={BOX_W} height={BOX_H} rx="7" className={cls} />
            {row(match.entry1, 1, top)}
            <line x1={left + 4} x2={left + BOX_W - 4} y1={c.y} y2={c.y} className="wv-map-divider" />
            {row(match.entry2, 2, top + rowH)}
          </g>
        );
      }))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The big VS card
// ---------------------------------------------------------------------------
function VsCard({ match, matchId, votes, picked, showResults, onPick, disabled }) {
  const tally = showResults && votes ? votes[matchId] : null;
  const total = tally ? (tally.entry1 || 0) + (tally.entry2 || 0) : 0;
  const pct = (side) => (total === 0 ? 50 : Math.round(((side === 1 ? tally.entry1 : tally.entry2) / total) * 100));
  const winnerSide = match.winner || null;

  const panel = (entry, side) => {
    if (!entry) return <div className="wv-panel pending">TBD</div>;
    const isPick = picked === side;
    const isWin = winnerSide === side, isLoss = winnerSide != null && !isWin;
    const cls = ['wv-panel', isPick ? 'my-pick' : '', isWin ? 'winner' : '', isLoss ? 'loser' : '', onPick && !disabled ? 'pickable' : ''].filter(Boolean).join(' ');
    const count = tally ? ((side === 1 ? tally.entry1 : tally.entry2) || 0) : 0;
    return (
      <button type="button" className={cls} disabled={disabled || !onPick} onClick={onPick ? () => onPick(side) : undefined}>
        {showResults && tally && <span className="wv-pct-bar" style={{ width: `${pct(side)}%` }} />}
        <span className="wv-seed">{entry.seed}</span>
        <span className="wv-name">{entry.name}</span>
        {isPick && <span className="wv-your-pick">Your pick</span>}
        {isWin && <span className="wv-won">Winner</span>}
        {showResults && tally && (
          <span className="wv-pct-label">{pct(side)}% · {count} vote{count === 1 ? '' : 's'}</span>
        )}
      </button>
    );
  };

  return (
    <div className="wv-card">
      {panel(match.entry1, 1)}
      <div className="wv-vs">VS</div>
      {panel(match.entry2, 2)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const WeeklyBracketPage = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bracket, setBracket] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [userVotes, setUserVotes] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // flow: 'vote' | 'review' | 'results'
  const [flow, setFlow] = useState('results');
  // transition phase while voting: 'card' | 'out' | 'travel' | 'in'
  const [phase, setPhase] = useState('card');
  const [idx, setIdx] = useState(0);
  const [pulse, setPulse] = useState(null);
  const [resultsIdx, setResultsIdx] = useState(0);
  const [showFullBracket, setShowFullBracket] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const timers = useRef([]);

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const [loadError, setLoadError] = useState(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => subscribeWeeklyBracket(data => { setBracket(data); setLoading(false); setLoadError(null); }, e => { setLoadError(e.message); setLoading(false); }), []);
  const identity = `${weekKey(bracket)}:${bracket?.currentRound || 0}:${currentUser?.uid || 'anon'}`;
  const draftKey = `weekly-draft:${identity}`;
  useEffect(() => {
    let active = true;
    timers.current.forEach(clearTimeout); timers.current = [];
    setHasVoted(false); setUserVotes({}); setIdx(0); setResultsIdx(0); setPhase('card'); setPulse(null); setReturnToReview(false); setFlow('results');
    if (!bracket) return;
    const load = async () => {
      try {
        const votes = currentUser ? await getUserVotesForRound(currentUser.uid, bracket.currentRound || 0, bracket) : null;
        if (!active) return;
        let draft = {};
        try { draft = JSON.parse(localStorage.getItem(draftKey)) || {}; } catch {}
        setHasVoted(!!votes); setUserVotes(votes || draft);
        setFlow(votes || !weeklyVotingOpen(bracket) ? 'results' : 'vote');
      } catch (e) { if (active) setLoadError(e.message); }
    };
    load();
    return () => { active = false; };
  }, [identity]);
  const votingOpen = weeklyVotingOpen(bracket, now);
  useEffect(() => { if (!votingOpen) setFlow('results'); }, [votingOpen]);

  const activeRound = bracket?.currentRound ?? 0;
  const matchups = bracket?.matchups?.[activeRound] || [];
  const finalRound = (bracket?.matchups?.length || 1) - 1;
  const finalMatch = bracket?.matchups?.[finalRound]?.[0];
  const champion = finalMatch?.winner ? (finalMatch.winner === 1 ? finalMatch.entry1 : finalMatch.entry2) : null;
  const geo = useMemo(() => (bracket?.matchups ? bracketGeometry(bracket.matchups) : null), [bracket]);

  // Where a matchup's box sits on the map, as fractions of the stage (for the fly-to-slot).
  const slotFraction = useCallback((m) => {
    if (!geo) return { x: 0.5, y: 0.5 };
    const c = geo.center(activeRound, m);
    return { x: c.x / geo.width, y: c.y / geo.height };
  }, [geo, activeRound]);

  const roundName = (r) => {
    const names = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final 4', 'Championship'];
    const total = bracket?.matchups?.length || 5;
    return names[r + (total === 5 ? 1 : 0)] || `Round ${r + 1}`;
  };

  // ---- voting flow -------------------------------------------------------
  const handlePick = (side) => {
    if (!currentUser) { alert('Please log in to vote'); return; }
    if (phase !== 'card' || hasVoted || !votingOpen || submitting) return;
    const next = { ...userVotes, [`r${activeRound}-m${idx}`]: side };
    setUserVotes(next);
    try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch {}

    const lastIdx = matchups.length - 1;
    const goingToReview = returnToReview || idx >= lastIdx;

    if (prefersReducedMotion()) {
      if (goingToReview) { setFlow('review'); setReturnToReview(false); }
      else setIdx(idx + 1);
      return;
    }
    setPhase('out');
    later(() => {
      if (goingToReview) {
        setPulse(null); setFlow('review'); setReturnToReview(false); setPhase('card');
      } else {
        setPulse({ r1: activeRound, m1: idx, r2: activeRound, m2: idx + 1 });
        setPhase('travel');
        later(() => {
          setPulse(null); setIdx(idx + 1); setPhase('in');
          later(() => setPhase('card'), PHASE_MS.in);
        }, PHASE_MS.travel);
      }
    }, PHASE_MS.out);
  };

  const editFromReview = (m) => { setReturnToReview(true); setIdx(m); setFlow('vote'); setPhase('card'); };

  const allPicked = matchups.length > 0 && matchups.every((_, m) => userVotes[`r${activeRound}-m${m}`]);

  const handleSubmit = async () => {
    if (!currentUser || !allPicked || !votingOpen || submitting) return;
    setSubmitting(true);
    try {
      await submitWeeklyVote(currentUser.uid, activeRound, userVotes, weekKey(bracket));
      setHasVoted(true);
      try { localStorage.removeItem(draftKey); } catch {}
      setResultsIdx(0);
      setFlow('results');
      setShowFullBracket(false);
    } catch (e) {
      console.error('Error submitting votes:', e);
      alert(e.message || 'Failed to submit votes. Please try again.');
    }
    setSubmitting(false);
  };

  // ---- render ------------------------------------------------------------
  if (loading) {
    return (
      <div className="home-container"><div className="loading-state"><div className="spinner"></div><p>Loading weekly bracket...</p></div></div>
    );
  }
  if (loadError) return <div role="alert" className="home-container">{loadError}<button onClick={() => window.location.reload()}>Retry</button></div>;
  if (!bracket || !bracket.matchups?.length) {
    return (
      <div className="home-container"><div className="empty-state"><p>No weekly bracket is running right now. Check back soon!</p></div></div>
    );
  }

  const votingMode = flow === 'vote' && !hasVoted && votingOpen;
  const showCard = votingMode && matchups[idx];
  const frac = showCard ? slotFraction(idx) : { x: 0.5, y: 0.5 };
  const cardStyle = phase === 'out'
    ? { left: `${frac.x * 100}%`, top: `${frac.y * 100}%`, transform: 'translate(-50%, -50%) scale(0.1)', opacity: 0 }
    : phase === 'in'
      ? undefined // handled by the 'wv-enter' animation class
      : undefined;

  return (
    <div className="home-container wv-page">
      <div className="wv-header">
        <h1 className="wv-title">{bracket.title || 'Weekly Bracket'}</h1>
        <p className="wv-subtitle">
          {champion
            ? <>Champion: <strong>{champion.name}</strong> 🏆</>
            : <>{roundName(activeRound)}{votingMode ? <> · Matchup {Math.min(idx + 1, matchups.length)} of {matchups.length}</> : null}</>}
        </p>
        {votingMode && (
          <div className="wv-progress">
            {matchups.map((_, m) => (
              <span key={m} className={`wv-dot ${userVotes[`r${activeRound}-m${m}`] ? 'done' : ''} ${m === idx ? 'now' : ''}`} />
            ))}
          </div>
        )}
      </div>

      {/* ---------------- VOTING ---------------- */}
      {votingMode && (
        <div className="wv-stage">
          <div className={`wv-stage-bracket ${phase === 'card' ? 'dimmed' : 'lit'}`}>
            <BracketMap
              matchups={bracket.matchups}
              activeRound={activeRound}
              userVotes={userVotes}
              currentIdx={idx}
              pulse={phase === 'travel' ? pulse : null}
            />
          </div>
          {showCard && phase !== 'travel' && (
            <div
              className={`wv-card-holder ${phase === 'in' ? 'wv-enter' : ''} ${phase === 'out' ? 'wv-leaving' : ''}`}
              style={cardStyle}
            >
              <VsCard
                match={matchups[idx]}
                matchId={`r${activeRound}-m${idx}`}
                picked={userVotes[`r${activeRound}-m${idx}`]}
                onPick={handlePick}
                disabled={phase !== 'card'}
              />
            </div>
          )}
        </div>
      )}

      {/* ---------------- REVIEW ---------------- */}
      {flow === 'review' && !hasVoted && votingOpen && (
        <div className="wv-review">
          <p className="wv-review-hint">Here's your round. Tap any matchup to change your pick.</p>
          <div className="wv-review-map">
            <BracketMap
              matchups={bracket.matchups}
              activeRound={activeRound}
              userVotes={userVotes}
              currentIdx={-1}
              onTapBox={editFromReview}
            />
          </div>
          <button className="wv-submit" disabled={!allPicked || submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting…' : `Submit ${roundName(activeRound)} votes`}
          </button>
        </div>
      )}

      {/* ---------------- RESULTS ---------------- */}
      {(flow === 'results' || hasVoted) && flow !== 'review' && !votingMode && (
        <div className="wv-results">
          {!currentUser && <p className="wv-review-hint">Log in to vote in this round.</p>}
          {!hasVoted && currentUser && votingOpen && flow === 'results' && (
            <p className="wv-review-hint">Results are hidden until you vote.</p>
          )}
          {!votingOpen && !champion && <p className="wv-review-hint">Voting is closed for this round. Results will update automatically.</p>}
          {showFullBracket ? (
            <>
              <div className="wv-full-map">
                <BracketMap
                  matchups={bracket.matchups}
                  votes={hasVoted ? bracket.votes : null}
                  activeRound={activeRound}
                  userVotes={userVotes}
                  currentIdx={resultsIdx}
                  onTapBox={(m) => { setResultsIdx(m); setShowFullBracket(false); }}
                  expanded
                />
              </div>
              <button className="wv-toggle" onClick={() => setShowFullBracket(false)}>Back to matchups</button>
            </>
          ) : (
            <>
              <div className="wv-results-card">
                <button className="wv-arrow" disabled={resultsIdx === 0} onClick={() => setResultsIdx(resultsIdx - 1)} aria-label="Previous matchup">‹</button>
                <VsCard
                  match={matchups[resultsIdx]}
                  matchId={`r${activeRound}-m${resultsIdx}`}
                  votes={hasVoted ? bracket.votes : null}
                  picked={userVotes[`r${activeRound}-m${resultsIdx}`]}
                  showResults={hasVoted}
                  disabled
                />
                <button className="wv-arrow" disabled={resultsIdx >= matchups.length - 1} onClick={() => setResultsIdx(resultsIdx + 1)} aria-label="Next matchup">›</button>
              </div>
              <div className="wv-progress">
                {matchups.map((_, m) => (
                  <button type="button" key={m} className={`wv-dot ${m === resultsIdx ? 'now' : ''}`} aria-label={`Show matchup ${m + 1}`} aria-pressed={m === resultsIdx} onClick={() => setResultsIdx(m)} />
                ))}
              </div>
              <button className="wv-toggle" onClick={() => setShowFullBracket(true)}>View full bracket</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default WeeklyBracketPage;
