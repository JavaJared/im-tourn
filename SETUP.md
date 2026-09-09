# Setup and deployment

All commands below run from the repository root. There is no nested application directory.

## Local development

Use Node 22. Java 21 or newer is also required for Firebase emulator tests.

```sh
npm ci
npm --prefix functions ci
npm run dev
```

Vite serves the app at the local address printed in the terminal. Firebase web configuration lives in `src/firebase.js`; the existing production project is `i-m-tourn`. Firebase supports email/password and Google sign-in through `src/contexts/AuthContext.jsx`.

For isolated development against emulators, set `VITE_USE_EMULATORS=true` in an ignored local environment file and start the required Firebase emulators using project `demo-im-tourn`. The checked-in test command below starts its own Firestore and Storage emulators and never uses production data.

## Verification

```sh
npm run check
npm run test:rules
```

`check` builds the shared server scoring bundle, runs regressions and UI module tests, runs the backend helper assertions, and builds `dist/`. The emulator suite tests security rules and real server transactions separately.

## Production website: Netlify

Production is https://imtourn.com, Netlify site `8048488b-f6ff-44b3-9f7f-fbd38e6780b3`.

The root `netlify.toml` explicitly configures:

| Setting | Value |
| --- | --- |
| Base directory | Repository root (`.`) |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | `22` |

These file settings override corresponding Netlify UI values. If editing the UI, keep its base/package directory at the root and its publish directory at `dist`; the previous nested paths are obsolete. SPA redirects and service-worker cache headers also remain in `netlify.toml`.

Production builds check Firebase backend readiness before publishing. A failed build leaves the existing deployment online. For a manual source upload, use a clean Git checkout/export rather than a directory containing installed dependencies or local environment files.

## Firebase backend

The root `firebase.json` points to `functions/`, `firestore.rules`, `firestore.indexes.json`, and `storage.rules`. Its predeploy command builds `functions/generated/scoring.cjs` from `src/lib/serverScoring.js`.

The **Deploy Firebase Backend** GitHub Actions workflow uses the existing `FIREBASE_SERVICE_ACCOUNT` secret to test and deploy Functions/indexes, then enables the frontend readiness marker. It preserves configured artifact retention and does not force function deletion.

The **Deploy Firebase Rules (after frontend)** workflow is a separate, manual step after signed-in frontend checks. See [REPAIRS.md](REPAIRS.md) for the current rollout requirements and rollback constraints.

The Firebase Hosting configuration is retained for compatibility, but Netlify serves the production website. `firebase deploy --only hosting` does not publish to imtourn.com.
