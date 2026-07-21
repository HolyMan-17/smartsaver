export const STALE_TELEMETRY_MS = 30000;

export const isTelemetryFresh = (receivedAt?: number): boolean =>
  !!receivedAt && Date.now() - receivedAt < STALE_TELEMETRY_MS;
