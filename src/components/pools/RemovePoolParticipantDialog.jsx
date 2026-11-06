import { createPortal } from 'react-dom';
import { useId } from 'react';
import { useDialog } from '../../lib/useDialog';
import UsernameText from '../layout/UsernameText';

export default function RemovePoolParticipantDialog({ participant, busy, error, onCancel, onConfirm }) {
  const id = useId();
  const close = () => { if (!busy) onCancel(); };
  const ref = useDialog(!!participant, close);
  if (!participant) return null;
  return createPortal(<div className="modal-overlay" onClick={close}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={`${id}-description`} className="modal-content" onClick={event => event.stopPropagation()}>
      <h2 id={id}>Remove participant?</h2>
      <p id={`${id}-description`}>Remove <strong><UsernameText userId={participant.userId} /></strong> and their submitted picks from this pool? They will no longer appear in standings or entry stats and cannot rejoin this pool with its invite code. Completed-pool winners will be updated from the remaining entries.</p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Removing participant. Please wait…</p>}
      <div className="save-notice">
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Removing…' : error ? 'Retry removal' : 'Remove participant'}</button>
      </div>
    </section>
  </div>, document.body);
}
