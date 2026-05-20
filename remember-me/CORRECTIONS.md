# Backend Integration Corrections — Device Pairing & App Scope

**Date**: 2026-05-14
**Status**: Active — backend agent must read before integration testing

---

## 1. Device Pairing Is NOT Done Through the App

**The SmartSaver app does NOT register devices.** Device pairing is a **separate hardware process** done directly with the ESP32 (gateway + nodes). This happens outside the app — via physical button press, Wi-Fi provisioning, or manufacturer setup.

**What this means for the backend:**

- The app will **never** call `POST /api/dispositivos` (device registration endpoint)
- The app **does** call `PATCH /api/dispositivos/{mac}` — but only for `nombre_personalizado` (custom name). It does NOT use PATCH for device registration or claiming.
- The app calls these endpoints:
  - `GET /api/dispositivos` — list devices the user has access to
  - `GET /api/dispositivos/{mac}` — get device detail
  - `PATCH /api/dispositivos/{mac}` — update `nombre_personalizado` (custom name only)
  - `POST /api/dispositivos/{mac}/comando/estado` — toggle relay
  - `POST /api/dispositivos/{mac}/comando/limites` — set safety limits
  - `GET /api/dispositivos/{mac}/telemetria` — fetch telemetry history
  - `GET /api/dispositivos/{mac}/agregados` — fetch aggregated telemetry
  - `GET /api/alertas` — list alerts
  - `PATCH /api/alertas/{id}` — resolve alert
  - `GET /api/eventos` — list events
  - `DELETE /api/dispositivos/{mac}` — remove device from user's list

**Backend responsibility:** When a new ESP32 device is paired (hardware process), the backend must:
1. Create the `artefacto` row in the `artefactos` table (if not exists)
2. Create the `permisos_usuario_artefacto` row linking the user to the device
3. The app will then see it on the next `GET /api/dispositivos` poll

**Do NOT expect the app to call registration endpoints.** Remove `POST /api/dispositivos` and `PATCH /api/dispositivos/{mac}` from the frontend integration test sequence.

---

## 2. App Device List Behavior

### Frontend Logic (`DevicesScreen.tsx`)

```
1. Mount → call apiClient.getDevices() → GET /api/dispositivos
2. If API returns array with items → render those devices
3. If API returns empty array [] → fall back to hardcoded DEVICE_REGISTRY (3 devices)
4. If API fails (network error) → fall back to hardcoded DEVICE_REGISTRY
5. Poll every 5 seconds
```

### Backend Requirement

`GET /api/dispositivos` must return the user's devices from the `permisos_usuario_artefacto` → `artefactos` JOIN.

**If the user has no devices yet (new user, no permissions):**
- Return `[]` (empty array)
- Frontend will show the 3 hardcoded fallback devices
- This is expected during onboarding / first use

**If the user has devices:**
- Return array of device objects
- Frontend will render real devices from the backend
- Hardcoded fallback is bypassed

**Critical:** The backend must ensure that when an ESP32 is paired and assigned to a user, the `permisos_usuario_artefacto` row is created. Otherwise the device will never appear in the app.

---

## 3. Device Detail Endpoint

`GET /api/dispositivos/{mac}` must return the full device object with all fields:

```json
{
  "id": 1,
  "mac": "00:1B:44:11:3A:B7",
  "nombre_personalizado": "Kitchen Light",
  "nivel_prioridad": "alta",
  "limite_consumo_w": 150.00,
  "is_online": true,
  "is_encendido": false,
  "nivel_acceso": "ADMIN",
  "last_seen_at": "2026-05-12T14:30:00Z"
}
```

**Backend must verify:**
- User has a `permisos_usuario_artefacto` row for this MAC
- If not → return `403 {"error": "forbidden", "message": "Dispositivo no autorizado"}`
- If device not found → return `404 {"error": "not_found", "message": "Dispositivo no encontrado", "mac": "..."}`

---

## 4. WebSocket — Production Must Use `wss://`

**Correction to `BACKEND-INTEGRATION.md`:**

The backend doc shows `ws://localhost:8000/ws/telemetry` for testing. This is fine for local dev.

**But production MUST use `wss://`** (WebSocket over TLS). The frontend is hardcoded to:

```
wss://api.thesisbroker.com/ws/telemetry?token=<access_token>
```

If the backend serves WebSocket on plain `ws://` in production, the frontend will fail to connect. JWT tokens must never travel over unencrypted channels.

**Backend must:**
- Local dev: `ws://localhost:8000/ws/telemetry`
- Production: `wss://api.thesisbroker.com/ws/telemetry` (TLS terminated at reverse proxy / load balancer)

---

## 5. `nivel_prioridad` Default Value

**Inconsistency found:**

- `BACKEND-INTEGRATION.md` (Step 3): `nivel_prioridad: "normal"`
- `BACKEND-SPEC.md` (Section 5.5): `nivel_prioridad: "media"`

**Fix:** Use `"media"` as the default. The frontend doesn't enforce specific values (it's a `string` type), but consistency matters.

---

## 6. Updated Integration Test Sequence (Revised for No App Registration)

Run these steps in order. Steps that require the app are marked. Steps that are backend-only are also marked.

### Step 0: Health Check (Any HTTP client)
```bash
GET /health
```
**Expected:** `200 OK`

