import type { NativeAppOutboundMessage } from '../../../contracts/native-app';
import { createNativePingMessage } from './outbound';

const NATIVE_HEARTBEAT_INTERVAL_MS = 15_000;
const NATIVE_HEARTBEAT_TIMEOUT_MS = 45_000;
const NATIVE_HANDSHAKE_TIMEOUT_MS = 45_000;

interface NativeHeartbeatControllerDeps {
  getHandshakeAccepted(): boolean;
  post(message: NativeAppOutboundMessage): void;
  reconnect(): void;
  handshakeTimedOut(): void;
}

export class NativeHeartbeatController {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastPongAt: number | null = null;
  private startedAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempts = 0;

  constructor(private readonly deps: NativeHeartbeatControllerDeps) {}

  start(): void {
    this.stop();
    this.lastPongAt = Date.now();
    this.startedAt = Date.now();
    this.timerId = setInterval(() => this.tick(), NATIVE_HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  resetRetries(): void {
    this.retryAttempts = 0;
  }

  scheduleReconnect(): boolean {
    const delay = [1000, 2000, 5000, 10_000, 30_000][this.retryAttempts];
    if (delay === undefined) return false;
    this.retryAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.deps.reconnect();
    }, delay);
    return true;
  }

  notePong(): void {
    this.lastPongAt = Date.now();
  }

  private tick(): void {
    if (
      !this.deps.getHandshakeAccepted() &&
      Date.now() - this.startedAt >= NATIVE_HANDSHAKE_TIMEOUT_MS
    ) {
      this.stop();
      this.deps.handshakeTimedOut();
      return;
    }
    if (this.isStale()) {
      this.deps.reconnect();
      return;
    }
    this.deps.post(createNativePingMessage());
  }

  private isStale(): boolean {
    return (
      this.deps.getHandshakeAccepted() &&
      this.lastPongAt !== null &&
      Date.now() - this.lastPongAt > NATIVE_HEARTBEAT_TIMEOUT_MS
    );
  }
}
