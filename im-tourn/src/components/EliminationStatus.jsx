// src/components/EliminationStatus.jsx
//
// UI surface for the elimination feature. Two pieces:
//   <StatusBadge />        - a small Alive/Eliminated/Clinched pill rendered
//                            inline in a leaderboard row.
//   <WhatNeedsToHappen />  - an expandable panel showing a constraint summary
//                            and a per-matchup "root for" view. Should only
//                            be rendered when shouldShowWinningPaths() is true
//                            AND the entry is alive.

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
        type="button"
        className="wnth-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="wnth-toggle-icon">{expanded ? '▼' : '▶'}</span>
        <span className="wnth-toggle-text">What needs to happen?</span>
        <span className="wnth-toggle-count">
          {summary.totalScenarios} path{summary.totalScenarios === 1 ? '' : 's'}
          {status.scenariosTruncated ? '+' : ''}
        </span>
      </button>

      {expanded && (
        <div className="wnth-panel">
          {summary.required.length > 0 && (
            <section className="wnth-section wnth-required">
              <header className="wnth-section-header">
                <span className="wnth-section-icon" aria-hidden="true">⚡</span>
                <h5 className="wnth-section-title">Must happen</h5>
                <span className="wnth-section-sub">
                  Required in every winning path
                </span>
              </header>
              <ul className="wnth-required-list">
                {summary.required.map((req) => (
                  <li key={req.matchupKey} className="wnth-required-item">
                    <span className="wnth-required-round">
                      {roundLabel(req.round, pool)}
                    </span>
                    <span className="wnth-required-body">
                      <strong className="wnth-required-team">{req.teamName}</strong>
                      <span className="wnth-required-verb"> must win</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.rootFor.length > 0 && (
            <section className="wnth-section wnth-rootfor">
              <header className="wnth-section-header">
                <span className="wnth-section-icon" aria-hidden="true">📣</span>
                <h5 className="wnth-section-title">Root for</h5>
                <span className="wnth-section-sub">
                  % of your winning paths that need this outcome
                </span>
              </header>
              <div className="wnth-rootfor-grid">
                {summary.rootFor.map((rf) => {
                  const totalForMatchup = rf.perOutcome.reduce(
                    (s, p) => s + p.scenarioCount,
                    0
                  );
                  return (
                    <div key={rf.matchupKey} className="wnth-rootfor-matchup">
                      <div className="wnth-rootfor-round">
                        {roundLabel(rf.round, pool)}
                      </div>
                      <div className="wnth-rootfor-options">
                        {rf.perOutcome.map((opt) => {
                          const pct = Math.round(
                            (opt.scenarioCount / totalForMatchup) * 100
                          );
                          const intensity = pctIntensity(pct);
                          return (
                            <div
                              key={opt.seed}
                              className={`wnth-rootfor-option ${intensity}`}
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
            </section>
          )}

          {summary.required.length === 0 && summary.rootFor.length === 0 && (
            <p className="wnth-empty">
              You're guaranteed to win regardless of remaining outcomes.
            </p>
          )}

          {status.scenariosTruncated && (
            <p className="wnth-truncated-note">
              Showing a sample of winning paths — actual total may be higher.
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
  const labels = ['Final', 'Semifinals', 'Quarterfinals', 'Round of 16', 'Round of 32', 'Round of 64'];
  if (fromEnd < labels.length) return labels[fromEnd];
  return `Round ${roundIndex + 1}`;
}

function pctIntensity(pct) {
  if (pct >= 67) return 'intensity-strong';
  if (pct >= 34) return 'intensity-medium';
  return 'intensity-weak';
}
