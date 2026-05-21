export type BatteryZone = "Safe" | "Warning" | "Critical";

export interface TelemetryReading {
  voltaje: number;
  corriente: number;
  potencia: number;
  tiempo_operacion_s: number;
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

export type WSMessage = WSTelemetriaMessage | WSConexionMessage;

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
