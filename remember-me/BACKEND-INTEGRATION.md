# Backend-Frontend Integration Verification Spec

> Use this document to verify the backend and frontend are wired and communicating correctly.
> This is a **post-implementation verification checklist**, not a design spec.
>
> **⚠️ CRITICAL:** Read `CORRECTIONS.md` first. Device pairing is hardware-only — the app never registers or claims devices.
>
> **Assumption:** Frontend has been built. This document provides the exact contract to validate against.

---

## Table of Contents

1. [Environment & URLs](#1-environment--urls)
2. [Auth0 Flow](#2-auth0-flow)
3. [Integration Test Sequence](#3-integration-test-sequence)
4. [Endpoint Reference](#4-endpoint-reference)
5. [Error Contract](#5-error-contract)
6. [WebSocket](#6-websocket)
7. [Common Failures & Fixes](#7-common-failures--fixes)

---

## 1. Environment & URLs

| Component | Local Dev | Production |
|---|---|---|
| API Base | `http://localhost:8000` | `https://api.thesisbroker.com` |
| Auth0 Domain | `thesisbroker.us.auth0.com` | `thesisbroker.us.auth0.com` |
| Auth0 Audience | `https://api.thesisbroker.com` | `https://api.thesisbroker.com` |
| Mosquitto MQTT | `127.0.0.1:1883` | (AWS IoT Core or equivalent) |

**Headers for all authenticated requests:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## 2. Auth0 Flow

### 2.1 PKCE Login Sequence

1. **Frontend** initiates Auth0 login via PKCE (SPASDK or `auth0-react`)
2. **Auth0** redirects back with `code`
3. **Frontend** exchanges `code` for `access_token` + `id_token`
4. **Frontend** stores `access_token` in memory (not localStorage for security)
5. **Frontend** sends `access_token` as `Authorization: Bearer <token>` on every API call

### 2.2 Critical: User Sync Webhook

**The backend will reject ALL authenticated calls** (`401: User not found or inactive`) until the user exists in the `usuarios` table.

**Trigger:** Auth0 Action or Rule must call the sync webhook **after** successful login/registration:

```bash
POST /api/users/sync
Authorization: Bearer <BACKEND_SYNC_SECRET>
Content-Type: application/json

{
  "auth0_id": "auth0|64f8a1b2c3d4e5f6a7b8c9d0",
  "email": "user@example.com",
  "nombre": "John Doe"
}
```

**Expected response:**
```json
{ "status": "synced", "auth0_id": "auth0|64f8a1b2c3d4e5f6a7b8c9d0" }
```

**To verify sync worked:**
```bash
mysql -u api_iot_user -p iot_telemetry -e "SELECT auth0_id, email, activo FROM usuarios;"
```

### 2.3 Token Requirements

- **Algorithm:** RS256
- **Audience:** `https://api.thesisbroker.com`
- **Issuer:** `https://thesisbroker.us.auth0.com/`
- **Required claim:** `sub` (Auth0 user ID)
- **JWKS URI:** `https://thesisbroker.us.auth0.com/.well-known/jwks.json`
- The backend caches JWKS for 1 hour

---

## 3. Integration Test Sequence

Run these in order. Each step depends on the previous one succeeding.

### Step 0: Health Check
```bash
GET /health
```
**Expected:** `200 OK`, empty JSON `{}`

**If this fails:** Backend is not running or wrong URL.

---

### Step 1: User Sync (Auth0 Webhook)
```bash
POST /api/users/sync
Authorization: Bearer <BACKEND_SYNC_SECRET>

{ "auth0_id": "<AUTH0_SUB>", "email": "test@example.com", "nombre": "Test User" }
```
**Expected:** `200 OK` with `{ "status": "synced", "auth0_id": "..." }`

**If this fails:** Wrong `BACKEND_SYNC_SECRET` in `.env` or missing header.

---

### Step 2: Authenticated User Check
```bash
GET /api/dispositivos
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>
```
**Expected:** `200 OK`, `[]` (empty array for new user)

**If 401:** Token invalid/expired, or user not synced (Step 1).
**If 403:** Unexpected — no devices yet should not trigger this.

---

### Step 3: Seed Device (Backend / Hardware Provisioning)

**The app does NOT register devices.** Device pairing is a hardware process done with the ESP32 itself. To test the app, you must pre-seed the device and permission rows:

```sql
-- 1. Ensure artefacto exists
INSERT INTO artefactos (mac, nombre, modelo)
VALUES ('00:1B:44:11:3A:B7', 'Router Principal', 'ESP32-C3')
ON DUPLICATE KEY UPDATE mac = mac;

-- 2. Get artefacto ID and user ID
SELECT id FROM artefactos WHERE mac = '00:1B:44:11:3A:B7';
SELECT id FROM usuarios WHERE auth0_id = '<AUTH0_SUB>';

-- 3. Link user to device
INSERT INTO permisos_usuario_artefacto (id_usuario, id_artefacto, nivel_acceso)
VALUES (<user_id>, <artefacto_id>, 'ADMIN')
ON DUPLICATE KEY UPDATE nivel_acceso = 'ADMIN';
```

**Or use the backend admin endpoint / script if available.**

**If 409/Forbidden:** Device already registered by another user.
**If 422:** Invalid MAC format (must be `AA:BB:CC:DD:EE:FF`).

---

### Step 4: List Devices
```bash
GET /api/dispositivos
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>
```
**Expected:** `200 OK`, array with the seeded device from Step 3.

---

### Step 5: Get Device Detail
```bash
GET /api/dispositivos/00:1B:44:11:3A:B7
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>
```
**Expected:** `200 OK`, same shape as Step 3.

---

### Step 6: Update Device (Backend-Only — App Does Not Call This)

The app has no UI for editing device metadata. This endpoint exists for backend/admin use only.

```bash
PATCH /api/dispositivos/00:1B:44:11:3A:B7
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>

{ "nombre_personalizado": "Kitchen Light", "limite_consumo_w": 150.0 }
```
**Expected:** `200 OK`, updated device with new `nombre_personalizado` and `limite_consumo_w`.

---

### Step 7: Toggle Relay (Command)
```bash
POST /api/dispositivos/00:1B:44:11:3A:B7/comando/estado
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>

{ "encendido": true }
```
**Expected:** `200 OK`, empty JSON `{}`

**Side effect:** MQTT message published to `smartups/dispositivos/00:1B:44:11:3A:B7/comando/estado`

---

### Step 8: Update Limits (Command)
```bash
POST /api/dispositivos/00:1B:44:11:3A:B7/comando/limites
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>

{ "limite_voltaje": 14.0, "limite_corriente": 10.0, "limite_potencia": 200.0 }
```
**Expected:** `200 OK`, empty JSON `{}`

**Validation bounds:**
| Field | Min | Max |
|---|---|---|
| `limite_voltaje` | 0.1 | 60.0 |
| `limite_corriente` | 0.1 | 30.0 |
| `limite_potencia` | 0.1 | 500.0 |

---

### Step 9: Verify Telemetry Endpoint Exists
```bash
GET /api/dispositivos/00:1B:44:11:3A:B7/telemetria?limite=10
Authorization: Bearer <REAL_AUTH0_ACCESS_TOKEN>
```
**Expected:** `200 OK`, `[]` (empty until device publishes data)

**To generate test telemetry:**
```bash
cd /home/manu0ak/iot_backend && python -m app.mock_esp32
```
Then re-run Step 9 — should return non-empty array.

**Telemetry response shape:**
```json
[
  {
    "id": 1,
    "mac_dispositivo": "00:1B:44:11:3A:B7",
    "timestamp": "2026-05-12T14:30:00",
    "voltaje": 120.50,
    "corriente": 2.30,
    "potencia": 277.15,
    "tiempo_operacion_s": 3600,
    "estado_sin_cambios": false
  }
]
```

---

### Step 10: Verify WebSocket

**Local dev:**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/telemetry?token=<ACCESS_TOKEN>');
```

**Production (MUST use TLS):**
```javascript
const ws = new WebSocket('wss://api.thesisbroker.com/ws/telemetry?token=<ACCESS_TOKEN>');
```

**Expected:** Connection opens successfully.

**Send test message:**
```javascript
ws.send('ping');
```
**Expected response:** `Echo: ping`

**If 4001 close code:** Invalid/missing token.

---

## 4. Endpoint Reference

### Public (No Auth)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Liveness probe |

### Auth0 Webhook (Shared Secret)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/users/sync` | `Authorization: Bearer <BACKEND_SYNC_SECRET>` | Create/update user in DB |

### M2M (No JWT — ESP32 Gateway)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/telemetria` | None | Ingest telemetry from devices |

### Authenticated (JWT Bearer)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dispositivos` | List user's devices |
| `POST` | `/api/dispositivos` | Register new device |
| `GET` | `/api/dispositivos/{mac}` | Get device detail |
| `PATCH` | `/api/dispositivos/{mac}` | Update device metadata |
| `GET` | `/api/dispositivos/{mac}/telemetria` | Get telemetry history |
| `POST` | `/api/dispositivos/{mac}/comando/estado` | Toggle relay |
| `POST` | `/api/dispositivos/{mac}/comando/limites` | Update safety limits |
| `WS` | `/ws/telemetry?token=<jwt>` | Real-time telemetry stream |

### Legacy (Still Active — To Be Removed)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/telemetria/{mac}` | Use `/api/dispositivos/{mac}/telemetria` |
| `POST` | `/api/comando/estado` | Use `/api/dispositivos/{mac}/comando/estado` |
| `POST` | `/api/comando/limites` | Use `/api/dispositivos/{mac}/comando/limites` |
| `GET` | `/api/dispositivos/{mac}/estado` | Use `/api/dispositivos/{mac}` |

---

## 5. Error Contract

All errors return structured JSON (never FastAPI default `{detail}`):

```json
{
  "error": "<code>",
  "message": "<human readable>",
  "...": "additional context"
}
```

| `error` | HTTP | When | Example Context |
|---|---|---|---|
| `unauthorized` | 401 | Missing/invalid JWT | `{"auth0_id": "..."}` |
| `sync_unauthorized` | 401 | Wrong sync secret | None |
| `forbidden` | 403 | No device access | `{"mac": "..."}` |
| `not_found` | 404 | Device not found | `{"mac": "..."}` |
| `validation_error` | 422 | Bad input | `{"field": "mac"}` |

**Validation error example:**
```json
{
  "error": "validation_error",
  "message": "value is not a valid email address: The email address is not valid. It must have exactly one @-sign.",
  "field": "email"
}
```

---

## 6. WebSocket

### Connection
```
Local dev:  ws://localhost:8000/ws/telemetry?token=<access_token>
Production: wss://api.thesisbroker.com/ws/telemetry?token=<access_token>
```

- **JWT as query param** (not header — WebSocket handshake cannot carry custom headers)
- **Close code 4001** = authentication failure
- **Echo mode** currently (real-time streaming planned)
- **Production MUST use `wss://`** — never send JWT tokens over unencrypted `ws://`

### Test Script (Node.js)
```javascript
const WebSocket = require('ws');
const token = process.argv[2];
// Local dev:
const ws = new WebSocket(`ws://localhost:8000/ws/telemetry?token=${token}`);
// Production:
// const ws = new WebSocket(`wss://api.thesisbroker.com/ws/telemetry?token=${token}`);

ws.on('open', () => {
  console.log('Connected');
  ws.send('test-message');
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
  ws.close();
});

ws.on('close', (code, reason) => {
  console.log('Closed:', code, reason.toString());
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
});
```

---

## 7. Common Failures & Fixes

### "User not found or inactive" (401)
**Cause:** User exists in Auth0 but not in backend DB.
**Fix:** Ensure Auth0 Action/Rule calls `POST /api/users/sync` after login.

### "Unable to find signing key" (401)
**Cause:** Auth0 rotated keys, JWKS cache stale.
**Fix:** Restart backend to clear cache, or wait up to 1 hour for TTL expiry.

### "Dispositivo no autorizado" (403)
**Cause:** User has no `PermisoUsuarioArtefacto` entry for this MAC.
**Fix:** User must be the one who registered the device, or be granted access.

### Empty telemetry array
**Cause:** Device has not published any data.
**Fix:** Run `python -m app.mock_esp32` to simulate ESP32 publishing.

### MQTT command not reaching device
**Cause:** Mosquitto not running, or device not subscribed.
**Fix:** `sudo systemctl status mosquitto` and check device MQTT connection.

### MAC format rejected (422)
**Cause:** MAC not in `AA:BB:CC:DD:EE:FF` format.
**Fix:** Normalize MAC to uppercase with colon separators.

---

## Quick Verification Checklist

- [ ] `GET /health` returns 200
- [ ] `POST /api/users/sync` with correct secret returns 200
- [ ] `GET /api/dispositivos` with valid Auth0 token returns 200
- [ ] Device pre-seeded in DB + `permisos_usuario_artefacto` row created (see Step 3)
- [ ] Device appears in `GET /api/dispositivos` list
- [ ] `GET /api/dispositivos/{mac}` returns device detail
- [ ] `POST /api/dispositivos/{mac}/comando/estado` toggles relay
- [ ] `POST /api/dispositivos/{mac}/comando/limites` sets limits
- [ ] `GET /api/dispositivos/{mac}/telemetria` returns data after mock_esp32 runs
- [ ] WebSocket connects with `?token=` query param (local: `ws://`, prod: `wss://`)
- [ ] All errors return `{error, message, ...}` format (never `{detail}`)

**See `CORRECTIONS.md` for:** device pairing scope, app limitations, `wss://` requirement.

---

*Last updated: 2026-05-14*
*See also: CORRECTIONS.md — device pairing is hardware-only, app never registers devices*
