export default function ActionDisclosure({ label = 'More', children }) {
  return <details className="action-disclosure" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation(); }
  }}><summary>{label}<svg className="action-disclosure-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg></summary><div className="action-disclosure-panel">{children}</div></details>;
}
