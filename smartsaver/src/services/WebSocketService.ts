import { WSMessage } from '../types/telemetry';

type MessageCallback = (data: WSMessage) => void;
type StatusCallback = (isConnected: boolean) => void;
type TokenGetter = () => Promise<string | null>;

const WS_BASE_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.thesisbroker.com/ws/telemetry';

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number = 2000;
  private maxReconnectInterval: number = 30000;
  private shouldReconnect: boolean = true;
  private tokenGetter: TokenGetter | null = null;
  private connectionGeneration: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalMs: number = 30000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt: number = 0;
  private readonly maxSilenceMs: number = 60000;

  private messageListeners: Set<MessageCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();

  constructor(url: string) {
    this.url = url;
  }

  public setTokenGetter(fn: TokenGetter) {
    this.tokenGetter = fn;
  }

  public async connect() {
    const myGeneration: number = ++this.connectionGeneration;

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.shouldReconnect = true;

    let connectUrl = this.url;
    if (this.tokenGetter) {
      const token = await this.tokenGetter();
      if (token) {
        const separator = this.url.includes('?') ? '&' : '?';
        connectUrl = `${this.url}${separator}token=${encodeURIComponent(token)}`;
      }
    }

    if (!this.shouldReconnect) return;
    if (myGeneration !== this.connectionGeneration) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    this.ws = new WebSocket(connectUrl);

    this.ws.onopen = () => {
      this.reconnectInterval = 2000;
      this.lastMessageAt = Date.now();
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN && Date.now() - this.lastMessageAt > this.maxSilenceMs) {
          if (__DEV__) console.warn('[WS] heartbeat missed, forcing reconnect');
          if (this.ws) this.ws.close();
        }
      }, this.heartbeatIntervalMs);
      this.notifyStatusListeners(true);
    };

    this.ws.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      try {
        const data: WSMessage = JSON.parse(event.data);
        const KNOWN_TYPES = ['telemetria', 'conexion', 'alerta', 'auto_kill_warning', 'auto_kill_executed', 'auto_kill_cancelled', 'gateway_alerta', 'gateway_telemetria'];
        if (!data || typeof data.type !== 'string' || !KNOWN_TYPES.includes(data.type)) {
          if (__DEV__) console.warn('[WS] unknown message type:', data?.type);
          return;
        }
        if (typeof data.mac !== 'string' && data.type !== 'gateway_alerta' && data.type !== 'gateway_telemetria') {
          if (__DEV__) console.warn('[WS] missing mac:', data);
          return;
        }
        this.notifyMessageListeners(data);
      } catch {
        if (__DEV__) console.warn('[WS] malformed message:', event.data);
      }
    };

    this.ws.onerror = () => {
      // Error details are logged via onclose — don't log the raw event (leaks token in URL)
      if (__DEV__) console.warn('[WS] connection error occurred');
    };

    this.ws.onclose = (event) => {
      this.notifyStatusListeners(false);
      this.ws = null;
      if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }

      if (event.code === 4001) {
        this.shouldReconnect = false;
        (async () => {
          const { useAuthStore } = require('../store/useAuthStore');
          try {
            const { refreshAccessToken } = require('../services/authService');
            const newTokens = await refreshAccessToken();
            if (newTokens) {
              if (__DEV__) console.info('[WS] 4001 → token refreshed, reconnecting');
              this.shouldReconnect = true;
              this.attemptReconnect();
              return;
            }
          } catch (e) {
            if (__DEV__) console.warn('[WS] 4001 → refresh failed, logging out', e);
          }
          useAuthStore.getState().logout();
        })();
        return;
      }

      this.reconnectInterval = Math.min(this.reconnectInterval * 1.5, this.maxReconnectInterval);

      if (this.shouldReconnect) {
        this.attemptReconnect();
      }
    };
  }

  public disconnect() {
    this.shouldReconnect = false;
    this.connectionGeneration += 1;
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      this.ws.close();
    }
    this.lastMessageAt = 0;
  }

  private attemptReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, this.reconnectInterval);
  }

  public subscribeToMessages(callback: MessageCallback): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  public subscribeToStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  private notifyMessageListeners(data: WSMessage) {
    this.messageListeners.forEach((listener) => listener(data));
  }

  private notifyStatusListeners(isConnected: boolean) {
    this.statusListeners.forEach((listener) => listener(isConnected));
  }
}

export const wsService = new WebSocketService(WS_BASE_URL);
