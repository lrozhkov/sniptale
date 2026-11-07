import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeWorkerMessage,
  type EffectRuntimeGpuPlanResult,
} from '../../contracts/effect-runtime/types';
import { EffectRuntimeResourceError } from '../../features/video/composition/effect-runtime/runtime/resource-limits';
import { GpuPreviewDeviceError } from '../../features/video/composition/canvas/gpu-preview';
import {
  executeEffectRuntimeWorker,
  createEffectRuntimeWorkerSession,
  type EffectRuntimeWorkerLike,
} from './worker-request';
import {
  collectEffectRuntimeWorkerTransferables,
  parseEffectRuntimeWorkerResponse,
} from './worker-message-boundary';

class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

class FakeErrorEvent extends Event implements ErrorEvent {
  readonly colno = 0;
  readonly error = null;
  readonly filename = '';
  readonly lineno = 0;
  readonly message = '';
}

class FakeWorker implements EffectRuntimeWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  emitWithPort(data: unknown, port: MessagePort): void {
    this.onmessage?.(new MessageEvent('message', { data, ports: [port] }));
  }
}

function emitMatchingFrame(
  worker: FakeWorker,
  request: EffectRuntimeWorkerMessage,
  bitmap: ImageBitmap
): void {
  worker.emit({
    result: {
      acknowledged: {
        assetSelectionId: request.assetSelectionRef.id,
        documentId: request.documentRef.id,
      },
      bitmap,
      effectInstanceId: request.effectInstanceId,
      height: 720,
      kind: 'frame',
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
      width: 1280,
    },
    type: EFFECT_RUNTIME_WORKER_RESPONSE,
  });
}

