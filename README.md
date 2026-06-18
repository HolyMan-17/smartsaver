# SmartSaver

**IoT Control App for ESP32-based Smart Mini-UPS devices.** Built with React Native (Expo) + FastAPI backend.

Monitor real-time voltage/current/power, toggle relays remotely, set safety limits, schedule operation, receive AI-driven alerts — all from your phone.

![Stack](https://img.shields.io/badge/Expo-SDK_54-000020?logo=expo) ![Lang](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript) ![Auth](https://img.shields.io/badge/Auth-Auth0_OAuth2.1-eb5424?logo=auth0) ![State](https://img.shields.io/badge/State-Zustand_v5-orange) ![API](https://img.shields.io/badge/Backend-FastAPI_+_MariaDB-teal?logo=fastapi)

---

## Features

- **Real-time telemetry** — Voltage, current, power via WebSocket + HTTP polling
- **Remote relay control** — Toggle devices ON/OFF with sync-state indicator
- **Safety limits** — Configurable V/A/W thresholds; automatic emergency shutdown with rollback
- **AI-powered monitoring** — Zone classification (Safe/Warning/Critical), auto-kill with user override
- **Operation scheduling** — Per-device weekly schedule with day/time picker, automation lock
- **Priority management** — P1/P2/P3 device tiers for load-shedding order
- **BMS alerts** — Critical thermal shutdown detection with manual resolution flow
- **Push notifications** — Expo push for alerts + background task processing
- **Notification history** — Backend-synced list, mark read, delete, clear all
- **Analytics** — Aggregated energy charts (24h/7d/30d), pie chart across devices, PDF + CSV export
- **Event log** — Full history of user actions, AI decisions, connection events, zone transitions
- **Dark mode** — Semantic color tokens, persisted preference, no flash on cold start
- **Auth0 OAuth2.1** — PKCE flow, refresh tokens, SecureStore, cross-logout cleanup

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   SmartSaver App    │────▶│  FastAPI Backend     │────▶│   MariaDB    │
│ (React Native/Expo) │◀────│ (REST + MQTT + Auth) │◀────│              │
└────────┬────────────┘     └──────────┬──────────┘     └──────────────┘
         │                             │
         ▼                             ▼
┌─────────────────┐          ┌─────────────────┐
│   Auth0 (OIDC)   │          │  ESP32 Devices   │
│  OAuth2.1 + PKCE │          │  (MQTT telemetry) │
└─────────────────┘          └─────────────────┘
```

| Layer | Tech |
|-------|------|
| Frontend | Expo SDK 54, Expo Router v6, Zustand v5 |
| Auth | Auth0 OAuth2.1 + OIDC, PKCE, refresh tokens via `expo-auth-session` |
| API | REST (fetch-based client, Bearer JWT, 10s timeout, 401→refresh→retry) |
| Real-time | WebSocket (`wss://`) with 6 message types, exponential reconnect |
| Charts | `react-native-gifted-charts` |
| Push | `expo-notifications` + background task |
| Export | `expo-print` (PDF) + `expo-sharing` + `expo-file-system` (CSV) |
| Backend | FastAPI + MariaDB + MQTT (separate repo) |

---

## Quick Start

```bash
cd smartsaver
yarn install
yarn start       # Expo dev server
yarn android     # Build + run native Android
yarn ios         # Build + run native iOS
yarn lint        # ESLint check
npx tsc --noEmit # TypeScript check
```

**Environment:** Set up `smartsaver/.env` (see `.env.example`):

```env
EXPO_PUBLIC_API_URL=https://api.thesisbroker.com
EXPO_PUBLIC_WS_URL=wss://api.thesisbroker.com/ws/telemetry
EXPO_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=your-client-id
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.thesisbroker.com
```

`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WS_URL` have hardcoded production fallbacks. Auth0 must be configured or present in `app.json` `extra`.

---

## Project Structure

```
smartsaver/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout — auth gate, WS lifecycle, push token
│   ├── index.tsx           # HomeScreen (onboarding redirect)
│   ├── login.tsx           # LoginScreen
│   ├── callback.tsx        # Auth0 deep-link catch
│   ├── onboarding.tsx      # User name + onboarding flow
│   ├── devices.tsx         # Device list + priority filter
│   ├── devices/[id]/
│   │   ├── index.tsx       # Device detail (telemetry, power toggle, limits)
│   │   └── schedule.tsx    # Weekly operation schedule
│   ├── analytics.tsx       # Charts, aggregates, PDF/CSV export
│   ├── logs.tsx            # Event log history
│   ├── notifications.tsx   # Notification list (push + backend sync)
│   ├── notification/[id].tsx # Notification detail
│   └── settings.tsx        # AI control, notifications, theme, logout
│
├── src/
│   ├── screens/            # 12 screen components (each with .tsx + .styles.ts)
│   ├── services/
│   │   ├── apiClient.ts    # REST client (25 endpoints, 401→refresh, 403 handling)
│   │   ├── WebSocketService.ts # WS singleton (reconnect, auth, 6 message types)
│   │   ├── authService.ts  # Auth0 PKCE flow, refresh, revoke
│   │   └── secureStore.ts  # expo-secure-store wrapper
│   ├── store/              # 6 Zustand stores
│   │   ├── useAuthStore.ts         # OAuth2.1 tokens + rehydrate
│   │   ├── useUserStore.ts         # userName, onboarding flag
│   │   ├── useThemeStore.ts        # Dark mode + semantic color tokens
│   │   ├── useTelemetryStore.ts    # Real-time WS telemetry
│   │   ├── useEventLogStore.ts     # In-app event log (capped 200)
│   │   └── useNotificationStore.ts # Backend-synced + local push (capped 100)
│   ├── types/
│   │   ├── api.ts      # Spanish-named endpoint schemas (25 interfaces)
│   │   ├── auth.ts     # AuthTokens, AuthUser, AuthState
│   │   └── telemetry.ts # WSMessage union (6 message types)
│   └── utils/
│       ├── notifications.ts           # Push permissions + token
│       └── backgroundNotificationTask.ts # Background push handler
│
├── app.json              # Expo config + Auth0 extra block
├── eas.json              # EAS Build profiles
├── babel.config.js       # Console stripping in production
├── tsconfig.json         # strict: true, @/* path alias
└── package.json          # Yarn Berry v4.15.0
```

---

## Screens

| Screen | Route | Purpose |
|--------|-------|---------|
| Login | `/login` | Auth0 PKCE login gate |
| Onboarding | `/onboarding` | Name entry + onboarding flag |
| Home | `/` | Device status summary, quick links, unread badge |
| Devices | `/devices` | Device list with telemetry, priority filter, name edit |
| Device Detail | `/devices/[id]` | Full telemetry, power toggle, limits, priority, auto-kill banner |
| Schedule | `/devices/[id]/schedule` | Weekly schedule config with time picker |
| Analytics | `/analytics` | Energy charts, pie chart, PDF/CSV export |
| Event Logs | `/logs` | Paginated event history with timeline UI |
| Notifications | `/notifications` | Push + backend-synced notification list |
| Notification Detail | `/notification/[id]` | Full notification body |
| Settings | `/settings` | AI control, notify toggles, theme, logout |

---

## API Endpoints

All endpoints use Spanish naming. MAC address in URL path, not body.

| Method | Path | Screen(s) |
|--------|------|-----------|
| `GET` | `/api/dispositivos?prioridad=P1\|P2\|P3` | Home, Devices, Analytics, Dashboard |
| `GET` | `/api/dispositivos/{mac}` | DeviceDetail, Dashboard |
| `PATCH` | `/api/dispositivos/{mac}` | Devices, DeviceDetail |
| `DELETE` | `/api/dispositivos/{mac}` | Settings (future) |
| `GET` | `/api/dispositivos/{mac}/telemetria` | DeviceDetail, Analytics, Devices |
| `GET` | `/api/dispositivos/{mac}/agregados` | Analytics |
| `POST` | `/api/dispositivos/{mac}/comando/estado` | DeviceDetail |
| `POST` | `/api/dispositivos/{mac}/comando/limites` | DeviceDetail |
| `GET` | `/api/dispositivos/{mac}/horario` | Schedule |
| `PUT` | `/api/dispositivos/{mac}/horario` | Schedule |
| `POST` | `/api/dispositivos/{mac}/ai-control/override` | DeviceDetail |
| `GET` | `/api/alertas` | DeviceDetail |
| `PATCH` | `/api/alertas/{id}` | DeviceDetail |
| `GET` | `/api/eventos?mac=&limite=&offset=` | EventLogs |
| `GET` | `/api/recomendaciones` | Settings |
| `GET/PATCH` | `/api/users/settings` | Settings, _layout |
| `GET/PATCH/DELETE` | `/api/notifications` | Notifications |

Errors: `{"error": "not_found", "message": "...", "mac": "..."}`

---

## Docs

| Doc | Contents |
|-----|----------|
| [`AGENTS.md`](AGENTS.md) | Full reference for AI agents — architecture, patterns, stores, API spec, security |
| [`smartsaver/CONTEXT.md`](smartsaver/CONTEXT.md) | Domain vocabulary, endpoint table, WS types, key features |
| [`fix-instructions.md`](fix-instructions.md) | Completed implementation plan (49 tasks across 5 phases) |
| [`database_schema.md`](database_schema.md) | MariaDB schema |
| [`remember-me/BACKEND-SPEC.md`](remember-me/BACKEND-SPEC.md) | Backend overhaul spec — Auth0 + RESTful routing |
| [`api_spec.md`](api_spec.md) | **Historical** v1 spec (deprecated) |

---

## License

Thesis project — Universidad. Backend repo is separate and not in this repository.
