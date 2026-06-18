# Context: SmartSaver App

## Domain Vocabulary

| Term | Meaning |
|------|---------|
| Artefacto / Dispositivo | IoT device (ESP32-based Smart Mini-UPS) identified by MAC address |
| Telemetría | Real-time sensor data: voltaje, corriente, potencia |
| Comando | Control instruction sent to a device (toggle power, set limits) |
| Puerta de enlace | ESP32 gateway that bridges nodes to the backend |
| Zona | Battery health classification: Safe, Warning, Critical (derived from ai_status) |
| Límite | Safety threshold for voltaje, corriente, or potencia |
| Permisos | Access control linking a user to an artefacto |
| Agregados | Time-bucketed telemetry aggregates (avg power, max power, energy Wh) |
| Horario | Device operation schedule (days, on/off times, automation toggle) |
| Prioridad | Device priority level: P1 (alta), P2 (media), P3 (baja) — used for auto-kill ordering |
| BMS | Battery Management System — critical thermal shutdown alerts |
| Auto-Kill | AI-initiated forced shutdown when risk is sustained; user can override (30min grace) |

## Key Relationships

- **User** authenticates via Auth0 (OAuth2.1 + OIDC, PKCE flow)
- **User** → many **Permisos** → many **Artefactos** (many-to-many ACL)
- **Artefacto** → many **Telemetría** readings (time-series)
- **Artefacto** → one **Estado** (online/offline, estado_reportado relay state, estado_deseado pending command)
- **Artefacto** → one **Horario** (operation schedule)
- **Comando** (estado/limites) → user sends → backend → MQTT → device
- **User** → one **UserSettings** (AI control, load-shedding, push token, notify prefs)
- **User** → many **Notificaciones** (backend-notifications + local Expo push)

## Architecture Constraints

- All API types use Spanish naming (`mac_dispositivo`, `encendido`, `limite_voltaje`, etc.) — matches FastAPI backend
- **V5.0 BREAKING:** `is_encendido` removed from `DispositivoResponse` — use `estado_reportado` (actual relay state) and `estado_deseado` (pending command). When they differ, show "syncing" spinner.
- WebSocket is **active** alongside 5-second HTTP polling (real-time `telemetria`/`conexion`/`alerta`/`auto_kill_*` events override polled values; HTTP remains source of truth for metadata/alerts/sync state)
- `WSMessage` union: `WSTelemetriaMessage | WSConexionMessage | WSAlertaMessage | WSAutoKillWarningMessage | WSAutoKillExecutedMessage | WSAutoKillCancelledMessage`
- Device list from `GET /api/dispositivos` with hardcoded fallback (DEVICE_REGISTRY: 1 device `00:1B:44:11:3A:B7`)
- Auth tokens stored in `expo-secure-store`, never AsyncStorage
- Other persistent data (user profile, theme, event logs, notifications) in AsyncStorage via zustand persist

## State Management (Zustand v5)

| Store | Persistence | Purpose |
|-------|------------|---------|
| `useAuthStore` | SecureStore (tokens) + in-memory | OAuth2.1 PKCE flow: login, rehydrate, logout, getAccessToken |
| `useUserStore` | AsyncStorage (manual) | `userName`, `hasCompletedOnboarding` |
| `useThemeStore` | AsyncStorage (zustand persist) | Dark/light mode, semantic color tokens |
| `useEventLogStore` | AsyncStorage (zustand persist, capped 200) | In-app event log (CRITICAL/WARNING/AI_ACTION/USER_ACTION/SYSTEM) |
| `useTelemetryStore` | None (in-memory) | Real-time WS telemetry: `latestReadings`, `deviceOnlineStatus`, `relayStates`, `autoKillStates`, connection state |
| `useNotificationStore` | AsyncStorage (zustand persist, capped 100) | Backend-synced + local Expo push notifications |

## Frontend API Endpoints

