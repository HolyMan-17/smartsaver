# Frontend-Backend Integration Verification Spec

*Single-source-of-truth contract between frontend and backend. If anything here doesn't match the backend implementation, flag it before integration testing.*

> **⚠️ MUST READ FIRST:** `CORRECTIONS.md` — Device pairing is hardware-only. App never registers or claims devices.

---

## 1. Environment Variables

### Frontend (`smartsaver/.env`)

```env
EXPO_PUBLIC_API_URL=https://api.thesisbroker.com
EXPO_PUBLIC_AUTH0_DOMAIN=thesisbroker.us.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=iCnC8XXZHeaCNdsEULmtIYD5YL01QdDU
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.thesisbroker.com
```

### Backend (`.env`)

```env
AUTH0_DOMAIN=thesisbroker.us.auth0.com
AUTH0_AUDIENCE=https://api.thesisbroker.com
AUTH0_ISSUER=https://thesisbroker.us.auth0.com/
AUTH0_JWKS_URI=https://thesisbroker.us.auth0.com/.well-known/jwks.json
BACKEND_SYNC_SECRET=<shared-secret-from-auth0-action>
```

---

## 2. Auth0 Configuration

| Setting | Value | Verified |
|---------|-------|----------|
| Tenant | `thesisbroker.us.auth0.com` | ✅ |
| Client ID | `iCnC8XXZHeaCNdsEULmtIYD5YL01QdDU` | ✅ |
| Audience | `https://api.thesisbroker.com` | ✅ |
| App Type | Native | ✅ |
| Grant Types | Authorization Code + Refresh Token | ✅ |
| Token Expiration | 900s (15 min) | ✅ |
| Refresh Token Rotation | Auto-enabled (single-use) | ✅ |
| Callback URLs | `smartsaver://callback`, `exp://127.0.0.1:8081` | ✅ |
| Logout URL | `smartsaver://callback` | ✅ |
| Scopes | `openid profile email offline_access read:devices write:devices read:logs` | ✅ |

---

## 3. API Endpoint Matrix

All authenticated endpoints require `Authorization: Bearer <access_token>`.

### Auth0 Webhook (Shared Secret, No JWT)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/users/sync` | Create/update user in DB after Auth0 login |

### Public (No Auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness probe |

### Authenticated (JWT Bearer)

| Method | Path | Frontend Calls | Purpose |
|--------|------|---------------|---------|
| `GET` | `/api/dispositivos` | ✅ DevicesScreen, HomeScreen, AnalyticsScreen | List user's devices |
| `GET` | `/api/dispositivos/{mac}` | ✅ DeviceDetailScreen, AnalyticsScreen | Get device detail |
| `PATCH` | `/api/dispositivos/{mac}` | ✅ DevicesScreen, DeviceDetailScreen | Update `nombre_personalizado` |
| `DELETE` | `/api/dispositivos/{mac}` | ✅ (settings, future) | Remove device from user's list |
| `GET` | `/api/dispositivos/{mac}/telemetria` | ✅ DeviceDetailScreen, AnalyticsScreen | Telemetry history |
| `GET` | `/api/dispositivos/{mac}/agregados` | ✅ AnalyticsScreen | Aggregated telemetry (hourly/daily) |
| `POST` | `/api/dispositivos/{mac}/comando/estado` | ✅ DeviceDetailScreen | Toggle relay |
| `POST` | `/api/dispositivos/{mac}/comando/limites` | ✅ DeviceDetailScreen | Set safety limits |
| `GET` | `/api/alertas` | ✅ (future: AlertsScreen) | List alerts |
| `PATCH` | `/api/alertas/{id}` | ✅ (future: AlertsScreen) | Resolve alert |
| `GET` | `/api/eventos` | ✅ (future: LogsScreen) | List events |
| `WS` | `/ws/telemetry?token=<jwt>` | ❌ Currently disabled | Real-time telemetry |

### NOT Called by the App

| Method | Path | Why Not |
|--------|------|---------|
| `POST` | `/api/dispositivos` | Device registration is hardware-only |
| `POST` | `/api/telemetria` | M2M only (ESP32 → backend) |

---

## 4. Response Schemas

### Device List (GET /api/dispositivos)

```json
[
  {
    "id": 1,
    "mac": "00:1B:44:11:3A:B7",
    "nombre_personalizado": "Kitchen Light",
    "nivel_prioridad": "media",
    "limite_consumo_w": 150.00,
    "limite_voltaje": null,
    "limite_corriente": null,
    "limite_potencia": null,
    "is_online": true,
    "is_encendido": false,
    "nivel_acceso": "ADMIN",
    "last_seen_at": "2026-05-12T14:30:00Z"
  }
]
```

