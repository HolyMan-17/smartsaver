# Backend Overhaul Specification — Auth0 OAuth2.1 Integration

*Handoff document for the backend agent.*

## 1. New Database Tables

### 1.1 `usuarios` table (replaces `app_api_keys` for authentication)

```sql
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auth0_id VARCHAR(255) UNIQUE NOT NULL,   -- JWT "sub" claim, e.g. "auth0|6735a1b2c4d8e9f01234"
    email VARCHAR(255) NOT NULL,
    nombre VARCHAR(255),
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso DATETIME NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uc_auth0_id UNIQUE (auth0_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 1.2 `permisos_usuario_artefacto` table (replaces `permisos_app_artefacto`)

```sql
CREATE TABLE permisos_usuario_artefacto (
    id_usuario INT NOT NULL,
    id_artefacto INT NOT NULL,
    nivel_acceso VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_usuario, id_artefacto),
    CONSTRAINT fk_permiso_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_permiso_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 1.3 `eventos_usuario` table modification (add user FK)

```sql
ALTER TABLE eventos_usuario 
    ADD COLUMN id_usuario INT NULL AFTER id_artefacto,
    ADD CONSTRAINT fk_eventos_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL;
```

## 2. Deprecated Tables

- **`app_api_keys`** — No longer used for mobile app authentication. Keep the table for reference, but create no new rows. All auth goes through Auth0 JWTs.
- **`permisos_app_artefacto`** — Replaced by `permisos_usuario_artefacto`. Keep during migration, deprecate. Do not add new rows.

## 3. Environment Variables (add to backend `.env`)

```env
# Auth0 Configuration
AUTH0_DOMAIN=thesisbroker.us.auth0.com
AUTH0_AUDIENCE=https://api.thesisbroker.com
AUTH0_ISSUER=https://thesisbroker.us.auth0.com/
AUTH0_JWKS_URI=https://thesisbroker.us.auth0.com/.well-known/jwks.json

# Auth0 User Sync Secret (shared with Auth0 Action)
BACKEND_SYNC_SECRET=<the-generated-secret-from-openssl-rand-base64-48>

# Existing MQTT config, DB config, etc. remain unchanged
```

## 4. JWT Validation Middleware

### 4.1 Dependencies

```bash
pip install python-jose[cryptography] pydantic-settings
```

### 4.2 Middleware Specification

Every request to `/api/*` endpoints must:

1. Extract `Authorization: Bearer <token>` header
2. Validate JWT:
   - Signature against JWKS from `https://thesisbroker.us.auth0.com/.well-known/jwks.json` (cache keys, refresh periodically)
   - `iss` must equal `https://thesisbroker.us.auth0.com/`
   - `aud` must equal `https://api.thesisbroker.com`
   - `exp` must not be in the past
3. Extract `sub` claim (Auth0 user ID, e.g., `auth0|6735a1b2c4d8e9f01234`)
4. Extract `scope` claim (space-separated string, e.g., `read:devices write:devices`)
5. Look up `usuarios` table by `auth0_id = sub` — if not found, return `403 Forbidden`
6. Inject user info into `request.state.user` for downstream handlers

### 4.3 Public Endpoints (no auth required)

| Endpoint | Reason |
|----------|--------|
| `GET /health` | Monitoring/health checks |
| `POST /api/users/sync` | Called by Auth0 Action with shared secret, not JWT |

### 4.4 Scope-Based Authorization

| Scope | Required For |
|-------|-------------|
| `read:devices` | `GET /api/dispositivos`, `GET /api/dispositivos/{mac}`, `GET /api/dispositivos/{mac}/telemetria` |
| `write:devices` | `POST /api/dispositivos/{mac}/comando/estado`, `POST /api/dispositivos/{mac}/comando/limites` |
| `read:logs` | `GET /api/logs` (future endpoint) |

For now (single-user), all scopes are granted to every authenticated user. Scope checking can be added later.

## 5. New API Endpoints

### 5.1 `POST /api/users/sync` — Auth0 Webhook

Called by the Auth0 Post-Login Action. NOT authenticated via JWT — authenticated via shared secret.

