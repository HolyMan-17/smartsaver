# AGENTS.md

## Project Overview

SmartSaver — React Native (Expo) IoT control app for ESP32-based Smart Mini-UPS devices. UI language is Spanish. Backed by a FastAPI + MariaDB + MQTT backend (separate repo).

## Commands

All commands run inside `smartsaver/`, not the repo root.

```bash
cd smartsaver
yarn start              # Expo dev server (expo start)
yarn android            # expo run:android — builds + runs native Android
yarn ios                # expo run:ios — builds + runs native iOS
yarn web                # expo start --web
yarn lint               # ESLint (flat config, expo preset) — expo lint
npx tsc --noEmit        # Type-check (no script exists; run manually)
```

**No test framework is configured.** There are no test scripts, test directories, or test runners.

## Architecture

### Routing

Expo Router v6 (file-based). Route files in `app/` are thin wrappers importing real screen components from `src/screens/`. Dynamic routes use `[id]` syntax.

Current routes:

| Route file | Screen |
|-----------|--------|
| `_layout.tsx` | Root layout — auth gate, WS lifecycle, push token registration |
| `index.tsx` | HomeScreen (onboarding redirect) |
| `login.tsx` | LoginScreen (also rendered directly in `_layout.tsx` when !isAuthenticated) |
| `callback.tsx` | Auth0 deep-link catch — `<Redirect href="/" />` |
| `onboarding.tsx` | OnboardingScreen |
| `devices.tsx` | DevicesScreen |
| `devices/[id]/index.tsx` | DeviceDetailScreen |
| `devices/[id]/schedule.tsx` | ScheduleScreen |
| `analytics.tsx` | AnalyticsScreen |
| `logs.tsx` | EventLogsScreen |
| `notifications.tsx` | NotificationsScreen |
| `notification/[id].tsx` | NotificationDetailScreen |
| `settings.tsx` | SettingsScreen |

Note: `src/screens/DashboardScreen/` exists but has **no route entry** — orphaned WS-only view, not reachable in-app.

### Authentication

OAuth2.1 + OIDC via Auth0 (PKCE flow). Config read from `Constants.expoConfig.extra` in `authService.ts` (falls back to `EXPO_PUBLIC_*` env vars). The `app.json` `extra` block holds hardcoded production values.

- **`src/services/authService.ts`** — loginWithAuth0 (PKCE), refreshAccessToken, getAccessToken, getAuthUser, logoutAuth0, revokeRefreshToken
- **`src/store/useAuthStore.ts`** — Zustand store: login/logout/rehydrate/getAccessToken. Tokens in SecureStore (not AsyncStorage).
- **`src/screens/LoginScreen/`** — Gate screen rendered in `_layout.tsx` when not authenticated.
- **`app/_layout.tsx`** — Auth guard: rehydrates auth state, shows LoginScreen if !isAuthenticated, wires `setAccessTokenGetter` to apiClient.
- **Auth flow**: App start → rehydrate from SecureStore → if expired, refresh → if no token, show LoginScreen → PKCE login → store tokens → render app.

Auth0 tenant: `thesisbroker.us.auth0.com`. Audience: `https://api.thesisbroker.com`. Scopes: `openid profile email offline_access read:devices write:devices read:logs`.

### State Management

Zustand (v5). Stores live in `src/store/`:

| Store | Persistence |
|-------|------------|
| `useAuthStore` | expo-secure-store (tokens) + in-memory state |
| `useUserStore` | AsyncStorage (manual) — userName, onboarding flag |
| `useThemeStore` | AsyncStorage (zustand persist) |
| `useEventLogStore` | AsyncStorage (zustand persist, capped 200) |
| `useTelemetryStore` | None (in-memory) — real WebSocket-backed, no mock timer |
| `useNotificationStore` | AsyncStorage (zustand persist, capped 100) — backend-synced + local push |

### Services

