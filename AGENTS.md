# AGENTS.md

## Project Overview

SmartSaver — React Native (Expo) IoT control app for ESP32-based Smart Mini-UPS devices. UI language is Spanish. Backed by a FastAPI + MariaDB + MQTT backend (separate repo).

## Commands

All commands run inside `smartsaver/`, not the repo root.

```bash
cd smartsaver
yarn start              # Expo dev server
yarn android            # Expo dev server (Android)
yarn ios                # Expo dev server (iOS)
yarn lint               # ESLint (flat config, expo preset)
npx tsc --noEmit        # Type-check (no script exists; run manually)
```

**No test framework is configured.** There are no test scripts, test directories, or test runners.

## Architecture

### Routing

Expo Router v6 (file-based). Route files in `app/` are thin wrappers importing real screen components from `src/screens/`. Dynamic routes use `[id]` syntax (e.g., `app/devices/[id]/index.tsx`).

### Authentication

OAuth2.1 + OIDC via Auth0 (PKCE flow). Config in `app.json` `extra` block from `EXPO_PUBLIC_*` env vars.

- **`src/services/authService.ts`** — loginWithAuth0 (PKCE), refreshAccessToken, getAccessToken, getAuthUser, logoutAuth0, revokeRefreshToken
- **`src/store/useAuthStore.ts`** — Zustand store: login/logout/rehydrate/getAccessToken. Tokens in SecureStore (not AsyncStorage).
- **`src/screens/LoginScreen/`** — Gate screen rendered in `_layout.tsx` when not authenticated.
- **`app/_layout.tsx`** — Auth guard: rehydrates auth state, shows LoginScreen if !isAuthenticated, wires `setAccessTokenGetter` to apiClient.
- **Auth flow**: App start → rehydrate from SecureStore → if expired, refresh → if no token, show LoginScreen → PKCE login → store tokens → render app.

Auth0 tenant: `thesisbroker.us.auth0.com`. Audience: `https://api.thesisbroker.com`. Scopes: `openid profile email offline_access`.

### State Management

Zustand (v5). Stores live in `src/store/`:

| Store | Persistence |
|-------|------------|
| `useAuthStore` | expo-secure-store (tokens) + in-memory state |
| `useUserStore` | AsyncStorage (manual) |
| `useThemeStore` | AsyncStorage (zustand persist) |
| `useEventLogStore` | AsyncStorage (zustand persist, capped 200) |
| `useTelemetryStore` | None (in-memory, mock data timer) |

### Services

- `src/services/apiClient.ts` — REST client (`fetch`-based). Base URL from `EXPO_PUBLIC_API_URL` env var, falls back to `https://api.thesisbroker.com`. Uses `authenticatedFetch()` with Bearer token, AbortController 10s timeout, 401→refresh→retry logic. Wired via `setAccessTokenGetter()` in `_layout.tsx`.
- `src/services/WebSocketService.ts` — **Currently disabled.** The `useTelemetryStore` bypasses it with `setTimeout` + mock data. When enabled, accepts `tokenGetter` for auth, defaults to `wss://`, passes token as query param, handles 4001 close code.

### Types

- `src/types/api.ts` — Backend response/request schemas. **Uses Spanish naming** (`mac_dispositivo`, `encendido`, `limite_voltaje`, etc.) matching the FastAPI backend. This is intentional; do not rename to English.
- `src/types/auth.ts` — AuthTokens, AuthUser, AuthState interfaces for OAuth2.1 PKCE flow.
- `src/types/telemetry.ts` — Frontend WebSocket payload types (English naming).

## Key Patterns

- **Screen structure**: Each screen has its own folder under `src/screens/` with `.tsx` (logic) and `.styles.ts` (styles). Route files in `app/` just re-export them.
- **Theming**: Colors come from `getColors(isDark)` in `useThemeStore`, not from `constants/theme.ts` (that file is Expo scaffold, largely unused). Screens call `getStyles(colors)` which returns a StyleSheet.
- **Polling**: Screens poll the API every 5 seconds via `setInterval`. No WebSocket is active in production yet.
- **Device registry**: `DEVICE_REGISTRY` in `DevicesScreen.tsx` is **hardcoded** with 3 devices. Screens now try `apiClient.getDevices()` first, falling back to the hardcoded list. Migration to authenticated API endpoint is planned.
- **Auth flow**: Auth check happens first in `_layout.tsx`. If not authenticated, `LoginScreen` is shown. After auth, onboarding check runs as a second gate.

## Backend API Spec

Full documentation is at the repo root: `api_spec.md` and `remember-me/BACKEND-SPEC.md`. Important details:
- Endpoints use RESTful resource paths: `POST /api/dispositivos/{mac}/comando/estado` (MAC in URL, not body).
- All endpoints Spanish-named. `mac_dispositivo` is the primary device identifier (17-char MAC string).
- Known backend bug: the `conexion` handler writes to `is_encendido` instead of `is_online`.
- `POST /api/dispositivos/{mac}/comando/estado` toggles physical relay state + publishes MQTT command.
- `POST /api/dispositivos/{mac}/comando/limites` pushes operational safety limits to the device via MQTT.
- Error responses use structured JSON: `{"error": "not_found", "message": "...", "mac": "..."}`.

## Environment Variables

| Variable | Where Used | Required |
|----------|-----------|----------|
| `EXPO_PUBLIC_API_URL` | `apiClient.ts` | No (falls back to `https://api.thesisbroker.com`) |
| `EXPO_PUBLIC_AUTH0_DOMAIN` | `authService.ts` | Yes |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID` | `authService.ts` | Yes |
| `EXPO_PUBLIC_AUTH0_AUDIENCE` | `authService.ts` | Yes |

The `.gitignore` excludes `.env*` (broadened from `.env*.local`).

## Security Status

- **Authentication: Implemented.** OAuth2.1 + OIDC via Auth0 (PKCE flow). Tokens stored in SecureStore. API calls use Bearer token via `authenticatedFetch()` with 401→refresh→retry.
- **Input validation: Implemented.** Safety-critical `setDeviceLimits` payloads have runtime bounds enforcement (NaN/negative/Infinity rejected). TypeScript `DispositivoLimites` type enforces shape.
- **WebSocket: Not yet active.** When enabled, will use `wss://` with token auth. Currently bypassed by mock telemetry timer.
- **Production console stripping: Configured.** `babel-plugin-transform-remove-console` in production builds.
- **Auth tokens: SecureStore** (not AsyncStorage). Other persistent data still uses AsyncStorage.

## Build and Deploy

EAS Build is configured (`eas.json`). The `preview` profile builds Android APKs. No CI/CD pipeline exists — builds are triggered manually via `eas build`.

Package manager is **Yarn Berry** (v4.14.1) with `nodeLinker: node-modules`. Despite `.pnp.cjs` existing at the root, PnP is not active. The `eas-build-pre-install` script runs `corepack enable` to ensure correct Yarn version.

## Expo SDK

SDK 54. Key enabled experiments: `typedRoutes: true`, `reactCompiler: true`. New Architecture is enabled. TypeScript `strict: true` is on. Path alias `@/*` maps to project root.

## Agent skills

### Issue tracker

Issues tracked in GitHub (repo: HolyMan-17/smartsaver). See `docs/agents/issue-tracker.md`.

### Triage labels

Using default mattpocock/skills vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at root points to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.

### Session rules

See `docs/agents/session-rules.md`.