beforeEach(() => {
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('EffectV1 broker to worker lifecycle', () => {
  it('accepts only an identity- and dimension-matched response', async () => {
    const request = createRequest();
    const worker = new FakeWorker();
    const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });
    const bitmap = new FakeImageBitmap(1280, 720);

    emitMatchingFrame(worker, request, bitmap);

    await expect(pending).resolves.toMatchObject({ bitmap, kind: 'frame' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('closes a stale response bitmap and cannot settle another request', async () => {
    const request = createRequest();
    const worker = new FakeWorker();
    const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });
    const bitmap = new FakeImageBitmap(1280, 720);

    worker.emit({
      result: {
        acknowledged: {
          assetSelectionId: request.assetSelectionRef.id,
          documentId: request.documentRef.id,
        },
        bitmap,
        effectInstanceId: request.effectInstanceId,
        height: 720,
        kind: 'frame',
        requestId: request.requestId,
        sequenceId: request.sequenceId + 1,
        snapshotId: request.snapshotId,
        width: 1280,
      },
      type: EFFECT_RUNTIME_WORKER_RESPONSE,
    });

    await expect(pending).resolves.toMatchObject({ code: 'stale', kind: 'error' });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

describe('EffectV1 disposable worker failures', () => {
  it('terminates the disposable worker on timeout', async () => {
    const request = createRequest();
    const worker = new FakeWorker();

    await expect(
      executeEffectRuntimeWorker(request, { timeoutMs: 1, workerFactory: () => worker })
    ).resolves.toMatchObject({ code: 'timeout', kind: 'error' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('closes request-owned bitmaps when transfer fails', async () => {
    const input = new FakeImageBitmap(1280, 720);
    const request = createRequest();
    request.documentRef.document!.kind = 'targetEffect';
    request.documentRef.document!.program.commands = [
      { height: 720, input: 'source', op: 'image', width: 1280, x: 0, y: 0 },
    ];
    request.inputFrames = {
      source: { bitmap: input, height: 720, width: 1280 },
    };
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => {
      throw new Error('clone failure');
    });

    await expect(
      executeEffectRuntimeWorker(request, { workerFactory: () => worker })
    ).resolves.toMatchObject({ code: 'crashed', kind: 'error' });
    expect(input.close).toHaveBeenCalledOnce();
  });
});

describe('EffectV1 worker error mapping', () => {
  it('maps factory, worker, message, and output failures without leaking bitmaps', async () => {
    const request = createRequest();
    await expect(
      executeEffectRuntimeWorker(request, {
        workerFactory: () => {
          throw new Error('factory');
        },
      })
    ).resolves.toMatchObject({ code: 'crashed' });

    const worker = new FakeWorker();
    const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });
    const bitmap = new FakeImageBitmap(640, 360);
    worker.emit(createFrameEnvelope(request, bitmap));
    await expect(pending).resolves.toMatchObject({ code: 'outputRejected' });
    expect(bitmap.close).toHaveBeenCalledOnce();

    const crashing = new FakeWorker();
    const crashed = executeEffectRuntimeWorker(request, { workerFactory: () => crashing });
    crashing.onerror?.(new FakeErrorEvent('error'));
    await expect(crashed).resolves.toMatchObject({ code: 'crashed' });

    const malformed = new FakeWorker();
    const rejected = executeEffectRuntimeWorker(request, { workerFactory: () => malformed });
    malformed.onmessageerror?.(new MessageEvent('messageerror'));
    await expect(rejected).resolves.toMatchObject({ code: 'malformed' });
  });
});

describe('EffectV1 worker response boundary', () => {
  it('rejects response ports and parses only exact response envelopes', async () => {
    const request = createRequest();
    const worker = new FakeWorker();
    const channel = new MessageChannel();
    const close = vi.spyOn(channel.port1, 'close');
    const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });

    worker.emitWithPort(
      createFrameEnvelope(request, new FakeImageBitmap(1280, 720)),
      channel.port1
    );

    await expect(pending).resolves.toMatchObject({ code: 'malformed' });
    expect(close).toHaveBeenCalledOnce();
    expect(parseEffectRuntimeWorkerResponse(null)).toBeNull();
    expect(parseEffectRuntimeWorkerResponse({ result: {}, type: 'wrong' })).toBeNull();
    channel.port2.close();
  });

  it('deduplicates image and input bitmap transfer ownership', () => {
    const bitmap = new FakeImageBitmap(1280, 720);
    const request = createRequest();
    request.assetSelectionRef.assets = {
      image: {
        bitmap,
        cacheKey: 'asset',
        height: 720,
        id: 'image',
        kind: 'image',
        mimeType: 'image/png',
        width: 1280,
      },
    };
    request.inputFrames = { source: { bitmap, height: 720, width: 1280 } };

    expect(collectEffectRuntimeWorkerTransferables(request)).toEqual([bitmap]);
  });
});

function createFrameEnvelope(request: EffectRuntimeWorkerMessage, bitmap: FakeImageBitmap) {
  return {
    result: {
      acknowledged: {
        assetSelectionId: request.assetSelectionRef.id,
        documentId: request.documentRef.id,
      },
      bitmap,
      effectInstanceId: request.effectInstanceId,
      height: bitmap.height,
      kind: 'frame',
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
      width: bitmap.width,
    },
    type: EFFECT_RUNTIME_WORKER_RESPONSE,
  };
}

function createRequest(): EffectRuntimeWorkerMessage {
  const documentId = 'c'.repeat(64);
  return {
    assetSelectionRef: { assets: {}, id: 'd'.repeat(64) },
    controls: {},
    documentRef: {
      document: {
        assets: [],
        clips: [],
        controls: [],
        duration: 2,
        id: 'safe-effect',
        kind: 'standalone',
        label: { en: 'Safe effect', ru: 'Безопасный эффект' },
        layers: [],
        program: { commands: [{ op: 'clear' }], kind: 'graph', version: 1 },
        scenes: [{ duration: 2, id: 'main', start: 0 }],
        schemaVersion: 'sniptale.effect.v1',
        timeline: { phases: [], tracks: [] },
      },
      id: documentId,
    },
    duration: 2,
    effectInstanceId: 'instance-1',
    fps: 30,
    frameIndex: 15,
    height: 720,
    inputFrames: {},
    progress: 0.25,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 720,
    renderWidth: 1280,
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: `effect:${documentId}`,
    time: 0.5,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    width: 1280,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function gpuPlan(
  request: EffectRuntimeWorkerMessage,
  extra: FakeImageBitmap[] = []
): EffectRuntimeGpuPlanResult {
  const inputs: EffectRuntimeGpuPlanResult['inputResources'] = {};
  const resources: EffectRuntimeGpuPlanResult['resources'] = [];
  for (const name of ['source', 'from', 'to'] as const) {
    const input = request.inputFrames[name];
    if (!input) continue;
    const id = resources.length;
    resources.push({ id, kind: 'input', ...input });
    inputs[name] = id;
  }
  for (const bitmap of extra)
    resources.push({
      id: resources.length,
      kind: 'primitive',
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
    });
  return {
    kind: 'gpu-plan',
    effectInstanceId: request.effectInstanceId,
    requestId: request.requestId,
    sequenceId: request.sequenceId,
    snapshotId: request.snapshotId,
    acknowledged: {
      documentId: request.documentRef.id,
      assetSelectionId: request.assetSelectionRef.id,
    },
    width: request.renderWidth,
    height: request.renderHeight,
    logicalWidth: request.width,
    logicalHeight: request.height,
    resources,
    inputResources: inputs,
    rootPass: 0,
    passes: [
      {
        id: 0,
        width: request.renderWidth,
        height: request.renderHeight,
        logicalWidth: request.width,
        logicalHeight: request.height,
        operations: [],
      },
    ],
  };
}
function emitGpuPlan(worker: FakeWorker, plan: EffectRuntimeGpuPlanResult) {
  worker.emit({ type: EFFECT_RUNTIME_WORKER_RESPONSE, result: plan });
}

it('selects GPU availability before transferring inputs, then publishes only the completed GPU bitmap', async () => {
  const worker = new FakeWorker();
  const posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const available = deferred<boolean>(),
    fence = deferred<ImageBitmap>();
  const request = createRequest(),
    input = new FakeImageBitmap(1280, 720),
    primitive = new FakeImageBitmap(8, 8);
  request.inputFrames.source = { bitmap: input, width: 1280, height: 720 };
  const render = vi.fn((_plan: EffectRuntimeGpuPlanResult, _signal: AbortSignal) => fence.promise);
  const pending = executeEffectRuntimeWorker(request, {
    workerFactory: () => worker,
    gpu: { isAvailable: () => available.promise, render },
  });
  expect(worker.postMessage).not.toHaveBeenCalled();
  available.resolve(true);
  const sent = await posted.promise;
  expect(sent.renderTarget).toBe('gpu-plan');
  const plan = gpuPlan(sent, [primitive]);
  emitGpuPlan(worker, plan);
  expect(render).toHaveBeenCalledOnce();
  expect(input.close).not.toHaveBeenCalled();
  expect(primitive.close).not.toHaveBeenCalled();
  const bitmap = new FakeImageBitmap(1280, 720);
  fence.resolve(bitmap);
  await expect(pending).resolves.toMatchObject({ kind: 'frame', bitmap });
  expect(input.close).toHaveBeenCalledOnce();
  expect(primitive.close).toHaveBeenCalledOnce();
  expect(bitmap.close).not.toHaveBeenCalled();
});

it('selects Canvas before transfer when GPU is unavailable', async () => {
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const render = vi.fn(async () => new FakeImageBitmap(1280, 720));
  const pending = executeEffectRuntimeWorker(createRequest(), {
    workerFactory: () => worker,
    gpu: { isAvailable: async () => false, render },
  });
  const sent = await posted.promise;
  expect(sent.renderTarget).toBeUndefined();
  emitMatchingFrame(worker, sent, new FakeImageBitmap(1280, 720));
  await expect(pending).resolves.toMatchObject({ kind: 'frame' });
  expect(render).not.toHaveBeenCalled();
});

it('retries typed device failure once with original inputs and cached references only', async () => {
  const worker = new FakeWorker(),
    first = deferred<EffectRuntimeWorkerMessage>(),
    retry = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage
    .mockImplementationOnce((value: EffectRuntimeWorkerMessage) => first.resolve(value))
    .mockImplementationOnce((value: EffectRuntimeWorkerMessage) => retry.resolve(value));
  const request = createRequest(),
    input = new FakeImageBitmap(1280, 720),
    primitive = new FakeImageBitmap(8, 8);
  request.inputFrames.source = { bitmap: input, width: 1280, height: 720 };
  const render = vi.fn(async () => {
    throw new GpuPreviewDeviceError('lost');
  });
  const pending = executeEffectRuntimeWorker(request, {
    workerFactory: () => worker,
    gpu: { isAvailable: async () => true, render },
  });
  const sent = await first.promise;
  emitGpuPlan(worker, gpuPlan(sent, [primitive]));
  const fallback = await retry.promise;
  expect(fallback.renderTarget).toBeUndefined();
  expect(fallback.documentRef).toEqual({ id: request.documentRef.id });
  expect(fallback.assetSelectionRef).toEqual({ id: request.assetSelectionRef.id });
  expect(fallback.inputFrames.source?.bitmap).toBe(input);
  expect(primitive.close).toHaveBeenCalledOnce();
  expect(input.close).not.toHaveBeenCalled();
  expect(worker.terminate).not.toHaveBeenCalled();
  emitMatchingFrame(worker, fallback, new FakeImageBitmap(1280, 720));
  await expect(pending).resolves.toMatchObject({ kind: 'frame' });
  expect(render).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
});

it('does not retry GPU validation failure or accept a Canvas frame for a GPU request', async () => {
  for (const response of ['gpu-error', 'unexpected-frame'] as const) {
    const worker = new FakeWorker(),
      posted = deferred<EffectRuntimeWorkerMessage>();
    worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
      posted.resolve(value)
    );
    const render = vi.fn(async () => {
      throw new Error('validation');
    });
    const pending = executeEffectRuntimeWorker(createRequest(), {
      workerFactory: () => worker,
      gpu: { isAvailable: async () => true, render },
    });
    const sent = await posted.promise;
    if (response === 'gpu-error') emitGpuPlan(worker, gpuPlan(sent));
    else emitMatchingFrame(worker, sent, new FakeImageBitmap(1280, 720));
    await expect(pending).resolves.toMatchObject({ code: 'outputRejected' });
    expect(worker.postMessage).toHaveBeenCalledOnce();
  }
});

it('publishes timeout but holds GPU resources and the session queue until the fence settles', async () => {
  vi.useFakeTimers();
  const workers = [new FakeWorker(), new FakeWorker()],
    firstPost = deferred<EffectRuntimeWorkerMessage>(),
    secondPost = deferred<EffectRuntimeWorkerMessage>();
  workers[0]!.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    firstPost.resolve(value)
  );
  workers[1]!.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    secondPost.resolve(value)
  );
  let index = 0;
  const workerFactory = vi.fn(() => workers[index++]!);
  const fence = deferred<ImageBitmap>();
  const render = vi.fn((_plan: EffectRuntimeGpuPlanResult, _signal: AbortSignal) => fence.promise);
  const session = createEffectRuntimeWorkerSession({
    timeoutMs: 10,
    workerFactory,
    gpu: { isAvailable: async () => true, render },
  });
  const request = createRequest(),
    input = new FakeImageBitmap(1280, 720);
  request.inputFrames.source = { bitmap: input, width: 1280, height: 720 };
  const first = session.execute(request);
  const sent = await firstPost.promise;
  emitGpuPlan(workers[0]!, gpuPlan(sent));
  const second = session.execute({ ...createRequest(), requestId: 'request-2', sequenceId: 2 });
  await vi.advanceTimersByTimeAsync(10);
  await expect(first).resolves.toMatchObject({ code: 'timeout' });
  expect(input.close).not.toHaveBeenCalled();
  expect(workerFactory).toHaveBeenCalledOnce();
  expect(render.mock.calls[0]?.[1].aborted).toBe(true);
  const late = new FakeImageBitmap(1280, 720);
  fence.resolve(late);
  const next = await secondPost.promise;
  expect(input.close).toHaveBeenCalledOnce();
  expect(late.close).toHaveBeenCalledOnce();
  expect(workerFactory).toHaveBeenCalledTimes(2);
  // Rejecting a normal frame also proves this queued request retained GPU mode.
  emitMatchingFrame(workers[1]!, next, new FakeImageBitmap(1280, 720));
  await expect(second).resolves.toMatchObject({ code: 'outputRejected' });
});

it('keeps the original deadline across a typed-device Canvas retry', async () => {
  vi.useFakeTimers();
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>(),
    retried = deferred<EffectRuntimeWorkerMessage>(),
    fence = deferred<ImageBitmap>();
  worker.postMessage
    .mockImplementationOnce((value: EffectRuntimeWorkerMessage) => posted.resolve(value))
    .mockImplementationOnce((value: EffectRuntimeWorkerMessage) => retried.resolve(value));
  const pending = executeEffectRuntimeWorker(createRequest(), {
    timeoutMs: 10,
    workerFactory: () => worker,
    gpu: { isAvailable: async () => true, render: () => fence.promise },
  });
  emitGpuPlan(worker, gpuPlan(await posted.promise));
  await vi.advanceTimersByTimeAsync(9);
  fence.reject(new GpuPreviewDeviceError('lost'));
  await retried.promise;
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toMatchObject({ code: 'timeout' });
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
});

it('closes every malformed plan resource directly beyond the generic traversal limit', async () => {
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const render = vi.fn(async () => new FakeImageBitmap(1280, 720));
  const pending = executeEffectRuntimeWorker(createRequest(), {
    workerFactory: () => worker,
    gpu: { isAvailable: async () => true, render },
  });
  const resources = Array.from({ length: 600 }, () => new FakeImageBitmap(1, 1));
  const malformed = gpuPlan(await posted.promise, resources);
  malformed.resources.at(-1)!.id = 0;
  emitGpuPlan(worker, malformed);
  await expect(pending).resolves.toMatchObject({ code: 'malformed' });
  expect(resources.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
  expect(render).not.toHaveBeenCalled();
});

it('keeps resource failures explicit and closes all plan resources without Canvas retry', async () => {
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const primitive = new FakeImageBitmap(8, 8);
  const pending = executeEffectRuntimeWorker(createRequest(), {
    workerFactory: () => worker,
    gpu: {
      isAvailable: async () => true,
      render: async () => {
        throw new EffectRuntimeResourceError();
      },
    },
  });
  emitGpuPlan(worker, gpuPlan(await posted.promise, [primitive]));
  await expect(pending).resolves.toMatchObject({ code: 'resourceLimit' });
  expect(worker.postMessage).toHaveBeenCalledOnce();
  expect(primitive.close).toHaveBeenCalledOnce();
});

it('closes retry inputs once when the fallback transfer fails', async () => {
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage
    .mockImplementationOnce((value: EffectRuntimeWorkerMessage) => posted.resolve(value))
    .mockImplementationOnce(() => {
      throw new Error('retry clone failure');
    });
  const request = createRequest(),
    input = new FakeImageBitmap(1280, 720),
    primitive = new FakeImageBitmap(8, 8);
  request.inputFrames.source = { bitmap: input, width: 1280, height: 720 };
  const pending = executeEffectRuntimeWorker(request, {
    workerFactory: () => worker,
    gpu: {
      isAvailable: async () => true,
      render: async () => {
        throw new GpuPreviewDeviceError('lost');
      },
    },
  });
  emitGpuPlan(worker, gpuPlan(await posted.promise, [primitive]));
  await expect(pending).resolves.toMatchObject({ code: 'crashed' });
  expect(input.close).toHaveBeenCalledOnce();
  expect(primitive.close).toHaveBeenCalledOnce();
});

it('rejects GPU output dimensions and closes the rejected bitmap', async () => {
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const output = new FakeImageBitmap(640, 360);
  const pending = executeEffectRuntimeWorker(createRequest(), {
    workerFactory: () => worker,
    gpu: { isAvailable: async () => true, render: async () => output },
  });
  emitGpuPlan(worker, gpuPlan(await posted.promise));
  await expect(pending).resolves.toMatchObject({ code: 'outputRejected' });
  expect(output.close).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledOnce();
});

it('closes untransferred inputs on availability timeout and never posts a late request', async () => {
  vi.useFakeTimers();
  const worker = new FakeWorker(),
    available = deferred<boolean>(),
    input = new FakeImageBitmap(1280, 720),
    request = createRequest();
  request.inputFrames.source = { bitmap: input, width: 1280, height: 720 };
  const pending = executeEffectRuntimeWorker(request, {
    timeoutMs: 10,
    workerFactory: () => worker,
    gpu: {
      isAvailable: () => available.promise,
      render: async () => new FakeImageBitmap(1280, 720),
    },
  });
  await vi.advanceTimersByTimeAsync(10);
  await expect(pending).resolves.toMatchObject({ code: 'timeout' });
  expect(input.close).toHaveBeenCalledOnce();
  available.resolve(true);
  await available.promise;
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(input.close).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('handles worker startup failure while GPU availability is still pending', async () => {
  const worker = new FakeWorker(),
    available = deferred<boolean>(),
    request = createRequest(),
    input = new FakeImageBitmap(1280, 720);
  request.inputFrames.source = { bitmap: input, width: 1280, height: 720 };
  const pending = executeEffectRuntimeWorker(request, {
    workerFactory: () => worker,
    gpu: {
      isAvailable: () => available.promise,
      render: async () => new FakeImageBitmap(1280, 720),
    },
  });
  worker.onerror?.(new FakeErrorEvent('error'));
  await expect(pending).resolves.toMatchObject({ code: 'crashed' });
  expect(input.close).toHaveBeenCalledOnce();
  available.resolve(false);
  await available.promise;
  expect(worker.postMessage).not.toHaveBeenCalled();
});

it.each(['gpu-success', 'device-fallback'] as const)(
  'ignores a forward wall clock jump during %s within the original elapsed budget',
  async (outcome) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    const worker = new FakeWorker();
    const posted = deferred<EffectRuntimeWorkerMessage>();
    const retried = deferred<EffectRuntimeWorkerMessage>();
    const fence = deferred<ImageBitmap>();
    worker.postMessage
      .mockImplementationOnce((value: EffectRuntimeWorkerMessage) => posted.resolve(value))
      .mockImplementationOnce((value: EffectRuntimeWorkerMessage) => retried.resolve(value));
    const pending = executeEffectRuntimeWorker(createRequest(), {
      workerFactory: () => worker,
      gpu: { isAvailable: async () => true, render: () => fence.promise },
    });
    emitGpuPlan(worker, gpuPlan(await posted.promise));
    await vi.advanceTimersByTimeAsync(127);
    expect(performance.now()).toBe(127);
    vi.setSystemTime(Date.now() + 1796);
    expect(performance.now()).toBe(127);
    const bitmap = new FakeImageBitmap(1280, 720);
    if (outcome === 'gpu-success') fence.resolve(bitmap);
    else {
      fence.reject(new GpuPreviewDeviceError('lost'));
      expect(
        await Promise.race([retried.promise.then(() => 'retry'), pending.then(() => 'result')])
      ).toBe('retry');
      const fallback = await retried.promise;
      emitMatchingFrame(worker, fallback, bitmap);
    }
    await expect(pending).resolves.toMatchObject({ kind: 'frame', bitmap });
    expect(bitmap.close).not.toHaveBeenCalled();
  }
);

it('enforces the elapsed deadline before an overdue timer callback despite a backward wall clock jump', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const monotonic = vi.spyOn(performance, 'now').mockReturnValue(0);
  const worker = new FakeWorker();
  const posted = deferred<EffectRuntimeWorkerMessage>();
  const fence = deferred<ImageBitmap>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const pending = executeEffectRuntimeWorker(createRequest(), {
    workerFactory: () => worker,
    gpu: { isAvailable: async () => true, render: () => fence.promise },
  });
  emitGpuPlan(worker, gpuPlan(await posted.promise));
  // The GPU completion microtask runs before an already-due timer task.
  monotonic.mockReturnValue(1501);
  vi.setSystemTime(Date.now() - 3000);
  const bitmap = new FakeImageBitmap(1280, 720);
  fence.resolve(bitmap);
  await expect(pending).resolves.toMatchObject({ code: 'timeout', kind: 'error' });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledOnce();
  monotonic.mockRestore();
});

it('forwards a bounded scene plan without creating or waiting for the sandbox GPU', async () => {
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const isAvailable = vi.fn(() => new Promise<boolean>(() => {}));
  const render = vi.fn(async () => new FakeImageBitmap(1280, 720));
  const session = createEffectRuntimeWorkerSession({
    workerFactory: () => worker,
    gpu: { isAvailable, render },
  });
  const pending = session.execute(createRequest(), 'gpu-scene');
  const sent = await posted.promise;
  expect(sent.renderTarget).toBe('gpu-plan');
  const primitive = new FakeImageBitmap(8, 8),
    plan = gpuPlan(sent, [primitive]);
  emitGpuPlan(worker, plan);
  await expect(pending).resolves.toEqual(plan);
  expect(isAvailable).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  expect(primitive.close).not.toHaveBeenCalled();
});

it('materializes valid oversized scene plans through the existing GPU representation', async () => {
  const worker = new FakeWorker(),
    posted = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage.mockImplementation((value: EffectRuntimeWorkerMessage) =>
    posted.resolve(value)
  );
  const bitmap = new FakeImageBitmap(1280, 720),
    render = vi.fn(async () => bitmap);
  const session = createEffectRuntimeWorkerSession({
    workerFactory: () => worker,
    gpu: { isAvailable: async () => true, render },
  });
  const pending = session.execute(createRequest(), 'gpu-scene');
  const sent = await posted.promise;
  const plan = gpuPlan(
    sent,
    Array.from({ length: 513 }, () => new FakeImageBitmap(1, 1))
  );
  emitGpuPlan(worker, plan);
  await expect(pending).resolves.toMatchObject({ kind: 'frame', bitmap });
  expect(render).toHaveBeenCalledOnce();
  for (const resource of plan.resources) expect(resource.bitmap.close).toHaveBeenCalledOnce();
});
