// Keep native link behavior for bookmarks, new tabs and modified clicks.
export default function ViewLink({ view, onNavigate, currentView, children, ...props }) {
  return <a {...props}
    href={view === 'home' ? '/' : '/?view=' + encodeURIComponent(view)}
    aria-current={currentView === view ? 'page' : undefined}
    onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate(view);
    }}>{children}</a>;
}