### Device Detail (GET /api/dispositivos/{mac})

Same shape as a single list item. 404 returns `{"error": "not_found", "message": "...", "mac": "..."}`.

### Telemetry History (GET /api/dispositivos/{mac}/telemetria?limite=50)

```json
[
  {
    "id": 1,
    "mac_dispositivo": "00:1B:44:11:3A:B7",
    "timestamp": "2026-05-12T14:30:00Z",
    "voltaje": 12.10,
    "corriente": 1.80,
    "potencia": 21.78,
    "tiempo_operacion_s": 1715682000,
    "estado_sin_cambios": false
  }
]
```

Array is DESC order (newest first). Frontend uses `history[0]` for latest reading.

### Telemetry Aggregates (GET /api/dispositivos/{mac}/agregados?granularity=hour&desde=...)

```json
[
  {
    "bucket": "2026-05-12T14:00:00",
    "potencia_promedio_w": 18.5,
    "potencia_maxima_w": 24.2,
    "energia_wh": 12.3
  }
]
```

`granularity` is `hour` or `day`. `desde` and `hasta` are optional ISO 8601 timestamps.

### Alerts (GET /api/alertas?solo_activas=true)

```json
[
  {
    "id": 1,
    "id_artefacto": 1,
    "tipo_alerta": "over_voltage",
    "mensaje": "Voltaje excedió el límite",
    "severidad": "warning",
    "leido": false,
    "resuelto": false,
    "timestamp": "2026-05-12T14:30:00Z"
  }
]
```

### Events (GET /api/eventos?mac=&limite=50)

```json
[
  {
    "id": 1,
    "id_artefacto": 1,
    "id_usuario": 1,
    "accion": "relay_toggle",
    "razon_disparo": "user_command",
    "timestamp": "2026-05-12T14:30:00Z"
  }
]
```

### Error Response (All Endpoints)

```json
{"error": "<code>", "message": "Human-readable Spanish message"}
```

| `error` | HTTP | Frontend Behavior |
|---------|------|-------------------|
| `unauthorized` | 401 | Token refresh + retry once. If refresh fails, force logout. |
| `forbidden` | 403 | Alert "Dispositivo no autorizado". No retry. |
| `not_found` | 404 | Alert with message. Fall back to cached/hardcoded data. |
| `validation_error` | 422 | Alert with message. Keep modal open for correction. |

---

## 5. Device Update (PATCH /api/dispositivos/{mac})

The app calls this endpoint to update `nombre_personalizado` (custom device name). other fields are available but not currently used in the UI.

**Request body** (partial update — only send fields you want to change):
```json
{"nombre_personalizado": "Kitchen Light"}
```

**To clear a name**, send `null`:
```json
{"nombre_personalizado": null}
```

**Frontend pre-validation:**
- `nombre_personalizado`: trimmed, non-empty after trim. Empty string rejected client-side.
- If the user clears the name field, frontend sends `null` (not empty string).

---

## 6. WebSocket Contract (Disabled — For Future Reference)

When enabled, the frontend will connect to:
```
wss://api.thesisbroker.com/ws/telemetry?token=<access_token>
```

- JWT as query param (WebSocket handshake cannot carry custom headers)
- Close code `4001` = authentication failure → stop reconnecting, force re-login
- Production MUST use `wss://` (TLS). Never send JWT tokens over unencrypted `ws://`

Test script:
```javascript
const ws = new WebSocket('wss://api.thesisbroker.com/ws/telemetry?token=<ACCESS_TOKEN>');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log(e.data);
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```

---

## 7. Auth Flow State Machine

```
App Launch
  │
  ├─ isLoading = true → Show ActivityIndicator
  │
  ├─ rehydrate():
  │    ├─ No tokens → isAuthenticated = false → LoginScreen
  │    ├─ Token expired → refreshAccessToken()
  │    │    ├─ Success → isAuthenticated = true
  │    │    └─ Failure → isAuthenticated = false → LoginScreen
  │    └─ Token valid → isAuthenticated = true
  │
  └─ After auth:
       ├─ Onboarding not done → OnboardingScreen (pre-filled with authUser.name)
       └─ Onboarding done → HomeScreen
```

---

## 8. Integration Test Checklist

