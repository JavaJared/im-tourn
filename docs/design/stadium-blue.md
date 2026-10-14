# Stadium Blue redesign — audit, system and rollout

Status: first implementation on `redesign/stadium-blue`, based on main `bf0904e`. This branch is a review candidate, not a completed production redesign. No backend, authentication, security rule, daily rollover, scoring, nomination, or save behavior is intentionally changed.

## 1. Current-state assessment

The source audit found 37 CSS files totaling 7,695 lines before this work. `App.css` imports more than twenty cascading feature styles. Components also inject inline style objects. `base.css`, `design-system.css`, feature files and `accessibility.css` each redefine parts of the palette. Lazy-loaded CSS can arrive after the shared stylesheet. A blanket light palette would leave white labels on white surfaces or dark fields with dark text.

| Finding | Evidence | Decision |
|---|---|---|
| Fragmented visual identity | Orange/teal root colors; purple “Neon Tokyo” weekly theme; separate arena, profile, notification and bracket styles | One semantic Stadium Blue system. Migrate whole surfaces, including states, rather than swapping global hex codes |
| Header organized by individual tools | Home/For You, Explore, Pools plus flag-dependent destinations | Home / Explore / My Stuff / Create. Preserve URLs; move tool discovery into Explore |
| Weak hierarchy in feed | Mixed metadata, generic secondary participation button, large span between footer actions | Creator → type → athletic title → preview → one blue participation action |
| Bracket thumbnails need width | Recent work deliberately widened feed after unreadable entry labels | Use a 1,000px preview feed, with copy limited to 65ch; do not blindly adopt 640px text-feed width |
| Duplicate Create access | Page headings and global navigation would compete | One global Create menu; remove local duplicate on Home and Explore |
| My Activities is hard to discover | Account dropdown, despite being the personal task dashboard | Promote to My Stuff, preserving `?view=my-activities` and existing filters |
| Good functionality already exists | `useViewNavigation`, `RoundNavigator`, three-step `CreatePage`, `useDialog`, `ActionDisclosure`, existing save and retry tests | Preserve engines and state logic. Restyle/migrate these instead of rebuilding |
| GOAT hierarchy lacks a focal point | Equal text buttons and dark boxes | Larger contender cards, chair label, vote bars and VS composition. Keep vote visibility/rules unchanged |
| Not all features are public | `FEATURES` disables drafts, predictions and champions; Kristin Tiers intentionally unlisted | Do not expose these through a redesign. Preserve private links and rollout decisions |
| Anonymous and account routes differ | Guest bracket play works; personal activities require auth | Keep guest participation and clear login actions; do not turn navigation into an auth barrier |
| Accessibility safeguards are valuable | Dialog stack/inert branches, focus restoration, native link modifier clicks, zoom fixes | Retain and test. Radix handles only newly migrated menus for now |
| Feed supports only four content types | `useForYouFeed` accepts legacy/custom/ranking/post | Do not draw fake debate or pool posts. Later feed expansion needs backend retrieval and eligibility work |

This is a repository audit, not a claim that all live authenticated screens have been visually tested. Local fixture previews must be distinguished from production data.

## 2. Final light design system

Source of truth: `src/styles/stadium/tokens.css`. Brand values are fixed; semantic values provide accessible text and state variants.

| Token | Light value | Usage |
|---|---|---|
| canvas | `#F8FAFC` | Page background |
| surface | `#FFFFFF` | Cards and dialogs |
| subtle | `#E8EEF5` | Secondary surface, disabled controls |
| ink | `#15253F` | Primary text |
| muted | `#52627A` | Supporting text and metadata |
| line | `#D4DDEA` | Decorative card dividers |
| control-line | `#718198` | Input/control boundary requiring contrast |
| brand | `#1463FF` | Primary action background |
| brand-hover / active | `#084ED6` / `#073B9E` | Interactive states |
| brand-soft | `#EAF1FF` | Selected tab/card background |
| on-brand | `#FFFFFF` | Blue button text |
| accent | `#FF693B` | Non-text competitive accent |
| accent-ink / soft | `#A72F0D` / `#FFF0EA` | Orange badge text/background |
| success / soft | `#116B45` / `#E7F6EF` | Correct, alive, completed |
| warning / soft | `#885000` / `#FFF4D8` | Deadline/needs attention |
| danger / soft | `#B42332` / `#FFF0F1` | Incorrect, eliminated, validation error |
| focus | `#084ED6` | 3px focus ring with 3px offset |
| disabled | `#64748B` | Disabled text, with native disabled semantics |

