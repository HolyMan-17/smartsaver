# Implementation Plan: Pairing / Add Node & Unlink Flow (Mobile App)

## Backend Contract

Full contract sourced from `frontend-integration.md`. See also sections 2–3 for REST/WS details.

## Decisions Captured

| Decision | Value |
|----------|-------|
| Gateway scope | One gateway per user (tied to UPS system). No multiple-gateway support. |
| Add Node entry point | `ListFooterComponent` at the bottom of `DevicesScreen` FlatList. |
| Pairing endpoint | `POST /api/gateways/{gateway_mac}/comando/pairing` |
| Unlink endpoint | `POST /api/gateways/{gateway_mac}/comando/unlink` |
| Node list endpoint | `GET /api/gateways/{gateway_mac}/nodes` |
| Pairing transport | App calls REST → backend forwards command to gateway via MQTT. |
| Real-time updates | WebSocket `gateway_pairing` and `gateway_unlink` events drive all state transitions. |
| Countdown | Driven locally in the app from the requested `duration_sec`. |
| Auto-stop | Backend sends `stop` automatically after a node joins — app does not call stop pairing on success. |
| Pairing capacity | One node per pairing window. Process ends when node joins or countdown expires. |
| Unlink confirmation | WebSocket `gateway_unlink` event with status `acked` or `offline`. |

---

## 1. Goal

Let the user pair a new stray node to their gateway, and unlink (delete) existing nodes. Both flows are driven by WebSocket events for real-time status.

### Pairing Flow
1. User taps **+ Agregar Nodo** in the device list footer.
2. App calls `POST /api/gateways/{gateway_mac}/comando/pairing` with `{ accion: "start", duration_sec: 60 }`.
3. A pairing modal opens with a local countdown and helper text.
4. User powers on/resets the stray node.
5. Backend sends WS `gateway_pairing` event with `estado: "node_joined"` and the new `node_mac`.
6. App transitions to success state, auto-closes modal, refreshes the device list.
7. Backend auto-sends `stop` pairing. App receives `estado: "stopped"` event, finalizes.

### Unlink Flow
1. User swipes a node card → taps **Eliminar** (already implemented).
2. App calls `POST /api/gateways/{gateway_mac}/comando/unlink` with `{ node_mac }`.
3. App waits for WS `gateway_unlink` event.
4. On `status: "acked"` or `"offline"` → app removes node from list.

---

## 2. REST API Endpoints (Contract)

### 2.1 Start / Stop Pairing Mode

```
POST /api/gateways/{gateway_mac}/comando/pairing
Authorization: Bearer <access_token>

Request:
{
  "accion": "start",       // "start" | "stop"
  "duration_sec": 60       // optional, default 60, range 10–120
}

Response 200:
{
  "status": "sent",
  "gateway_mac": "AA:BB:CC:DD:EE:FF",
  "accion": "start",
  "duration_sec": 60
}

Errors:
  401 Unauthorized — token invalid/expired
  422 Unprocessable Entity — invalid accion or duration out of range
```

**App behavior:**
- On `start`: open pairing modal, begin local countdown, subscribe to WS `gateway_pairing` events.
- On `stop`: close modal, stop countdown, mark state idle.

### 2.2 Unlink Node

```
POST /api/gateways/{gateway_mac}/comando/unlink
Authorization: Bearer <access_token>

Request:
{
  "node_mac": "11:22:33:44:55:66",
  "node_id": 1              // optional
}

Response 200:
{
  "status": "sent",
  "gateway_mac": "AA:BB:CC:DD:EE:FF",
  "node_mac": "11:22:33:44:55:66"
}

Errors:
  401 Unauthorized
  403 Forbidden — user does not have permission for this node
  404 Not Found — node or gateway not found
```

### 2.3 List Paired Nodes

```
GET /api/gateways/{gateway_mac}/nodes
Authorization: Bearer <access_token>

Response 200:
[
  {
    "id": 1,
    "mac": "11:22:33:44:55:66",
    "nombre_personalizado": "Luz Sala",
    "nivel_prioridad": "P2",
    "estado_reportado": true,
    "estado_deseado": true,
    "is_online": true,
    "limite_consumo_w": 100.0,
    "limite_voltaje": 130.0,
    "limite_corriente": 5.0,
    "limite_potencia": 120.0
  }
]
```

---

## 3. WebSocket Events

All events arrive on the existing `wss://api.thesisbroker.com/ws/telemetry?token=<jwt>` connection. The `useTelemetryStore` or a new handler must filter and dispatch these.

