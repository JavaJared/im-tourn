# For You

The default home route is a social feed mixing legacy brackets, published custom brackets and open rankings. Browse remains at `/?view=browse`; the rankings directory remains at `/?view=rankings`. Existing bracket, ranking, profile and pool URLs remain valid.

## Recommendations

The first version is a deterministic, bounded recommendation system, not a trained model or whole-catalog relevance search. Each request takes the next eight newest items from each of three public sources (up to 24 cards), then ranks that window using:

- Recent participation: up to ten legacy submissions, ten custom submissions, and ten ranking votes, joined to parent categories. Each distinct participated item contributes +3 category interest.
- Recent feedback: up to 100 item records. Opening a feed item contributes +1; “Not interested” contributes -3 category interest and hides that item. Repeated clicks update one record rather than multiplying its influence.
- Accepted friends: up to 100 friendships give friend-created content a boost.
- Freshness: newer content receives higher scores.
- Discovery: previously participated items and the viewer's own creations rank lower. Repeated creators and runs of one content type receive penalties within each page.

Scores: recency up to 12, category interest times two capped between -12 and +12, friend +8, previously participated -24, previously opened -3, own creation -12. Diversity penalties are seven per previously selected item from that author and six after two consecutive items of the same kind. Candidates outside the current chronological window are not compared. Future improvements can expand candidate retrieval and tune weights using real feedback.

Guests and new accounts receive fresh, varied public discoveries. Only the authenticated user's activity shapes their interests; friends' private picks are not read. Drafts, pools and unpublished content never enter this feed. A profile-loading failure falls back to discoveries with a visible status.

## Paging, performance and privacy

Timestamp-plus-ID cursors preserve nanoseconds and remain usable if a boundary document is deleted. A first-page timestamp excludes newer insertions until refresh. All sources must succeed before advancing their cursors, and the client deduplicates IDs by content type. Relevance is recomputed per window; refreshing starts over. Infinite loading stops when content is exhausted, with an honest caught-up state. A Load more button works without IntersectionObserver and supports keyboard use.

Only card metadata is downloaded. Recommendation profiles are cached in function memory for two minutes (maximum 100 accounts per instance); feedback invalidates that instance's cached profile. Every page checks candidate-specific hide records independently, so hidden items stay hidden beyond the 100-record preference sample. Category learning can take two minutes to propagate across instances. Client feed cards are kept in memory for ten minutes for return navigation, scoped to one account; they are not written to browser storage. Offscreen cards use CSS content visibility to reduce rendering work.

Feedback lives at `feedPreferences/{authenticatedUid}/items/{type}-{itemId}`. Client-supplied user IDs and categories are ignored; source type, public status, ID and action are validated server-side. Existing default-deny rules prevent direct client access. No new Firestore rules or indexes are required; existing status/date and activity indexes are reused. The backend workflow deploys `getForYouFeed` and `recordFeedFeedback`.

## Checks

Pure ranking tests cover interests, friends, hiding, participated items, diversity and guest ordering. Hook tests cover cursor retry, duplicates, account changes, late responses and hide/refresh races. The existing friends-server emulator suite covers public eligibility, mixed pagination, deleted boundaries, authenticated feedback, recipient isolation and invalid cursors. Emulator checks require GitHub's Java 21 environment. Visual review is left to the site owner.
