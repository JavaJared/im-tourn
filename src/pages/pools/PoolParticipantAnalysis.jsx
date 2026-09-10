import { useDialog } from '../../lib/useDialog';
export default function PoolParticipantAnalysis({
  setAnalyzingParticipant,
  analyzingParticipant,
  analyzeParticipant,
  pool,
  getRoundName,
}) {
  const dialogRef = useDialog(true, () => setAnalyzingParticipant(null));
  return (
    <div className="modal-overlay" onClick={() => setAnalyzingParticipant(null)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Participant analysis" className="analysis-modal" onClick={(e) => e.stopPropagation()}>
        <button
          aria-label="Close dialog"
          className="modal-close"
          onClick={() => setAnalyzingParticipant(null)}
        >
          ×
        </button>
        <div className="analysis-header">
          <span className="analysis-seed">#{analyzingParticipant.seed}</span>
          <h2>{analyzingParticipant.name}</h2>
        </div>
        <p className="analysis-subtitle">How far do people have them going?</p>

        {(() => {
          const analysis = analyzeParticipant(analyzingParticipant);
          if (!analysis || analysis.totalPicks === 0) {
            return <p className="no-analysis">No predictions available for this participant.</p>;
          }

          const numRounds = pool.bracketMatchups?.length || 0;

          return (
            <div className="analysis-content">
              {/* Champion picks */}
              {analysis.champion.length > 0 && (
                <div className="analysis-row champion-row">
                  <div className="analysis-round">
                    <span className="round-icon">🏆</span>
                    <span className="round-name">Champion</span>
                  </div>
                  <div className="analysis-count">{analysis.champion.length}</div>
                  <div className="analysis-users">
                    {analysis.champion.map((name, i) => (
                      <span key={i} className="analysis-user">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Losing in each round (reverse order - show later rounds first) */}
              {[...Array(numRounds)].map((_, i) => {
                const roundIndex = numRounds - 1 - i;
                const users = analysis.byRound[roundIndex] || [];
                if (users.length === 0) return null;

                return (
                  <div key={roundIndex} className="analysis-row">
                    <div className="analysis-round">
                      <span className="round-icon">❌</span>
                      <span className="round-name">
                        Out in {getRoundName(roundIndex, numRounds)}
                      </span>
                    </div>
                    <div className="analysis-count">{users.length}</div>
                    <div className="analysis-users">
                      {users.map((name, j) => (
                        <span key={j} className="analysis-user">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
