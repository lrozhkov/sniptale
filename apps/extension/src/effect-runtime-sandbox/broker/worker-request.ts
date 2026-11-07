import { fitsEffectRuntimeGpuSceneTransport } from '../../features/video/composition/effect-runtime/runtime/gpu-plan-boundary';
import { matchesEffectRuntimeRetryInputs } from '../../contracts/effect-runtime/retry-inputs';
import { isImageBitmap } from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  createEffectRuntimeFailure,
  sameEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeErrorCode,
  EffectRuntimeFrameInputs,
  EffectRuntimeFrameResult,
  EffectRuntimeSceneResult,
  EffectRuntimeGpuPlanResult,
  EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { GpuPreviewDeviceError } from '../../features/video/composition/canvas/gpu-preview';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../../features/video/composition/effect-runtime/runtime/resource-limits';
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

interface EffectRuntimeWorkerGpu {
  isAvailable(): Promise<boolean>;
  /** Borrows every plan resource until this promise settles, including after cancellation. */
  render(plan: EffectRuntimeGpuPlanResult, signal: AbortSignal): Promise<ImageBitmap>;
}
interface WorkerOptions {
  onReset?(): void;
  timeoutMs?: number;
  gpu?: EffectRuntimeWorkerGpu;
  workerFactory(): EffectRuntimeWorkerLike;
}
interface EffectRuntimeWorkerLease {
  onReset?(): void;
  worker: EffectRuntimeWorkerLike | null;
}
interface EffectRuntimeWorkerSession {
  execute(request: EffectRuntimeWorkerMessage): Promise<EffectRuntimeFrameResult>;
  execute(
    request: EffectRuntimeWorkerMessage,
    output: 'gpu-scene'
  ): Promise<EffectRuntimeSceneResult>;
}

