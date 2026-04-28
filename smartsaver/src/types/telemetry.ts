export type BatteryZone = "Safe" | "Warning" | "Critical";

export interface TelemetryData {
  voltage: number;
  current: number;
  watts: number;
}

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
  telemetry: TelemetryData;
  ml_prediction: MLPrediction;
  hardware_state: HardwareState;
}