```
POST /api/users/sync
Authorization: Bearer <BACKEND_SYNC_SECRET>
Content-Type: application/json

{
  "auth0_id": "auth0|6735a1b2c4d8e9f01234",
  "email": "user@example.com",
  "nombre": "Manuel"
}
```

**Logic:**
1. Validate `Authorization` header matches `BACKEND_SYNC_SECRET` from env
2. Upsert into `usuarios` table: `INSERT ... ON DUPLICATE KEY UPDATE email=VALUES(email), nombre=VALUES(nombre), ultimo_acceso=NOW()`
3. Return 200 with `{"status": "synced", "auth0_id": "auth0|..."}`

### 5.2 `GET /api/dispositivos` — List User's Devices

Authenticated via JWT. Returns only devices the user has access to via `permisos_usuario_artefacto`.

```
GET /api/dispositivos
Authorization: Bearer <access_token>

Response 200:
[
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
  },
  ...
]
```

**Logic:**
1. Get user from JWT `sub` claim → lookup `usuarios.id`
2. JOIN `permisos_usuario_artefacto` → `artefactos`
3. Return only devices where user has a `permisos_usuario_artefacto` row
4. **This replaces the hardcoded `DEVICE_REGISTRY` on the app side**

### 5.3 `GET /api/dispositivos/{mac}` — Device Detail

Replaces the old `GET /api/dispositivos/{mac}/estado`. Returns full device info, not just online status.

```
GET /api/dispositivos/{mac}
Authorization: Bearer <access_token>

Response 200:
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

Response 404:
{
  "error": "not_found",
  "message": "Dispositivo no encontrado",
  "mac": "00:1B:44:11:3A:B7"
}
```

### 5.4 `GET /api/dispositivos/{mac}/telemetria` — Telemetry

Replaces the old `GET /api/telemetria/{mac_dispositivo}`.

```
GET /api/dispositivos/{mac}/telemetria?limite=50
Authorization: Bearer <access_token>

Response 200:
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
  },
  ...
]
```

Note: `id_artefacto` replaced by `mac_dispositivo` in the response.

### 5.5 `POST /api/dispositivos` — Register Device (NEW)

Register a device by MAC address.

```
POST /api/dispositivos
Authorization: Bearer <access_token>

Request:
{ "mac": "00:1B:44:11:3A:B7" }

Response 201:
{
  "id": 1,
  "mac": "00:1B:44:11:3A:B7",
  "nombre_personalizado": null,
  "nivel_prioridad": "media",
  "limite_consumo_w": 0.00,
  "is_online": false,
  "is_encendido": false,
  "nivel_acceso": "ADMIN",
  "last_seen_at": null
}
```

### 5.6 `PATCH /api/dispositivos/{mac}` — Update Device (NEW)

Partial update. Uses `exclude_unset=True` — only sent fields are updated.

