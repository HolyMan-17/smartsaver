# Android (Expo)

## Config in app.json

```jsonc
"android": {
  "package": "com.yourcompany.yourapp",   // applicationId — set once, stable forever
  "versionCode": 1,                        // integer, increment every store release
  "googleServicesFile": "./google-services.json",  // FCM; keep out of git
  "adaptiveIcon": {
    "foregroundImage": "./assets/images/android-icon-foreground.png",
    "backgroundImage": "./assets/images/android-icon-background.png",
    "monochromeImage": "./assets/images/android-icon-monochrome.png"
  },
  "edgeToEdgeEnabled": true,               // Android 15 edge-to-edge
  "predictiveBackGestureEnabled": false    // enable only when you handle back properly
}
```

- `package` (applicationId) is **permanent** — changing it later means a new Play Store listing. Use a reverse-domain you own.
- `versionCode` must increase every upload to Play. Top-level `version` is the user-facing semver.
- `google-services.json` (FCM) is downloaded from the Firebase console; add to `.gitignore`. EAS injects credentials at build time.

## Permissions

Declare only what you use, via `app.json` plugins or `expo-build-properties`:

```jsonc
"plugins": [
  ["expo-notifications", { "icon": "./assets/images/notif-icon.png", "color": "#3B82F6" }],
  ["expo-location", { "locationWhenInUse": "Always" }]
]
```

Config plugins auto-add the required `<uses-permission>` (e.g., `expo-notifications` → `POST_NOTIFICATIONS`). **Don't hand-edit `AndroidManifest.xml`** under CNG — use a config plugin or `expo-build-properties`.

Request runtime permissions at the point of need, not at launch. Handle "denied" + "blocked" gracefully with a rationale + a settings deep link.

## EAS Build profiles (eas.json)

```jsonc
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "android": { "buildType": "apk" } },
    "preview":     { "android": { "buildType": "apk" } },
    "production":  {}
  }
}
```

- `development` → `expo-dev-client` APK for internal testing with native code.
- `preview` → signed APK for QA/testers (sideload).
- `production` → AAB (Android App Bundle) for Play Store by default.
- Commands:
  - `eas build --profile development --platform android`
  - `eas build --profile production --platform android`
  - `eas submit --platform android` (needs a Play service account JSON uploaded via `eas credentials`)
- First production build: `eas credentials` → upload or generate the Android Keystore. **Keep it safe** — losing it blocks updates to the existing listing.

## Building locally (CNG)

- `npx expo prebuild --platform android` generates `android/`. Use only to inspect/patch native code temporarily; prefer cloud builds via EAS.
- `yarn android` = `expo run:android` = prebuild + gradle assemble + install on device/emulator.
- Don't commit `android/` unless you've intentionally ejected from CNG (then you own native upgrades).

## Native modules & config plugins

- Pure-JS `expo-*` modules need no prebuild and work in Expo Go unless they require custom native code.
- Anything needing native code → `expo-dev-client` build. Examples: custom FCM channels, background services, third-party SDKs without Expo config plugins.
- To tweak native config idiomatically, write a config plugin (`withAndroidManifest`, `withAppBuildGradle`) in `app.config.ts` or a local plugin file. Never edit generated `android/` files by hand.

## Android version matrix

- `compileSdk`/`targetSdk` track the Expo SDK (SDK 54 → API 36). Don't downgrade.
- `minSdk` 24+ (Android 7.0) covers ~99% of devices. Raise only if a dependency requires it.
- Android 13+ requires runtime `POST_NOTIFICATIONS` permission (expo-notifications exposes the API; you own the UX).
- Android 14+ foreground services need a declared type; use `expo-task-manager`/`expo-background-fetch` carefully.
- Android 15+ edge-to-edge is mandatory — `edgeToEdgeEnabled: true` + `react-native-safe-area-context` insets.

## Play Store submission

1. Create the app in Play Console; set up **Play App Signing** (let Google manage the upload key).
2. `eas submit --platform android --profile production` uploads the AAB. EAS needs a Play service account API key (JSON) configured via `eas credentials`.
3. Fill the store listing: title, short/full description, screenshots (per device type), feature graphic, **privacy policy URL** (required).
4. Complete the content rating questionnaire, the **data safety form** (declare data collected/shared — be truthful), target audience, and ads declaration.
5. Roll out: internal testing → closed → open → production. Use staged rollout (10% → 50% → 100%).
6. Every update: bump `versionCode` (integer) and `version` (semver) in app.json, rebuild, resubmit.
7. Keep the EAS-managed/uploaded Keystore safe. If lost, you must contact Play support to reset.

## Debugging on Android

- `adb devices` to confirm connection. `adb reverse tcp:8081 tcp:8081` lets a physical device reach Metro on your machine.
- Flipper / React DevTools for JS; Android Studio Layout Inspector for views.
- `adb logcat | grep ReactNativeJS` for native crashes and JS logs. JS crashes surface as a red screen in dev and silently in prod — ship Sentry/Bugsnag to capture them.
- Crash reporting: integrate `@sentry/react-native` for production.

## Common Android pitfalls

- **Cleartext blocked**: dev against a local HTTP API → use `expo-build-properties` to allow cleartext for that domain only, or tunnel (ngrok)/HTTPS.
- **Keystore mismatch on update**: must reuse the same upload keystore. Store it in EAS credentials.
- **Splash/icon not updating**: clear `android/` (`rm -rf android`) and re-prebuild, or rely on EAS clean builds.
- **FCM token not registering**: `google-services.json` missing or wrong package name; check `expo-notifications` setup.
- **Background work killed**: Android Doze/App Standby kills background work — design for ephemeral background; rely on FCM high-priority push for wakeup.
- **`import.meta`/ESM error in bundle**: Metro resolving to ESM exports — set `resolver.unstable_enablePackageExports = false` (common with Zustand v5 + Hermes).
