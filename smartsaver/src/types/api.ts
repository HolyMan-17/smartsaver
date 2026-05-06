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
