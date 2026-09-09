# I'm Tourn

Tournament brackets, weekly voting, pools, rankings and tier lists. Production: [imtourn.com](https://imtourn.com), hosted on Netlify.

There is one application, at the **repository root**. The former nested app has been moved here and the outdated duplicate removed. Use Node 22 and Java 21+ for Firebase emulators.

```sh
npm ci
npm --prefix functions ci
npm run dev
```

`npm run check` runs regressions and builds the app. `npm run test:rules` runs isolated Firestore/Storage permission and server-transaction tests. `VITE_USE_EMULATORS=true` connects the app to the `demo-im-tourn` emulator project.

## Where code belongs

| Location | Responsibility |
| --- | --- |
| `src/App.jsx` | App shell: authentication provider, header, content, footer and dialogs |
| `src/app/` | Route selection, lazy page imports, navigation and restored app state |
| `src/pages/brackets/` | Browse, create, fill, saved brackets and PDF export |
| `src/pages/pools/` | Pool pages and separate bracket, leaderboard, sleeper and participant-analysis panels |
| `src/pages/predictions/` | Existing prediction-pool pages; feature visibility remains configurable |
| `src/pages/admin/` | Weekly bracket administration and feedback inbox |
| `src/components/` | Shared UI plus existing ranking, draft, tier and custom-bracket components |
| `src/config/app.js` | Feature visibility, categories and UI administrator IDs |
| `src/services/`, `src/lib/` | Firebase operations, scoring, bracket algorithms and shared hooks |
| `functions/` | Firebase backend and generated shared scoring bundle |
| `tests/` | Regression, UI routing, security-rule and transaction tests |
| `public/` | Icons, manifest and service worker |

## Deployment

Netlify reads the root `netlify.toml`: base `.`, build command `npm run build`, publish directory `dist`. These explicit settings override the old nested-directory build values. Do not point builds to `im-tourn/dist` or recreate an inner application folder.

GitHub Actions install and test at the root, with a separate dependency install in `functions/`. Firebase configuration and all three deployment/verification workflows use the same layout. Only the root frontend `package-lock.json` and the backend `functions/package-lock.json` are needed; the backend is a separate runtime, not a second website.

See [SETUP.md](SETUP.md) for setup and [REPAIRS.md](REPAIRS.md) for deployment order, security-rule rollout, verification and rollback limits. Previous application versions remain available in Git history.
