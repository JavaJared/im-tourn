import BracketLoader from '../BracketLoader';
import UsernameForm from './UsernameForm';
import './username.css';

export default function UsernameSetup({ account, onSave, onRetry, onLogout }) {
  return <main className="home-container username-setup">
    <h1>{account.loading || account.error ? 'Account setup' : 'Choose your username'}</h1>
    {account.loading ? <BracketLoader compact label="Loading your account…" />
      : account.error ? <><p role="alert">{account.error}</p><button className="nav-btn" onClick={onRetry}>Retry account setup</button></>
      : <><UsernameForm onSave={onSave} setup /></>}
    <button className="back-btn" onClick={onLogout}>Log out</button>
  </main>;
}
