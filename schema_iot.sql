-- ==============================================================================
-- PROYECTO: Smart Mini-UPS & TinyML IoT Gateway (V17.0)
-- MOTOR: MariaDB
-- DESCRIPCIÓN: Esquema unificado con Telemetría Particionada, Control M2M,
--              Alertas de Sistema, Autenticación Auth0 JWT, Permisos Usuario-Artefacto,
--              Límites normalizados (artefactos_limites), Device Shadow, Lease arbitration,
--              Soft delete, Alertas con resolución, Edge-AI BMS (ai_status),
--              Recomendaciones AI, AI Control (auto-kill + override), Horarios de
--              automatización, Notificaciones push (Expo), Historial de notificaciones,
--              Perfiles UPS (ups_sistemas) con métricas live del Gateway.
--
--              Este archivo consolida todas las migraciones V5.0 → V17.0.
--              Para bases de datos existentes, aplicar migration_v*.sql secuencialmente.
-- ==============================================================================

-- 1. USUARIOS (Auth0 JWT Authentication)
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auth0_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    nombre VARCHAR(255),
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso DATETIME NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    -- AI Control (V8.0): toggles globales aplican a TODOS los dispositivos del usuario
    ai_control_habilitado BOOLEAN NOT NULL DEFAULT FALSE,
    auto_apagado_low_priority BOOLEAN NOT NULL DEFAULT FALSE,
    -- Push notifications (V10.0): Expo push token for mobile notifications
    expo_push_token VARCHAR(255) DEFAULT NULL,
    -- Preferencias de notificación por tipo (V13.0)
    notificaciones_criticas BOOLEAN NOT NULL DEFAULT TRUE,
    notificaciones_advertencias BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uc_auth0_id UNIQUE (auth0_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABLA NÚCLEO (Hardware & Device Shadow)
CREATE TABLE artefactos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mac VARCHAR(17) UNIQUE NOT NULL,
    nombre_personalizado VARCHAR(100),
    nivel_prioridad VARCHAR(10) NOT NULL,
    estado_deseado BOOLEAN NOT NULL DEFAULT FALSE,
    estado_reportado BOOLEAN NOT NULL DEFAULT FALSE,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at DATETIME NULL,
    override_activo BOOLEAN NOT NULL DEFAULT FALSE,
    vencimiento_lease DATETIME NULL,
    deleted_at DATETIME NULL,
    -- AI Control scheduling state (V8.0): per-device auto-kill timer + override cooldown
    auto_kill_at TIMESTAMP NULL DEFAULT NULL,
    ai_override_until TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_artefactos_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. LÍMITES NORMALIZADOS (1:1 con artefactos)
CREATE TABLE artefactos_limites (
    id_artefacto INT PRIMARY KEY,
    limite_consumo_w DECIMAL(8,2) NOT NULL DEFAULT 0,
    limite_voltaje DECIMAL(8,2) NULL,
    limite_corriente DECIMAL(8,2) NULL,
    limite_potencia DECIMAL(8,2) NULL,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- (V14.0) TRUE = configurados por usuario (se aplican); FALSE = reportados por dispositivo (no se aplican)
    configurado_por_usuario BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_limites_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. PERMISOS USUARIO -> ARTEFACTO
CREATE TABLE permisos_usuario_artefacto (
    id_usuario INT NOT NULL,
    id_artefacto INT NOT NULL,
    nivel_acceso VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_usuario, id_artefacto),
    CONSTRAINT fk_permiso_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_permiso_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. LOG DE ALERTAS DEL SISTEMA
CREATE TABLE alertas_sistema (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_artefacto INT NOT NULL,
    tipo_alerta VARCHAR(50) NOT NULL,
    mensaje VARCHAR(255) NOT NULL,
    severidad VARCHAR(20) NOT NULL,
    leido BOOLEAN NOT NULL DEFAULT FALSE,
    resuelto BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_alertas_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE,
    INDEX idx_alertas_resuelto (resuelto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. CREDENCIALES CRIPTOGRÁFICAS M2M
CREATE TABLE credenciales_mtls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_artefacto INT NOT NULL,
    hash_certificado VARCHAR(255) NOT NULL,
    token_activo VARCHAR(255) NOT NULL,
    fecha_emision DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_revocado BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_credenciales_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. GESTIÓN DE ACTUALIZACIONES OTA
CREATE TABLE despliegues_ota (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_artefacto INT NOT NULL,
    version_modelo_ml VARCHAR(50) NOT NULL,
    url_descarga VARCHAR(255) NOT NULL,
    hash_firma VARCHAR(255) NOT NULL,
    estado_despliegue VARCHAR(50) NOT NULL,
    fecha_despliegue DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ota_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. EVENTOS DE USUARIO (Audit trail)
CREATE TABLE eventos_usuario (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_artefacto INT NOT NULL,
    id_usuario INT NULL,
    accion VARCHAR(100) NOT NULL,
    razon_disparo VARCHAR(255),
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_eventos_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE,
    CONSTRAINT fk_eventos_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. SERIES TEMPORALES DE ALTA FRECUENCIA (particionada por mes)
CREATE TABLE telemetria (
    id BIGINT AUTO_INCREMENT,
    id_artefacto INT NOT NULL,
    timestamp DATETIME NOT NULL,
    voltaje DECIMAL(8,2) NOT NULL,
    corriente DECIMAL(8,2) NOT NULL,
    potencia DECIMAL(8,2) NOT NULL,
    tiempo_operacion_s INT NOT NULL,
    estado_sin_cambios BOOLEAN NOT NULL DEFAULT FALSE,
    -- (V6.0) Edge-AI BMS classification: 0 = SAFE, 1 = RISKY, 2 = CRITICAL
    ai_status INT NOT NULL DEFAULT 0,
    -- (V16.0) UPS mode reported in telemetry: 0 = Line, 1 = Battery
    ups_mode INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE (YEAR(timestamp) * 100 + MONTH(timestamp)) (
    PARTITION p202605 VALUES LESS THAN (202606),
    PARTITION p202606 VALUES LESS THAN (202607),
    PARTITION p202607 VALUES LESS THAN (202608),
    PARTITION p202608 VALUES LESS THAN (202609),
    PARTITION p202609 VALUES LESS THAN (202610),
    PARTITION p202610 VALUES LESS THAN (202611),
    PARTITION p202611 VALUES LESS THAN (202612),
    PARTITION p202612 VALUES LESS THAN (202701),
    PARTITION p_max VALUES LESS THAN MAXVALUE
);

-- 10. RECOMENDACIONES AI (V7.0)
-- Tipos: consumo_riesgo_sostenido, oscilacion_frecuente, recuperacion_consumo, fluctuacion_voltaje
-- Patrón espejo de alertas_sistema: una recomendación activa por (device, type), resolución híbrida
CREATE TABLE recomendaciones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_artefacto INT NOT NULL,
    tipo_recomendacion VARCHAR(50) NOT NULL,
    mensaje VARCHAR(500) NOT NULL,
    accion_sugerida VARCHAR(50) DEFAULT NULL,
    severidad VARCHAR(20) NOT NULL DEFAULT 'warning',
    resuelto BOOLEAN NOT NULL DEFAULT FALSE,
    resolucion VARCHAR(20) DEFAULT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resuelto_en TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_recomendaciones_artefacto (id_artefacto),
    INDEX idx_recomendaciones_tipo (tipo_recomendacion),
    INDEX idx_recomendaciones_resuelto (resuelto),
    INDEX idx_recomendaciones_artefacto_tipo_activo (id_artefacto, tipo_recomendacion, resuelto),
    CONSTRAINT fk_recomendaciones_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. HORARIOS DE AUTOMATIZACIÓN DE DISPOSITIVOS (V9.0 + V12.0)
-- Estado de horario persistido para reinicio robusto y consistencia entre workers
CREATE TABLE artefactos_horarios (
    id_artefacto INT PRIMARY KEY,
    dias_operacion JSON NOT NULL,
    hora_encendido TIME DEFAULT NULL,
    hora_apagado TIME DEFAULT NULL,
    automatizacion_activa BOOLEAN DEFAULT FALSE,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_schedule_state TINYINT(1) NULL DEFAULT NULL COMMENT 'NULL = desconocido, 0 = apagado, 1 = encendido',
    last_schedule_state_at DATETIME NULL DEFAULT NULL,
    CONSTRAINT fk_horario_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. HISTORIAL DE NOTIFICACIONES DE USUARIO (V11.0)
-- Notificaciones push/locales enviadas al dispositivo del usuario
CREATE TABLE notificaciones_usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    cuerpo TEXT NOT NULL,
    leido BOOLEAN DEFAULT FALSE,
    eliminado BOOLEAN DEFAULT FALSE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_notif_usuario_lookup (id_usuario, eliminado, timestamp DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. PERFILES UPS DE USUARIO (V15.0 + V17.0)
-- Perfil 1:1 con usuario (inversor + baterías). Métricas live reportadas por el Gateway.
CREATE TABLE ups_sistemas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    nombre VARCHAR(100) DEFAULT 'UPS Principal',
    inversor_w INT NOT NULL DEFAULT 1200,
    baterias_cantidad INT NOT NULL DEFAULT 2,
    bateria_voltaje_v INT NOT NULL DEFAULT 12,
    bateria_capacidad_ah INT NOT NULL DEFAULT 9,
    configuracion_baterias VARCHAR(20) NOT NULL DEFAULT 'series',
    -- modo_actual: 0 = Line, 1 = Battery (reportado por el Gateway vía MQTT)
    modo_actual INT NOT NULL DEFAULT 0,
    -- (V17.0) Métricas live reportadas por el Gateway/UPS
    bateria_porcentaje INT NULL DEFAULT NULL,
    autonomia_minutos INT NULL DEFAULT NULL,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ups_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY (id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- DEPRECATED TABLES (kept for reference; do not add new rows)
-- ==============================================================================

-- DEPRECATED: Use usuarios + permisos_usuario_artefacto instead
-- CREATE TABLE app_api_keys (
--     id INT AUTO_INCREMENT PRIMARY KEY,
--     nombre_app VARCHAR(100) NOT NULL,
--     api_key_hash VARCHAR(255) NOT NULL UNIQUE,
--     fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     activa BOOLEAN NOT NULL DEFAULT TRUE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- DEPRECATED: Use permisos_usuario_artefacto instead
-- CREATE TABLE permisos_app_artefacto (
--     id_api_key INT NOT NULL,
--     id_artefacto INT NOT NULL,
--     nivel_acceso VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
--     fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     PRIMARY KEY (id_api_key, id_artefacto),
--     CONSTRAINT fk_permiso_api FOREIGN KEY (id_api_key) REFERENCES app_api_keys(id) ON DELETE CASCADE,
--     CONSTRAINT fk_permiso_artefacto FOREIGN KEY (id_artefacto) REFERENCES artefactos(id) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- MIGRATION HISTORY
-- ==============================================================================
-- V5.0  → V6.0  (migration_v6.sql)  : ADD telemetria.ai_status
-- V6.0  → V7.0  (migration_v7.sql)  : CREATE TABLE recomendaciones
-- V7.0  → V8.0  (migration_v8.sql)  : ADD usuarios.ai_control_habilitado, auto_apagado_low_priority
--                                     ADD artefactos.auto_kill_at, ai_override_until
-- V8.0  → V9.0  (migration_v9.sql)  : CREATE TABLE artefactos_horarios (con last_schedule_state)
-- V9.0  → V10.0 (migration_v10.sql) : ADD usuarios.expo_push_token
-- V10.0 → V11.0 (migration_v11.sql) : CREATE TABLE notificaciones_usuario
-- V11.0 → V12.0 (migration_v12.sql) : ADD artefactos_horarios.last_schedule_state, last_schedule_state_at
-- V12.0 → V13.0 (migration_v13.sql) : ADD usuarios.notificaciones_criticas, notificaciones_advertencias
-- V13.0 → V14.0 (migration_v14.sql) : ADD artefactos_limites.configurado_por_usuario
-- V14.0 → V15.0 (migration_v15.sql) : CREATE TABLE ups_sistemas + seed por usuario
-- V15.0 → V16.0 (migration_v16.sql) : ADD telemetria.ups_mode
-- V16.0 → V17.0 (migration_v17.sql) : ADD ups_sistemas.bateria_porcentaje, autonomia_minutos