Selection is always accompanied by text/checkmark or `aria-pressed`. Correct/incorrect and Alive/Eliminated retain text, not only a green/red signal. “Draft” uses neutral badges; “Published” uses success. An unread notification uses a blue marker **and** unread text. Numeric rank is primary; orange is reserved for a winner/chair moment. Information uses brand-soft with brand-hover text.

### Typography and geometry

- Inter 400/500/600/700/800: UI, body, forms, navigation. Body 16px / 1.5; supporting text 14px / 1.5; metadata 12px minimum.
- Barlow Condensed 600/700/800: competition titles and display moments. Ordinary forms and section headings stay in Inter. Space Grotesk adds a third voice without enough benefit and is not installed.
- Page heading: Inter 29–40px, weight 800. Section heading 20–24px/700. Card heading 20px/700, or Barlow 28–36px for competition content. Matchup contender: Barlow 32–60px.
- Data: tabular numerals. No all-caps paragraphs; uppercase reserved for compact role labels.
- Spacing: 4, 8, 12, 16, 24, 32, 48px. Cards 16–24px padding; 16px radius. Buttons/inputs 10px radius and at least 44px height.
- Page width 1280px; feed preview width 1000px; readable prose 65ch. Phone padding 12–16px, desktop 24–32px.
- 160ms color/border transitions. No scale-on-hover, glow, animated layout shifts, or motion needed to understand state. Respect reduced motion.
- Form error: visible message adjacent to field with `aria-describedby`, `aria-invalid` when applicable. Label stays visible; placeholder never substitutes for label.
- Reuse existing save/retry and loading flows. Feed skeleton is an announced single status; animated shapes are hidden from assistive technology. Bracket loader remains available for actual competition loading.

### Responsive conventions

At <=800px, navigation becomes a four-column row below the brand/account row. At <=600px, card padding reduces and primary participation actions take the full footer width. It remains in document flow so keyboard focus, browser zoom and soft keyboards cannot be covered by a fixed bottom bar. A bottom bar can be reconsidered after Android safe-area testing.

No fixed page min-width. Use `minmax(0,1fr)`, wrapping names, horizontally scrollable **bracket regions**, not horizontal page scrolling. Test 360, 390, 768, 1280 and 1440 CSS pixels plus a narrow reflow equivalent to 200%/400% zoom.

### Logo review

The existing text identity and all favicon/app/social assets remain. The component catalog shows two **unapproved** concepts: condensed uppercase wordmark with bracket mark, and lowercase `i’m tourn.` wordmark with a compact tournament symbol. Evaluate at 24px, app icon size and on white/blue. Prefer option A for athletic recognition; option B is friendlier but less sports-specific. Do not ship either icon until reviewed.

### Dark mode

Not enabled in this release. A future complementary theme should use navy canvas, lighter navy surfaces, light text, lighter blue foreground links and independently verified action text. The temporary legacy container is **not** a dark-mode implementation. Introducing a switch before every surface is tokenized would advertise incomplete support.

## 3. Navigation proposal

| Entry | Existing route | Contents |
|---|---|---|
| Home | `/` | For You feed, current recommendation refresh and social posts |
| Explore | `?view=browse` | Brackets, Rankings, GOAT Arena, Pools, Weekly bracket |
| My Stuff | `?view=my-activities` | Everything, Needs attention, My brackets, Saved picks, Pools, Rankings |
| Create | Menu, not a new route | Bracket, Ranking, Bracket pool, Request a GOAT debate |
| Account | Existing profile/friends/admin routes | Profile, Friends, admin panel (authorized users), log out |
| Bell | Existing notification system | Sent bracket notifications; no unsupported event types implied |

Current deep links/bookmarks continue unchanged. Drafts, predictions and champions remain controlled by their existing feature flags; when enabled their Explore/Create entries become available. Kristin Tiers remains unlisted. Do not rename private tier tools “public Tier Lists” or promise generic tier creation before it exists.

