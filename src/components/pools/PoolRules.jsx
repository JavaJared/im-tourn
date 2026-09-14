import { predictionsOpen, timestampMillis } from '../../lib/poolLifecycle';

export default function PoolRules({ pool, roundPoints }) {
  const deadline = timestampMillis(pool.lockDate);
  return <section className="pool-rules">
    <h2>Rules</h2>
    <h3>Entries and deadline</h3>
    <p>{predictionsOpen(pool) ? 'Predictions are open. Join the pool, choose your winners in My Picks, and submit your prediction.' : 'Predictions are closed. Entries can no longer be submitted or changed.'}</p>
    <p>{deadline != null ? `Deadline: ${new Date(deadline).toLocaleString()}. The host can also lock predictions earlier.` : 'The host closes predictions by locking the pool.'} You can update your submitted prediction while predictions are open.</p>
    <h3>Scoring</h3>
    <p>Each correct winner earns the points shown for its round. Official Results shows the host’s recorded outcomes; Standings shows entry scores.</p>
    <table><caption>Points per correct pick</caption><thead><tr><th scope="col">Round</th><th scope="col">Points</th></tr></thead><tbody>
      {roundPoints.map((points, index) => <tr key={index}><th scope="row">{index === roundPoints.length - 1 && roundPoints.length > 1 ? 'Final' : `Round ${index + 1}`}</th><td>{points}</td></tr>)}
    </tbody></table>
    {pool.enableSleepers && <><h3>Sleeper bonuses</h3>
      {pool.bracketMatchups?.rounds?.length > 2 && <p>Sleeper 1: a participant you predict to lose in Round 1 earns {pool.sleeper1Points || 0} bonus points if they reach Round 3.</p>}
      {pool.bracketMatchups?.rounds?.length > 3 && <p>Sleeper 2: a participant you predict to lose in Round 2 earns {pool.sleeper2Points || 0} bonus points if they reach Round 4.</p>}
    </>}
    <h3>Pick privacy</h3><p>Other participants’ predictions stay private until predictions close. Invite codes are visible only to the host.</p>
    <h3>From the host</h3><p className="pool-rules-description">{pool.description || 'No additional rules or description provided.'}</p>
  </section>;
}
