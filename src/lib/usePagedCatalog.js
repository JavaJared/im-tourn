import { useState, useEffect, useRef, useCallback } from 'react';
import { callServer } from '../services/server';

// Each source advances only after its own successful response. A failed source
// cannot erase successful cards or skip a page when retried.
export function usePagedCatalog(types, { endpoint = 'browseCatalog', params = {}, scope = '', enabled = true } = {}) {
  const paramsKey = JSON.stringify(params);
  const sourcesKey = types.join(',');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const pages = useRef({});
  const generation = useRef(0);
  const busy = useRef(false);
  const load = useCallback(async (reset = false) => {
    if (!enabled) { generation.current++; busy.current = false; pages.current = {}; setItems([]); setLoading(false); setError(''); setHasMore(false); return; }
    if (busy.current && !reset) return;
    const version = ++generation.current;
    if (reset) { pages.current = {}; setItems([]); }
    busy.current = true; setLoading(true); setError('');
    const requested = sourcesKey.split(',').filter(type => pages.current[type] !== null);
    const results = await Promise.allSettled(requested.map(type => callServer(endpoint, { ...JSON.parse(paramsKey), type, cursor: pages.current[type] || null })));
    if (version !== generation.current) return;
    const received = [];
    const failures = [];
    results.forEach((result, index) => {
      const type = requested[index];
      if (result.status === 'rejected' || !Array.isArray(result.value?.items) || !(result.value.nextCursor === null || typeof result.value.nextCursor === 'string')) { failures.push(type); return; }
      received.push(...result.value.items.filter(item => item && typeof item.id === 'string').map(item => ({ ...item, catalogType: type })));
      pages.current[type] = result.value.nextCursor;
    });
    setItems(previous => [...new Map([...previous, ...received].map(item => [`${item.catalogType}:${item.id}`, item])).values()]);
    if (failures.length) setError('Some items could not be loaded. Your loaded items are still available. Retry to continue, or refresh the list if it changed.');
    setHasMore(sourcesKey.split(',').some(type => pages.current[type] !== null));
    busy.current = false; setLoading(false);
  }, [sourcesKey, endpoint, paramsKey, scope, enabled]);
  useEffect(() => { load(true); return () => { generation.current++; busy.current = false; }; }, [load]);
  return { items, loading, error, hasMore, loadMore: () => load(), refresh: () => load(true) };
}