Explore search remains feature-specific until a real unified catalog endpoint can paginate/filter across types. This first slice unifies destination discovery, not cross-type search. Existing home refresh behavior stays intact.

## 4. Technology assessment and integration

The inspected project uses React 18, Vite 8, Firebase 12 and Capacitor 8. The registry peer ranges checked during implementation accept React 18 for Lucide/Radix and Vite 8 for Tailwind's Vite plugin.

| Tool | Decision | Reason/tradeoff |
|---|---|---|
| Tailwind CSS 4.3.3 + Vite plugin | Added, `tw:` prefix, no Preflight | Useful for shared layout primitives; prevents `.container` collisions and global resets of bracket/SVG/form defaults |
| Lucide React 1.55.0 | Added | One icon language; named imports; icons supplement meaningful labels |
| Radix Dropdown Menu 2.2.1 | Added for global Create/account menus | Keyboard arrows, Escape, focus restoration, collision handling and portals |
| shadcn/ui | Adopt source-owned composition approach; no bulk generator/import yet | Existing accessible dialog hook works. Migrate individual components to the same tokens, not a second theme or wholesale dialog rewrite |
| Motion | Defer | CSS covers current restrained transitions; avoid another runtime for hover effects. Add lazy feature subset only for concrete choreography |
| dnd-kit | Defer to ranking/tier editor migration | Must preserve keyboard move-up/down alternatives and current saving. Do not replace the bracket engine with drag-and-drop |
| Bootstrap | Do not add | Overlaps Tailwind/reset/component styling and increases conflict risk |
| React/router/framework | Preserve | Existing route state and deep links have regression coverage; no migration is required for this design |

Shared foundation now includes Button, Badge, EmptyState, FeedSkeleton and CreateMenu. Future migrations should add field wrappers, avatar/profile previews and competition-card composition into the same `components/ui` folder. Avoid speculative unused components. `ActionDialog` and `useDialog` remain the existing dialog implementation.

Official references checked:
- https://tailwindcss.com/docs/preflight (selective imports without Preflight)
- https://tailwindcss.com/docs/installation/using-vite
- https://ui.shadcn.com/docs/installation/manual
- https://www.radix-ui.com/primitives/docs/components/dropdown-menu
- https://lucide.dev/guide/react/
- https://motion.dev/docs/react-reduce-bundle-size
- https://dndkit.com/legacy/presets/sortable/overview/

## 5. Page-by-page plan

| Surface | Specific redesign | State |
|---|---|---|
| Shell/navigation | Light header, four choices, one Create menu, account and bell | Implemented first slice |
| Home feed | Consistent card hierarchy, readable thumbnails, blue CTA, restrained metadata, skeleton/empty state | Implemented first slice for existing content types |
| Explore | Unified destination navigation, then shared catalog/search/filter patterns | Navigation and catalog palette migrated in second slice |
| GOAT rooms | Chair/challenger roles, VS, vote bars, large names; preserve discussion/nomination/admin behavior | Implemented first slice |
| My Stuff | Promote route, light cards and filter chips; retain actual source categories | Implemented first slice |
| Bracket view | Tokenize `BracketFrame`/`BracketBoard` and inline colors; align connectors/states; retain round mode, overview, next unanswered, friend/consensus views | Implemented second slice; real-account acceptance pending |
| Bracket creation | Refine existing Details → Entries → Preview flow, retain arbitrary sizes, byes/seeds and ranking conversion | Implemented second slice; real-account acceptance pending |
| PNG export | Carry approved bracket palette into actual exported DOM; validate tall/two-sided brackets and transparent backgrounds | Light palette and pending-label fit fixed; actual local PNG download verified |
| Rankings | Clear numbered rows, one primary save action, accessible reordering controls; consistent validation | Styles migrated second slice; ranking form checked locally |
| Tier lists | Restyle private editor, retain current visibility and keyboard alternatives; no new public exposure | Final styling complete; local tile/dialog checks passed |
| Pools/predictions | Light directory cards; preserve My Picks/Official Results/Standings/Rules; stat columns with aligned numerals | Bracket pools and disabled predictions migrated; feature gates preserved |
| Standings | Position/username, score, remaining possible, status; secondary actions in detail disclosure | Migrated second slice; potential-point tie ordering preserved |
| Profiles/friends | Light social header and content tabs, shared avatars/cards; retain username/bio/edit/request behavior | Migrated second slice; public profile fixture checked |
| Notifications | Light dialog, readable unread state, existing sent-bracket destinations, focus and dismissal | Migrated second slice; real inbox acceptance pending |
| Auth/settings | Tokenized labels/fields/errors, maintain username onboarding and provider behavior | Dialog palette migrated; authentication behavior unchanged |
| Weekly bracket | Remove isolated neon theme; preserve voting/results | Theme migrated second slice; weekly voting acceptance pending |
| Admin | Separate participant and admin areas; semantic danger actions and confirmation patterns | Theme migrated second slice; authorized admin acceptance pending |
| Legal/feedback | Consistent typography and dialog controls; do not edit policy claims during styling | Light typography/dialogs applied; policy text unchanged |

