import { useDialog } from '../../lib/useDialog';
export default function PoolSleeperModal({
  setShowSleeperModal,
  pool,
  sleeper1,
  setSleeper1,
  getRoundLosers,
  sleeper2,
  setSleeper2,
  submitPredictionsToServer,
  submitting,
  submittingSleepers,
  handleSubmitSleepers,
}) {
  const dialogRef = useDialog(true, () => setShowSleeperModal(false));
  return (
    <div className="modal-overlay" onClick={() => setShowSleeperModal(false)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Sleeper picks" className="sleeper-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Select Your Sleeper Picks</h2>
        <p className="sleeper-modal-desc">
          Choose participants you think will outperform their seeding!
        </p>

        <div className="sleeper-pick-group">
          <label>
            <strong>Sleeper Pick 1</strong>
            <span className="sleeper-pick-desc">
              A Round 1 loser who makes it to Round 3+ ({pool.sleeper1Points} pts)
            </span>
          </label>
          <select
            value={sleeper1 ? String(sleeper1.seed) : ''}
            onChange={(e) => {
              if (!e.target.value) {
                setSleeper1(null);
                return;
              }
              const losers = getRoundLosers(0);
              const selected = losers.find((l) => String(l.seed) === e.target.value);
              setSleeper1(selected || null);
            }}
            className="sleeper-select"
          >
            <option value="">Select a Round 1 loser...</option>
            {getRoundLosers(0).map((loser) => (
              <option key={loser.seed} value={String(loser.seed)}>
                #{loser.seed} {loser.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sleeper-pick-group">
          <label>
            <strong>Sleeper Pick 2</strong>
            <span className="sleeper-pick-desc">
              A Round 2 loser who makes it to Round 4+ ({pool.sleeper2Points} pts)
            </span>
          </label>
          <select
            value={sleeper2 ? String(sleeper2.seed) : ''}
            onChange={(e) => {
              if (!e.target.value) {
                setSleeper2(null);
                return;
              }
              const losers = getRoundLosers(1);
              const selected = losers.find((l) => String(l.seed) === e.target.value);
              setSleeper2(selected || null);
            }}
            className="sleeper-select"
          >
            <option value="">Select a Round 2 loser...</option>
            {getRoundLosers(1).map((loser) => (
              <option key={loser.seed} value={String(loser.seed)}>
                #{loser.seed} {loser.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sleeper-modal-actions">
          <button
            className="skip-sleepers-btn"
            onClick={() => submitPredictionsToServer(null)}
            disabled={submitting || submittingSleepers}
          >
            Skip Sleepers
          </button>
          <button
            className="submit-sleepers-btn"
            onClick={handleSubmitSleepers}
            disabled={submitting || submittingSleepers}
          >
            {submittingSleepers ? 'Submitting...' : 'Submit Sleepers'}
          </button>
        </div>
      </div>
    </div>
  );
}
