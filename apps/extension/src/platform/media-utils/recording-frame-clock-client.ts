import {
  normalizeRecordingFrameClockLease,
  RECORDING_FRAME_CLOCK_LEASE_MS,
  type RecordingFrameClockLease,
} from '../../contracts/video/recording-frame-clock';

interface RecordingFrameClockConnection {
  port: MessagePort;
  close(): void;
}

/** The worker rendezvous receives ports and identity only. Native frames bypass its realm. */
export function openRecordingFrameClockPort(
  lease: RecordingFrameClockLease,
  role: 'source' | 'renderer',
  signal: AbortSignal,
  createWorker = () =>
    new SharedWorker(new URL('../../recording-clock/relay.worker.ts', import.meta.url), {
      type: 'module',
      name: 'sniptale-recording-frame-clock',
    })
): Promise<RecordingFrameClockConnection> {
  return new RecordingClockRendezvous(lease, role, signal, createWorker).open();
}

class RecordingClockRendezvous {
  private worker: SharedWorker | null = null;
  private directPort: MessagePort | null = null;
  private untransferredPort: MessagePort | null = null;
  private settled = false;
  private closed = false;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private resolve!: (connection: RecordingFrameClockConnection) => void;
  private reject!: (reason: unknown) => void;

  constructor(
    private readonly lease: RecordingFrameClockLease,
    private readonly role: 'source' | 'renderer',
    private readonly signal: AbortSignal,
    private readonly createWorker: () => SharedWorker
  ) {}

  open(): Promise<RecordingFrameClockConnection> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      const remaining = this.lease.expiresAtEpochMs - Date.now();
      if (
        this.signal.aborted ||
        !normalizeRecordingFrameClockLease(this.lease) ||
        remaining <= 0 ||
        remaining > RECORDING_FRAME_CLOCK_LEASE_MS
      ) {
        reject(new Error('Exact recording clock is unavailable'));
        return;
      }
      try {
        this.worker = this.createWorker();
      } catch (error) {
        reject(error);
        return;
      }
      this.timeout = setTimeout(this.fail, remaining);
      this.signal.addEventListener('abort', this.fail, { once: true });
      this.worker.onerror = this.fail;
      this.worker.port.onmessageerror = this.fail;
      this.worker.port.onmessage = this.receive;
      this.worker.port.start();
      this.register();
    });
  }

  private close = () => {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timeout);
    this.signal.removeEventListener('abort', this.fail);
    this.worker?.port.close();
    this.directPort?.close();
    this.untransferredPort?.close();
  };

  private fail = () => {
    if (!this.settled) {
      this.settled = true;
      this.reject(new Error('Exact recording clock rendezvous failed'));
    }
    this.close();
  };

  private receive = (event: MessageEvent<unknown>) => {
    if (this.closed || (this.role === 'renderer' && this.settled)) {
      event.ports.forEach((port) => port.close());
      return;
    }
    if (!this.accepts(event)) {
      event.ports.forEach((port) => port.close());
      this.fail();
      return;
    }
    this.directPort = event.ports[0]!;
    this.directPort.start();
    this.settled = true;
    this.resolve({ port: this.directPort, close: this.close });
  };

  private accepts(event: MessageEvent<unknown>): boolean {
    const data = event.data;
    return (
      this.lease.expiresAtEpochMs > Date.now() &&
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      Object.keys(data).every((key) => ['type', 'nonce'].includes(key)) &&
      this.role === 'renderer' &&
      data.type === 'direct-port' &&
      'nonce' in data &&
      data.nonce === this.lease.nonce &&
      event.ports.length === 1
    );
  }

  private register(): void {
    const worker = this.worker!;
    if (this.role === 'source') {
      const channel = new MessageChannel();
      this.directPort = channel.port1;
      this.untransferredPort = channel.port2;
      this.directPort.start();
      try {
        worker.port.postMessage({ type: 'register', role: this.role, lease: this.lease }, [
          channel.port2,
        ]);
      } catch {
        this.fail();
        return;
      }
      this.untransferredPort = null;
      this.settled = true;
      this.resolve({ port: this.directPort, close: this.close });
    } else {
      try {
        worker.port.postMessage({ type: 'register', role: this.role, lease: this.lease });
      } catch {
        this.fail();
      }
    }
  }
}
