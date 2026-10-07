# GOAT Arena featured-room pilot

Entry: Explore → GOAT Arena (`/?view=arena`). Administrators see a “Create featured debate” disclosure. Supply 4–50 unique candidates, with the first two as the opening pair. Creation spends 5 of the administrator's daily credits. Rooms are not seeded automatically.

## Included

- Ongoing rooms with 24-hour matchups and a five-minute scheduled rollover, also checked when a room opens. Votes close on the server at the deadline. Rollover starts the next full 24-hour window; scheduler outages do not create phantom wins.
- Free authenticated voting, one vote per account per matchup.
- Ten credits shared across rooms, resetting at midnight UTC without rollover. Discussion submissions cost one credit, new challenger nominations or existing-candidate support cost two. One combined nomination/support per account per matchup. Matching normalized names merge into the same candidate, including concurrent submissions; they add support rather than duplicate records. New names await admin approval before appearing publicly. Support counts apply only to their submission matchup.
- Transactions serialize voting, credit spending, and rollover. Retry receipts prevent charging twice for a repeated request. The frontend retains the comment request ID after a failed request.
- Winning candidates defend the chair. A tie retains the first member of the matchup (the incumbent, or first opening candidate) but awards no win. Zero votes rerun the same pair without awarding a win.
- Most-supported eligible challenger wins nomination; ties use server-side cryptographic randomness. Without nominations, the first eligible reserve enters. Defeated candidates cannot return during the same GOAT Chair reign. When the chair changes, earlier defeated candidates unlock; the newly defeated incumbent is locked for the new reign. All returning candidates also sit out at least two matchups. Existing history is used to initialize this rule for pre-update rooms. Rooms pause if no replacement is available.
- Chair wins, streaks, paginated history and discussion, stable room URLs, guest reading, responsive keyboard-operable voting controls.
- Admin pause/resume, adding curated candidates, reviewing nominated challengers, comment review/removal, debate-access restrictions and restoration, private moderation audit log.

## Moderation boundary

This release deliberately holds **all comments for human review**. It is not an automated content classifier. Only approved comments enter the public discussion collection. Pending messages and moderation logs cannot be read through the public endpoints. Discussion refreshes every 30 seconds while visible; it is not a socket-based chat.

Restrictions apply to GOAT participation only; they do not disable the user's entire I'm Tourn account. No automatic permanent bans. Appeals use existing site feedback; admins can restore access using the user ID shown in the review queue. Reviewers should record appeals/decisions through their existing support process.

Before scaling beyond the pilot: connect an authenticated server-side moderation provider, define thresholds and warning/temporary-restriction policy, provide users a private moderation inbox, add reporting/replies, and implement reviewed sitewide enforcement. Keep pending-by-default behavior if classification fails. Public room creation remains unavailable during the featured pilot. Users may nominate new challengers under Next challenger; admins approve or reject them in Host controls & moderation → Review nominated challengers. Rejected names cannot bypass the decision through capitalization or spacing changes. Equivalent spacing/case/Unicode forms and curly apostrophes are deduplicated; semantic aliases such as “MJ” versus “Michael Jordan” are not automatically inferred. Users can still nominate when a room is paused awaiting a challenger. When a paused room has no challenger, approving a new candidate fills that slot; an admin then resumes the matchup.

## Deployment and validation

The existing GitHub backend workflow deploys the new callable functions and `advanceGoatDebates` scheduler. Existing default-deny Firestore rules protect the new API-owned collections (`goatDebates`, `goatAccounts`); no client rule grants or compound indexes are needed. No API keys or new npm dependencies are required for this pilot.

Wait for both backend and frontend workflows before testing. If the frontend arrives first, Arena may show a retryable endpoint error until backend deployment completes. Other application features are unchanged.

`npm run check` includes lifecycle tests. `npm run test:rules` includes Firestore emulator tests covering auth, concurrent voting, credit spending/idempotency, private review, restrictions, and once-only rollover. CI supplies Java 21 for the emulator.
