import { useId, useState } from 'react';
import { MAX_PARTICIPANTS } from '../lib/customBracket';
import { generateDefaultBracketLayout } from '../lib/defaultBracketLayout';
import './defaultBracketSetup.css';

export default function DefaultBracketSetup({ onGenerate, disabled }) {
  const id = useId();
  const [count, setCount] = useState('16');
  const [error, setError] = useState('');
  const size = Number(count);
  const valid = Number.isInteger(size) && size >= 2 && size <= MAX_PARTICIPANTS;
  const byes = valid ? 2 ** Math.ceil(Math.log2(size)) - size : 0;
  const submit = event => {
    event.preventDefault();
    if (disabled) return;
    try { onGenerate(generateDefaultBracketLayout(size)); setError(''); }
    catch (reason) { setError(reason.message); }
  };
  return <form className="default-bracket-setup" onSubmit={submit}>
    <h2>Default layout</h2>
    <label htmlFor={id}>Number of entries</label>
    <input id={id} type="number" min="2" max={MAX_PARTICIPANTS} step="1" required
      value={count} disabled={disabled} aria-describedby={`${id}-summary`}
      onChange={event => { setCount(event.target.value); setError(''); }} />
    <p id={`${id}-summary`} aria-live="polite">{valid ? `${Math.ceil(Math.log2(size))} rounds · ${byes} automatic ${byes === 1 ? 'bye' : 'byes'}` : `Choose 2–${MAX_PARTICIPANTS} entries.`}</p>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={disabled || !valid}>Generate layout</button>
  </form>;
}
