# Loading behavior

- A previously confirmed account username is cached per UID in session storage for up to 24 hours. Authentication still resolves first; the username refresh always runs. New accounts without a confirmed cache still complete username setup. A server response requiring setup invalidates the cache. This is display data, never authorization evidence. A successful rename supersedes older in-flight reads.
- Public bracket/ranking browse cards are cached for two minutes in session storage. Every mount refreshes them. Each source replaces its own cached cards as soon as its first page arrives. A failed source retains its cards with the existing retry warning. Private activities, pools, friends, drafts and saved picks are not cached by this hook.
- Public catalog responses hydrate current usernames in one batch; clients seed the existing username cache before mounting cards. A failed hydration falls back to the existing username service without failing the catalog.
- Profile header and statistics requests run independently. Header-only requests skip activity and pool-history queries. Stats keep their existing completeness and friendship checks, and query completed-pool standings in batches of five rather than serially. Profile edits are preserved if statistics finish later.
- Custom bracket viewing shares the route's live subscription; the builder is lazy-loaded. The standalone fill view starts saved-pick loading alongside its subscription, keeps newer local drafts, and never enables picking before saved picks resolve.

## Verification and remaining cold starts

Local tests cover progressive cards, failed sources, account switching, cached public cards, username invalidation and profile headers surviving statistics failures. Backend emulator coverage checks header-only responses alongside full statistics and privacy; run through the existing GitHub workflow.

No paid minimum-instance setting has been enabled. Function cold starts and fresh-browser Firebase downloads may still contribute latency. Measure those separately after deploying this change before selecting individual functions to keep warm. Do not set a global minimum across all exported functions. This update makes no live latency guarantee and does not change Firestore or Storage rules.