| Method | Endpoint | Used by |
|--------|----------|---------|
| `GET` | `/health` | Health check (unauthenticated, unused) |
| `GET` | `/api/dispositivos?prioridad=P1|P2|P3` | HomeScreen, DevicesScreen, AnalyticsScreen, DashboardScreen |
| `GET` | `/api/dispositivos/{mac}` | DeviceDetailScreen, DashboardScreen |
| `PATCH` | `/api/dispositivos/{mac}` | DevicesScreen (name edit), DeviceDetailScreen (name edit, priority) |
| `DELETE` | `/api/dispositivos/{mac}` | Future (settings) |
| `GET` | `/api/dispositivos/{mac}/telemetria?limite=N` | DeviceDetailScreen, AnalyticsScreen, DevicesScreen, DashboardScreen |
| `GET` | `/api/dispositivos/{mac}/agregados?granularity=hour|day&desde=ISO` | AnalyticsScreen |
| `POST` | `/api/dispositivos/{mac}/comando/estado` | DeviceDetailScreen (power toggle, emergency shutdown) |
| `POST` | `/api/dispositivos/{mac}/comando/limites` | DeviceDetailScreen (safety limits) |
| `GET` | `/api/dispositivos/{mac}/horario` | ScheduleScreen |
| `PUT` | `/api/dispositivos/{mac}/horario` | ScheduleScreen |
| `POST` | `/api/dispositivos/{mac}/ai-control/override` | DeviceDetailScreen (override auto-kill) |
| `GET` | `/api/alertas?solo_activas=true` | DeviceDetailScreen (BMS alerts) |
| `PATCH` | `/api/alertas/{id}` | DeviceDetailScreen (resolve BMS alert) |
| `GET` | `/api/eventos?mac=&limite=&offset=` | EventLogsScreen (paginated history) |
| `GET` | `/api/recomendaciones?solo_activas=true` | SettingsScreen (future) |
| `GET` | `/api/users/settings` | SettingsScreen |
| `PATCH` | `/api/users/settings` | SettingsScreen, _layout.tsx (push token registration) |
| `GET` | `/api/notifications` | NotificationsScreen (sync) |
| `PATCH` | `/api/notifications/{id}` | NotificationsScreen (mark read) |
| `DELETE` | `/api/notifications/{id}` | NotificationsScreen (delete one) |
| `DELETE` | `/api/notifications` | NotificationsScreen (clear all) |

## WebSocket (`wss://api.thesisbroker.com/ws/telemetry?token=<jwt>`)

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `telemetria` | Server→Client | Real-time V/A/W readings per MAC |
| `conexion` | Server→Client | Device online/offline events |
| `alerta` | Server→Client | BMS critical alert with AI status + relay state |
| `auto_kill_warning` | Server→Client | AI about to auto-kill a device (countdown) |
| `auto_kill_executed` | Server→Client | AI auto-kill completed |
| `auto_kill_cancelled` | Server→Client | Auto-kill cancelled (user override or AI decision) |

Auth: token passed as `?token=` query param. 4001 close code triggers force-logout.

## Key Features

- **Notifications:** Expo push + backend sync. Foreground/background push saves to store. Backend notifications merged on screen open + auth. Token registered on auth, cleared on logout/deny.
- **Schedule (Horario):** Per-device operation schedule (`dias_operacion` ISO 8601: 1=Mon..7=Sun), start/end times, automation master toggle. Schedule lock blocks manual OFF.
- **AI Auto-Kill:** Backend sets `auto_kill_at` on high-risk devices. DeviceDetailScreen shows countdown banner. User can override via `POST /ai-control/override` (30min grace). WS pushes real-time state changes.
- **Safety Limits:** User-configurable V/A/W max thresholds. Exceeded limits trigger emergency shutdown with rollback on failure. Limits validated client-side (bounds: V 0.1-250, A 0.1-30, W 0.1-500).
- **Priority:** P1 (alta), P2 (media), P3 (baja). Used for auto-kill ordering + load-shedding. Filterable in DevicesScreen.
- **BMS Alerts:** Critical thermal alerts (`tipo_alerta: 'bms_critica'`) disable power controls. Must be manually resolved. Turning device ON auto-resolves linked alerts.
- **Analytics:** Aggregated telemetry (hourly/daily buckets), 24h/7d/30d time range, pie chart across devices, PDF + CSV export.
- **Dark Mode:** Semantic color tokens via `getColors(isDark)`. Theme persists across sessions. Hydration gate prevents flash.

## External Systems

- **Auth0**: Identity provider (`thesisbroker.us.auth0.com`) — OAuth2.1 + OIDC, PKCE flow, `offline_access` scope for refresh tokens
- **FastAPI backend**: REST API at `api.thesisbroker.com`, MQTT broker for device communication
- **MariaDB**: Backend database (separate repo)
- **Expo Push**: Push notification delivery via FCM/APNs
