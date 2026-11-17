import { matchesEffectRuntimeRetryInputs } from '../../contracts/effect-runtime/retry-inputs';
import {
  createEffectRuntimeFailure,
  sameEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeErrorCode,
  EffectRuntimeFrameFailure,
  EffectRuntimeFrameResult,
  EffectRuntimeSceneResult,
  EffectRuntimeStartupFailureCode,
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
import {
  watchEffectRuntimeWorkerStartup,
  type EffectRuntimeWorkerLike,
  type EffectRuntimeWorkerStartup,
} from './worker-startup';

interface WorkerOptions {
  onReset?(): void;
  timeoutMs?: number;
  workerFactory(): EffectRuntimeWorkerLike;
}
interface EffectRuntimeWorkerLease {
  onReset?(): void;
  startup: EffectRuntimeWorkerStartup | null;
  unavailable: boolean;
  startupFailure?: EffectRuntimeStartupFailureCode;
}
interface EffectRuntimeWorkerSession {
  readonly unavailable: boolean;
  takeUnavailableFailure(value: unknown): EffectRuntimeFrameFailure;
  /** Start trusted worker modules without posting a user frame or consuming queue admission. */
  preload(): void;
  execute(request: EffectRuntimeWorkerMessage): Promise<EffectRuntimeFrameResult>;
  execute(
    request: EffectRuntimeWorkerMessage,
    output: 'gpu-scene'
  ): Promise<EffectRuntimeSceneResult>;
}

function startupRefusal(
  value: unknown,
  startupFailureCode?: EffectRuntimeStartupFailureCode
): EffectRuntimeFrameFailure {
  const refusal = createEffectRuntimeFailure(value, 'circuitOpen');
  return startupFailureCode ? { ...refusal, startupFailureCode } : refusal;
}

function takeUnavailableFailure(lease: EffectRuntimeWorkerLease, value: unknown) {
  const startupFailureCode = lease.startupFailure;
  delete lease.startupFailure;
  return startupRefusal(value, startupFailureCode);
}

function ensureWorkerStartup(
  lease: EffectRuntimeWorkerLease,
  options: WorkerOptions,
  retained: boolean
): EffectRuntimeWorkerStartup {
  if (lease.startup) return lease.startup;
  const worker = options.workerFactory();
  const startup = watchEffectRuntimeWorkerStartup(worker, (failure) => {
    worker.terminate();
    lease.startup = null;
    if (retained && (failure === 'crashed' || failure === 'malformed')) {
      lease.unavailable = true;
      lease.startupFailure = failure;
    }
    lease.onReset?.();
  });
  lease.startup = startup;
  return startup;
}

/** One worker owns retained Lottie players and executes one request at a time. */
export function createEffectRuntimeWorkerSession(
  options: WorkerOptions
): EffectRuntimeWorkerSession {
  const lease: EffectRuntimeWorkerLease = {
    ...(options.onReset ? { onReset: options.onReset } : {}),
    startup: null,
    unavailable: false,
  };
  const preload = () => {
    if (lease.startup || lease.unavailable) return;
    try {
      ensureWorkerStartup(lease, options, true);
    } catch {
      lease.unavailable = true;
      lease.startupFailure = 'crashed';
    }
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
    takeUnavailableFailure: (value) => takeUnavailableFailure(lease, value),
    get unavailable() {
      return lease.unavailable;
    },
  };
}

export async function executeEffectRuntimeWorker(
  request: EffectRuntimeWorkerMessage,
  options: WorkerOptions
): Promise<EffectRuntimeFrameResult> {
  return startWorkerOperation(request, options, { startup: null, unavailable: false }, true).result;
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
  let deadline = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let request: EffectRuntimeWorkerMessage = original;
  let transferred = false;
  let worker: EffectRuntimeWorkerLike | null = null;

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
        if (lease.startup?.worker === worker) lease.startup = null;
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
  const start = (readyWorker: EffectRuntimeWorkerLike) => {
    worker = readyWorker;
    worker.onerror = () => fail('crashed');
    worker.onmessageerror = () => fail('malformed');
    worker.onmessage = onMessage;
    deadline = performance.now() + timeoutMs;
    timeout = setTimeout(() => fail('timeout'), timeoutMs);
    send(request);
  };
  try {
    if (lease.unavailable) {
      finish(takeUnavailableFailure(lease, original), true);
      return { result, drained };
    }
    const startup = ensureWorkerStartup(lease, options, !terminateAfterResult);
    if (startup.ready) start(startup.worker);
    else {
      void startup.result.then((result) => {
        if (result === 'ready') start(startup.worker);
        else if (lease.unavailable) finish(takeUnavailableFailure(lease, original));
        else fail(result === 'initializationFailed' ? 'crashed' : result);
      });
    }
  } catch {
    if (!worker && !terminateAfterResult) {
      lease.unavailable = true;
      finish(startupRefusal(original, 'crashed'), true);
    } else fail('crashed');
    if (!worker) lease.onReset?.();
  }
  return { result, drained };
}
