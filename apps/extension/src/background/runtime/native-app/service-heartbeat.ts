import type { NativeAppOutboundMessage } from '../../../contracts/native-app';
import { createNativePingMessage } from './outbound';

const NATIVE_HEARTBEAT_INTERVAL_MS = 15_000;
const NATIVE_HEARTBEAT_TIMEOUT_MS = 45_000;

interface NativeHeartbeatControllerDeps {
  getHandshakeAccepted(): boolean;
  post(message: NativeAppOutboundMessage): void;
  reconnect(): void;
}

export class NativeHeartbeatController {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastPongAt: number | null = null;

  constructor(private readonly deps: NativeHeartbeatControllerDeps) {}

  start(): void {
    this.stop();
    this.lastPongAt = Date.now();
    this.timerId = setInterval(() => this.tick(), NATIVE_HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  notePong(): void {
    this.lastPongAt = Date.now();
  }

  private tick(): void {
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