```
PATCH /api/dispositivos/{mac}
Authorization: Bearer <access_token>

Request:
{ "nombre_personalizado": "Kitchen Light", "limite_consumo_w": 150.0 }

Response 200:
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

## 6. Modified Existing Endpoints

All endpoints below gain JWT authentication and device authorization checks.

**Important**: Backend now uses RESTful resource paths with MAC in URL instead of flat paths. MAC is no longer in request bodies.

### 6.1 `GET /api/dispositivos/{mac}/telemetria`

*(Replaces `GET /api/telemetria/{mac_dispositivo}`)*

- **Add**: JWT auth required, scope `read:devices`
- **Add**: Verify user has access to this device's MAC via `permisos_usuario_artefacto`
- **If unauthorized**: Return `403 {"error": "forbidden", "message": "Dispositivo no autorizado"}`
- **Behavior unchanged**: Returns telemetry data for the MAC
- **Query param**: `?limite=50` still supported

### 6.2 `POST /api/dispositivos/{mac}/comando/estado`

*(Replaces `POST /api/comando/estado`)*

- **Add**: JWT auth required, scope `write:devices`
- **Add**: Verify user has access to target device
- **Add**: Log action in `eventos_usuario` with `id_usuario`
- **Change**: MAC is now in URL path, not in request body
- **Request body is now**: `{"encendido": true}` (no `mac_dispositivo` field)
- **Behavior unchanged**: Updates relay state + publishes MQTT

### 6.3 `POST /api/dispositivos/{mac}/comando/limites`

*(Replaces `POST /api/comando/limites`)*

- **Add**: JWT auth required, scope `write:devices`
- **Add**: Verify user has access to target device
- **Change**: MAC is now in URL path, not in request body
- **Request body is now**: `{"limite_voltaje": 14.0}` (no `mac_dispositivo` field)
- **Add**: Server-side input validation (critical):
  - `limite_voltaje`: if present, must be a number ≥ 0.1 and ≤ 60
  - `limite_corriente`: if present, must be a number ≥ 0.1 and ≤ 30
  - `limite_potencia`: if present, must be a number ≥ 0.1 and ≤ 500
  - Reject `NaN`, `Infinity`, `-Infinity`, negative values, and non-numeric types
  - Return `422` with structured error: `{"error": "validation_error", "message": "..."}`
- **Behavior unchanged**: Publishes limits via MQTT

### 6.4 `GET /api/dispositivos/{mac}`

*(Replaces `GET /api/dispositivos/{mac_dispositivo}/estado`)*

- **Add**: JWT auth required, scope `read:devices`
- **Add**: Verify user has access to this device
- **Change**: Returns full device detail (not just `is_online`), includes `nivel_acceso`, `nombre_personalizado`, `limite_consumo_w`, etc.
- **See section 5.3 for response shape**

### 6.5 `POST /api/telemetria`

- **No auth change** — this endpoint is called by ESP32 devices via MQTT, not by the app
- **Keep existing `app_api_keys` auth** for M2M device communication (separate from mobile app auth)

## 6.6 Error Response Format

All error responses now use structured JSON (not FastAPI default `{"detail": "..."}`):

```json
{
  "error": "not_found",
  "message": "Dispositivo no encontrado",
  "mac": "00:1B:44:11:3A:B7"
}
```

| `error` code | HTTP | When |
|---|---|---|
| `unauthorized` | 401 | Missing/invalid JWT |
| `forbidden` | 403 | No device access |
| `not_found` | 404 | Device not found |
| `validation_error` | 422 | Bad input |
| `rate_limited` | 429 | Too many requests |

## 7. WebSocket Authentication

### 7.1 `WS /ws/telemetry`

Current: `ws://localhost:8000/ws/telemetry` (no auth)
New: `wss://api.thesisbroker.com/ws/telemetry?token=<access_token>`

**Logic:**
1. Client connects with JWT access token as query parameter
2. On connection, validate JWT (same rules as REST middleware)
3. If token invalid/expired → close with code `4001` and reason `"Unauthorized"`
4. If token valid → accept connection, filter telemetry events to only devices the user has access to
5. On token expiry during active connection → close with code `4001`
6. **TLS is mandatory in production** (`wss://`)

## 8. Existing Bug Fixes (from `api_spec.md`)

### 8.1 `conexion` handler bug

In `mqtt_listener.py` line ~63: the `conexion` handler calls `actualizar_estado_dispositivo(db, mac, encendido=estado_bool)` which sets `is_encendido` (relay state) instead of `is_online` (reachability).

**Fix:**
```python
# BEFORE (buggy)
actualizar_estado_dispositivo(db, mac, encendido=estado_bool)

# AFTER (fixed)
actualizar_estado_dispositivo(db, mac, is_online=estado_bool)
```

### 8.2 MQTT credentials deduplication

`main.py` lines 57 and 74 use hardcoded MQTT credentials while the listener reads from env vars. Unify to env vars only.

## 9. Rate Limiting

Add per-user rate limiting using `slowapi`:

```bash
pip install slowapi
```

| Endpoint | Limit |
|----------|-------|
| `POST /api/dispositivos/{mac}/comando/estado` | 10 requests/minute per user |
| `POST /api/dispositivos/{mac}/comando/limites` | 10 requests/minute per user |
| `GET /api/dispositivos/{mac}/telemetria` | 60 requests/minute per user |
| `GET /api/dispositivos` | 30 requests/minute per user |
| `POST /api/users/sync` | 5 requests/minute (by IP, no JWT) |

