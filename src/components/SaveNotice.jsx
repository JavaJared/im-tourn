export default function SaveNotice({ state = 'idle', message, onRetry, retryLabel = 'Retry save' }) {
  if (!message) return null;
  return <div className="save-notice" role={state === 'error' ? 'alert' : 'status'} aria-atomic="true">
    <span>{message}</span>{state === 'error' && onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
  </div>;
}