---

### Step 1: User Sync (Auth0 Action → Backend)
```bash
POST /api/users/sync
Authorization: Bearer <BACKEND_SYNC_SECRET>

{ "auth0_id": "auth0|...", "email": "test@example.com", "nombre": "Test" }
```
**Expected:** `200 {"status": "synced", "auth0_id": "..."}`
**Note:** This is triggered by Auth0 Post-Login Action, not the app.

---

### Step 2: Authenticated User Check (App or cURL)
```bash
GET /api/dispositivos
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>
```
**Expected:** `200 OK`, `[]` (empty array for new user with no devices)
**If 401:** Token invalid or user not synced (Step 1).

---

### Step 3: Seed Device Permission (Backend admin / provisioning script)
**The app CANNOT do this.** This simulates the hardware pairing process:

```sql
-- Ensure artefacto exists
INSERT INTO artefactos (mac, nombre, modelo) 
VALUES ('00:1B:44:11:3A:B7', 'Router Principal', 'ESP32-C3')
ON DUPLICATE KEY UPDATE mac = mac;

-- Get artefacto ID
SELECT id FROM artefactos WHERE mac = '00:1B:44:11:3A:B7';

-- Link to user (replace 1 with actual usuarios.id)
INSERT INTO permisos_usuario_artefacto (id_usuario, id_artefacto, nivel_acceso)
VALUES (1, <artefacto_id>, 'ADMIN')
ON DUPLICATE KEY UPDATE nivel_acceso = 'ADMIN';
```

**Expected:** Device now linked to user.

---

### Step 4: List Devices (App)
App calls `GET /api/dispositivos`.
**Expected:** `200 OK`, array with the seeded device from Step 3.
**If still empty:** Step 3 failed or wrong user ID.

---

### Step 5: Get Device Detail (App)
App calls `GET /api/dispositivos/00:1B:44:11:3A:B7`.
**Expected:** `200 OK`, full device object.

---

### Step 6: Toggle Relay (App)
App calls `POST /api/dispositivos/00:1B:44:11:3A:B7/comando/estado` with `{"encendido": true}`.
**Expected:** `200 OK`
**Side effect:** MQTT message published.

---

### Step 7: Update Limits (App)
App calls `POST /api/dispositivos/00:1B:44:11:3A:B7/comando/limites` with `{"limite_voltaje": 14.0}`.
**Expected:** `200 OK`
**Backend validation:** V: 0.1-60, A: 0.1-30, W: 0.1-500.

---

### Step 8: Telemetry (App)
App calls `GET /api/dispositivos/00:1B:44:11:3A:B7/telemetria?limite=50`.
**Expected:** `200 OK`, `[]` initially (no data yet).

**To generate test telemetry:**
```bash
cd /home/manu0ak/iot_backend && python -m app.mock_esp32
```
Then re-run — should return non-empty array with `mac_dispositivo`, `timestamp`, `voltaje`, `corriente`, `potencia`.

---

### Step 9: WebSocket (Manual test — app currently disabled)
```javascript
const ws = new WebSocket('wss://api.thesisbroker.com/ws/telemetry?token=<ACCESS_TOKEN>');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log(e.data);
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```
**Expected:** Connection opens. `4001` close code = auth failure.

---

## 7. What the App Does NOT Do (And Never Will, For Now)

| Feature | Why Not | Future |
|---------|---------|--------|
| `POST /api/dispositivos` (register device) | Pairing is hardware process | Maybe — if in-app QR scanning added |
| Device claiming / QR scan | Out of scope for v1 | Future roadmap |
| In-app Wi-Fi provisioning | Use ESP32 built-in provisioning | Maybe — if unified flow needed |

**Note:** The app DOES call `PATCH /api/dispositivos/{mac}` — but only for updating `nombre_personalizado` (custom device name). This was added in the 2026-05-20 session.

---

## 8. Summary for Backend Agent

**Your job:**
1. Implement JWT validation middleware (JWKS from Auth0)
2. Implement `POST /api/users/sync` (Auth0 webhook with shared secret)
3. Implement `GET /api/dispositivos` (user-scoped via `permisos_usuario_artefacto`)
4. Implement `GET /api/dispositivos/{mac}` (device detail + access check)
5. Implement `GET /api/dispositivos/{mac}/telemetria` (telemetry history)
6. Implement `POST /api/dispositivos/{mac}/comando/estado` (toggle relay + MQTT)
7. Implement `POST /api/dispositivos/{mac}/comando/limites` (set limits + MQTT)
8. Implement `WS /ws/telemetry` with JWT query param auth (local: ws://, prod: wss://)
9. Return structured errors: `{"error", "message", ...}` never `{"detail"}`
10. Pre-seed `permisos_usuario_artefacto` rows for development testing
11. Implement rate limiting (slowapi or similar). 429 responses are a backend concern — frontend has no special handling. If frontend needs specific 429 UX later, add it to the contract first.

**NOT your job (app handles these):**
- Device registration / claiming
- Device metadata updates (name, priority)
- Auth0 login/logout/refresh (app does PKCE directly with Auth0)
- User onboarding flow

---

*Last updated: 2026-05-20*
*Frontend status: Analytics overhauled, type-check clean, lint clean (0 errors)*
