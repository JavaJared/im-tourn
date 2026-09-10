// A failed production build leaves Netlify's previously published site online.
if (process.env.CONTEXT === 'production') {
  const endpoint = 'https://us-central1-i-m-tourn.cloudfunctions.net/repairReadiness';
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    const data = response.ok ? await response.json() : null;
    if (data?.version !== 4) throw new Error('Backend release 4 is not ready.');
  } catch (error) {
    console.error('Production publish paused. Deploy the Firebase backend workflow first, then retry this Netlify build. The existing live deployment remains online.', error.message);
    process.exit(1);
  }
}
