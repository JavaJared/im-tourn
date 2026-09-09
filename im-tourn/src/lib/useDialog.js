import { useEffect, useRef } from 'react';
export function useDialog(isOpen, onClose) {
  const ref = useRef(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const previous = document.activeElement, dialog = ref.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
    (focusable()[0] || dialog).focus();
    const handler = e => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    dialog.addEventListener('keydown', handler);
    return () => { dialog.removeEventListener('keydown', handler); previous?.focus?.(); };
  }, [isOpen]);
  return ref;
}
