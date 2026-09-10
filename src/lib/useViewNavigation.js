import { useState, useEffect, useCallback } from 'react';
const pages = new Set(['home','my-activities','my-brackets','create','fill','pdf','weekly','champions','pools','create-pool','prediction-pools','create-prediction-pool','rankings','create-ranking','my-rankings','drafts','create-draft','my-drafts','privacy','terms','admin','kristin-tiers']);
export function readView(search) {
  const value = new URLSearchParams(search).get('view') || 'home';
  return pages.has(value) || /^(pool-|prediction-pool-|ranking-|ranking-vote-|draft-|kristin-tiers-|custom-bracket-)[\w-]+$/.test(value) ? value : 'home';
}
export function useViewNavigation() {
  const [view, update] = useState(() => readView(window.location.search));
  const navigate = useCallback(next => {
    const url = new URL(window.location.href); url.searchParams.delete('pool');
    if (next === 'home') url.searchParams.delete('view'); else url.searchParams.set('view', next);
    if (url.href !== window.location.href) window.history.pushState({}, '', url);
    update(next); window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => { const pop = () => update(readView(window.location.search)); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  return [view, navigate];
}
export function readSession(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } }
export function saveSession(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }
