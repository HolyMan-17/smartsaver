# References

## Official docs (primary source of truth)

- Expo: https://docs.expo.dev
- Expo Router: https://docs.expo.dev/router/introduction/
- React Native: https://reactnative.dev/docs/getting-started
- EAS Build: https://docs.expo.dev/eas/
- EAS Submit (Android): https://docs.expo.dev/submit/android/
- expo-notifications: https://docs.expo.dev/versions/latest/sdk/notifications/
- expo-secure-store: https://docs.expo.dev/versions/latest/sdk/securestore/
- Config plugins: https://docs.expo.dev/config-plugins/introduction/
- New Architecture: https://reactnative.dev/docs/the-new-architecture/landing
- Auth0 + Expo PKCE: https://docs.expo.dev/guides/authentication/

## Core libraries

| Concern | Library | Notes |
|---|---|---|
| Routing | expo-router | file-based, typed routes |
| State (client) | zustand | narrow selectors; per-domain stores |
| State (server) | @tanstack/react-query | caching, retries, sync |
| Forms | react-hook-form + zod | RN-compatible via Controller |
| HTTP | fetch / axios | wrap in a single apiClient |
| Auth | expo-auth-session, expo-secure-store, expo-web-browser | OAuth PKCE |
| Push | expo-notifications | FCM (Android) |
| Images | expo-image | caching, blurhash placeholders |
| Icons | @expo/vector-icons | Ionicons / MaterialIcons / SF Symbols |
| Animations | react-native-reanimated | worklets, UI thread |
| Gestures | react-native-gesture-handler | required by reanimated |
| Charts | react-native-gifted-charts | performant; chart-kit for simple |
| SVG | react-native-svg | logos, custom illustrations |
| Safe area | react-native-safe-area-context | notches, edge-to-edge |
| Screens | react-native-screens | native navigation containers |
| Storage (sensitive) | expo-secure-store | Keystore |
| Storage (prefs) | @react-native-async-storage/async-storage | non-sensitive only |
| Net info | @react-native-community/netinfo | connectivity gating |
| Haptics | expo-haptics | tactile feedback |
| Dev client | expo-dev-client | replaces Expo Go for native code |
| Crash reporting | @sentry/react-native | production crashes |

## Tooling

- **ESLint**: `eslint-config-expo` (in Expo templates). `yarn lint`.
- **Prettier**: add `prettier` + `eslint-config-prettier` if not present; keep formatting consistent.
- **TypeScript**: `tsc --noEmit` in CI. `strict: true`.
- **Flipper / React DevTools**: JS + network inspection.
- **Maestro**: E2E flows.
- **expo-doctor**: diagnose version/dependency mismatches.

## Useful CLI

```bash
npx expo start                       # start Metro
npx expo start --android             # start + open on Android
npx expo run:android                 # prebuild + gradle build + install
npx expo prebuild --platform android # generate native folders
npx expo install <pkg>               # version-compatible install
npx expo install --fix               # align versions after upgrade
npx expo-doctor                      # diagnose version mismatches
eas build --profile development --platform android
eas build --profile production  --platform android
eas submit --platform android
eas credentials                      # manage keystores / service accounts
adb devices
adb reverse tcp:8081 tcp:8081        # device -> local Metro
adb logcat | grep ReactNativeJS
```

## Troubleshooting playbook

- **Metro cache weirdness**: `npx expo start --clear` or `rm -rf node_modules .expo && yarn install`.
- **Version mismatch after upgrade**: `npx expo-doctor` then `npx expo install --fix`.
- **Build fails on a native dep**: check New Architecture compatibility; some older libs need `newArchEnabled: false` temporarily or a compat update.
- **`import.meta` / ESM error in bundle**: Metro resolving to ESM exports — set `resolver.unstable_enablePackageExports = false` (common with Zustand v5 + Hermes).
- **Keystore lost**: can't update the existing Play listing without it. Use Play App Signing + keep the EAS-managed keystore, or contact Play support to reset.
- **Push not arriving on Android 13+**: runtime permission not granted. Request `POST_NOTIFICATIONS` at a sensible moment.
- **App crashes only in prod release**: `console`/dev-only code, missing env vars, or unguarded `undefined` access — ship Sentry to capture it.
- **Slow EAS builds**: EAS caches deps; keep `node_modules` lean and use `.easignore` to skip heavy dev deps.

## Conventions to inherit (SmartSaver example)

When editing this project's RN app, follow its existing conventions:
- TypeScript strict; path alias `@/*`.
- Spanish API field names in `src/types/api.ts` (match the FastAPI backend) — map to UI names in stores only if needed.
- Auth0 OAuth via `expo-auth-session`; tokens in `expo-secure-store`.
- Zustand stores per domain (`useAuthStore`, `useTelemetryStore`, `useNotificationStore`, `useUserStore`).
- `expo-router` with typed routes; `app/_layout.tsx` holds providers + the auth gate.
- New Architecture + React Compiler enabled (`app.json` experiments).
- Yarn Berry (`packageManager: yarn@4`) — don't introduce npm/pnpm.
- Strip `console` in production via `babel-plugin-transform-remove-console` (gated behind `api.env('production')`).
- EAS profiles: `development` (internal APK + dev client), `preview` (APK), `production` (AAB).
