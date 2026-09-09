# I'm Tourn

Tournament brackets, weekly voting, pools, rankings and tier lists. Production: [imtourn.com](https://imtourn.com), hosted on Netlify.

The active application is in **im-tourn/**. Use Node 22 and Java 21+ for Firebase emulators.

```sh
cd im-tourn
npm ci
npm --prefix functions ci
npm run dev
```

`npm run check` runs regressions and builds the app. `npm run test:rules` runs isolated Firestore/Storage permission and server-transaction tests. `VITE_USE_EMULATORS=true` connects the app to the `demo-im-tourn` emulator project.

See [REPAIRS.md](REPAIRS.md) for the repair scope, deployment order, verification, rollback limits and follow-up work. Root scripts/configuration forward to the active application; the old root source is retained for reference.