- **`src/services/apiClient.ts`** — REST client (`fetch`-based). Base URL from `EXPO_PUBLIC_API_URL` env var, falls back to `https://api.thesisbroker.com`. Uses `authenticatedFetch()` with Bearer token, AbortController 10s timeout, 401→refresh→retry logic. 403 handling: force-logout **only** when body is `{error: "forbidden", message ~ /not found|inactive/i}`; other 403s throw "Acceso denegado al recurso." without logout. Wired via `setAccessTokenGetter()` in `_layout.tsx`.
  - **Endpoints**: getHealth, healthCheck, getDevices (with optional `prioridad` filter), getDeviceDetail, updateDevice (PATCH), deleteDevice, getTelemetryHistory, getTelemetryAggregates, setDeviceState (POST, body `{encendido, override_automation}`), setDeviceLimits, getDeviceSchedule, updateDeviceSchedule, getAlerts, resolveAlert, getEvents, getRecommendations, getUserSettings, updateUserSettings, overrideAutoKill, getNotifications, markNotificationRead, deleteNotification, clearAllNotifications.
  - Errors parsed as `ApiErrorResponse` (`{error, message, mac?, field?}`) — never FastAPI `{detail}`.

- **`src/services/WebSocketService.ts`** — **Active.** Singleton `wsService`. URL from `EXPO_PUBLIC_WS_URL` env var, falls back to `wss://api.thesisbroker.com/ws/telemetry`. Accepts `tokenGetter` for auth — token passed as `?token=` query param. Exponential reconnect (2s base, 1.5x backoff, 30s cap). Handles 4001 close code (auth failure → force logout via `useAuthStore.logout()`). Message types dispatched to listeners: `telemetria`, `conexion`, `alerta`, `auto_kill_warning`, `auto_kill_executed`, `auto_kill_cancelled`.
  - **Known issue**: `connect()` awaits `tokenGetter()` before `new WebSocket()` — if `disconnect()` fires during await, an orphan socket can still be created. Should recheck `shouldReconnect` after await.

- **`src/services/authService.ts`** — Auth0 PKCE flow implementation.

- **`src/services/secureStore.ts`** — SecureStore wrapper used by auth.

- **`src/utils/notifications.ts`** — `requestNotificationPermissions`, `getPushToken` (Expo push token for backend registration).

### Types

- **`src/types/api.ts`** — Backend response/request schemas. **Uses Spanish naming** (`mac_dispositivo`, `encendido`, `limite_voltaje`, etc.) matching the FastAPI backend. This is intentional; do not rename to English.
  - `TelemetriaResponse` — sensor reading with `ai_status?`
  - `DispositivoResponse` — device: `mac`, `nombre_personalizado`, `nivel_prioridad`, `limite_consumo_w`, `limite_voltaje/corriente/potencia` (nullable), `estado_deseado`, `estado_reportado`, `is_online`, `nivel_acceso`, `last_seen_at`, `auto_kill_at`, `ai_override_until`, `automatizacion_activa?`, `automation_lock_active?`
  - `HorarioBase` / `HorarioUpdate` / `HorarioResponse` — device schedule (dias_operacion, hora_encendido, hora_apagado, automatizacion_activa)
  - `UserSettingsResponse` / `UserSettingsUpdate` — `ai_control_habilitado`, `auto_apagado_low_priority`, `expo_push_token?`
  - `AIOverrideResponse` — `{status, mac, ai_override_until}`
  - `AgregadosResponse` — time-bucketed aggregates: `potencia_promedio_w`, `potencia_maxima_w`, `energia_wh`
  - `AlertaResponse` / `EventoResponse` / `RecomendacionResponse` — alerts, events, AI recommendations
  - `NotificacionUsuarioResponse` — backend notification (`titulo`, `cuerpo`, `leido`, `eliminado`)
  - `DispositivoEstadoCommand` / `ComandoEstado` — POST estado body (`encendido`, optional `override_automation`)
  - `DispositivoLimitesCommand` — POST limites body
  - `DispositivoUpdateCommand` — PATCH body for `nombre_personalizado`, `nivel_prioridad`, and limits
  - `ApiErrorResponse` — `{error, message, mac?, field?}`

- **`src/types/auth.ts`** — AuthTokens, AuthUser, AuthState interfaces for OAuth2.1 PKCE flow.

- **`src/types/telemetry.ts`** — Frontend WebSocket payload types. `WSMessage` is a union of **six** message types: `WSTelemetriaMessage`, `WSConexionMessage`, `WSAlertaMessage`, `WSAutoKillWarningMessage`, `WSAutoKillExecutedMessage`, `WSAutoKillCancelledMessage`. Legacy `IoTGatewayPayload`, `MLPrediction`, and `HardwareState` boilerplate types have been **deleted**.

## Key Patterns

