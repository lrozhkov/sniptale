import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { hasExactKeys, isRecord } from '../../contracts/effect-runtime/identity';
import {
  EFFECT_RUNTIME_WORKER_READY,
  type EffectRuntimeStartupFailureCode,
} from '../../contracts/effect-runtime/types';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime/runtime/resource-limits';

export type EffectRuntimeWorkerLike = Pick<
  Worker,
  'onerror' | 'onmessage' | 'onmessageerror' | 'postMessage' | 'terminate'
>;

type StartupFailure = EffectRuntimeStartupFailureCode | 'initializationFailed' | 'timeout';
type StartupResult = 'ready' | StartupFailure;

export interface EffectRuntimeWorkerStartup {
  worker: EffectRuntimeWorkerLike;
  ready: boolean;
  result: Promise<StartupResult>;
}

/** A fresh worker must finish guarded initialization before it can receive frame inputs. */
export function watchEffectRuntimeWorkerStartup(
  worker: EffectRuntimeWorkerLike,
  onFailure: (failure: StartupFailure) => void
): EffectRuntimeWorkerStartup {
  let complete!: (result: StartupResult) => void;
  const startup: EffectRuntimeWorkerStartup = {
    worker,
    ready: false,
    result: new Promise((resolve) => {
      complete = resolve;
    }),
  };
  const timeoutMs = EFFECT_RUNTIME_RESOURCE_LIMITS.workerStartupTimeoutMs;
  const deadline = performance.now() + timeoutMs;
  const timer = setTimeout(() => finish('timeout'), timeoutMs);
  let settled = false;
  function finish(result: StartupResult): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    startup.ready = result === 'ready';
    if (result !== 'ready') onFailure(result);
    complete(result);
  }
  worker.onerror = () => finish('crashed');
  worker.onmessageerror = () => finish('malformed');
  worker.onmessage = (event) => {
    const data: unknown = event.data;
    const valid =
      event.ports.length === 0 &&
      isRecord(data) &&
      hasExactKeys(data, ['type', 'initialized']) &&
      data['type'] === EFFECT_RUNTIME_WORKER_READY &&
      typeof data['initialized'] === 'boolean';
    if (!valid) {
      for (const port of event.ports) port.close();
      closeEffectRuntimeBitmaps(data);
      finish('malformed');
      return;
    }
    if (performance.now() >= deadline) finish('timeout');
    else finish(data['initialized'] ? 'ready' : 'initializationFailed');
  };
  return startup;
}
