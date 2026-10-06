export default function ActionDisclosure({ label = 'More', children }) {
  return <details className="action-disclosure" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation(); }
  }}><summary>{label}</summary><div className="action-disclosure-panel">{children}</div></details>;
}
