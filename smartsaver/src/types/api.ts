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
}

export interface DispositivoResponse {
  id: number;
  mac: string;
  nombre_personalizado: string | null;
  nivel_prioridad: string;
  limite_consumo_w: number;
  is_online: boolean;
  is_encendido: boolean;
  nivel_acceso: string;
  last_seen_at: string | null;
}

// ─── Request / Command Schemas ───────────────────────────
// MAC is in the URL path, not in request bodies

export interface DispositivoEstadoCommand {
  encendido: boolean;
}

export interface DispositivoLimitesCommand {
  limite_voltaje?: number | null;
  limite_corriente?: number | null;
  limite_potencia?: number | null;
}

/** Legacy types kept for backward compatibility with types that include mac_dispositivo */
export interface DispositivoEstado {
  mac_dispositivo: string;
  encendido: boolean;
}

export interface DispositivoLimites {
  mac_dispositivo: string;
  limite_voltaje?: number | null;
  limite_corriente?: number | null;
  limite_potencia?: number | null;
}

// ─── Error Response ────────────────────────────────────────

export interface ApiErrorResponse {
  error: string;
  message: string;
  mac?: string;
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