## 6. Roadmap, dependencies and release gates

1. **P0: foundation + first surfaces (this branch).** Establish tokens, audit, navigation, modern menus, feed, Arena and My Stuff. Build, route/interaction regression tests, semantic contrast tests and local screenshots.
2. **P0: bracket system.** Replace inline colors at their source. Exercise legacy/custom, byes, seeds, round mode, friends/consensus, guest play, saved picks and PNG export before declaring a light bracket complete.
3. **P1: Explore and creation.** Shared catalog cards/filters and existing guided builders. Preserve return destination and native links. Unified cross-type search is a separate backend-dependent increment.
4. **P1: rankings, pools, profiles, notifications and auth.** Migrate whole stateful surfaces and portals. Remove each from `legacySurface()` only when fields, errors, dialogs and empty states have been checked.
5. **P2: remaining weekly/private/admin/support screens.** Remove redundant theme files and compatibility aliases after last consumer migrates. Inter and Barlow are already self-hosted/subsetted in this slice; remove Outfit/Bebas when no consumer remains.
6. **Release review.** Review logo concepts; check representative desktop/mobile/guest/account/host screens, keyboard paths, contrast, slow/offline loading, browser zoom and Android WebView. Compare bundle size, route chunks and PNG behavior. Merge only a coherent reviewed release, never this unfinished cross-site migration automatically.

### Integration and known limitations

The temporary `legacySurface(view)` routing wrapper and `legacy-bridge.css` were removed in the final cleanup after tier, draft and prediction styles migrated. Existing semantic variable aliases remain because feature components still consume them; all resolve to the same light palette.

Inter (variable Latin) and Barlow Condensed (Latin 600/700/800) are self-hosted with font-display: swap. All remaining font consumers now use those self-hosted families; the old Google font import has been removed. No dark toggle is shipped. No live-site or private-account review is claimed. The component catalog uses clearly marked fixtures. Server functions and permissions are unchanged. Existing Firebase's large chunk warning remains; do not confuse it with a failed build.

Use `npm run dev` and open `/design-preview.html` for a local component catalog and representative concepts; this HTML is not a production build entry. Production remains on `main`. Review branch only, no manual Netlify deployment.


## Review evidence

Local Chromium screenshots use fixture content with external API requests intercepted. No production data was read or written. They are design examples, not claims about current activity on the live site.

| Surface | Desktop | Phone |
|---|---|---|
| Previous feed | [Before](screenshots/before-feed-1440.png) | [Before](screenshots/before-feed-390.png) |
| Stadium Blue feed | [After](screenshots/feed-1440.png) | [After](screenshots/feed-390.png) |
| GOAT matchup | [Desktop](screenshots/arena-1440.png) | [Phone](screenshots/arena-390.png) |
| Components and logo options | [Catalog](screenshots/concepts-1440.png) | [Catalog](screenshots/concepts-390.png) |

Validation: build passes; 281 unit/component tests passed, with 97 existing emulator-dependent tests skipped in this non-emulator run. New semantic contrast tests pass normal-text 4.5:1 and control/focus 3:1 thresholds for specified token pairs. This is not a full WCAG conformance claim. Local fixtures checked at 360/390/768/1280/1440px; Create keyboard open/arrows/Escape/focus restoration and mobile route selection verified. See `local-review.json`. Authenticated real-account, Android emulator and cross-browser visual acceptance remain pending.


