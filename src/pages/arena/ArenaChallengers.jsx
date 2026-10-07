import { useState } from 'react';

export default function ArenaChallengers({ room, personal, disabled, onAction, signedIn }) {
  const [name, setName] = useState(''), [notice, setNotice] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const reason = candidate => room.eligibility?.[candidate.id] || (room.matchup.includes(candidate.id) ? 'In the current matchup' : '');
  const eligible = room.candidates.filter(c => !reason(c));
  const waiting = room.candidates.filter(c => !room.matchup.includes(c.id) && reason(c));
  const blocked = disabled || !!personal?.nomination;
  async function nominate(event) {
    event.preventDefault(); setNotice('');
    if (await onAction('nominate', { name, requestId })) {
      setName(''); setRequestId(crypto.randomUUID());
      setNotice('Nomination saved. New names need approval; matching names count toward the existing candidate.');
    }
  }
  return <section className="arena-panel"><h2>Next challenger</h2>
    <p>Nominate a new challenger or support an existing one.</p>
    {signedIn ? <form className="arena-form" onSubmit={nominate}>
      <label htmlFor="arena-challenger-name">Nominate a challenger<input id="arena-challenger-name" required maxLength={80} value={name} disabled={blocked} placeholder="Enter the full candidate name" onChange={e => { setName(e.target.value); setRequestId(crypto.randomUUID()); }} aria-describedby="arena-nomination-help" list="arena-candidate-names"/></label>
      <datalist id="arena-candidate-names">{eligible.map(c => <option key={c.id} value={c.name}/>)}</datalist>
      <small id="arena-nomination-help">One nomination or support per matchup. New names are reviewed before joining the public list.</small>
      <button className="arena-primary" disabled={blocked || !name.trim()}>Nominate</button>
    </form> : <p>Sign in to nominate a challenger.</p>}
    {notice && <p role="status">{notice}</p>}
    {personal?.nomination && <p>Your nomination: <strong>{personal.nominationName || 'Saved candidate'}</strong>{personal.nominationStatus === 'pending' ? ' · Awaiting review' : personal.nominationStatus === 'rejected' ? ' · Not approved' : ''}</p>}
    {eligible.map(c => <div className="arena-list-row" key={c.id}><strong>{c.name}</strong><span>{room.nominations[c.id] || 0} nominations</span><button className="arena-primary" disabled={blocked} onClick={() => onAction('nominate', { candidateId: c.id })}>{personal?.nomination === c.id ? 'Supported' : 'Support'}</button></div>)}
    {!eligible.length && <p>No eligible challengers yet.</p>}
    {waiting.length > 0 && <details className="arena-cooldown"><summary>Waiting to return ({waiting.length})</summary>{waiting.map(c => <div className="arena-list-row" key={c.id}><strong>{c.name}</strong><span>{reason(c)}</span></div>)}</details>}
  </section>;
}
