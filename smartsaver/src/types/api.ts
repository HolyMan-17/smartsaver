// ─── Response Schemas ────────────────────────────────────

export interface UpsSistema {
  id: number;
  nombre: string;
  inversor_w: number;
  baterias_cantidad: number;
  bateria_voltaje_v: number;
  bateria_capacidad_ah: number;
  configuracion_baterias: 'series' | 'parallel';
  modo_actual: number; // 0 = Line Mode (Grid), 1 = Battery Mode (UPS)
  actualizado_en: string; // ISO 8601
}

export interface SystemPower {
  potencia_total_w: number;
  cantidad_dispositivos_activos: number;
  autonomia_estimada_min?: number; // CÁLCULO PROVISTO POR BACKEND
  carga_bateria_porcentaje?: number; // CÁLCULO PROVISTO POR BACKEND
}

export interface TelemetriaResponse {
  id: number;
  mac_dispositivo: string;
  timestamp: string;
  voltaje: number;
  corriente: number;
  potencia: number;
  tiempo_operacion_s: number;
  estado_sin_cambios: boolean;
  ai_status?: number;
}

export interface DispositivoResponse {
  id: number;
  mac: string;
  nombre_personalizado: string | null;
  nivel_prioridad: 'P1' | 'P2' | 'P3';
  limite_consumo_w: number;
  limite_voltaje: number | null;
  limite_corriente: number | null;
  limite_potencia: number | null;
  estado_deseado: boolean;
  estado_reportado: boolean;
  is_online: boolean;
  nivel_acceso: string;
  last_seen_at: string | null;
  auto_kill_at: string | null;
  ai_override_until: string | null;
  automatizacion_activa?: boolean;
  automation_lock_active?: boolean;
}

export interface HorarioBase {
  /** ISO 8601 day numbers: 1=Mon, 2=Tue, ..., 6=Sat, 7=Sun. */
  dias_operacion: number[];
  hora_encendido: string | null; // Format "HH:mm:ss"
  hora_apagado: string | null;   // Format "HH:mm:ss"
  automatizacion_activa: boolean;
}
export type HorarioUpdate = HorarioBase;

export interface HorarioResponse extends HorarioBase {
  id_artefacto: number;
  actualizado_en: string;
}

export interface UserSettingsResponse {
  ai_control_habilitado: boolean;
  auto_apagado_low_priority: boolean;
  expo_push_token?: string | null;
  notificaciones_criticas?: boolean;
  notificaciones_advertencias?: boolean;
}

export interface UserSettingsUpdate {
  ai_control_habilitado?: boolean;
  auto_apagado_low_priority?: boolean;
  expo_push_token?: string | null;
  notificaciones_criticas?: boolean;
  notificaciones_advertencias?: boolean;
}

export interface AIOverrideResponse {
  status: string;
  mac: string;
  ai_override_until: string | null;
}

export interface AgregadosResponse {
  bucket: string;
  potencia_promedio_w: number;
  potencia_maxima_w: number;
  energia_wh: number;
}

export interface AlertaResponse {
  id: number;
  id_artefacto: number;
  tipo_alerta: 'bms_critica' | 'over_voltage' | 'over_current' | 'over_power' | 'voltage_sag' | 'voltage_spike' | string;
  mensaje: string;
  severidad: 'info' | 'warning' | 'critical' | string;
  leido: boolean;
  resuelto: boolean;
  timestamp: string;
}

export interface EventoResponse {
  id: number;
  id_artefacto: number;
  id_usuario: number;
  /** Backend-defined action enum — see api_spec.md */
  accion: 'command_on' | 'command_off' | 'bms_shutdown' | 'limit_exceeded' | 'schedule_trigger' | string;
  razon_disparo: string;
  timestamp: string;
}

export interface RecomendacionResponse {
  id: number;
  id_artefacto: number;
  tipo_recomendacion: string;
  mensaje: string;
  accion_sugerida: string | null;
  severidad: string;
  resuelto: boolean;
  resolucion: string | null;
  timestamp: string;
  resuelto_en: string | null;
}


// ─── Request / Command Schemas ───────────────────────────
// MAC is in the URL path, not in request bodies

export interface DispositivoLimitesCommand {
  limite_consumo_w?: number;
  limite_voltaje?: number | null;
  limite_corriente?: number | null;
  limite_potencia?: number | null;
}

export interface ComandoEstado {
  encendido: boolean;
  override_automation?: boolean;
}

export interface DispositivoUpdateCommand {
  nombre_personalizado?: string | null;
  nivel_prioridad?: 'P1' | 'P2' | 'P3';
  limite_consumo_w?: number;
  limite_voltaje?: number | null;
  limite_corriente?: number | null;
  limite_potencia?: number | null;
}

export interface DispositivoDeleteResponse {
  status: string;
  mac: string;
}

// ─── Error Response ────────────────────────────────────────

export interface ApiErrorResponse {
  error: string;
  message: string;
  mac?: string;
  field?: string;
}

/** M2M ingestion payload sent by the ESP32 — not used by the app directly,
 *  included for contract completeness. */
export interface TelemetriaCreate {
  mac_dispositivo: string;   // exactly 17 chars
  voltaje: number;           // >= 0
  corriente: number;         // >= 0
  potencia: number;          // >= 0
  tiempo_operacion_s: number; // >= 0
}

export interface NotificacionUsuarioResponse {
  id: number;
  titulo: string;
  cuerpo: string;
  leido: boolean;
  eliminado: boolean;
  timestamp: string;
}

