import type { NativeAppOutboundMessage } from '../../../contracts/native-app';

interface HistoryRetryTarget {
  connectionId: string;
  controllerLeaseId: string;
}
interface HistoryRetryDependencies {
  target(): HistoryRetryTarget | null;
  resume(controllerLeaseId: string): Promise<NativeAppOutboundMessage[]>;
  post(message: NativeAppOutboundMessage): void;
  warn(): void;
}
const sameTarget = (left: HistoryRetryTarget, right: HistoryRetryTarget | null) =>
  right !== null &&
  left.connectionId === right.connectionId &&
  left.controllerLeaseId === right.controllerLeaseId;

/** Retries pending requests without overlapping work or crossing a connection boundary. */
export function createNativeHistoryRetry(deps: HistoryRetryDependencies) {
  let epoch = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  function stop() {
    epoch++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function schedule(expectedEpoch: number) {
    if (epoch !== expectedEpoch || !deps.target()) return;
    timer = setTimeout(() => {
      timer = null;
      void tick(expectedEpoch);
    }, 2000);
  }
  async function tick(expectedEpoch: number) {
    const target = deps.target();
    if (epoch !== expectedEpoch || !target) return;
    if (running) {
      schedule(expectedEpoch);
      return;
    }
    running = true;
    try {
      const messages = await deps.resume(target.controllerLeaseId);
      for (const message of messages) {
        if (epoch !== expectedEpoch || !sameTarget(target, deps.target())) return;
        if (
          'controllerLeaseId' in message &&
          message.controllerLeaseId !== target.controllerLeaseId
        )
          continue;
        deps.post(message);
      }
    } catch {
      if (epoch === expectedEpoch && sameTarget(target, deps.target())) deps.warn();
    } finally {
      running = false;
      schedule(expectedEpoch);
    }
  }
  return {
    start() {
      stop();
      schedule(epoch);
    },
    stop,
  };
}
