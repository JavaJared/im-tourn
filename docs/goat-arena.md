# GOAT Arena featured-room pilot

Entry: Explore → GOAT Arena (`/?view=arena`). Administrators see a “Create featured debate” disclosure. Supply 4–50 unique candidates, with the first two as the opening pair. Creation spends 5 of the administrator's daily credits. Rooms are not seeded automatically.

## Included

- Ongoing rooms with 24-hour matchups and a five-minute scheduled rollover, also checked when a room opens. Votes close on the server at the deadline. Rollover starts the next full 24-hour window; scheduler outages do not create phantom wins.
- Free authenticated voting, one vote per account per matchup.
- Ten credits shared across rooms, resetting at midnight UTC without rollover. Discussion submissions cost one credit, candidate support costs two. One candidate support per matchup.
- Transactions serialize voting, credit spending, and rollover. Retry receipts prevent charging twice for a repeated request. The frontend retains the comment request ID after a failed request.
- Winning candidates defend the chair. A tie retains the first member of the matchup (the incumbent, or first opening candidate) but awards no win. Zero votes rerun the same pair without awarding a win.
- Most-supported eligible challenger wins nomination; ties use server-side cryptographic randomness. Without nominations, the first eligible reserve enters. Candidates sit out two matchups before returning. Rooms pause if no replacement is available.
- Chair wins, streaks, paginated history and discussion, stable room URLs, guest reading, responsive keyboard-operable voting controls.
- Admin pause/resume, adding curated candidates, comment review/removal, debate-access restrictions and restoration, private moderation audit log.

## Moderation boundary

This release deliberately holds **all comments for human review**. It is not an automated content classifier. Only approved comments enter the public discussion collection. Pending messages and moderation logs cannot be read through the public endpoints. Discussion refreshes every 30 seconds while visible; it is not a socket-based chat.

Restrictions apply to GOAT participation only; they do not disable the user's entire I'm Tourn account. No automatic permanent bans. Appeals use existing site feedback; admins can restore access using the user ID shown in the review queue. Reviewers should record appeals/decisions through their existing support process.

Before scaling beyond the pilot: connect an authenticated server-side moderation provider, define thresholds and warning/temporary-restriction policy, provide users a private moderation inbox, add reporting/replies, and implement reviewed sitewide enforcement. Keep pending-by-default behavior if classification fails. Public room creation and free-form candidate nominations are intentionally unavailable during the featured pilot. Semantic aliases are curated by admins; only equivalent spacing/case/Unicode forms are automatically deduplicated.

## Deployment and validation

The existing GitHub backend workflow deploys the new callable functions and `advanceGoatDebates` scheduler. Existing default-deny Firestore rules protect the new API-owned collections (`goatDebates`, `goatAccounts`); no client rule grants or compound indexes are needed. No API keys or new npm dependencies are required for this pilot.

Wait for both backend and frontend workflows before testing. If the frontend arrives first, Arena may show a retryable endpoint error until backend deployment completes. Other application features are unchanged.

`npm run check` includes lifecycle tests. `npm run test:rules` includes Firestore emulator tests covering auth, concurrent voting, credit spending/idempotency, private review, restrictions, and once-only rollover. CI supplies Java 21 for the emulator.
