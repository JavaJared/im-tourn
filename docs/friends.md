# Friends

Open **Friends** in the profile dropdown. Share the displayed friend code, or paste someone else's code to send a request. The recipient must explicitly accept; crossing requests do not automatically accept. Incoming requests can be declined, outgoing requests canceled, and either person can remove an accepted friend.

Sending/accepting shares past and future published creations and standalone saved bracket/ranking choices. The on-page disclosure explains this before either action. Friends do not grant access to private pools, join codes, unpublished custom brackets/rankings, disabled drafts, tier lists, or device-only drafts. Existing public content stays public after unfriending; friend history APIs reject subsequent access.

On Brackets and Rankings, **Whose activity?** selects an accepted friend and **Friend's activity** switches between Created and Filled out / voted in. These are server-filtered, paginated queries, not a filter of the first public catalog page. Search/sort still apply to loaded results. Filled activity opens a read-only dialog with saved choices by round or ranking order. The Friends page also has an activity view.

## Backend

- `friendProfiles/{uid}`: own display name and random 96-bit share code.
- `friendCodes/{code}`: server-only code-to-UID lookup. No email lookup or directory.
- `friendships/{sha256(sorted pair)}`: one canonical relationship, member IDs, requester, display names and status. Transactional state transitions prevent self-acceptance and duplicate/cross-request auto-acceptance.
- `friendRequestLimits/{uid}`: transactional daily cap of 20 new requests. Dismissed/removed pairs have a 24-hour resend cooldown.
- All new collections use the existing default-deny Firestore rules; clients only access callable APIs. No rule relaxation or data migration is required.
- Metadata history pages contain at most 12 source records, friend pages at most 25. Parent reads are bounded by a page. Deleted/unpublished parents and unrelated collection-group paths are omitted. Cursors may produce an empty page after filtering; Load more continues.
- Saved-choice reads validate friendship, source type, owner and published parent, and recheck friendship after reads. They return only presentation fields, never a full account/pool record.
- Removing a friend cannot retract data already seen or downloaded.

## Deployment and verification

Backend release 5 deploys six callable APIs and verifies their query indexes before setting the readiness marker. The readiness endpoint keeps `version: 4` for earlier frontend compatibility and adds `friendsReady: true` when release 5 is ready. The new production frontend requires both. A Netlify build started before backend deployment finishes must be retried; the previous live site stays online.

`tests/friends-server.test.js` runs in the existing Firestore emulator CI gate, covering consent transitions, quotas, revocation, publication status, pagination, custom/legacy picks, ranking order and ownership. `tests/rules.test.js` checks clients cannot read/write friend collections. `tests/friends-ui.test.jsx` checks request actions, accepted-only selectors, server filter parameters, dialogs and routing.

Manual authenticated acceptance: with two accounts, exchange a code, accept, inspect created and filled activity in Friends and both browse pages, remove the friendship, then refresh and verify history is denied. Existing Android installations require an updated APK to show the feature.
