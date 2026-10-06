import { useState, useEffect, useCallback } from 'react';
const pages = new Set(['home','browse','friends','profile','my-activities','my-brackets','create','fill','pdf','weekly','champions','pools','create-pool','prediction-pools','create-prediction-pool','rankings','create-ranking','my-rankings','drafts','create-draft','my-drafts','privacy','terms','admin','kristin-tiers']);
export function readView(search) {
  const value = new URLSearchParams(search).get('view') || 'home';
  return pages.has(value) || /^(feed-post-|pool-|prediction-pool-|ranking-|ranking-vote-|draft-|kristin-tiers-|custom-bracket-|saved-custom-bracket-|fill-bracket-|saved-bracket-|local-bracket-|profile-)[\w-]+$/.test(value) ? value : 'not-found';
}
export function returnView(fallback = 'home') {
  if (typeof window === 'undefined') return fallback;
  const value = window.history?.state?.returnTo;
  return typeof value === 'string' && readView('?view='+encodeURIComponent(value)) !== 'not-found' ? value : fallback;
}
const returnDestinations = /^(home|browse|rankings|weekly|pools|my-activities|my-brackets|profile(?:-[\w-]+)?|pool-[\w-]+)$/;
export function useViewNavigation() {
  const [view, update] = useState(() => readView(window.location.search));
  const navigate = useCallback((next, { replace = false } = {}) => {
    const refreshHome=next==='home'&&readView(window.location.search)==='home';
    const url = new URL(window.location.href); url.searchParams.delete('pool'); url.pathname = '/';
    if (next === 'home') url.searchParams.delete('view'); else url.searchParams.set('view', next);
    if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState']({returnTo:returnDestinations.test(readView(window.location.search))?readView(window.location.search):returnView()}, '', url);
    if(refreshHome)window.dispatchEvent(new Event('imtourn:refresh-feed'));
    update(next); window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => { const pop = () => update(readView(window.location.search)); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  return [view, navigate];
}
export function readSession(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } }
export function saveSession(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }
