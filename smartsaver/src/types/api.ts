// ─── Response Schemas ────────────────────────────────────

export interface TelemetriaResponse {
  id: number;
  id_artefacto: number;
  timestamp: string;
  voltaje: number;
  corriente: number;
  potencia: number;
  tiempo_operacion_s: number;
  estado_sin_cambios: boolean;
}

export interface DispositivoEstadoResponse {
  mac_dispositivo: string;
  is_online: boolean;
}

// ─── Request / Command Schemas ───────────────────────────

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

/** M2M ingestion payload sent by the ESP32 — not used by the app directly,
 *  included for contract completeness. */
export interface TelemetriaCreate {
  mac_dispositivo: string;   // exactly 17 chars
  voltaje: number;           // >= 0
  corriente: number;         // >= 0
  potencia: number;          // >= 0
  tiempo_operacion_s: number; // >= 0
}
