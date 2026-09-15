import { createPortal } from 'react-dom';
import { useId } from 'react';
import { useDialog } from '../../lib/useDialog';
export default function ConfirmDialog({ open, onCancel, onConfirm, busy, error }) {
  const id = useId();
  const ref = useDialog(open, () => { if (!busy) onCancel(); });
  if (!open) return null;
  return createPortal(<div className="modal-overlay" onClick={() => { if (!busy) onCancel(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={id + '-description'} className="modal-content" onClick={e => e.stopPropagation()}>
      <h2 id={id}>Delete this pool?</h2>
      <p id={id + '-description'}>This removes the pool and its entries for everyone. This cannot be undone.</p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Deleting pool. Please wait…</p>}
      <div className="save-notice">
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : error ? 'Retry deletion' : 'Delete pool'}</button>
      </div>
    </div>
  </div>, document.body);
}
