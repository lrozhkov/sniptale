import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  createEffectRuntimeFailure,
  sameEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import {
  type EffectRuntimeErrorCode,
  type EffectRuntimeFrameResult,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime';
import {
  closeEffectRuntimeWorkerRequestBitmaps,
  collectEffectRuntimeWorkerTransferables,
  hasExpectedEffectRuntimeAcknowledgement,
  parseEffectRuntimeWorkerResponse,
} from './worker-message-boundary';

export type EffectRuntimeWorkerLike = Pick<
  Worker,
  'onerror' | 'onmessage' | 'onmessageerror' | 'postMessage' | 'terminate'
>;

interface WorkerResponseState {
  settled: boolean;
  timeout: ReturnType<typeof setTimeout>;
}

interface EffectRuntimeWorkerLease {
  onReset?(): void;
  worker: EffectRuntimeWorkerLike | null;
}

interface EffectRuntimeWorkerSession {
  execute(request: EffectRuntimeWorkerMessage): Promise<EffectRuntimeFrameResult>;
}

export function createEffectRuntimeWorkerSession(options: {
  onReset?(): void;
  timeoutMs?: number;
  workerFactory(): EffectRuntimeWorkerLike;
}): EffectRuntimeWorkerSession {
  const lease: EffectRuntimeWorkerLease = {
    ...(options.onReset ? { onReset: options.onReset } : {}),
    worker: null,
  };
  let queue = Promise.resolve();
  return {
    execute(request) {
      const operation = queue.then(() =>
        executeEffectRuntimeWorkerWithLease(request, {
          ...options,
          lease,
          terminateAfterResult: false,
        })
      );
      queue = operation.then(
        () => undefined,
        () => undefined
      );
      return operation;
    },
  };
}

export async function executeEffectRuntimeWorker(
  request: EffectRuntimeWorkerMessage,
  options: {
    timeoutMs?: number;
    workerFactory(): EffectRuntimeWorkerLike;
  }
): Promise<EffectRuntimeFrameResult> {
  return executeEffectRuntimeWorkerWithLease(request, {
    ...options,
    lease: { worker: null },
    terminateAfterResult: true,
  });
}

async function executeEffectRuntimeWorkerWithLease(
  request: EffectRuntimeWorkerMessage,
  options: {
    lease: EffectRuntimeWorkerLease;
    terminateAfterResult: boolean;
    timeoutMs?: number;
    workerFactory(): EffectRuntimeWorkerLike;
  }
): Promise<EffectRuntimeFrameResult> {
  let worker: EffectRuntimeWorkerLike;
  try {
    worker = options.lease.worker ?? options.workerFactory();
    options.lease.worker = worker;
  } catch {
    closeEffectRuntimeWorkerRequestBitmaps(request);
    options.lease.onReset?.();
    return createEffectRuntimeFailure(request, 'crashed');
  }
  const timeoutMs = Math.min(
    EFFECT_RUNTIME_RESOURCE_LIMITS.renderTimeoutMs,
    Math.max(1, options.timeoutMs ?? EFFECT_RUNTIME_RESOURCE_LIMITS.renderTimeoutMs)
  );
  return new Promise((resolve) =>
    attachWorkerResponseHandlers(request, worker, timeoutMs, resolve, options)
  );
}

function attachWorkerResponseHandlers(
  request: EffectRuntimeWorkerMessage,
  worker: EffectRuntimeWorkerLike,
  timeoutMs: number,
  resolve: (result: EffectRuntimeFrameResult) => void,
  options: { lease: EffectRuntimeWorkerLease; terminateAfterResult: boolean }
): void {
  const state: WorkerResponseState = {
    settled: false,
    timeout: setTimeout(
      () => failWorker(request, worker, state, resolve, options.lease, 'timeout'),
      timeoutMs
    ),
  };
  worker.onerror = () => failWorker(request, worker, state, resolve, options.lease, 'crashed');
  worker.onmessageerror = () =>
    failWorker(request, worker, state, resolve, options.lease, 'malformed');
  worker.onmessage = (event) =>
    handleWorkerMessage(request, worker, state, resolve, event, options);
  try {
    worker.postMessage(request, collectEffectRuntimeWorkerTransferables(request));
  } catch {
    closeEffectRuntimeWorkerRequestBitmaps(request);
    failWorker(request, worker, state, resolve, options.lease, 'crashed');
  }
}

function handleWorkerMessage(
  request: EffectRuntimeWorkerMessage,
  worker: EffectRuntimeWorkerLike,
  state: WorkerResponseState,
  resolve: (result: EffectRuntimeFrameResult) => void,
  event: MessageEvent<unknown>,
  options: { lease: EffectRuntimeWorkerLease; terminateAfterResult: boolean }
): void {
  if (event.ports.length !== 0) {
    for (const port of event.ports) port.close();
    closeEffectRuntimeBitmaps(event.data);
    failWorker(request, worker, state, resolve, options.lease, 'malformed');
    return;
  }
  const result = parseEffectRuntimeWorkerResponse(event.data);
  if (!result) {
    closeEffectRuntimeBitmaps(event.data);
    failWorker(request, worker, state, resolve, options.lease, 'malformed');
  } else if (!sameEffectRuntimeIdentity(request, result)) {
    if (result.kind === 'frame') result.bitmap.close();
    finishWorker(
      worker,
      state,
      resolve,
      createEffectRuntimeFailure(request, 'stale'),
      options.lease,
      true
    );
  } else if (
    isFrameSizeInvalid(request, result) ||
    !hasExpectedEffectRuntimeAcknowledgement(request, result)
  ) {
    if (result.kind === 'frame') result.bitmap.close();
    finishWorker(
      worker,
      state,
      resolve,
      createEffectRuntimeFailure(request, 'outputRejected'),
      options.lease,
      true
    );
  } else {
    finishWorker(worker, state, resolve, result, options.lease, options.terminateAfterResult);
  }
}

function finishWorker(
  worker: EffectRuntimeWorkerLike,
  state: WorkerResponseState,
  resolve: (result: EffectRuntimeFrameResult) => void,
  result: EffectRuntimeFrameResult,
  lease: EffectRuntimeWorkerLease,
  terminate: boolean
): void {
  if (state.settled) {
    if (result.kind === 'frame') result.bitmap.close();
    return;
  }
  state.settled = true;
  clearTimeout(state.timeout);
  worker.onmessage = null;
  worker.onmessageerror = null;
  worker.onerror = null;
  if (terminate) {
    worker.terminate();
    if (lease.worker === worker) lease.worker = null;
    lease.onReset?.();
  }
  resolve(result);
}

function failWorker(
  request: EffectRuntimeWorkerMessage,
  worker: EffectRuntimeWorkerLike,
  state: WorkerResponseState,
  resolve: (result: EffectRuntimeFrameResult) => void,
  lease: EffectRuntimeWorkerLease,
  code: Extract<EffectRuntimeErrorCode, 'crashed' | 'malformed' | 'timeout'>
): void {
  finishWorker(worker, state, resolve, createEffectRuntimeFailure(request, code), lease, true);
}

function isFrameSizeInvalid(
  request: EffectRuntimeWorkerMessage,
  result: EffectRuntimeFrameResult
): boolean {
  return (
    result.kind === 'frame' &&
    (result.width !== request.renderWidth || result.height !== request.renderHeight)
  );
}
