export type BatteryZone = "Safe" | "Warning" | "Critical";

export interface TelemetryReading {
  voltaje: number;
  corriente: number;
  potencia: number;
  tiempo_operacion_s: number;
  ai_status?: number;
}

export interface WSTelemetriaMessage {
  type: "telemetria";
  mac: string;
  data: TelemetryReading;
}

export interface WSConexionMessage {
  type: "conexion";
  mac: string;
  data: { is_online: boolean };
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

export type WSMessage = 
  | WSTelemetriaMessage 
  | WSConexionMessage 
  | WSAlertaMessage
  | WSAutoKillWarningMessage
  | WSAutoKillExecutedMessage
  | WSAutoKillCancelledMessage;

export interface MLPrediction {
  current_zone: BatteryZone;
  confidence_percent: number;
}

export interface HardwareState {
  relay_active: boolean;
}

export interface IoTGatewayPayload {
  device_id: string;
  timestamp: number;
  telemetry: {
    voltage: number;
    current: number;
    watts: number;
  };
  ml_prediction: MLPrediction;
  hardware_state: HardwareState;
}
