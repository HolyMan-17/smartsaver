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
| Agregados | Time-bucketed telemetry aggregates (avg power, max power, energy Wh) |

## Key Relationships

- **User** authenticates via Auth0 (OAuth2.1 + OIDC, PKCE flow)
- **User** → many **Permisos** → many **Artefactos** (many-to-many ACL)
- **Artefacto** → many **Telemetría** readings (time-series)
- **Artefacto** → one **Estado** (online/offline, estado_reportado/estado_deseado shadow)
- **Comando** (estado/limites) → user sends → backend → MQTT → device

## Architecture Constraints

- All API types use Spanish naming (mac_dispositivo, encendido, etc.) — matches FastAPI backend
- **V5.0 BREAKING:** `is_encendido` removed — use `estado_reportado` (actual relay state) and `estado_deseado` (pending command)
- WebSocket service is currently disabled; telemetry uses 5-second HTTP polling
- When enabled, WS uses `WSMessage` union type (`WSTelemetriaMessage | WSConexionMessage`) per V5.0 contract
- Device list comes from `GET /api/dispositivos` with hardcoded fallback (DEVICE_REGISTRY with 1 device)
- Auth tokens stored in expo-secure-store, never AsyncStorage
- Analytics screen uses aggregated telemetry (`GET /api/dispositivos/{mac}/agregados`) for energy/kWh data and raw telemetry as fallback

## Frontend API Endpoints Used

| Endpoint | Screen(s) |
|----------|-----------|
| `GET /api/dispositivos` | HomeScreen, DevicesScreen, AnalyticsScreen |
| `GET /api/dispositivos/{mac}` | DeviceDetailScreen |
| `PATCH /api/dispositivos/{mac}` | DevicesScreen (name edit), DeviceDetailScreen (name edit) |
| `DELETE /api/dispositivos/{mac}` | Future (settings) |
| `GET /api/dispositivos/{mac}/telemetria` | DeviceDetailScreen, AnalyticsScreen |
| `GET /api/dispositivos/{mac}/agregados` | AnalyticsScreen |
| `POST /api/dispositivos/{mac}/comando/estado` | DeviceDetailScreen |
| `POST /api/dispositivos/{mac}/comando/limites` | DeviceDetailScreen |
| `GET /api/alertas` | Future (AlertsScreen) |
| `PATCH /api/alertas/{id}` | Future (AlertsScreen) |
| `GET /api/eventos` | Future (LogsScreen) |

## External Systems

- **Auth0**: Identity provider (thesisbroker.us.auth0.com)
- **FastAPI backend**: REST API at api.thesisbroker.com, MQTT broker for device communication
- **MariaDB**: Backend database (separate repo)