- **Screen structure**: Each screen has its own folder under `src/screens/` with `.tsx` (logic) and `.styles.ts` (styles). Route files in `app/` just re-export them.
- **Theming**: Colors come from `getColors(isDark)` in `useThemeStore`, not from `constants/theme.ts` (that file is Expo scaffold, largely unused). Screens call `getStyles(colors)` which returns a StyleSheet.
- **Polling + WebSocket coexistence**: DeviceDetailScreen and DevicesScreen poll the API every 5 seconds via `setInterval` for device list, detail, alerts, and initial telemetry history. AnalyticsScreen fetches on mount, manual refresh, device/time-range change — no polling. The WebSocket (`wsService`) is **active in production** alongside polling: real-time `telemetria` and `conexion` events from the store override polled values reactively in DevicesScreen (`resolvedDevices` merge) and DeviceDetailScreen (`liveReading`/`liveOnline` effects). HTTP polling remains the source of truth for device metadata, alerts list, and sync state (`estado_deseado` vs `estado_reportado`).
- **Device registry**: `DEVICE_REGISTRY` in `DevicesScreen.tsx` is **hardcoded** with 1 fallback device (`00:1B:44:11:3A:B7`). Screens try `apiClient.getDevices()` first, falling back to the hardcoded list on null/error. HomeScreen and AnalyticsScreen also use this fallback path.
- **Analytics**: AnalyticsScreen uses `getTelemetryAggregates(mac, granularity, desde)` for aggregated charts (avg power, peak power, energy kWh) with a time-range selector (24h/7d/30d). Falls back to raw `getTelemetryHistory()` if aggregates return empty. Device picker is a bottom-sheet modal when multiple devices exist. Layout animations enabled for Android via `UIManager.setLayoutAnimationEnabledExperimental(true)`. PDF export via `expo-print` + `expo-sharing` + `expo-file-system`.
- **Auth flow**: Auth check happens first in `_layout.tsx`. If not authenticated, `LoginScreen` is shown. After auth, onboarding check runs as a second gate (`app/index.tsx` redirects to `/onboarding` if `!hasCompletedOnboarding`).
- **Notifications**: `expo-notifications` registered in `_layout.tsx` — foreground + response listeners save remote pushes to `useNotificationStore`. On auth, `_layout.tsx` requests permissions and registers the Expo push token with the backend via `apiClient.updateUserSettings({expo_push_token})`. `useNotificationStore.syncBackendNotifications()` merges server notifications (`db_*` IDs) with local push notifications, persisted to AsyncStorage (capped 100). Read/delete actions propagate back to `/api/notifications`.
- **Schedule (Horario)**: ScheduleScreen (route `/devices/[id]/schedule`) reads/updates device operation schedule via `getDeviceSchedule` / `updateDeviceSchedule`. `automation_lock_active` on the device blocks manual OFF toggles in DeviceDetailScreen with an override confirmation dialog.
- **AI Auto-Kill**: When `DispositivoResponse.auto_kill_at` is set, DeviceDetailScreen shows a countdown banner. User can override via `apiClient.overrideAutoKill(mac)` → POST `/api/dispositivos/{mac}/ai-control/override` → backend grants 30min grace (`ai_override_until`). WS `auto_kill_*` message types push real-time state changes (currently received but not yet wired to UI logic in the store).
- **Priority filtering**: `DispositivoResponse.nivel_prioridad` is `P1` | `P2` | `P3`. DevicesScreen exposes a filter segment for priority. DeviceDetailScreen has a priority selector card that PATCHes the device. Backend uses priority for auto-kill ordering.
- **BMS alerts**: `AlertaResponse` with `tipo_alerta === 'bms_critica'` triggers a critical-state UI in DeviceDetailScreen (red AI card, power controls disabled). Resolving the alert is a manual user action; turning the device back ON auto-resolves linked BMS alerts.

## Backend API Spec

