import { IoTGatewayPayload } from '../types/telemetry';

type MessageCallback = (data: IoTGatewayPayload) => void;
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

  private messageListeners: Set<MessageCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();

  constructor(url: string) {
    this.url = url;
  }

  public setTokenGetter(fn: TokenGetter) {
    this.tokenGetter = fn;
  }

  public async connect() {
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

    this.ws = new WebSocket(connectUrl);

    this.ws.onopen = () => {
      this.reconnectInterval = 2000;
      this.notifyStatusListeners(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data: IoTGatewayPayload = JSON.parse(event.data);
        this.notifyMessageListeners(data);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      // Error details are logged via onclose
    };

    this.ws.onclose = (event) => {
      this.notifyStatusListeners(false);
      this.ws = null;

      // Auth failure — don't reconnect, force re-login
      if (event.code === 4001) {
        this.shouldReconnect = false;
        return;
      }

      if (this.shouldReconnect) {
        this.attemptReconnect();
      }
    };
  }

  public disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
    }
  }

  private attemptReconnect() {
    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
        this.reconnectInterval = Math.min(this.reconnectInterval * 1.5, this.maxReconnectInterval);
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

  private notifyMessageListeners(data: IoTGatewayPayload) {
    this.messageListeners.forEach((listener) => listener(data));
  }

  private notifyStatusListeners(isConnected: boolean) {
    this.statusListeners.forEach((listener) => listener(isConnected));
  }
}

export const wsService = new WebSocketService(WS_BASE_URL);