/** The queue follows GPU settlement; a timed-out publication cannot admit another retained plan. */
export function createEffectRuntimeWorkerSession(
  options: WorkerOptions
): EffectRuntimeWorkerSession {
  const lease: EffectRuntimeWorkerLease = {
    ...(options.onReset ? { onReset: options.onReset } : {}),
    worker: null,
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
  return { execute };
}

export async function executeEffectRuntimeWorker(
  request: EffectRuntimeWorkerMessage,
  options: WorkerOptions
): Promise<EffectRuntimeFrameResult> {
  return startWorkerOperation(request, options, { worker: null }, true).result;
}

/** One authority owns publication, transfer, retry, deadline, and the asynchronous GPU drain. */
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
  output: 'bitmap' | 'gpu-scene' = 'bitmap'
) {
  let publish!: (result: EffectRuntimeSceneResult) => void;
  let releaseDrain!: () => void;
  const result = new Promise<EffectRuntimeSceneResult>((resolve) => {
    publish = resolve;
  });
  const drained = new Promise<void>((resolve) => {
    releaseDrain = resolve;
  });
  const abort = new AbortController();
  const timeoutMs = Math.min(
    EFFECT_RUNTIME_RESOURCE_LIMITS.renderTimeoutMs,
    Math.max(1, options.timeoutMs ?? EFFECT_RUNTIME_RESOURCE_LIMITS.renderTimeoutMs)
  );
  const deadline = performance.now() + timeoutMs;
  let settled = false;
  let pending = 0;
  let processing = false;
  const { renderTarget: _requestedTarget, ...initialFields } = original;
  let request: EffectRuntimeWorkerMessage = initialFields;
  let transferred = false;
  let worker: EffectRuntimeWorkerLike | null = null;
  const timeout = setTimeout(() => fail('timeout'), timeoutMs);

  const checkDrain = () => {
    if (settled && pending === 0) releaseDrain();
  };
  const finish = (value: EffectRuntimeSceneResult, terminate = terminateAfterResult) => {
    if (settled) {
      closeEffectRuntimeWorkerResponse(value);
      return;
    }
    settled = true;
    clearTimeout(timeout);
    abort.abort();
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
  const renderPlan = async (plan: EffectRuntimeGpuPlanResult) => {
    pending += 1;
    processing = true;
    const retriedInputs = new Set<ImageBitmap>();
    try {
      if (!options.gpu) {
        fail('outputRejected');
        return;
      }
      const bitmap = await options.gpu.render(plan, abort.signal);
      if (settled) {
        bitmap.close();
        return;
      }
      if (performance.now() >= deadline) {
        bitmap.close();
        fail('timeout');
        return;
      }
      if (
        !isImageBitmap(bitmap) ||
        bitmap.width !== original.renderWidth ||
        bitmap.height !== original.renderHeight
      ) {
        closeEffectRuntimeWorkerResponse(bitmap);
        fail('outputRejected');
        return;
      }
      finish({
        acknowledged: plan.acknowledged,
        effectInstanceId: plan.effectInstanceId,
        requestId: plan.requestId,
        sequenceId: plan.sequenceId,
        snapshotId: plan.snapshotId,
        width: plan.width,
        height: plan.height,
        kind: 'frame',
        bitmap,
      });
    } catch (error) {
      if (settled) return;
      if (performance.now() >= deadline) {
        fail('timeout');
        return;
      }
      if (error instanceof GpuPreviewDeviceError) {
        const inputs: EffectRuntimeFrameInputs = {};
        for (const [name, id] of Object.entries(plan.inputResources)) {
          if (name !== 'source' && name !== 'from' && name !== 'to') continue;
          const resource = plan.resources.find((entry) => entry.id === id);
          if (!resource) {
            fail('outputRejected');
            return;
          }
          inputs[name] = {
            bitmap: resource.bitmap,
            width: resource.width,
            height: resource.height,
          };
        }
        const { renderTarget: _target, ...fields } = original;
        processing = false;
        for (const input of Object.values(inputs)) retriedInputs.add(input.bitmap);
        send({
          ...fields,
          inputFrames: inputs,
          documentRef: { id: original.documentRef.id },
          assetSelectionRef: { id: original.assetSelectionRef.id },
        });
      } else fail(error instanceof EffectRuntimeResourceError ? 'resourceLimit' : 'outputRejected');
    } finally {
      // A successful retry post transfers original inputs; all other plan handles remain ours.
      closeEffectRuntimeWorkerResponse({
        ...plan,
        resources: plan.resources.filter(({ bitmap }) => !retriedInputs.has(bitmap)),
      });
      processing = false;
      pending -= 1;
      checkDrain();
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
      processing ||
      !hasExpectedEffectRuntimeAcknowledgement(request, response) ||
      (response.kind === 'frame' &&
        (request.renderTarget === 'gpu-plan' ||
          response.width !== request.renderWidth ||
          response.height !== request.renderHeight)) ||
      (response.kind !== 'gpu-plan' &&
        !matchesEffectRuntimeRetryInputs(request.inputFrames, response))
    ) {
      closeEffectRuntimeWorkerResponse(response);
      fail('outputRejected');
      return;
    }
    if (response.kind === 'gpu-plan') {
      if (output === 'gpu-scene' && fitsEffectRuntimeGpuSceneTransport(response)) finish(response);
      else void renderPlan(response);
    } else finish(response);
  };
  const start = () => {
    if (settled || !worker) return;
    send(request);
  };
  try {
    worker = lease.worker ?? options.workerFactory();
    lease.worker = worker;
    worker.onerror = () => fail('crashed');
    worker.onmessageerror = () => fail('malformed');
    worker.onmessage = onMessage;
    if (output === 'gpu-scene') {
      request = { ...initialFields, renderTarget: 'gpu-plan' };
      start();
    } else if (options.gpu) {
      pending += 1;
      void (async () => {
        try {
          let available: boolean;
          try {
            available = await options.gpu!.isAvailable();
          } catch (error) {
            if (!(error instanceof GpuPreviewDeviceError)) throw error;
            available = false;
          }
          if (settled) return;
          if (performance.now() >= deadline) {
            fail('timeout');
            return;
          }
          const { renderTarget: _target, ...fields } = original;
          request = available ? { ...fields, renderTarget: 'gpu-plan' } : fields;
          start();
        } catch {
          if (!settled) fail('crashed');
        } finally {
          pending -= 1;
          checkDrain();
        }
      })();
    } else start();
  } catch {
    fail('crashed');
    if (!worker) lease.onReset?.();
  }
  return { result, drained };
}