### 3.1 Pairing Status (`gateway_pairing`)

```json
{
  "event": "gateway_pairing",
  "gateway_mac": "AA:BB:CC:DD:EE:FF",
  "estado": "active | node_joined | stopped | timeout | full",
  "duration_sec": 60,
  "node_mac": "11:22:33:44:55:66",
  "node_id": 1
}
```

| `estado` | App action |
|----------|------------|
| `active` | Confirm pair mode is active; sync countdown if needed. |
| `node_joined` | Transition to success. Auto-refresh device list. Show success banner. |
| `stopped` | Dismiss modal. Reset pairing state. (Backend auto-sends after `node_joined` or user cancels.) |
| `timeout` | Show timeout alert. Dismiss modal. |
| `full` | Show "Gateway full" alert. Dismiss modal. |

### 3.2 Unlink Acknowledgment (`gateway_unlink`)

```json
{
  "event": "gateway_unlink",
  "gateway_mac": "AA:BB:CC:DD:EE:FF",
  "node_mac": "11:22:33:44:55:66",
  "status": "acked | offline"
}
```

| `status` | App action |
|----------|------------|
| `acked` | Node confirmed unlink. Remove from list. |
| `offline` | Node was offline — gateway removed it immediately. Remove from list. Node will be forced to unlink on reconnect. |

---

## 4. State Machine

```
     Idle ──(tap "Add Node")──> StartPairing ──(POST /pairing 200)──> Countdown
       
     Countdown ──(WS "node_joined")──> Success ──(WS "stopped")──> Idle
     Countdown ──(tap Cancel)──> Stopping ──(POST /pairing stop)──> Idle
     Countdown ──(WS "timeout")──> Timeout ──(dismiss)──> Idle

     Idle ──(swipe Delete)──> Confirm ──(POST /unlink)──> Pending ──(WS "gateway_unlink")──> Idle
```

---

## 5. App Implementation

### 5.1 Files to Create / Modify

| File | Change |
|------|--------|
| `src/types/api.ts` | Add `GatewayPairingRequest`, `GatewayPairingResponse`, `GatewayUnlinkRequest`, `GatewayUnlinkResponse`, `WSPairingEvent`, `WSUnlinkEvent`. |
| `src/types/telemetry.ts` | Add `gateway_pairing` and `gateway_unlink` to the `WSMessage` union. |
| `src/services/apiClient.ts` | Add `startPairing(gatewayMac, durationSec?)`, `stopPairing(gatewayMac)`, `unlinkNode(gatewayMac, nodeMac)`, `getGatewayNodes(gatewayMac)`. |
| `src/store/usePairingStore.ts` (new) | Zustand store: `isActive`, `endsAt`, `status`, `error`, actions. |
| `src/store/useTelemetryStore.ts` | Add WS message handler for `gateway_pairing` and `gateway_unlink` events, update `usePairingStore`. |
| `src/screens/DevicesScreen/DevicesScreen.tsx` | Add `ListFooterComponent`, pairing modal, countdown interval, WS event subscription, success/timeout handling. |
| `src/screens/DevicesScreen/DevicesScreen.styles.ts` | Footer button, modal, countdown styles. |
| `app/devices.tsx` | No change. |

### 5.2 Gateway MAC Resolution

The app needs the gateway MAC to call pairing/unlink endpoints. Suggested source:

- **Primary**: Store it from `GET /api/users/settings` or from the UPS system response.
- **Fallback**: A dedicated `GET /api/gateway/info` that returns the user's gateway MAC.
- **Alternative**: If truly one gateway per user, backend could accept `POST /api/sistema/pairing` which resolves the MAC internally.

> **Open decision:** Confirm with backend how the app obtains the gateway MAC.

### 5.3 UI Components

#### List Footer Button

At the bottom of `FlatList` via `ListFooterComponent`:

```
┌─────────────────────────────┐
│  +  Agregar Nodo              │   ← blue/white, full width, rounded
└─────────────────────────────┘
```

#### Pairing Modal

Centered/fade overlay (same pattern as edit-name modal):

| Element | Content |
|---------|---------|
| Title | **"Agregar Nodo"** |
| Status text | *"Modo de emparejamiento activo"* |
| Countdown | Animated ring or progress bar showing remaining seconds |
| Instructions | *"Enciende o reinicia el nodo que quieres emparejar. Se conectará automáticamente a la puerta de enlace."* |
| Cancel button | **Cancelar** — sends `accion: "stop"` |

#### Success Banner

After WS `node_joined`, show a brief success indicator:
- Close modal
- Flash new device card with a highlight animation
- Auto-dismiss after 2 seconds

