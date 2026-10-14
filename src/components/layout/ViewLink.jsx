import { forwardRef } from 'react';
// Keep native link behavior for bookmarks, new tabs and modified clicks.
export default forwardRef(function ViewLink({ view, onNavigate, currentView, children, ...props }, ref) {
  return <a ref={ref} {...props}
    href={view === 'home' ? '/' : '/?view=' + encodeURIComponent(view)}
    aria-current={currentView === view ? 'page' : undefined}
    onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate(view);
    }}>{children}</a>;
});
