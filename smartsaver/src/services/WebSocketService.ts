import { IoTGatewayPayload } from '../types/telemetry';

type MessageCallback = (data: IoTGatewayPayload) => void;
type StatusCallback = (isConnected: boolean) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number = 2000;
  private maxReconnectInterval: number = 30000;
  private shouldReconnect: boolean = true;
  
  private messageListeners: Set<MessageCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();

  constructor(url: string) {
    this.url = url;
  }

  public connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
        return;
    }

    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log(`[WebSocket] Connected to ${this.url}`);
      this.reconnectInterval = 2000;
      this.notifyStatusListeners(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data: IoTGatewayPayload = JSON.parse(event.data);
        this.notifyMessageListeners(data);
      } catch (error) {
        console.error('[WebSocket] JSON Parse Error:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WebSocket] Error occurred:', error);
    };

    this.ws.onclose = (event) => {
      console.log(`[WebSocket] Disconnected (Code: ${event.code})`);
      this.notifyStatusListeners(false);
      this.ws = null;

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
    console.log(`[WebSocket] Attempting to reconnect in ${this.reconnectInterval}ms...`);
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

// Ensure the backend isn't real yet, just mock the URL or leave it. The user said don't connect to real backend yet.
// For now, use a dummy local URL.
export const wsService = new WebSocketService('ws://localhost:8000/ws/telemetry');
