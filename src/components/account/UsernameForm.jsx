import { useEffect, useRef, useState } from 'react';

export default function UsernameForm({ username = '', onSave, setup = false }) {
  const [value, setValue] = useState(username), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const active = useRef(true), pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setValue(username); }, [username]);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await onSave(value);
      if (active.current) { setValue(result.username); setMessage('Username saved.'); }
    } catch (reason) {
      if (active.current) setError(reason.message || 'Could not save your username. Please retry.');
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <form onSubmit={submit} className="username-form">
    <label htmlFor="account-username">Username</label>
    <p id="username-help">3–24 letters, numbers, or underscores. Start with a letter. Usernames are unique and not case-sensitive. The user_ prefix is reserved for default usernames.</p>
    <input id="account-username" className="form-input" value={value} onChange={event => setValue(event.target.value)}
      required minLength={3} maxLength={24} pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}" autoComplete="username" autoCapitalize="none" spellCheck={false}
      aria-describedby="username-help" disabled={busy} />
    <button className="nav-btn" disabled={busy} type="submit">{busy ? 'Saving…' : setup ? 'Save username and continue' : 'Save username'}</button>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </form>;
}
