import { useEffect, useRef } from 'react';

const dialogs = [];
let previousOverflow = '';
export function useDialog(isOpen, onClose) {
  const ref = useRef(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const dialog = ref.current, previous = document.activeElement;
    const item = { dialog };
    if (!dialogs.length) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    dialogs.push(item);
    const top = () => dialogs.at(-1) === item;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length);
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
    const focusFirst = () => (focusable()[0] || dialog).focus({ preventScroll: true });
    focusFirst();
    const keydown = event => {
      if (!top()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const focusin = event => { if (top() && !dialog.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin, true);
    return () => {
      const wasTop = top();
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin, true);
      const index = dialogs.indexOf(item); if (index !== -1) dialogs.splice(index, 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      if (wasTop && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isOpen]);
  return ref;
}