Full documentation is at the repo root: `api_spec.md` and `remember-me/BACKEND-SPEC.md`. Important details:
- Endpoints use RESTful resource paths: `POST /api/dispositivos/{mac}/comando/estado` (MAC in URL, not body).
- All endpoints Spanish-named. `mac_dispositivo` is the primary device identifier (17-char MAC string).
- Known backend bug: the `conexion` WS handler writes to `is_encendido` instead of `is_online`. Frontend `useTelemetryStore` reads `msg.data.is_online` directly — affected events may surface `undefined`. Backend fix pending.
- **V5.0 BREAKING:** `is_encendido` removed from `DispositivoResponse`. Use `estado_reportado` (actual relay state) and `estado_deseado` (pending command). When they differ, show "syncing" spinner.
- `POST /api/dispositivos/{mac}/comando/estado` body: `{encendido: boolean, override_automation?: boolean}`. Toggles physical relay + publishes MQTT command + activates 5min user lease. `override_automation: true` disables active schedule lock.
- `POST /api/dispositivos/{mac}/comando/limites` pushes operational safety limits to the device via MQTT.
- `GET /api/dispositivos/{mac}/horario` / `PUT /api/dispositivos/{mac}/horario` — device schedule (dias_operacion, hora_encendido, hora_apagado, automatizacion_activa).
- `POST /api/dispositivos/{mac}/ai-control/override` — user overrides pending AI auto-kill; grants 30min grace period.
- `GET/PATCH /api/users/settings` — `ai_control_habilitado`, `auto_apagado_low_priority`, `expo_push_token`.
- `GET /api/recomendaciones?solo_activas=true` — AI-generated recommendations.
- `GET /api/notifications` / `PATCH /api/notifications/{id}` (mark read) / `DELETE /api/notifications/{id}` / `DELETE /api/notifications` (clear all).
- Error responses use structured JSON: `{"error": "not_found", "message": "...", "mac": "..."}`.

## Environment Variables

| Variable | Where Used | Required |
|----------|-----------|----------|
| `EXPO_PUBLIC_API_URL` | `apiClient.ts` | No (falls back to `https://api.thesisbroker.com`) |
| `EXPO_PUBLIC_WS_URL` | `WebSocketService.ts` | No (falls back to `wss://api.thesisbroker.com/ws/telemetry`) |
| `EXPO_PUBLIC_AUTH0_DOMAIN` | `authService.ts` | Yes (or hardcoded in `app.json` `extra`) |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID` | `authService.ts` | Yes (or hardcoded in `app.json` `extra`) |
| `EXPO_PUBLIC_AUTH0_AUDIENCE` | `authService.ts` | Yes (or hardcoded in `app.json` `extra`) |

The `.gitignore` excludes `.env*` (broadened from `.env*.local`). In practice, `app.json` `extra` holds hardcoded Auth0 values; env vars are fallback only.

## Security Status

- **Authentication: Implemented.** OAuth2.1 + OIDC via Auth0 (PKCE flow). Tokens stored in SecureStore. API calls use Bearer token via `authenticatedFetch()` with 401→refresh→retry. 403 responses force-logout only on user-not-found/inactive; other 403s throw without logout.
- **Input validation: Implemented.** Safety-critical `setDeviceLimits` payloads have runtime bounds enforcement in `DeviceDetailScreen` (NaN/negative/Infinity/out-of-range rejected via `validateLimit`). TypeScript `DispositivoLimitesCommand` type enforces shape.
- **WebSocket: Active.** `wss://` with JWT token passed as query param. 4001 close code triggers force-logout. Token retrieved via `useAuthStore.getAccessToken()` through `wsService.setTokenGetter()`.
- **Production console stripping: Configured.** `babel-plugin-transform-remove-console` in production builds (`babel.config.js`).
- **Auth tokens: SecureStore** (not AsyncStorage). Other persistent data (user profile, theme, event log, notifications) still uses AsyncStorage.
- **Push notifications: Implemented.** Expo push token registered with backend on auth. Remote pushes saved to store in foreground + on tap.

## Build and Deploy

EAS Build is configured (`eas.json`). Profiles: `development` (internal APK, dev client), `preview` (APK), `production`. No CI/CD pipeline exists — builds are triggered manually via `eas build`.

Package manager is **Yarn Berry** (v4.15.0, per `package.json` `packageManager` field) with `nodeLinker: node-modules`. Despite `.pnp.cjs` existing at the root, PnP is not active. The `eas-build-pre-install` script runs `corepack enable` to ensure correct Yarn version.

## Expo SDK

SDK 54. Key enabled experiments: `typedRoutes: true`, `reactCompiler: true`. New Architecture is enabled (`newArchEnabled: true` in `app.json`). TypeScript `strict: true` is on. Path alias `@/*` maps to project root.

## Agent skills

### Issue tracker

Issues tracked in GitHub (repo: HolyMan-17/smartsaver). See `docs/agents/issue-tracker.md`.

### Triage labels

Using default mattpocock/skills vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at root points to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.

### Session rules

See `docs/agents/session-rules.md`.