Use `sub` claim from JWT as the rate limit key for authenticated endpoints, and client IP for the sync endpoint.

## 10. Device Claiming (Future — Document Only)

```
POST /api/dispositivos/claim
Authorization: Bearer <access_token>

{
  "mac_dispositivo": "00:1B:44:11:3A:B7"
}
```

**Logic:**
1. Validate JWT
2. Check MAC exists in `artefactos` table
3. Check MAC is not already claimed by another user (no row in `permisos_usuario_artefacto` for this device with a different user)
4. Create `permisos_usuario_artefacto` row with `nivel_acceso = 'ADMIN'`
5. Return 201 with the device info

**Not implemented yet.** For development, pre-seed `permisos_usuario_artefacto` rows manually:

## 11. App-Side Changes (Already Implemented)

The following changes have already been made on the app side. Your backend must be compatible with these:

- **Client-side input validation** on safety limits: voltage (0.1–60 V), current (0.1–30 A), power (0.1–500 W). Backend should validate with the same or stricter bounds.
- **Auth flow**: App uses OAuth2.1 Authorization Code + PKCE via `expo-auth-session`. Tokens stored in `expo-secure-store`. Access tokens sent as `Authorization: Bearer <token>` on all API calls.
- **API paths are RESTful**: MAC is in the URL path, not in request bodies. Commands use `POST /api/dispositivos/{mac}/comando/estado` and `POST /api/dispositivos/{mac}/comando/limites`. Telemetry uses `GET /api/dispositivos/{mac}/telemetria`. Device detail uses `GET /api/dispositivos/{mac}`.
- **Device registry**: App will first try `GET /api/dispositivos`, fall back to a hardcoded list if that fails. Your endpoint must return the JSON structure shown in section 5.2.
- **Error responses**: Backend uses structured JSON with `error`, `message`, and context fields (e.g., `mac`). Not FastAPI default `{"detail": "..."}`.
- **WebSocket**: App will connect to `wss://api.thesisbroker.com/ws/telemetry?token=<access_token>`.
- **Logout**: App calls Auth0 `/v2/logout` to kill the session, then clears local tokens.
- **API client**: App sends `Authorization: Bearer <token>` header on all `/api/*` requests. Expects 401 on expired tokens (will refresh and retry once). Expects 403 on unauthorized device access.

## 12. Migration Checklist

1. [ ] Create `usuarios` table
2. [ ] Create `permisos_usuario_artefacto` table
3. [ ] ALTER `eventos_usuario` to add `id_usuario` column and FK
4. [ ] Add JWT validation middleware (JWKS)
5. [ ] Add `POST /api/users/sync` endpoint
6. [ ] Add `GET /api/dispositivos` endpoint (user-scoped device list)
7. [ ] Add `GET /api/dispositivos/{mac}` endpoint (device detail, replaces `/estado`)
8. [ ] Add `GET /api/dispositivos/{mac}/telemetria` endpoint (replaces `/api/telemetria/{mac}`)
9. [ ] Add `POST /api/dispositivos/{mac}/comando/estado` (replaces `/api/comando/estado`)
10. [ ] Add `POST /api/dispositivos/{mac}/comando/limites` (replaces `/api/comando/limites`)
11. [ ] Add `POST /api/dispositivos` endpoint (register device)
12. [ ] Add `PATCH /api/dispositivos/{mac}` endpoint (update device)
13. [ ] Protect all `/api/*` endpoints with JWT middleware
14. [ ] Add device authorization checks (permisos_usuario_artefacto)
15. [ ] Add input validation on `POST /api/dispositivos/{mac}/comando/limites`
16. [ ] Implement structured error responses (`error`, `message`, context fields)
17. [ ] Add rate limiting with slowapi
18. [ ] Configure WebSocket token auth (`wss://` + JWT validation)
19. [ ] Fix `conexion` handler bug (`is_online` not `is_encendido`)
20. [ ] Unify MQTT credentials to env vars
21. [ ] Add environment variables (`AUTH0_*`, `BACKEND_SYNC_SECRET`)
22. [ ] Pre-seed `permisos_usuario_artefacto` for development testing