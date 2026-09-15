# Android development build

This is the first Capacitor milestone, not an app-store release. It bundles the same React application and uses the existing i-m-tourn Firebase project, collections, authentication, storage and server functions. It does not copy production data or change security rules. Cloud-saved records are shared; local browser drafts and preferences are not.

## Build or download

The GitHub Actions **Build Android development APK** workflow builds on relevant pull requests and can be run manually from main. Download the imtourn-android-development artifact and extract app-debug.apk. This is a debug-signed development APK, not a Play Store release. Artifacts in this public repository are not a confidential distribution channel. Each runner may generate a different debug key; subsequent installs may require uninstalling the old build, which erases its local-only data. Production-saved records remain on Firebase.

Locally: use Node 22+, Java 21 and Android Studio with the SDK required by the locked Capacitor version. Run:

    npm ci
    npm run build:server
    npm run android:prepare
    npm run android:open

Android Studio can run the app on an emulator or attached Android device. The preparation command generates the ignored android/ shell once, then syncs fresh dist/ assets into it. Do not edit generated native configuration without also adding a reproducible source script/config change. There is no server.url or live-site WebView redirect; the assets are packaged in the APK. Netlify continues to build the website independently.

## Implemented

- Locked Capacitor Android/core/CLI and App plugin dependencies.
- Shared Firebase web SDK account/data access, retaining its existing persistence behavior.
- Android back routes through browser history; at root it minimizes instead of force-exiting. Modal back sends Escape to existing dialog handling.
- Native-only safe-area adjustments.
- Shared pool invitations use https://imtourn.com instead of the native localhost origin.
- Native builds hide unsupported Google popup sign-in and explain the email/password limitation. Web Google sign-in remains unchanged.
- Existing feature flags still keep drafts disabled.

## Before inviting testers

1. On a real Android device verify email/password login, restart persistence and logout. Do not create a duplicate account if your existing account is Google-only; use the website until native Google sign-in is configured.
2. Save a bracket or pool pick on mobile, check it on desktop, then reverse the direction. Use a dedicated test pool/account; these builds connect to production.
3. Verify failed/retried saves, deadlines and participant privacy; local edits are not guaranteed to sync before the app is killed.
4. Test Back with dialogs/open keyboard, rotation, zoom, safe areas and TalkBack.
5. Check image uploads and pool clipboard links. PDF export/download/native sharing remain unverified.

## Next milestones

- Native Google sign-in: register the Android app com.imtourn.app in the SAME Firebase project, configure signing SHA fingerprints and OAuth client, and bridge its credential into the existing Firebase JS auth session. Never add an Admin SDK credential to the app. Do not weaken Firebase rules to make login work.
- Mobile navigation and account screen; native sharing/PDF handling.
- Verified HTTPS app links after a stable signing key and association file; currently links open the website, not automatically the installed app.
- Notifications, native offline/resume testing, and store-ready icons/splash artwork.
- iOS target and testing on a Mac/Xcode, followed by signing and TestFlight. No iOS binary is supplied in this milestone.
- Dedicated release signing, privacy/store disclosures and release review.

Reference: https://capacitorjs.com/docs/getting-started