### Test 1: Auth0 Login + User Sync
- [ ] Login opens Auth0 browser → authenticates → redirects to `smartsaver://callback`
- [ ] Frontend exchanges code for tokens (PKCE)
- [ ] Auth0 Post-Login Action calls `POST /api/users/sync` → `{"status": "synced"}`
- [ ] User appears in `usuarios` table

### Test 2: Authenticated API Call
- [ ] `GET /api/dispositivos` with Bearer token → 200 + device list (or `[]`)
- [ ] 401 → automatic token refresh + retry

### Test 3: Device Detail
- [ ] `GET /api/dispositivos/{mac}` → 200 with full device object
- [ ] 404 → `{"error": "not_found", ...}`

### Test 4: Device Custom Name
- [ ] `PATCH /api/dispositivos/{mac}` with `{"nombre_personalizado": "Kitchen Light"}` → 200 + updated device
- [ ] `PATCH /api/dispositivos/{mac}` with `{"nombre_personalizado": null}` → 200 + name cleared

### Test 5: Telemetry
- [ ] `GET /api/dispositivos/{mac}/telemetria?limite=50` → 200 + DESC array
- [ ] Each object has `mac_dispositivo`, `timestamp`, `voltaje`, `corriente`, `potencia`

### Test 6: Telemetry Aggregates
- [ ] `GET /api/dispositivos/{mac}/agregados?granularity=hour&desde=...` → 200 + array
- [ ] Each object has `bucket`, `potencia_promedio_w`, `potencia_maxima_w`, `energia_wh`

### Test 7: Toggle Relay
- [ ] `POST /api/dispositivos/{mac}/comando/estado` with `{"encendido": true}` → 200

### Test 8: Set Limits
- [ ] `POST /api/dispositivos/{mac}/comando/limites` → 200 (valid input)
- [ ] 422 on invalid bounds (V 0.1-60, A 0.1-30, W 0.1-500)

### Test 9: Alerts
- [ ] `GET /api/alertas?solo_activas=true` → 200 + array
- [ ] `PATCH /api/alertas/{id}` with `{"resuelto": true}` → 200

### Test 10: Events
- [ ] `GET /api/eventos?mac=&limite=50` → 200 + array

### Test 11: Token Expiry + Refresh
- [ ] Wait 15 min → API call returns 401 → automatic refresh → retry succeeds

### Test 12: Logout
- [ ] Clears SecureStore + AsyncStorage → LoginScreen shown

---

## 9. Common Failures & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "User not found or inactive" (401) | User in Auth0 but not in backend DB | Ensure Auth0 Action calls `POST /api/users/sync` |
| "Unable to find signing key" (401) | Auth0 rotated keys, JWKS cache stale | Restart backend or wait 1h for TTL |
| "Dispositivo no autorizado" (403) | No `permisos_usuario_artefacto` row for this MAC | Seed device + permission in DB |
| Empty telemetry array | Device has not published data | Run `python -m app.mock_esp32` |
| MQTT command not reaching device | Mosquitto not running or device not subscribed | Check `systemctl status mosquitto` and device MQTT |
| MAC format rejected (422) | MAC not in `AA:BB:CC:DD:EE:FF` format | Normalize MAC to uppercase with colons |

---

## 10. Known Frontend Issues / TODOs

| Issue | Location | Impact |
|-------|----------|--------|
| `require()` in `apiClient.ts` lazy imports | `src/services/apiClient.ts:48,54` | Lint warning only |
| WebSocket disabled | `useTelemetryStore` uses mock timer | No live telemetry |
| Alerts/Events screens not yet built | UI only in planning | No user-facing screen yet |

---

## 11. Key Frontend Files

| File | Purpose |
|------|---------|
| `src/services/apiClient.ts` | All REST calls (`authenticatedFetch`) |
| `src/services/authService.ts` | Auth0 PKCE flow, token management |
| `src/services/WebSocketService.ts` | WS contract (disabled) |
| `src/types/api.ts` | TypeScript request/response shapes |
| `app/_layout.tsx` | Auth guard + rehydrate |
| `src/screens/AnalyticsScreen/` | Device selector, aggregated chart, energy cards, pie chart |
| `src/screens/DeviceDetailScreen/` | Device control + custom name editing |

**Last updated**: 2026-05-20
**Frontend status**: Analytics overhauled, type-check clean, lint clean (0 errors)
**See also**: `CORRECTIONS.md` — device pairing scope, `wss://` requirement, PATCH for names