## Second slice: competition and supporting screens

The branch now applies Stadium Blue to bracket browsing, the guided creator and custom editor, playable/saved brackets, ranking forms/results, pools and standings, profiles/friends, social dialogs, notifications, authentication/feedback dialogs, weekly brackets and admin styles. `competitionTheme.js` provides one semantic palette for bracket roots. The rendering engine, seeding, scoring, save services, access rules, routes and data schemas have not changed.

The mobile round selector now has enough room for its full label. Pending matchup text is constrained within its slot, including image exports. PNG export reads the rendered background instead of hard-coding the former dark canvas. Alive and Eliminated retain both distinct text and semantic green/red colors. Pool browsing now shares the Explore destination navigation.

Final cleanup migrated private tier lists and disabled drafts/predictions and removed the dark containment layer. They remain unlisted/disabled as before. Actual account/host workflows, weekly voting, notifications and admin operations still need acceptance review; styling implementation is not a claim that those live operations were exercised.

### Second-slice evidence

- Production build passed; existing Firebase chunk warning remains.
- Offline unit/component run: 281 passed, 97 emulator-dependent tests skipped. An initial unguarded run was stopped by automatic review after an existing test attempted a Firebase request. The successful run disabled both Node sockets and fetch before loading tests; it did not require production access.
- Local Chromium fixtures at 360, 390, 768, 1280 and 1440px: no page overflow or uncaught errors for profile, ranking directory, pool guest state and bracket/standings catalog.
- Keyboard bracket pick, next unanswered, Create menu focus restoration and route navigation checked. Actual PNG generated and inspected.
- Local fixture authentication checked the five-entry creator (automatic byes, review step) and ranking form at 390/1440px. No bracket or ranking was published and no account credentials were used.
- These checks do not substitute for real-account acceptance, cross-browser, Android or full accessibility review.

| Surface | Desktop | Phone |
|---|---|---|
| Playable bracket | [Desktop](screenshots/competition-1440.png) | [Phone](screenshots/competition-390.png) |
| Pool standings | [Desktop](screenshots/standings-1440.png) | [Phone](screenshots/standings-390.png) |
| Bracket creation review | [Desktop](screenshots/create-1440.png) | [Phone](screenshots/create-390.png) |
| Ranking creation | [Desktop](screenshots/create-ranking-1440.png) | [Phone](screenshots/create-ranking-390.png) |
| Rankings | [Desktop](screenshots/rankings-1440.png) | [Phone](screenshots/rankings-390.png) |
| Public profile | [Desktop](screenshots/profile-1440.png) | [Phone](screenshots/profile-390.png) |
| Pools guest state | [Desktop](screenshots/pools-1440.png) | [Phone](screenshots/pools-390.png) |

See `competition-review.json` for fixture check coverage. The PR remains a draft, with production still on main.


## Final styling cleanup

- Tier tiles, item dialogs, draft cards and prediction controls now use the shared light surfaces, borders, status colors and typography. Feature flags, access rules, tier definitions and persistence are unchanged.
- Removed the dark route wrapper, `legacy-bridge.css`, duplicate dark root token definitions, all Outfit/Bebas declarations and the external Google Fonts import. Kept semantic aliases used by existing feature components.
- Fixed the onboarding tour button's missing background token and retained readable text on global primary actions, including portals.
- Build passed; network-blocked unit/component suite: 281 passed, 97 emulator-dependent tests skipped.
- Local fixture review at 360/390/768/1440px: no horizontal overflow or page errors; tier selection works by keyboard; item dialog closes with Escape. Public draft and prediction URLs remain gated.
- [Supporting screens desktop](screenshots/supporting-1440.png), [mobile](screenshots/supporting-390.png), [tier item dialog](screenshots/tier-dialog-390.png). Coverage is recorded in `final-review.json`. Examples use production presentation components where available and explicitly labeled local markup for prediction/weekly controls.

### Remaining release decisions

The coding cleanup is complete. Keep PR #27 in draft until the user reviews the appearance and real-account flows. Logo selection, final favicon/app icon replacement, authenticated host/admin/notification checks, Android/cross-browser acceptance, and merging to main are not claimed complete. Existing logos remain unchanged. No live-site access or manual Netlify deployment was performed.
