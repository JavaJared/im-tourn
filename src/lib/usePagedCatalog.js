import { useState, useEffect, useRef, useCallback } from 'react';
import { rememberUsername } from '../services/publicUsernames';
import { callServer } from '../services/server';

// Each source advances only after its own successful response. A failed source
// cannot erase successful cards or skip a page when retried.
export function usePagedCatalog(types, { endpoint = 'browseCatalog', params = {}, scope = '', enabled = true } = {}) {
  const paramsKey = JSON.stringify(params);
  const sourcesKey = types.join(',');
  // Cache public browse cards only, never friend lists, private activities or picks.
  const cacheKey = endpoint === 'browseCatalog' && !params.mine && !types.includes('draft')
    ? `catalog:v1:${sourcesKey}:${paramsKey}:${scope}` : null;
  const readCache = () => {
    try { const entry = JSON.parse(sessionStorage.getItem(cacheKey)); return cacheKey && entry?.expires > Date.now() && Array.isArray(entry.items) ? entry.items : []; }
    catch { return []; }
  };
  const [items, setItems] = useState(readCache);
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
    if (reset) { pages.current = {}; setItems(readCache()); }
    busy.current = true; setLoading(true); setError('');
    const requested = sourcesKey.split(',').filter(type => pages.current[type] !== null);
    const failures = [], fresh = [];
    await Promise.all(requested.map(async type => {
      try {
        const result = await callServer(endpoint, { ...JSON.parse(paramsKey), type, cursor: pages.current[type] || null });
        if (version !== generation.current) return;
        if (!Array.isArray(result?.items) || !(result.nextCursor === null || typeof result.nextCursor === 'string')) throw Error('Malformed page');
        Object.entries(result.usernames || {}).forEach(([id, username]) => rememberUsername(id, username));
        const received = result.items.filter(item => item && typeof item.id === 'string').map(item => ({...item, catalogType:type}));
        fresh.push(...received);
        pages.current[type] = result.nextCursor;
        setItems(previous => [...new Map([...(reset ? previous.filter(item => item.catalogType !== type) : previous), ...received].map(item => [`${item.catalogType}:${item.id}`, item])).values()]);
      } catch { if (version === generation.current) failures.push(type); }
    }));
    if (version !== generation.current) return;
    if (reset && cacheKey && !failures.length) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({items:fresh, expires:Date.now()+120000})); } catch { /* Cache is optional. */ }
    }
    if (failures.length) setError('Some items could not be loaded. Your loaded items are still available. Retry to continue, or refresh the list if it changed.');
    setHasMore(sourcesKey.split(',').some(type => pages.current[type] !== null));
    busy.current = false; setLoading(false);
  }, [sourcesKey, endpoint, paramsKey, scope, enabled]);
  useEffect(() => { load(true); return () => { generation.current++; busy.current = false; }; }, [load]);
  return { items, loading, error, hasMore, loadMore: () => load(), refresh: () => load(true) };
}
