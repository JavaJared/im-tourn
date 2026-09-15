import { useEffect, useRef, useState } from 'react';
export const analyticsCategory = view => ['home','pools','rankings','weekly','privacy','terms'].includes(view) ? view : 'other';
export default function AnalyticsConsent({ view }) {
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem('analytics-choice') || ''; } catch { return ''; } });
  const [open, setOpen] = useState(!['accepted','declined'].includes(choice));
  const [storageError, setStorageError] = useState(false);
  const frame = useRef(null);
  const send = () => frame.current?.contentWindow?.postMessage({ type: 'page', category: analyticsCategory(view) }, window.location.origin);
  useEffect(() => { if (choice === 'accepted') send(); }, [view, choice]);
  const choose = next => {
    setChoice(next); setOpen(false);
    try { localStorage.setItem('analytics-choice', next); setStorageError(false); } catch { setStorageError(true); }
    if (next === 'declined') for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; domain=' + location.hostname, '; domain=.' + location.hostname]) document.cookie = name + '=; Max-Age=0; path=/' + domain;
    }
  };
  return <>
    {choice === 'accepted' && <iframe ref={frame} src="/analytics.html" title="Optional analytics" hidden aria-hidden="true" referrerPolicy="no-referrer" onLoad={send} />}
    <div className="analytics-preferences">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Privacy settings</button>
      {storageError && <p role="status">This choice applies for this visit. Your browser could not remember it.</p>}
      {open && <section aria-label="Optional analytics" className="consent-panel">
        <h2>Optional analytics</h2><p>Allow Google Analytics cookies to help us understand which sections people use? Essential sign-in and saved-pick storage works either way. We send general page categories, not your picks or pool codes.</p>
        <a href="/?view=privacy">Read our privacy policy</a>
        <div><button type="button" onClick={() => choose('declined')}>Decline analytics</button><button type="button" onClick={() => choose('accepted')}>Accept analytics</button></div>
      </section>}
    </div>
  </>;
}
