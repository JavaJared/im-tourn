import { useId } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../lib/useDialog';
export default function ActionDialog({ title, onClose, children }) {
  const id = useId(), ref = useDialog(true, onClose);
  return createPortal(<div className="action-dialog-backdrop" onClick={event => { if(event.target === event.currentTarget) onClose(); }}>
    <section className="action-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby={id}>
      <header><h2 id={id}>{title}</h2><button type="button" className="back-btn" aria-label="Close dialog" onClick={onClose}>×</button></header>
      {children}
    </section></div>, document.body);
}
