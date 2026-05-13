# Context: SmartSaver App

## Domain Vocabulary

| Term | Meaning |
|------|---------|
| Artefacto | An IoT device (ESP32-based Smart Mini-UPS) identified by MAC address |
| Telemetría | Real-time sensor data: voltaje, corriente, potencia |
| Comando | A control instruction sent to a device (toggle power, set limits) |
| Puerta de enlace | The ESP32 gateway that bridges LoRa nodes to the backend |
| Zona | TinyML battery health classification: Safe, Warning, Critical |
| Límite | Safety threshold for voltaje, corriente, or potencia |
| Permisos | Access control linking a user to an artefacto |

## Key Relationships

- **User** authenticates via Auth0 (OAuth2.1 + OIDC, PKCE flow)
- **User** → many **Permisos** → many **Artefactos** (many-to-many ACL)
- **Artefacto** → many **Telemetría** readings (time-series)
- **Artefacto** → one **Estado** (online/offline, relay on/off)
- **Comando** (estado/limites) → user sends → backend → MQTT → device

## Architecture Constraints

- All API types use Spanish naming (mac_dispositivo, encendido, etc.) — matches FastAPI backend
- WebSocket service is currently disabled; telemetry uses 5-second HTTP polling
- Device registry is hardcoded (DEVICE_REGISTRY) — migrating to authenticated API
- Auth tokens stored in expo-secure-store, never AsyncStorage

## External Systems

- **Auth0**: Identity provider (thesisbroker.us.auth0.com)
- **FastAPI backend**: REST API at api.thesisbroker.com, MQTT broker for device communication
- **MariaDB**: Backend database (separate repo)