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
| Explore | Unified destination navigation, then shared catalog/search/filter patterns | Navigation done; individual catalog visuals pending |
| GOAT rooms | Chair/challenger roles, VS, vote bars, large names; preserve discussion/nomination/admin behavior | Implemented first slice |
| My Stuff | Promote route, light cards and filter chips; retain actual source categories | Implemented first slice |
| Bracket view | Tokenize `BracketFrame`/`BracketBoard` and inline colors; align connectors/states; retain round mode, overview, next unanswered, friend/consensus views | Next core slice |
| Bracket creation | Refine existing Details → Entries → Preview flow, retain arbitrary sizes, byes/seeds and ranking conversion | Next core slice |
| PNG export | Carry approved bracket palette into actual exported DOM; validate tall/two-sided brackets and transparent backgrounds | Required alongside bracket migration |
| Rankings | Clear numbered rows, one primary save action, accessible reordering controls; consistent validation | Pending |
| Tier lists | Restyle private editor, retain current visibility and keyboard alternatives; no new public exposure | Pending |
| Pools/predictions | Light directory cards; preserve My Picks/Official Results/Standings/Rules; stat columns with aligned numerals | Pending |
| Standings | Position/username, score, remaining possible, status; secondary actions in detail disclosure | Pending, preserve potential-point tie ordering |
| Profiles/friends | Light social header and content tabs, shared avatars/cards; retain username/bio/edit/request behavior | Pending |
| Notifications | Light dialog, readable unread state, existing sent-bracket destinations, focus and dismissal | Pending |
| Auth/settings | Tokenized labels/fields/errors, maintain username onboarding and provider behavior | Pending |
| Weekly bracket | Remove isolated neon theme; preserve voting/results | Pending |
| Admin | Separate participant and admin areas; semantic danger actions and confirmation patterns | Pending |
| Legal/feedback | Consistent typography and dialog controls; do not edit policy claims during styling | Pending |

## 6. Roadmap, dependencies and release gates

1. **P0: foundation + first surfaces (this branch).** Establish tokens, audit, navigation, modern menus, feed, Arena and My Stuff. Build, route/interaction regression tests, semantic contrast tests and local screenshots.
2. **P0: bracket system.** Replace inline colors at their source. Exercise legacy/custom, byes, seeds, round mode, friends/consensus, guest play, saved picks and PNG export before declaring a light bracket complete.
3. **P1: Explore and creation.** Shared catalog cards/filters and existing guided builders. Preserve return destination and native links. Unified cross-type search is a separate backend-dependent increment.
4. **P1: rankings, pools, profiles, notifications and auth.** Migrate whole stateful surfaces and portals. Remove each from `legacySurface()` only when fields, errors, dialogs and empty states have been checked.
5. **P2: remaining weekly/private/admin/support screens.** Remove redundant theme files and compatibility aliases after last consumer migrates. Inter and Barlow are already self-hosted/subsetted in this slice; remove Outfit/Bebas when no consumer remains.
6. **Release review.** Review logo concepts; check representative desktop/mobile/guest/account/host screens, keyboard paths, contrast, slow/offline loading, browser zoom and Android WebView. Compare bundle size, route chunks and PNG behavior. Merge only a coherent reviewed release, never this unfinished cross-site migration automatically.

### Integration and known limitations

`legacySurface(view)` keeps unconverted routes on their existing dark variables. This prevents contrast regressions from hard-coded feature styles. It is temporary containment in the **same app**, not duplicated pages or a new application. The light shell currently surrounds some dark legacy content on the branch; this is a known unfinished migration, not the final design.

Inter (variable Latin) and Barlow Condensed (Latin 600/700/800) are self-hosted with font-display: swap. The old Google font import remains for legacy components until they migrate. No dark toggle is shipped. No live-site or private-account review is claimed. The component catalog uses clearly marked fixtures. Server functions and permissions are unchanged. Existing Firebase's large chunk warning remains; do not confuse it with a failed build.

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
