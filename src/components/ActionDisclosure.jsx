import { useEffect, useRef } from 'react';

export default function ActionDisclosure({ label = 'More', children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Touch browsers may blur the summary without focusing the tapped link.
    // Close on an actual outside interaction, not that intermediate blur.
    const closeOutside = event => {
      const menu = ref.current;
      if (menu && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, []);
  return <details ref={ref} className="action-disclosure" onKeyDown={event => {
    if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation(); }
  }}><summary>{label}<svg className="action-disclosure-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg></summary><div className="action-disclosure-panel" onClick={event => {
    // The child's navigation handler runs first as the click bubbles upward.
    if (event.target.closest('a,button') && ref.current) ref.current.open = false;
  }}>{children}</div></details>;
}