### 5.4 Countdown Logic

1. When `POST /pairing` returns 200, set `pairingStore.start({ endsAt: Date.now() + duration_sec * 1000, duration: duration_sec })`.
2. Start a 1-second `setInterval` updating `remainingSeconds`.
3. When `remainingSeconds <= 0` and no `node_joined` event fired, treat as local timeout (the backend will also send `timeout` event).
4. On cancel: call `stopPairing()`, clear interval, close modal.
5. On WS `node_joined`: clear interval, wait for `stopped`, close modal, refresh list.
6. **Important:** Backend caps at 120 s. App should enforce 10–120 s range.

### 5.5 WS Event Handling

In `useTelemetryStore` or a subscription inside `DevicesScreen`:

```ts
// Pseudocode
wsService.onMessage((msg) => {
  if (msg.event === 'gateway_pairing') {
    const store = usePairingStore.getState();
    switch (msg.estado) {
      case 'node_joined': store.markSuccess(msg.node_mac); break;
      case 'stopped': store.markStopped(); break;
      case 'timeout': store.markTimeout(); break;
      case 'full': store.markError('full'); break;
    }
  }
  if (msg.event === 'gateway_unlink') {
    // Update unlink status, remove node from list
  }
});
```

### 5.6 Error Handling

| Scenario | UX |
|----------|-----|
| 401 / 422 on pairing request | Show alert, do not open modal. |
| Gateway offline | Show alert: *"La puerta de enlace no responde."* |
| `full` event | Show alert: *"La puerta de enlace no tiene capacidad para más nodos."* |
| `timeout` event | Show alert: *"No se detectó ningún nodo. Inténtalo de nuevo."* |

---

## 6. Types

```ts
// src/types/api.ts additions

export interface GatewayPairingRequest {
  accion: 'start' | 'stop';
  duration_sec?: number;
}

export interface GatewayPairingResponse {
  status: string;
  gateway_mac: string;
  accion: 'start' | 'stop';
  duration_sec?: number;
}

export interface GatewayUnlinkRequest {
  node_mac: string;
  node_id?: number;
}

export interface GatewayUnlinkResponse {
  status: string;
  gateway_mac: string;
  node_mac: string;
}

export interface GatewayNode {
  id: number;
  mac: string;
  nombre_personalizado: string | null;
  nivel_prioridad: string;
  estado_reportado: boolean;
  estado_deseado: boolean;
  is_online: boolean;
  limite_consumo_w: number;
  limite_voltaje: number | null;
  limite_corriente: number | null;
  limite_potencia: number | null;
}
```

```ts
// src/types/telemetry.ts additions to WSMessage union

export interface WSPairingEvent {
  event: 'gateway_pairing';
  gateway_mac: string;
  estado: 'active' | 'node_joined' | 'stopped' | 'timeout' | 'full';
  duration_sec: number;
  node_mac?: string;
  node_id?: number;
}

export interface WSUnlinkEvent {
  event: 'gateway_unlink';
  gateway_mac: string;
  node_mac: string;
  status: 'acked' | 'offline';
}
```

---

## 7. API Client Additions

```ts
// src/services/apiClient.ts additions

// Pairing
startPairing: async (gatewayMac: string, durationSec = 60):
  Promise<GatewayPairingResponse | null> => { ... }
stopPairing: async (gatewayMac: string):
  Promise<GatewayPairingResponse | null> => { ... }

// Unlink
unlinkNode: async (gatewayMac: string, nodeMac: string):
  Promise<GatewayUnlinkResponse | null> => { ... }

// Node list (gateway-owned)
getGatewayNodes: async (gatewayMac: string):
  Promise<GatewayNode[] | null> => { ... }
```

All use `authenticatedFetch`. Errors return `null`.

---

## 8. State Store (`usePairingStore`)

```ts
interface PairingState {
  isActive: boolean;
  endsAt: number | null;
  durationSec: number;
  status: 'idle' | 'countdown' | 'success' | 'timeout' | 'stopped' | 'error';
  pairedNodeMac: string | null;
  error: string | null;
  
  start: (params: { endsAt: number; duration: number }) => void;
  markSuccess: (nodeMac: string) => void;
  markStopped: () => void;
  markTimeout: () => void;
  markError: (msg: string) => void;
  reset: () => void;
}
```

In-memory only (no persistence). Zustand store, no persistence middleware.

---

## 9. UI Copy (Spanish)

