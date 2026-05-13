---
SmartSaver IoT Backend — API & Architecture Specification
Overview
FastAPI backend for managing IoT devices (ESP32-based Smart Mini-UPS). Devices communicate via MQTT; the backend persists telemetry to MariaDB and exposes a REST API for the frontend app. All endpoints, models, and columns use Spanish naming conventions.
---
Base URL
http://<host>:8000
(No API prefix beyond /api on data endpoints; /health is at root.)
---
Endpoints
GET /health
Health check. Returns an empty object.
Response: 200 — {}
---
GET /api/telemetria/{mac_dispositivo}
Retrieve recent telemetry readings for a device.
Param
mac_dispositivo
limite
Response: 200 — List[TelemetriaResponse] (empty list if no data)
Error: 404 not applicable — returns [] for missing devices.
---
POST /api/telemetria
Register a new telemetry reading (used by ESP32 devices via MQTT, but also exposed as REST).
Request Body: TelemetriaCreate
{
  "mac_dispositivo": "00:1B:44:11:3A:B7",
  "voltaje": 12.1,
  "corriente": 1.8,
  "potencia": 21.78,
  "tiempo_operacion_s": 1715682000
}
Response: 201 — TelemetriaResponse
Error: 404 — {"detail": "Dispositivo no registrado"} (device MAC not found in artefactos table)
---
POST /api/comando/estado
Turn a device's physical relay on or off.
Request Body: DispositivoEstado
{
  "mac_dispositivo": "00:1B:44:11:3A:B7",
  "encendido": true
}
Side effects:
1. Updates is_encendido on the Artefacto row in MariaDB.
2. Publishes MQTT message to smartups/dispositivos/{mac}/comando/estado with payload {"encendido": true/false}.
Response: 200 — {}
Error: 404 — {"detail": "Dispositivo no encontrado"}
---
POST /api/comando/limites
Push updated operational limits to a device.
Request Body: DispositivoLimites (all limit fields are optional — exclude_unset=True means only sent fields are forwarded to the device)
{
  "mac_dispositivo": "00:1B:44:11:3A:B7",
  "limite_voltaje": 14.0,
  "limite_corriente": 2.5
}
Side effects:
1. Verifies the device exists (returns 404 if not).
2. Publishes MQTT message to smartups/dispositivos/{mac}/comando/limites with only the fields that were explicitly set.
Response: 200 — {}
Error: 404 — {"detail": "Dispositivo no encontrado"}
---
GET /api/dispositivos/{mac_dispositivo}/estado
Check whether a device is reachable (network liveness).
Param
mac_dispositivo
Response: 200 — DispositivoEstadoResponse
{
  "mac_dispositivo": "00:1B:44:11:3A:B7",
  "is_online": true
}
Error: 404 — {"detail": "Dispositivo no encontrado"}
> Important: This returns is_online (network reachability), NOT is_encendido (relay state). See Semantic Distinctions (#semantic-distinctions).
---
Schemas
Input Schemas
Schema	Fields
TelemetriaCreate	mac_dispositivo: str (len=17), voltaje: float (≥0), corriente: float (≥0), potencia: float (≥0), tiempo_operacion_s: int (≥0)
DispositivoEstado	mac_dispositivo: str, encendido: bool
DispositivoLimites	mac_dispositivo: str, limite_voltaje: float | null, limite_corriente: float | null, limite_potencia: float | null
Output Schemas
Schema	Fields
TelemetriaResponse	id: int, id_artefacto: int, timestamp: datetime, voltaje: float, corriente: float, potencia: float, tiempo_operacion_s: int, estado_sin_cambios: bool
DispositivoEstadoResponse	mac_dispositivo: str, is_online: bool
---
Database Model (Artefacto — artefactos table)
This is the core device table the frontend interacts with:
Column
id
mac
nombre_personalizado
nivel_prioridad
limite_consumo_w
estado_deseado
estado_reportado
is_online
is_encendido
last_seen_at
override_activo
vencimiento_lease
Other tables: telemetria (partitioned time-series), app_api_keys, permisos_app_artefacto (ACL), alertas_sistema, credenciales_mtls, despliegues_ota, eventos_usuario. These have no REST endpoints yet.
---
MQTT Topics
Direction	Topic Pattern
Subscribe	smartups/dispositivos/{mac}/telemetria
Subscribe	smartups/dispositivos/{mac}/conexion
Publish	smartups/dispositivos/{mac}/comando/estado
Publish	smartups/dispositivos/{mac}/comando/limites
MQTT broker: 127.0.0.1:1883 (Mosquitto)
---
Semantic Distinctions
Term	DB Column
is_online	Artefacto.is_online
is_encendido	Artefacto.is_encendido
estado_deseado	Artefacto.estado_deseado
estado_reportado	Artefacto.estado_reportado
---
## Known Issues
1. **`conexion` handler bug** (`mqtt_listener.py:63`): When a device connects/disconnects, the handler calls `actualizar_estado_dispositivo(db, mac, encendido=estado_bool)` which sets `is_encendido` (relay state) instead of `is_online` (reachability). This means `GET /api/dispositivos/{mac}/estado` may return stale `is_online` values.
2. **Hardcoded MQTT credentials** in `main.py:57,74`: Publish commands use literal `esp-gateway` / password while the listener reads from env vars. Should be unified to env vars.
3. **No `app/__init__.py`**: All imports use the `app.` prefix; uvicorn must be run from the project root (`iot_backend/`) for this to resolve.
---
Translation Quick Reference
Spanish
artefacto
telemetría
encendido
conexión
dispositivo
límite
voltaje
corriente
potencia
permiso
alerta
despliegue
credencial
---
