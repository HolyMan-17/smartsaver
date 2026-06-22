# Best Practices (React Native + Mobile)

## Performance

- **Lists**: use `FlatList`/`SectionList` (not `.map`). Set `keyExtractor`, `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`. For complex cells, add `getItemLayout` + `React.memo` cells.
- **Avoid inline functions/objects in list item props** — they defeat `React.memo`. Hoist callbacks with `useCallback`, hoist styles with `StyleSheet.create` at module scope.
- **Images**: `expo-image` (Blaze) or FastImage. Provide `placeholder`, `contentFit`, cache modes. Never bundle multi-MB PNGs — resize/optimize assets.
- **Animations**: `react-native-reanimated` runs on the UI thread via worklets. Keep JS work out of animated handlers. Use `useAnimatedStyle` / `useDerivedValue`.
- **Heavy JS**: long JSON parse, crypto, sorting big arrays → move off the JS thread (Worklets via `react-native-worklets`, a native module, or pagination).
- **Re-renders**: prefer Zustand selector subscriptions over React Context for frequently-changing values. Profile with React DevTools Profiler.
- **Bundle**: enable Hermes (default on RN 0.70+). Strip `console.*` in prod via `babel-plugin-transform-remove-console` gated behind `api.env('production')`.
- **New Architecture**: enables synchronous layout, faster lists. Test native deps for compatibility before forcing it on.

## Memory & lifecycle

- Clean up subscriptions, timers, listeners in `useEffect` return.
- Abort in-flight `fetch` with `AbortController` on unmount to avoid setState-after-unmount.
- Don't keep large datasets in memory — paginate or window.

## Security

- Tokens/secrets → `expo-secure-store` (Android Keystore). Never AsyncStorage, never hardcoded in JS constants.
- Don't ship server-side secrets in the app bundle. Use a backend-for-frontend for anything requiring a server secret; the app only holds the user's OAuth token.
- HTTPS everywhere; Android 9+ blocks cleartext by default. If you must allow a local dev IP, scope `usesCleartextTraffic` via `expo-build-properties` to that domain only — never globally in prod.
- Auth0: pin audience/issuer; validate JWTs **server-side** (the app shouldn't parse/verify tokens).
- Strip `console` logs in production builds.
- Never log tokens, PII, or full request bodies.

## Accessibility

- Every `TouchableOpacity`/`Pressable` acting as a button: `accessibilityRole="button"`, `accessibilityLabel`, and `accessibilityState={{ disabled }}` when relevant.
- Use `accessible` + `accessibilityElementsHidden` on decorative containers.
- Touch targets ≥ 48x48 dp (Android). Pad small icons.
- Don't rely on color alone — pair with icon/text for status (online/offline, alert severity).
- Test with TalkBack on Android. `accessibilityLiveRegion` for dynamic updates.
- Honor font scaling: `allowFontScaling` true by default; test at 150%/200%.

## Forms & input

- `KeyboardAvoidingView` (`behavior="padding"` on Android) around scrollable forms.
- Dismiss keyboard on tap-outside: `TouchableWithoutFeedback` + `Keyboard.dismiss()`.
- Put `KeyboardAvoidingView` inside a `ScrollView` for long forms; mind Android's behavior differences vs iOS.

## Offline & network

- Assume the network drops. Show optimistic UI + rollback on failure, or explicit loading/error states.
- Cache last-good response (TanStack Query `staleTime`/`gcTime`, or a store snapshot) so screens aren't empty on reconnect.
- Use `@react-native-community/netinfo` for connectivity gating — degrade gracefully rather than blocking the UI entirely.

## Internationalization

- `expo-localization` + `i18next`/`react-i18next` for multiple locales. Keep strings in JSON per locale; never inline user-facing strings.
- RTL: set `I18nManager.forceRTL` + `isRTL`; verify layouts mirror. Flexbox + Expo Router handle most RTL automatically.

## UX patterns

- Haptics (`expo-haptics`) for confirmations, toggles, destructive taps — subtle, not every tap.
- Pull-to-refresh: `RefreshControl` on `ScrollView`/`FlatList`.
- Loading skeletons > spinners for lists.
- Empty states with a CTA, never a blank screen.
- Destructive actions → confirm (`Alert.alert` is acceptable here) with clear cancel/confirm labels.
- Avoid modal/alert fatigue for non-destructive errors — inline error text + retry is better UX.

## Code style

- `StyleSheet.create` at module scope, reused. Avoid `style={[...]}` arrays in hot paths when avoidable.
- Functional components + hooks only. No class components.
- Type all props/state; prefer `unknown` over `any`; avoid non-null assertions (`!`) — narrow instead.
- One component per file; co-locate tests next to the component when a test setup exists.
- Keep components < 200 lines; extract subcomponents when they grow.
- Mirror the project's existing conventions exactly — naming, file placement, import order.
