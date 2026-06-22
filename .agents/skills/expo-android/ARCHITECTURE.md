# Architecture & Patterns

## Recommended project layout

```
app/                    Expo Router file-based routes
  (tabs)/               Tab group (parens = doesn't affect URL)
  devices/[id]/         Dynamic routes
  _layout.tsx           Layout for a segment (providers, splash, fonts)
  index.tsx             Entry route
src/
  screens/              Screen-level components (one folder per screen)
  services/             API/network layer (apiClient, authService, ...)
  store/                Zustand stores (one file per domain)
  types/                Shared TS types (api.ts, auth.ts, ...)
  utils/                Pure helpers
  config.ts             Env-derived config (API URL, Auth0 creds via expo-constants)
components/             Shared/presentational components
  ui/                   Primitives (Button, Card, Switch)
hooks/                  Reusable hooks (useColorScheme, useThemeColor)
constants/              theme.ts, colors, layout metrics
assets/                 images, fonts
app.json
eas.json
babel.config.js
metro.config.js
tsconfig.json
```

Keep `app/` thin — it wires navigation and renders a screen from `src/screens/`. Screens hold layout + state orchestration; `components/` are presentational and dumb.

## Expo Router

- File-based: `app/devices/[id].tsx` → route `/devices/:id`. Folders = nested routes. `_layout.tsx` = layout for a segment.
- Groups with `(name)` don't affect the URL — use them to share layouts (e.g., `(tabs)`, `(auth)`).
- Enable typed routes: `"experiments": { "typedRoutes": true }` in app.json. `<Link href="/devices/123">` is then type-checked.
- Navigation hooks from `expo-router`: `useRouter()`, `useSegments()`, `useLocalSearchParams()`, `usePathname()`. Imperative: `router.push/back/replace`.
- Deep linking: set `"scheme": "yourapp"` in app.json. `expo-linking` parses inbound URLs.
- Auth gate: in `app/_layout.tsx` (or a segment `_layout`), read auth store; `<Redirect href="/login" />` for protected segments.
- Programmatic navigation with params: `router.push({ pathname: '/devices/[id]', params: { id: mac } })`.
- Modals/sheets: name a file `+not-found.tsx` for 404; use `presentation: 'modal'` in `Stack` screen options.

### Route protection pattern

```tsx
// app/(app)/_layout.tsx
import { Redirect, Slot, useSegments } from 'expo-router';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function AppLayout() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Redirect href="/login" />;
  return <Slot />;
}
```

## State management (Zustand)

- One store per domain: `useAuthStore`, `useTelemetryStore`, `useNotificationStore`, `useUserStore`.
- **Select narrow slices** to avoid re-renders: `useAuthStore((s) => s.token)`, not the whole store object.
- Persist with `zustand/middleware` `persist` + a `expo-secure-store` adapter for sensitive values; `AsyncStorage` only for non-sensitive UI prefs.
- Actions live in the store; components dispatch actions and read derived state.
- For server data with caching/loading/error states, prefer **TanStack Query** over hand-rolling. Use Zustand for true client state (UI, auth, theme).
- Call stores outside React from services via `useAuthStore.getState()` (e.g., to read the token in `apiClient`).

### Secure persist adapter (sketch)

```ts
import { createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

const secureStorage: StateStorage = {
  getItem: (k) => SecureStore.getItem(k) as string | null,
  setItem: (k, v) => { void SecureStore.setItem(k, v); },
  removeItem: (k) => { void SecureStore.deleteItemAsync(k); },
};
export const securePersist = () => createJSONStorage(() => secureStorage);
```

## API / service layer

- Single `apiClient` (fetch wrapper or axios) with base URL from `expo-constants` (`Constants.expoConfig.extra`) or a `src/config.ts`.
- Attach auth token from the auth store in a centralized place (interceptor or header helper), not in every call site.
- One service module per resource: `authService`, `deviceService`, `telemetryService`. Return typed responses.
- Components never call `apiClient` directly — they call a hook or a store action.
- **Normalize at the boundary**: keep backend field names verbatim in `src/types/api.ts` (e.g., Spanish `mac_dispositivo`, `encendido`) to match the API; map to UI shapes in the store/screen only if needed.
- Throw a typed `ApiError` with status + body so callers can branch on `res.status === 401` etc.

```ts
// src/services/apiClient.ts
import { Constants } from 'expo-constants';
import { useAuthStore } from '@/src/store/useAuthStore';

const BASE_URL = (Constants.expoConfig?.extra as any)?.apiUrl as string;

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) { super(`API ${status}`); }
}

export async function apiClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return (res.status === 204 ? undefined : await res.json()) as T;
}
```

## Forms

- **React Hook Form** + **Zod** resolver. Works on RN with `Controller` for custom inputs.
- The Zod schema is the single source of truth for both form validation and the API payload type: `type Payload = z.infer<typeof schema>`.
- Show field errors inline; disable submit until valid.
- For Picker/Select, wrap in a `Controller` and use `@react-native-picker/picker` or a bottom-sheet picker.
- `KeyboardAvoidingView` (`behavior="padding"` on Android) around scrollable forms; dismiss keyboard on tap-outside.

## Theming

- Centralize tokens in `constants/theme.ts`: colors (light/dark), spacing scale, typography, radii, shadows.
- Use `useColorScheme()` + `useThemeColor()` hooks (Expo template provides these) to react to the system theme.
- Don't hardcode hex values in components. Reference `theme.colors.xxx`.
- Set `"userInterfaceStyle": "automatic"` in app.json for system-driven light/dark.
- Edge-to-edge (Android 15+): `react-native-safe-area-context` insets drive padding, not hardcoded top margins.

## Path aliases

```jsonc
// tsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }
```
Metro resolves these automatically via `expo/metro-config` defaults in SDK 50+. Use `@/src/services/apiClient` consistently across the codebase.

## Realtime / background

- **Polling**: `setInterval` in a hook with cleanup on unmount. Fine for ≤5s cadence on a single screen; clear on blur for tabbed screens.
- **WebSocket**: a singleton service (`WebSocketService`) with connect/disconnect + a subscribe API; stores listen and update. Reconnect with backoff. Android kills background sockets under Doze — rely on FCM high-priority push for wakeup, not a live socket in background.
- **Background fetch**: `expo-background-fetch` + `expo-task-manager`. Android needs a foreground service for continuous work; design background tasks to be short and ephemeral.
