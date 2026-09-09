import { useDialog } from '../../lib/useDialog';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const AuthModal = ({ isOpen, onClose, initialMode = 'login' }) => {
  const dialogRef = useDialog(isOpen, onClose);
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef(0);
  const busy = useRef(false);
  const { signup, login, loginWithGoogle, resetPassword } = useAuth();

  useEffect(() => {
    setMode(initialMode);
    setError('');
    setMessage('');
    setPassword('');
    setLoading(false);
    busy.current = false;
    request.current += 1;
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const changeMode = (next) => {
    if (busy.current) return;
    setMode(next);
    setError('');
    setMessage('');
    setPassword('');
  };

  const runRequest = async (action, recovery = false) => {
    if (busy.current) return;
    busy.current = true;
    const id = ++request.current;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await action();
      if (id !== request.current) return;
      if (recovery) {
        setMessage(
          'If an account uses this email, you will receive a password reset link. Check your inbox and spam folder.',
        );
      } else {
        onClose();
      }
    } catch (err) {
      if (id !== request.current) return;
      setError(
        recovery
          ? err.code === 'auth/too-many-requests'
            ? 'Too many attempts. Please wait a few minutes before trying again.'
            : 'We could not request a reset email. Check your email address and connection, then try again.'
          : (err.message || 'Unable to sign in. Please try again.')
              .replace('Firebase: ', '')
              .replace(/\(auth\/.*\)/, ''),
      );
    } finally {
      if (id === request.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    return runRequest(
      () =>
        mode === 'reset'
          ? resetPassword(email)
          : mode === 'signup'
            ? signup(email, password, displayName)
            : login(email, password),
      mode === 'reset',
    );
  };

  const handleGoogleLogin = () => runRequest(loginWithGoogle);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'reset' ? 'Reset password' : 'Account sign in'}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button aria-label="Close dialog" className="modal-close" onClick={onClose}>
          ×
        </button>
        <h2 className="modal-title">
          {mode === 'reset'
            ? 'Reset Password'
            : mode === 'login'
              ? 'Welcome Back'
              : 'Create Account'}
        </h2>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {mode === 'reset' && <p>Enter your account email to request a password reset link.</p>}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="form-input"
                aria-label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              aria-label="Email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          {mode !== 'reset' && (
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}

          <button type="submit" className="publish-btn" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'reset'
                ? 'Send Reset Link'
                : mode === 'login'
                  ? 'Log In'
                  : 'Sign Up'}
          </button>
        </form>

        {mode === 'login' && (
          <p className="auth-switch">
            <button type="button" disabled={loading} onClick={() => changeMode('reset')}>
              Forgot password?
            </button>
          </p>
        )}
        {mode !== 'reset' && (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>

            <button className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          </>
        )}

        <p className="auth-switch">
          {mode === 'reset'
            ? 'Remember your password? '
            : mode === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
          <button
            type="button"
            disabled={loading}
            onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
