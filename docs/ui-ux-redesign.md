# UI/UX simplification

- Navigation: For You, Explore, Pools; contextual Create choices; My Activities in the account menu. Existing URLs remain supported.
- Brackets: consolidated filled/blank PNG/PDF downloads, accessible share dialog, separate completed-bracket posting action, concise save states, return-to-source navigation, and feed scroll restoration.
- Creation: Details → Entries → Review → Publish, 2–100 entries, automatic seeded byes, common counts, paste-list input, seed preview, and advanced draft editing. Advanced controls support keyboard activation.
- Feed: quieter actions, expandable captions, ranking-specific labels, authenticated author photos with fallbacks, and lightweight champion summaries. Pagination and deferred rendering remain.
- Standings: points, remaining potential, status, and View picks visible; champion, scoring breakdown, and provisional status in Details. Tied ranks and permissions are preserved.
- Pools: lifecycle actions separated from advanced recalculation and deletion; confirmation remains.
- Profiles: Posts / Created / Picks, content-type filters, primary statistics plus More stats, existing photo/username/bio/friend controls and privacy rules.
- Friends: username-first entry, secondary code invitation, request counts, secondary actions and proper removal confirmation.
- Shared styling: consistent surfaces, accents, spacing and responsive controls. Branded loading, zoom, reduced motion, and focus behavior retained.

Validation includes client regressions, server helpers, production build, and focused tests for creation/retry, export choices, bounded avatar access, return navigation and keyboard editing. Firebase emulator-only checks remain in GitHub Actions. No Netlify command or live-site inspection was performed; rendered visual review remains with Jared.

Public profiles now allow guests to read public identity, published creations, and public posts. Saved choices and pool statistics remain restricted to owners and accepted friends. Draft restrictions are unchanged. Feed cards lazily request full-bracket SVG previews near the viewport; public bracket previews use blank structures, and post previews use the author’s explicitly published snapshot. No stored image pipeline or private submission downloads are required. Ranking conversion retains its authorized generated-draft review path.
