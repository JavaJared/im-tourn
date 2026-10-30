# Removing bracket-pool participants

The pool host can open **Standings → Remove participant** for any other member, including a member who has not submitted picks or whose picks are private. A confirmation identifies the selected username and explains the effect. Cancel makes no changes; failed requests keep the dialog open for retry, and pending requests disable duplicate submission and dismissal. The host cannot remove their own entry.

Removal deletes the selected pool entry and its saved predictions. The entry disappears from standings, predicted-finish statistics, winning-path analysis and the member's joined-pool list. The existing participant refresh updates other viewers; the host's screen also removes the row immediately after confirmation succeeds. In completed pools, scores and all tied winner fields are recomputed atomically from all remaining canonical submissions, including entries beyond the browser's loaded pages. No remaining submitted entries means no declared winner. Official bracket results are unchanged.

The `removePoolParticipant` callable authenticates the caller and checks stored host ownership. It uses a transaction to delete the entry and create a private marker at `bracketPools/{poolId}/removedParticipants/{userId}`. `joinPrivatePool` checks that marker in its own transaction so a removed member cannot use the same invite code to immediately rejoin. The restriction applies only to that pool. Markers contain the member ID, acting host ID and removal timestamp, with no picks, names or invitation codes. Existing default-deny rules protect them; normal clients cannot create a replacement membership directly.

Removal is idempotent and serialized with result recording, completion and joining. Pool deletion and bracket reset/deletion also clean the markers. No indexes, rule changes or migration are required. The feature applies to bracket pools (the public pool feature); hidden prediction pools are unchanged.

Deploy the Firebase backend (including the updated join callable) before using the new frontend controls. The existing backend workflow deploys these exports on merge. No production data is changed merely by deployment; a host must confirm each removal.

Validation is in `tests/pool-privacy.test.js`, `tests/server.test.js` and `tests/pool-removal-ui.test.jsx`: host/auth checks, private picks, cancel/retry/double-click behavior, rejoining and direct-write denial, concurrent joins and completion, completed/tied/empty winner updates, and cleanup.
