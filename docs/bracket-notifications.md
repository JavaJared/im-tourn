# Shared bracket notifications

In a bracket's Friends tab, select an accepted friend. If they have no compatible completed submission, **Send bracket to friend** adds the bracket to their inbox. This works for legacy brackets and published custom brackets, not pools or drafts.

The signed-in header shows a bell with an unread count. The inbox supports opening a bracket, marking individual notifications read, refresh/retry, and pages of 25 older notifications. Opening validates that the bracket remains available before marking it read. Deleted/closed brackets can still be marked read without opening them.

Only bracket shares create notifications. No email, push, friend-request or other notification types are enabled. The badge checks on mount, focus/visibility changes and every 60 seconds while the app is visible; it is not an instantaneous push subscription. Closing the inbox does not mark items read.

Backend callables authenticate all operations. Recipient paths derive from the authenticated UID for listing and reading; request data cannot select another inbox. Sending requires an accepted friendship, an open bracket, and no compatible completed submission among the latest 100 (matching the existing picks view). Friendship, source, duplicate, submission and rate-limit checks run in a transaction. Sends are idempotent per sender/recipient/bracket, including after a notification is read, and limited to 20 new shares per sender per hour. Current usernames are hydrated when listing.

Storage uses `notificationInboxes/{uid}/items/{shareHash}` and `bracketShareLimits/{uid}`. Existing default-deny Firestore rules prevent direct client access; all access is through callables. No rule or index deployment changes are required. The existing backend deployment workflow deploys the three new functions.

Local UI tests cover send retries, success, unread badge, accessible dialog markup and open/read navigation. Firebase emulator tests in the existing friends-server suite cover authentication, recipient isolation, duplicate sends, completion checks, draft restrictions, unavailable brackets and rate limits. Those tests run in GitHub's Java 21 environment.
