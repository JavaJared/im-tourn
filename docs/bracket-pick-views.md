# Bracket pick views

Standalone legacy and custom fills have My Picks, Friends, and Community views. My Picks opens the latest compatible completed account save. A newer local draft takes precedence, with an unsaved-picks status. Older local drafts without timestamps are preserved conservatively. Read-only activity URLs retain their original saved-pick behavior. Switching views does not replace the editable state.

`getBracketPickView` validates the source bracket, authenticates personal reads, and checks accepted friendship before and after reading a friend's submission. Custom drafts are not exposed. It reads only standalone submissions; poolEntries and prediction-pool submissions are never queried.

Community counts each user's latest compatible completed submission once. A bracket is constructed in round order by comparing support for the currently reachable candidates advancing beyond that round. Ties use preceding-round support and then original participant order. Byes advance automatically. Zero support leaves a matchup unresolved. Percentages are proportions of all counted brackets, not conditional head-to-head percentages, and need not total 100%.

Queries select only needed fields and examine the latest 2,000 submissions for Community. Larger histories are explicitly labeled partial. Results are cached server-side for 60 seconds, keyed by source structure, and the client receives only the aggregated bracket. Personal/friend lookup examines the latest 100 submissions for that person and bracket. Custom published structure is immutable; legacy submissions must match current first-round entries, round shape, and valid advancement paths. Invalid/incomplete submissions are excluded.

The backend workflow deploys the new callable and its Firestore indexes. No Firestore or Storage rules change is needed. Automated tests cover consensus paths/ties/no-support, legacy compatibility, account draft precedence, read-only views, latest-per-user aggregation, and rejected friendship access. Backend integration tests run with Firebase emulators in GitHub Actions.
