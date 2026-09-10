import { useEffect, useState } from 'react';

// Terminating obsolete workers also stops expensive searches after navigation
// or new results. Never run the search on the UI thread as a fallback.
export function usePoolAnalysis(input) {
  const [state, setState] = useState({ input: null, analysis: null, error: '', loading: false });
  useEffect(() => {
    if (!input) return;
    let worker;
    setState({ input, analysis: null, error: '', loading: true });
    const fail = () => setState({ input, analysis: null, error: 'Winning-path analysis is unavailable. Scores and predictions are still available.', loading: false });
    try {
      worker = new Worker(new URL('../workers/poolAnalysis.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => setState({ input, analysis: data.analysis || null, error: data.error || '', loading: false });
      worker.onerror = fail;
      worker.postMessage(input);
    } catch { fail(); }
    return () => { if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); } };
  }, [input]);
  return state.input === input ? state : { analysis: null, error: '', loading: !!input };
}
