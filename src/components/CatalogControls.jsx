export default function CatalogControls({ catalog }) {
  return <div className="catalog-controls">
    {catalog.error && <p role="alert">{catalog.error}</p>}
    {catalog.hasMore && <p>Search and sorting apply to the items loaded so far.</p>}
    {catalog.hasMore && <button type="button" className="back-btn" disabled={catalog.loading} onClick={catalog.loadMore}>{catalog.loading ? 'Loading…' : catalog.error ? 'Retry loading' : 'Load more'}</button>}
    <button type="button" className="back-btn" disabled={catalog.loading} onClick={catalog.refresh}>Refresh list</button>
  </div>;
}
