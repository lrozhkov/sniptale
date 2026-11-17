import { EFFECT_RUNTIME_WORKER_READY } from '../../contracts/effect-runtime/types';
import type { EffectRuntimeWorkerLike } from './worker-startup';

export function workerReadyMessage(initialized = true): MessageEvent<unknown> {
  return new MessageEvent('message', {
    data: { type: EFFECT_RUNTIME_WORKER_READY, initialized },
  });
}

export function finishWorkerStartupOnFirstListener<T extends EffectRuntimeWorkerLike>(
  worker: T
): T {
  type Handler = (event: MessageEvent<unknown>) => void;
  let startup = true;
  let onmessage: Handler | null = null;
  Object.defineProperty(worker, 'onmessage', {
    get: () => onmessage,
    set(listener: Handler | null) {
      onmessage = listener;
      if (!listener || !startup) return;
      startup = false;
      listener(workerReadyMessage());
    },
  });
  return worker;
}
