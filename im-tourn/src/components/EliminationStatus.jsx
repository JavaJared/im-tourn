// src/components/EliminationStatus.jsx
//
// UI surface for the elimination feature. Two pieces:
//   <StatusBadge />        - a small Alive/Eliminated/Clinched pill rendered
//                            inline in a leaderboard row.
//   <WhatNeedsToHappen />  - an expandable panel showing a constraint summary
//                            and a per-matchup "root for" view. Should only
//                            be rendered when shouldShowWinningPaths() is true
//                            AND the entry is alive.
//
// The heavy computation happens once at the leaderboard level via
// analyzePool() and is passed down; these components only do rendering.

import React, { useState } from 'react';
import { summarizeWinningScenarios } from '../lib/elimination';

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

export function StatusBadge({ status }) {
  if (!status) return null;

  const meta = {
    alive: { label: 'Alive', emoji: '🎯', className: 'status-alive' },
    eliminated: { label: 'Eliminated', emoji: '💀', className: 'status-eliminated' },
    clinched: { label: 'Clinched', emoji: '🏆', className: 'status-clinched' },
  }[status.status];

  if (!meta) return null;

  const title =
    status.status === 'alive'
      ? `Alive — score range ${status.currentScore} → ${status.maxPossibleScore}`
      : status.status === 'eliminated'
      ? `Eliminated — max possible ${status.maxPossibleScore} points`
      : `Clinched — guaranteed finish tied for 1st or better`;

  return (
    <span className={`elim-badge ${meta.className}`} title={title}>
      <span className="elim-badge-emoji">{meta.emoji}</span>
      <span className="elim-badge-label">{meta.label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// WhatNeedsToHappen
// ---------------------------------------------------------------------------

export function WhatNeedsToHappen({ status, pool }) {
  const [expanded, setExpanded] = useState(false);

  if (!status || status.status !== 'alive') return null;
  const summary = summarizeWinningScenarios(status, pool);
  if (!summary) return null;

  return (
    <div className="wnth-container">
      <button
        className="wnth-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="wnth-toggle-icon">{expanded ? '▼' : '▶'}</span>
        What needs to happen?{' '}
        <span className="wnth-toggle-count">
          ({summary.totalScenarios} winning path{summary.totalScenarios === 1 ? '' : 's'}
          {status.scenariosTruncated ? '+' : ''})
        </span>
      </button>

      {expanded && (
        <div className="wnth-panel">
          {summary.required.length > 0 && (
            <div className="wnth-section">
              <h5 className="wnth-section-title">Must happen</h5>
              <ul className="wnth-required-list">
                {summary.required.map((req) => (
                  <li key={req.matchupKey}>
                    <span className="wnth-round">{roundLabel(req.round, pool)}:</span>{' '}
                    <strong>{req.teamName}</strong> must win
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.rootFor.length > 0 && (
            <div className="wnth-section">
              <h5 className="wnth-section-title">Root for</h5>
              <div className="wnth-rootfor-grid">
                {summary.rootFor.map((rf) => {
                  const totalForMatchup = rf.perOutcome.reduce(
                    (s, p) => s + p.scenarioCount,
                    0
                  );
                  return (
                    <div key={rf.matchupKey} className="wnth-rootfor-row">
                      <div className="wnth-rootfor-round">
                        {roundLabel(rf.round, pool)}
                      </div>
                      <div className="wnth-rootfor-options">
                        {rf.perOutcome.map((opt) => {
                          const pct = Math.round(
                            (opt.scenarioCount / totalForMatchup) * 100
                          );
                          return (
                            <div
                              key={opt.seed}
                              className="wnth-rootfor-option"
                              title={`${opt.scenarioCount} of ${totalForMatchup} winning paths`}
                            >
                              <span className="wnth-team">{opt.teamName}</span>
                              <span className="wnth-bar-wrap">
                                <span
                                  className="wnth-bar-fill"
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                              <span className="wnth-pct">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {summary.required.length === 0 && summary.rootFor.length === 0 && (
            <p className="wnth-empty">
              You're guaranteed to win regardless of remaining outcomes.
            </p>
          )}

          {status.scenariosTruncated && (
            <p className="wnth-truncated-note">
              Analysis capped — showing a sample of winning paths.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundLabel(roundIndex, pool) {
  const totalRounds = pool.bracketMatchups.length;
  const fromEnd = totalRounds - 1 - roundIndex;
  // Friendly labels based on distance from the final
  const labels = ['Final', 'Semifinals', 'Quarterfinals', 'Round of 16', 'Round of 32', 'Round of 64'];
  if (fromEnd < labels.length) return labels[fromEnd];
  return `Round ${roundIndex + 1}`;
}
