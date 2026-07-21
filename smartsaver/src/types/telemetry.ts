

export interface TelemetryReading {
  voltaje: number;
  corriente: number;
  potencia: number;
  tiempo_operacion_s: number;
  ai_status?: number;
  receivedAt?: number;
}

export interface WSTelemetriaMessage {
  type: "telemetria";
  mac: string;
  data: TelemetryReading;
}

export interface WSConexionMessage {
  type: "conexion";
  mac: string;
  data: { is_online?: boolean; estado_reportado?: boolean; is_encendido?: boolean };
}

export interface WSAlertaMessage {
  type: "alerta";
  mac: string;
  data: {
    alerta: string;
    ai_status: number;
    estado_reportado: boolean;
  };
}

export interface WSAutoKillWarningMessage {
  type: "auto_kill_warning";
  mac: string;
  data: {
    auto_kill_at: string;
    grace_period_min: number;
    message: string;
    accion_sugerida: string;
  };
}

export interface WSAutoKillExecutedMessage {
  type: "auto_kill_executed";
  mac: string;
  data: {
    message: string;
    reason?: string;
  };
}

export interface WSAutoKillCancelledMessage {
  type: "auto_kill_cancelled";
  mac: string;
  data: {
    message: string;
  };
}

export interface WSGatewayAlertaMessage {
  type: "gateway_alerta";
  mac?: string;
  data: {
    alerta: string;
  };
}

export interface WSGatewayTelemetriaMessage {
  type: "gateway_telemetria";
  mac?: string;
  data: {
    potencia_total_w: number;
    cantidad_dispositivos_activos?: number;
    autonomia_estimada_min?: number;
    carga_bateria_porcentaje?: number;
  };
}

export type WSMessage = 
  | WSTelemetriaMessage 
  | WSConexionMessage 
  | WSAlertaMessage
  | WSAutoKillWarningMessage
  | WSAutoKillExecutedMessage
  | WSAutoKillCancelledMessage
  | WSGatewayAlertaMessage
  | WSGatewayTelemetriaMessage;

// ponytail: MLPrediction, HardwareState, and IoTGatewayPayload were unused boilerplate types and have been deleted.

