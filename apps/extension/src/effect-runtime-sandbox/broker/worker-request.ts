import { matchesEffectRuntimeRetryInputs } from '../../contracts/effect-runtime/retry-inputs';
import {
  createEffectRuntimeFailure,
  sameEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeErrorCode,
  EffectRuntimeFrameResult,
  EffectRuntimeSceneResult,
  EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime/runtime/resource-limits';
import {
  closeEffectRuntimeWorkerRequestBitmaps,
  closeEffectRuntimeWorkerResponse,
  collectEffectRuntimeWorkerTransferables,
  hasExpectedEffectRuntimeAcknowledgement,
  parseEffectRuntimeWorkerResponse,
} from './worker-message-boundary';

export type EffectRuntimeWorkerLike = Pick<
  Worker,
  'onerror' | 'onmessage' | 'onmessageerror' | 'postMessage' | 'terminate'
>;

interface WorkerOptions {
  onReset?(): void;
  timeoutMs?: number;
  workerFactory(): EffectRuntimeWorkerLike;
}
interface EffectRuntimeWorkerLease {
  onReset?(): void;
  worker: EffectRuntimeWorkerLike | null;
  started: boolean;
  unavailable: boolean;
}
interface EffectRuntimeWorkerSession {
  readonly unavailable: boolean;
  /** Start trusted worker modules without posting a user frame or consuming queue admission. */
  preload(): void;
  execute(request: EffectRuntimeWorkerMessage): Promise<EffectRuntimeFrameResult>;
  execute(
    request: EffectRuntimeWorkerMessage,
    output: 'gpu-scene'
  ): Promise<EffectRuntimeSceneResult>;
}

/** One worker owns retained Lottie players and executes one request at a time. */
export function createEffectRuntimeWorkerSession(
  options: WorkerOptions
): EffectRuntimeWorkerSession {
  const lease: EffectRuntimeWorkerLease = {
    ...(options.onReset ? { onReset: options.onReset } : {}),
    worker: null,
    started: false,
    unavailable: false,
  };
  const preload = () => {
    if (lease.worker || lease.unavailable) return;
    let worker: EffectRuntimeWorkerLike;
    try {
      worker = options.workerFactory();
    } catch {
      lease.unavailable = true;
      return;
    }
    lease.worker = worker;
    const retire = () => {
      if (lease.worker !== worker) return;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      lease.worker = null;
      lease.unavailable = true;
      lease.onReset?.();
    };
    worker.onerror = retire;
    worker.onmessageerror = retire;
  };
  let queue = Promise.resolve();
  function execute(request: EffectRuntimeWorkerMessage): Promise<EffectRuntimeFrameResult>;
  function execute(
    request: EffectRuntimeWorkerMessage,
    output: 'gpu-scene'
  ): Promise<EffectRuntimeSceneResult>;
  function execute(
    request: EffectRuntimeWorkerMessage,
    output: 'bitmap' | 'gpu-scene' = 'bitmap'
  ): Promise<EffectRuntimeSceneResult> {
    const operation = queue.then(() =>
      startWorkerOperation(request, options, lease, false, output)
    );
    queue = operation
      .then(({ drained }) => drained)
      .then(
        () => undefined,
        () => undefined
      );
    return operation.then(({ result }) => result);
  }
  return {
    execute,
    preload,
    get unavailable() {
      return lease.unavailable;
    },
  };
}

export async function executeEffectRuntimeWorker(
  request: EffectRuntimeWorkerMessage,
  options: WorkerOptions
): Promise<EffectRuntimeFrameResult> {
  return startWorkerOperation(
    request,
    options,
    { worker: null, started: false, unavailable: false },
    true
  ).result;
}

/** One authority owns publication, transfer, identity, deadline and worker retirement. */
function startWorkerOperation(
  original: EffectRuntimeWorkerMessage,
  options: WorkerOptions,
  lease: EffectRuntimeWorkerLease,
  terminateAfterResult: boolean
): { result: Promise<EffectRuntimeFrameResult>; drained: Promise<void> };
function startWorkerOperation(
  original: EffectRuntimeWorkerMessage,
  options: WorkerOptions,
  lease: EffectRuntimeWorkerLease,
  terminateAfterResult: boolean,
  output: 'bitmap' | 'gpu-scene'
): { result: Promise<EffectRuntimeSceneResult>; drained: Promise<void> };
function startWorkerOperation(
  original: EffectRuntimeWorkerMessage,
  options: WorkerOptions,
  lease: EffectRuntimeWorkerLease,
  terminateAfterResult: boolean,
  _output: 'bitmap' | 'gpu-scene' = 'bitmap'
) {
  let publish!: (result: EffectRuntimeSceneResult) => void;
  let releaseDrain!: () => void;
  const result = new Promise<EffectRuntimeSceneResult>((resolve) => {
    publish = resolve;
  });
  const drained = new Promise<void>((resolve) => {
    releaseDrain = resolve;
  });
  const timeoutMs = Math.min(
    EFFECT_RUNTIME_RESOURCE_LIMITS.renderTimeoutMs,
    Math.max(1, options.timeoutMs ?? EFFECT_RUNTIME_RESOURCE_LIMITS.renderTimeoutMs)
  );
  const deadline = performance.now() + timeoutMs;
  let settled = false;
  let request: EffectRuntimeWorkerMessage = original;
  let transferred = false;
  let worker: EffectRuntimeWorkerLike | null = null;
  const timeout = setTimeout(() => fail('timeout'), timeoutMs);

  const checkDrain = () => {
    if (settled) releaseDrain();
  };
  const finish = (value: EffectRuntimeSceneResult, terminate = terminateAfterResult) => {
    if (settled) {
      closeEffectRuntimeWorkerResponse(value);
      return;
    }
    settled = true;
    clearTimeout(timeout);
    if (!transferred) closeEffectRuntimeWorkerRequestBitmaps(original);
    if (worker) {
      worker.onmessage = null;
      worker.onmessageerror = null;
      worker.onerror = null;
      if (terminate) {
        worker.terminate();
        if (lease.worker === worker) lease.worker = null;
        lease.onReset?.();
      }
    }
    publish(value);
    checkDrain();
  };
  function fail(code: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>) {
    finish(createEffectRuntimeFailure(original, code), true);
  }
  const send = (value: EffectRuntimeWorkerMessage) => {
    if (settled || !worker) return false;
    request = value;
    try {
      transferred = true;
      worker.postMessage(value, collectEffectRuntimeWorkerTransferables(value));
      return true;
    } catch {
      closeEffectRuntimeWorkerRequestBitmaps(value);
      // A failed post leaves its input ownership here; prevent finish from closing it twice.
      transferred = true;
      fail('crashed');
      return false;
    }
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    if (settled) {
      closeEffectRuntimeWorkerResponse(event.data);
      return;
    }
    // A reply proves worker startup, independently of per-frame payload admission.
    lease.started = true;
    if (performance.now() >= deadline) {
      closeEffectRuntimeWorkerResponse(event.data);
      fail('timeout');
      return;
    }
    if (event.ports.length !== 0) {
      for (const port of event.ports) port.close();
      closeEffectRuntimeWorkerResponse(event.data);
      fail('malformed');
      return;
    }
    const response = parseEffectRuntimeWorkerResponse(event.data, request);
    if (!response) {
      closeEffectRuntimeWorkerResponse(event.data);
      fail('malformed');
      return;
    }
    if (!sameEffectRuntimeIdentity(request, response)) {
      closeEffectRuntimeWorkerResponse(response);
      fail('stale');
      return;
    }
    if (
      !hasExpectedEffectRuntimeAcknowledgement(request, response) ||
      (response.kind === 'frame' &&
        (response.width !== request.renderWidth || response.height !== request.renderHeight)) ||
      !matchesEffectRuntimeRetryInputs(request.inputFrames, response)
    ) {
      closeEffectRuntimeWorkerResponse(response);
      fail('outputRejected');
      return;
    }
    finish(response);
  };
  const start = () => {
    if (settled || !worker) return;
    send(request);
  };
  try {
    if (lease.unavailable) {
      fail('circuitOpen');
      return { result, drained };
    }
    if (!lease.worker) lease.started = false;
    worker = lease.worker ?? options.workerFactory();
    lease.worker = worker;
    const failWorker = (code: 'crashed' | 'malformed') => {
      if (!terminateAfterResult && !lease.started) {
        lease.unavailable = true;
        fail('circuitOpen');
      } else fail(code);
    };
    worker.onerror = () => failWorker('crashed');
    worker.onmessageerror = () => failWorker('malformed');
    worker.onmessage = onMessage;
    start();
  } catch {
    if (!worker && !terminateAfterResult) lease.unavailable = true;
    fail(lease.unavailable ? 'circuitOpen' : 'crashed');
    if (!worker) lease.onReset?.();
  }
  return { result, drained };
}
