// ─── Response Schemas ────────────────────────────────────

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
  nivel_prioridad: string;
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
  expo_push_token?: string;
}

export interface UserSettingsUpdate {
  ai_control_habilitado?: boolean;
  auto_apagado_low_priority?: boolean;
  expo_push_token?: string;
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
  tipo_alerta: string;
  mensaje: string;
  severidad: string;
  leido: boolean;
  resuelto: boolean;
  timestamp: string;
}

export interface EventoResponse {
  id: number;
  id_artefacto: number;
  id_usuario: number;
  accion: string;
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

export interface DispositivoEstadoCommand {
  encendido: boolean;
}

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
  nivel_prioridad?: string;
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

