# Android test APKs (E13-04)

Owner: Nana Yaw. This packages the existing PWA with Capacitor 8.6.2. It does not change the TB model, thresholds or clinical wording. See [ADR-21](../adr/0021-android-test-apks.md).

## Get a build

1. Open GitHub Actions and select **Android APK**.
2. Select a successful main run and download its `triagelens-apk` artifact. GitHub sign-in is required to download Actions artifacts.
3. Unzip it. The APK filename includes the build number and commit. `SHA256SUMS.txt` checks the download.
4. Transfer the APK to an Android phone. Allow installation from that file source and open it.
5. Sign in with a TriageLens app account. Vercel login is not involved because the screens are in the APK.

Each push to main, including a PR merge, builds an APK. Artifacts expire after 30 days. No GitHub Release, tag or Play Store upload is created. Vercel continues its existing website deployment flow.

Main builds use `org.triagelens.app` and a persistent team-test signing key. A later build can update the earlier app while keeping its local state. Its version code is this workflow's run number. Preserve that counter if replacing the workflow. A failed build publishes no APK.

PR builds use `org.triagelens.app.preview` and a runner-generated debug key. They are disposable build checks, install separately from main and may require uninstalling a previous preview. They never receive the main signing secrets. Do not use previews for data that must be kept.

## Configuration

The four browser-public GitHub repository variables match the deployed app: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MODEL_URL`, `VITE_MODEL_SHA256`. They are included in the APK, so they must never contain private credentials. `check-android-env.mjs` rejects missing values, HTTP URLs, a non-publishable key and an invalid hash.

Four GitHub Actions secrets hold the team-test signing material: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Only a main push or a manual run on main uses them. The runner removes the decoded keystore after the build. Keep the local backup and passwords outside git; losing the key prevents ordinary updates over earlier main APKs.

Use this key for team testing. Decide production distribution and key custody separately before a Play Store release. Keep the same signing certificate for updates to the same app ID.

## Build locally

Install Node 22.12 or later, JDK 21 and Android SDK 36 using Android Studio. Copy only the public app configuration into a git-ignored `.env.local` in `apps/pwa`.

```sh
cd apps/pwa
npm ci
npm run android:apk
```

This creates a debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`. Generated web files, local SDK paths, signing files and APKs are not committed. The Gradle wrapper is committed so CI and local builds use the same version.

## Offline status and device checks

Bundled screens, fonts and the inference runtime can load without Vercel. This is not yet a fully offline screening release. The model is fetched from its URL at launch; sign-in and record saving need network. Model persistence, offline session rules and the durable case queue/sync remain separate work. The model is not included in git or the APK.

On an Android phone, check sign-in, the clinic account restriction, age under 15, image selection, retake, a completed screening and saved records. Confirm that WebView loads the worker and WASM files; it can fall back to one inference thread. Use synthetic or approved fake inputs only. Verify that a second main APK installs over the first. Check status-bar and navigation-bar spacing. Report the phone, Android and WebView versions and results before calling the APK device-verified.

Turning airplane mode on is expected to expose the remaining online dependencies. Do not report full offline support from the bundled screens alone. Existing quality calibration and reference-phone performance gaps remain open.
