import {
  normalizeRecordingFrameClockLease,
  RECORDING_FRAME_CLOCK_LEASE_MS,
  type RecordingFrameClockLease,
} from '../contracts/video/recording-frame-clock';

interface Rendezvous {
  lease: RecordingFrameClockLease;
  source: MessagePort | null;
  renderer: MessagePort | null;
  direct: MessagePort | null;
  timeout: ReturnType<typeof setTimeout>;
}

/** Bounded one-use capability rendezvous. Captured pixels never cross this worker. */
export function createRecordingFrameClockRelay(now = Date.now) {
  const pending = new Map<string, Rendezvous>();
  const consumed = new Map<string, number>();
  const closed = new WeakSet<MessagePort>();
  const close = (port: MessagePort | null) => {
    if (port && !closed.has(port)) {
      closed.add(port);
      port.close();
    }
  };
  const unavailable = (port: MessagePort) => {
    try {
      port.postMessage({ type: 'unavailable' });
    } catch {
      /* Closed remote. */
    }
    close(port);
  };
  const dispose = (item: Rendezvous) => {
    clearTimeout(item.timeout);
    close(item.direct);
    close(item.source);
    close(item.renderer);
    pending.delete(item.lease.nonce);
  };
  return (port: MessagePort) => {
    let registered = false;
    let owned: Rendezvous | null = null;
    port.onmessageerror = () => {
      if (owned) dispose(owned);
      else unavailable(port);
    };
    port.onmessage = (event: MessageEvent<unknown>) => {
      const releaseIncoming = () => event.ports.forEach(close);
      const data = event.data;
      const epoch = now();
      for (const [key, expires] of consumed) if (expires <= epoch) consumed.delete(key);
      if (
        registered ||
        typeof data !== 'object' ||
        data === null ||
        !('type' in data) ||
        data.type !== 'register' ||
        !('role' in data) ||
        (data.role !== 'source' && data.role !== 'renderer') ||
        !('lease' in data) ||
        Object.keys(data).some((key) => !['type', 'role', 'lease'].includes(key))
      ) {
        releaseIncoming();
        unavailable(port);
        return;
      }
      const lease = normalizeRecordingFrameClockLease(data.lease);
      if (
        !lease ||
        lease.expiresAtEpochMs <= epoch ||
        lease.expiresAtEpochMs - epoch > RECORDING_FRAME_CLOCK_LEASE_MS ||
        consumed.has(lease.nonce) ||
        event.ports.length !== (data.role === 'source' ? 1 : 0)
      ) {
        releaseIncoming();
        unavailable(port);
        return;
      }
      let item = pending.get(lease.nonce);
      if (!item) {
        if (pending.size >= 4 || consumed.size >= 32) {
          releaseIncoming();
          unavailable(port);
          return;
        }
        item = {
          lease,
          source: null,
          renderer: null,
          direct: null,
          timeout: setTimeout(() => {
            if (item) dispose(item);
          }, lease.expiresAtEpochMs - epoch),
        };
        pending.set(lease.nonce, item);
      }
      if (JSON.stringify(item.lease) !== JSON.stringify(lease) || item[data.role]) {
        releaseIncoming();
        unavailable(port);
        return;
      }
      registered = true;
      owned = item;
      item[data.role] = port;
      if (data.role === 'source') item.direct = event.ports[0]!;
      if (!item.source || !item.renderer || !item.direct) return;
      consumed.set(lease.nonce, lease.expiresAtEpochMs);
      const direct = item.direct;
      item.direct = null;
      try {
        item.renderer.postMessage({ type: 'direct-port', nonce: lease.nonce }, [direct]);
      } catch {
        close(direct);
      }
      dispose(item);
    };
    port.start();
  };
}

const relay = createRecordingFrameClockRelay();
const workerScope = globalThis as typeof globalThis & {
  onconnect: ((event: MessageEvent) => void) | null;
};
workerScope.onconnect = (event) => {
  const port = event.ports[0];
  if (port) relay(port);
};
