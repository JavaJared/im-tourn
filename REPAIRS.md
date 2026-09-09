# Security and reliability repairs

Production is https://imtourn.com on Netlify, site `8048488b-f6ff-44b3-9f7f-fbd38e6780b3`.
The verified production commit before repairs was `3c3b0f3e604734345e35d79eb641497adb1ba600`.
The canonical app, Firebase configuration, and Functions source now live at the repository root. The former nested app was promoted here and the obsolete root copy removed. Git history retains the old versions.

## Changes

- Server-owned weekly votes, ranking ballots/consensus and idempotent submission likes. Weekly tally retries recompute canonical ballots rather than applying event deltas; week-scoped ballots are retained through rollover. Archive and replacement are transactional, and selection validates candidates before any mutation.
- Standard 32/64 brackets join the weekly catalog. A 64-entry bracket's Saturday final closes in the Sunday rollover. Weekly voting follows New York calendar boundaries, rejects closed rounds, updates live, and restores local draft picks.
- Firestore rules freeze entry identities and competitive settings, enforce deadlines at server time, protect rankings and administrative data, and disable hidden draft writes. Standard creation, private tier lists and saved fill submissions have matching rules. Storage writes/deletes check parent ownership.
- Shared server/client scoring covers legacy pool structures and sleeper bonuses. Result operations act on the latest stored bracket, clear dependent picks through the existing engine, and score atomically. Completion requires a decided final and includes every tied submitted winner. Empty entries cannot win from stale scores.
- Sleeper selectors restored. Incomplete elimination searches report uncertainty, and truncated scenarios cannot claim a required path. A short computation budget reduces UI blocking.
- Feedback is saved privately to Firestore, with visible errors and an administrator inbox. Sign-in is required; anonymous visitors are told this before submitting.
- Canonical saved fills, saved-submission viewer and local PDF export. Browser navigation is reflected in `?view=…`; pool invitations preserve bookmark/refresh context. Fill and pool picks are kept locally during editing.
- Keyboard access for bracket picks, dialog focus/Escape handling, visible focus and mobile zoom. Feature pages and PDF code load on demand. A page error boundary provides recovery.
- Atomic ranking publication after uploads; cleanup waits for all uploads. Pool score edits update individual fields. Tier saves are serialized, retain failed changes, and reject another tab's intervening placement update.
- Updated SDKs/build tooling, committed lockfiles, regression and emulator suites, and CI. Removed two unreferenced components with missing imports and the ignored nested workflow.

## Safe rollout

The repair branch does not change production until deployed. No existing pools, entries, rankings or ballots require destructive migration.

1. Run **Deploy Firebase Backend** from the repair branch (or merge, which triggers it). It installs locked dependencies, runs tests, deploys Functions and indexes, then writes a backend-ready marker only after success. It uses the existing `FIREBASE_SERVICE_ACCOUNT` secret. The account must also be permitted to deploy indexes and write the readiness marker.
2. Publish/retry the Netlify build after that workflow succeeds. `netlify.toml` sets base `.`, publish `dist`, and Node 22. Production builds refuse to publish until the readiness endpoint confirms backend release 2. A failed build leaves the previous production deployment online. Deploy previews skip this guard for visual review; their authenticated mutations still require the new Functions.
3. Verify on the new frontend: sign in; create a standard bracket; join and submit in a disposable pool; record results and complete a tied pool; submit a ranking ballot; test a tier image and feedback. Use a dedicated test account and disposable records. Existing live contests should not be used for mutation testing.
4. Run **Deploy Firebase Rules (after frontend)** after confirming the new frontend. This applies Firestore and Storage rules. The first Storage deployment using Firestore lookups may require enabling cross-service permissions in Firebase. Users with a pre-update tab may need to refresh to use the secured APIs.
5. Verify the protected operations using the checked-in emulator suite and spot-check normal signed-in flows again. Security findings remain open on production until these rules are deployed.

Backend rollout before the frontend and rules preserves normal old-client behavior for the transition. Avoid the brief rollout interval around a scheduled weekly rollover. Manual weekly winner selection is limited to the current round so closed ballots are not silently reinterpreted. Selecting a replacement midweek schedules it for the upcoming Monday; the UI labels this as the next weekly bracket.

### Rollback

Netlify retains the previous deployment for rollback. Keep the new backend available while rolling forward a frontend repair: the new APIs are additive and support legacy pool structures. After strict rules land, do not roll the frontend back to a version that directly writes ballots or likes; those old write paths are deliberately denied. Reverting the strict rules would reopen the vulnerabilities. Prefer a targeted frontend correction on the secured APIs.

## Validation and remaining work

Run from the repository root:

```sh
npm ci
npm --prefix functions ci
npm run check
npm run test:rules
```

Use Node 22 and Java 21+ for emulators. `npm run check` runs pure regressions, the existing 49 helper assertions, and the production build. `test:rules` exercises both permission boundaries and actual server transactions against the Firestore/Storage emulators, including simultaneous votes, duplicate retries, deadline enforcement, old-week events and tied completion. Production credentials are never used by these suites.

The UUID override in Functions stays on CommonJS-compatible 11.x. The affected Google HTTP libraries use only its stable `v4()` API. Do not use `npm audit fix --force`: the suggested downgrade crosses unsupported Firebase SDK generations.

This repair does **not** change existing public pools into private pools. Public join codes and picks remain part of the current data model (review S7). A private-pool/sealed-picks migration needs an explicit access model, membership-based queries and separate public metadata. Broader catalog pagination/search, a full mobile bracket redesign, audit-history UI and new competition features remain follow-up work. Initial feature code is split, but the shared Firebase chunk is still large.

Live authenticated smoke tests and production security-rule deployment cannot be replaced by a successful build or an emulator run. Check the PR for actual completed validation and deployment status.
