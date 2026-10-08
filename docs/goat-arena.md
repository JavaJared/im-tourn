# GOAT Arena featured-room pilot

Entry: Explore → GOAT Arena (`/?view=arena`). Administrators see a “Create featured debate” disclosure. Supply 4–50 unique candidates, with the first two as the opening pair. Creation is free. Rooms are not seeded automatically.

## Included

- Ongoing rooms roll over at 12:00 AM America/New_York time (EST in winter, EDT in summer). New and resumed rooms end at the next Eastern midnight; their first matchup can be shorter than a day. The five-minute recovery schedule includes midnight, and opening a room also processes a due rollover. Existing rooms are aligned automatically within a scheduled pass without resetting picks; paused rooms stay paused. Votes close at the server deadline even if scheduler execution is delayed. After an outage, only the actual played matchup earns a result; missed days do not create phantom wins. The next deadline always remains Eastern midnight.
- Free authenticated voting, one vote per account per matchup.
- Free comments and nominations. One combined nomination/support per account per matchup. Comments have a server-enforced 10-second cooldown shared across rooms.
- Matching normalized names merge into the same candidate, including concurrent submissions; they add support rather than duplicate records. New names await admin approval before appearing publicly. Support counts apply only to their submission matchup.
- Transactions serialize participation and rollover. Retry receipts prevent duplicate comments, votes, and nominations. Old credit balances are ignored and no longer displayed or updated.

- Winning candidates defend the chair. A tie retains the first member of the matchup (the incumbent, or first opening candidate) but awards no win. Zero votes rerun the same pair without awarding a win.
- Most-supported eligible challenger wins nomination; ties use server-side cryptographic randomness. Without nominations, the first eligible reserve enters. Defeated candidates cannot return during the same GOAT Chair reign. When the chair changes, earlier defeated candidates unlock; the newly defeated incumbent is locked for the new reign. All returning candidates also sit out at least two matchups. Existing history is used to initialize this rule for pre-update rooms. Rooms pause if no replacement is available.
- Chair wins, streaks, paginated history and discussion, stable room URLs, guest reading, responsive keyboard-operable voting controls.
- Admin pause/resume, adding curated candidates, reviewing nominated challengers, comment review/removal, debate-access restrictions and restoration, private moderation audit log.

## Moderation boundary

Comments are checked with OpenAI `omni-moderation-latest` once the server can access the configured secret. A complete, unflagged response with all category scores below 0.4 publishes immediately. Flagged, uncertain, malformed, timed-out, unconfigured, and failed checks stay private for review. The 0.4 threshold is a conservative starting policy, not a calibrated probability or guarantee of safety; review false positives before tuning it.

Only comment text and the model name are sent to OpenAI, not account IDs or usernames. Private queue metadata and moderation results never enter the public comment documents. Automatic review cannot override an intervening manual removal or restriction. Concurrent retries use a short processing lease to avoid duplicate checks/publication. Admins can retry held comments with **Retry automatic check**. Comments left pending by an outage or missing key do not publish retroactively without a retry or manual approval.

Discussion refreshes every 30 seconds while visible and immediately after the author's comment publishes. It is not a socket-based chat. New challenger names still require manual approval for category relevance and duplicate identities.

Restrictions apply to GOAT participation only; they do not disable the user's entire I'm Tourn account. No automatic permanent bans. Appeals use existing site feedback; admins can restore access using the user ID shown in the review queue. Reviewers should record appeals/decisions through their existing support process.

Before scaling beyond the pilot: evaluate moderation decisions and define warning/temporary-restriction policy, provide users a private moderation inbox, add reporting/replies, and implement reviewed sitewide enforcement. Keep pending-by-default behavior if classification fails. Public room creation remains unavailable during the featured pilot. Users may nominate new challengers under Next challenger; admins approve or reject them in Host controls & moderation → Review nominated challengers. Rejected names cannot bypass the decision through capitalization or spacing changes. Equivalent spacing/case/Unicode forms and curly apostrophes are deduplicated; semantic aliases such as “MJ” versus “Michael Jordan” are not automatically inferred. Users can still nominate when a room is paused awaiting a challenger. When a paused room has no challenger, approving a new candidate fills that slot; an admin then resumes the matchup.

## Deployment and validation

The existing GitHub backend workflow deploys the new callable functions and `advanceGoatDebates` scheduler. Existing default-deny Firestore rules protect the new API-owned collections (`goatDebates`, `goatAccounts`); no client rule grants or compound indexes are needed. Automatic moderation needs the server secret described below; missing configuration does not block deployment or disable the manual queue. No new npm dependencies are required.

Wait for both backend and frontend workflows before testing. If the frontend arrives first, Arena may show a retryable endpoint error until backend deployment completes. Other application features are unchanged.

`npm run check` includes lifecycle tests. `npm run test:rules` includes Firestore emulator tests covering auth, concurrent voting, free participation/idempotency, private review, restrictions, and once-only rollover. CI supplies Java 21 for the emulator.

## Activate automatic moderation

1. Create a project API key at https://platform.openai.com/api-keys with access to the Moderations endpoint. Do not put it in React, a `VITE_` variable, Netlify, source control, or chat.
2. In Google Cloud Console, select **i-m-tourn**, enable Secret Manager if necessary, and create a secret named **GOAT_MODERATION_API_KEY** containing that key. Alternatively, run `firebase functions:secrets:set GOAT_MODERATION_API_KEY --project i-m-tourn` locally and enter the key at its prompt.
3. Grant **Secret Manager Secret Accessor** on this one secret to the runtime service account(s) used by `actOnGoatDebate` and `manageGoatDebate`. Find each account in the function's runtime settings, or with:

   ```sh
   gcloud functions describe actOnGoatDebate --gen2 --region=us-central1 --project=i-m-tourn --format="value(serviceConfig.serviceAccountEmail)"
   gcloud functions describe manageGoatDebate --gen2 --region=us-central1 --project=i-m-tourn --format="value(serviceConfig.serviceAccountEmail)"
   ```

   In the secret's Permissions tab, grant that role to the returned service account(s), not to public users. If both functions use the same account, grant it once.
4. After the GitHub backend deployment finishes, open a debate's **Host controls & moderation → Check automatic moderation setup**. “Server key accessible” confirms secret access, not provider validity. Submit a harmless comment to verify provider authentication and publication. A comment remaining queued has a review reason in the admin queue.
5. To rotate the key, add a new secret version. Runtime caching lasts up to 60 seconds. Disable secret access to return to manual review; cached access can persist for that same period.

No redeployment is needed just to add/rotate the key: the server retrieves it at runtime with its own Google credentials. Missing permissions or disabled Secret Manager are handled as unavailable configuration. OpenAI 401/429/5xx errors remain in manual review. Unit tests mock the provider; emulator tests never read production secrets or send content externally.

References: https://developers.openai.com/api/docs/guides/moderation and https://cloud.google.com/secret-manager/docs/access-secret-version.