| Element | Text |
|---------|------|
| Footer button | **+ Agregar Nodo** |
| Modal title | **Agregar Nodo** |
| Modal status | **Modo de emparejamiento activo** |
| Countdown | **Tiempo restante: {s}s** |
| Instructions | *"Enciende o reinicia el nodo que quieres emparejar. Se conectará automáticamente."* |
| Cancel button | **Cancelar** |
| Success toast | **"Nodo {mac} emparejado"** |
| Timeout alert | **"Tiempo agotado"** — *"No se detectó ningún nodo. Inténtalo de nuevo."* |
| Gateway full | **"Capacidad máxima"** — *"La puerta de enlace no puede aceptar más nodos."* |
| Gateway offline | **"Puerta de enlace offline"** — *"No se pudo iniciar el emparejamiento."* |
| Unlink acked | Node removed from list silently. |
| Unlink offline | Node removed from list. Optional toast: *"Nodo desvinculado (estaba offline)."* |

---

## 10. Sequence Diagrams

### 10.1 Pairing a Node

```
User         App              Backend           WS              Gateway       Node
 |             |                  |               |                 |            |
 | tap Add     |                  |               |                 |            |
 |------------>| POST /pairing    |               |                 |            |
 |             | (start, 60s)     |               |                 |            |
 |             |----------------->| publish MQTT  |                 |            |
 | open modal  |<----- 200 -------|------------   | pairingMode=true|            |
 | countdown   |                  |               |                 |            |
 |             |                  |               |                 |<--HANDSHAKE|
 |             |                  |               |             HANDSHAKE_CONFIRM|
 |             |                  | create node   |                 |            |
 |             |  WS "node_joined" |<-------------| publish         |            |
 | close modal |<----- WS -------|               |                 |            |
 | success UI  |                  | publish stop  |                 |            |
 |             |                  |-------------->| pairingMode=false|           |
 | refresh list|  WS "stopped"    |               |                 |            |
 |             |<----- WS -------|               |                 |            |
```

### 10.2 Unlink a Node (Online)

```
User         App              Backend           WS              Gateway       Node
 |             |                  |               |                 |            |
 | swipe Delete|                  |               |                 |            |
 | confirm     |                  |               |                 |            |
 |------------>| POST /unlink     |               |                 |            |
 |             |----------------->| publish MQTT  |                 |            |
 |             |                  |               |             UNLINK via LoRa |
 |             |                  |               |                 |----------->|
 |             |                  |               |             UNLINK_ACK     |
 |             |                  |               |                 |<-----------|
 |             |                  |               |                 |            |
 | remove card |  WS "unlink"     |               |                 |            |
 |             |<----- WS -------| (acked)        |                 |            |
```

### 10.3 Unlink a Node (Offline)

```
User         App              Backend           WS              Gateway
 |             |                  |               |                 |
 | swipe Delete|                  |               |                 |
 | confirm     |                  |               |                 |
 |------------>| POST /unlink     |               |                 |
 |             |----------------->| publish MQTT  |                 |
 |             |                  |               | remove from NVS |
 |             |                  |               | publish offline |
 | remove card |  WS "unlink"     |               |                 |
 |             |<----- WS -------| (offline)      |                 |
```

---

## 11. Testing Steps

1. Tap **+ Agregar Nodo** → modal opens, countdown at 60 s.
2. Verify `POST /api/gateways/{mac}/comando/pairing` with `{ accion: "start", duration_sec: 60 }`.
3. Power on a stray node → verify WS `gateway_pairing` with `estado: "node_joined"`.
4. Modal closes → success toast → new device appears in list.
5. Tap **Cancelar** during countdown → verify `POST .../pairing` with `{ accion: "stop" }`.
6. Let countdown expire → verify timeout alert.
7. Swipe-delete a node → confirm → verify `POST .../unlink` is sent.
8. Receive WS `gateway_unlink` → node removed from list.
9. Test with gateway offline → verify error alert.

---

## 12. Open Questions

1. **Gateway MAC source**: Where does the app obtain the gateway MAC? A dedicated endpoint (`GET /api/gateway/info`), part of UPS system response, or stored in user settings?
2. **Node list vs device list**: Should `GET /api/gateways/{mac}/nodes` replace `GET /api/dispositivos`, supplement it, or be combined into one call?
3. **`gateway_pairing` event router**: Does the backend include the WS event in the existing `/ws/telemetry` stream, or does it use a separate WS endpoint?
4. **Upsert policy**: If the node was previously soft-deleted and re-paired, does `node_joined` still fire with the same MAC? Should the app treat it as a new node or just un-delete the existing one?
