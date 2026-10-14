export default function FeedSkeleton() {
  return <div role="status" className="feed-skeleton"><span className="sr-only">Loading your feed…</span><div aria-hidden="true" className="tw:flex tw:items-center tw:gap-3"><span className="skeleton-avatar"/><span className="skeleton-line"/></div><div aria-hidden="true" className="skeleton-title"/><div aria-hidden="true" className="skeleton-preview"/></div>;
}
