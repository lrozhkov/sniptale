import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { createAnimationDocument } from './request-boundary.test-support';
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

describe('Animation broker to worker lifecycle', () => {
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

describe('Animation disposable worker failures', () => {
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

describe('Animation worker error mapping', () => {
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

describe('Animation worker response boundary', () => {
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
      document: createAnimationDocument(),
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
it.each(['error', 'messageerror'] as const)(
  'retains idle worker startup refusal after %s until a new session replaces it',
  async (failure) => {
    const first = new FakeWorker(),
      replacement = new FakeWorker();
    const workerFactory = vi.fn().mockReturnValueOnce(first).mockReturnValue(replacement);
    const session = createEffectRuntimeWorkerSession({ workerFactory });
    session.preload();
    session.preload();
    expect(workerFactory).toHaveBeenCalledOnce();
    expect(first.postMessage).not.toHaveBeenCalled();
    if (failure === 'error') first.onerror?.(new FakeErrorEvent('error'));
    else first.onmessageerror?.(new MessageEvent('messageerror'));
    expect(first.terminate).toHaveBeenCalledOnce();
    session.preload();
    expect(workerFactory).toHaveBeenCalledOnce();
    const request = createRequest();
    await expect(session.execute(request)).resolves.toMatchObject({
      code: failure === 'error' ? 'crashed' : 'malformed',
    });
    await expect(session.execute(createRequest())).resolves.toMatchObject({ code: 'circuitOpen' });
    expect(workerFactory).toHaveBeenCalledOnce();
    const recovered = createEffectRuntimeWorkerSession({ workerFactory });
    const pending = recovered.execute(request);
    await Promise.resolve();
    emitMatchingFrame(replacement, request, new FakeImageBitmap(1280, 720));
    await expect(pending).resolves.toMatchObject({ kind: 'frame' });
  }
);

it('retains synchronous preload refusal until a new worker session replaces it', async () => {
  const worker = new FakeWorker(),
    workerFactory = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('startup');
      })
      .mockReturnValue(worker);
  const session = createEffectRuntimeWorkerSession({ workerFactory });
  expect(() => session.preload()).not.toThrow();
  expect(() => session.preload()).not.toThrow();
  expect(workerFactory).toHaveBeenCalledOnce();
  await expect(session.execute(createRequest())).resolves.toMatchObject({ code: 'crashed' });
  expect(workerFactory).toHaveBeenCalledOnce();
  const recovered = createEffectRuntimeWorkerSession({ workerFactory });
  const request = createRequest(),
    pending = recovered.execute(request);
  await Promise.resolve();
  emitMatchingFrame(worker, request, new FakeImageBitmap(1280, 720));
  await expect(pending).resolves.toMatchObject({ kind: 'frame' });
  expect(workerFactory).toHaveBeenCalledTimes(2);
});

it('retains startup failure on the first real request without retrying queued frames', async () => {
  const workerFactory = vi.fn(() => {
    throw new Error('startup');
  });
  const session = createEffectRuntimeWorkerSession({ workerFactory });
  await expect(session.execute(createRequest())).resolves.toMatchObject({ code: 'crashed' });
  await expect(session.execute(createRequest())).resolves.toMatchObject({ code: 'circuitOpen' });
  const bitmap = new FakeImageBitmap(1280, 720);
  await expect(
    session.execute({
      ...createRequest(),
      inputFrames: { source: { bitmap, width: 1280, height: 720 } },
    })
  ).resolves.toMatchObject({ code: 'circuitOpen' });
  expect(bitmap.close).toHaveBeenCalledOnce();
  session.preload();
  expect(workerFactory).toHaveBeenCalledOnce();
});

it('retains an asynchronous startup error during the first request', async () => {
  const worker = new FakeWorker();
  const workerFactory = vi.fn(() => worker);
  const session = createEffectRuntimeWorkerSession({ workerFactory });
  const pending = session.execute(createRequest());
  await Promise.resolve();
  worker.onerror?.(new FakeErrorEvent('error'));
  await expect(pending).resolves.toMatchObject({ code: 'crashed' });
  await expect(session.execute(createRequest())).resolves.toMatchObject({ code: 'circuitOpen' });
  expect(workerFactory).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('keeps recovery after an error from a worker that has already answered a frame', async () => {
  const first = new FakeWorker(),
    replacement = new FakeWorker();
  const workerFactory = vi.fn().mockReturnValueOnce(first).mockReturnValue(replacement);
  const session = createEffectRuntimeWorkerSession({ workerFactory });
  const request = createRequest();
  const ready = session.execute(request);
  await Promise.resolve();
  emitMatchingFrame(first, request, new FakeImageBitmap(1280, 720));
  await expect(ready).resolves.toMatchObject({ kind: 'frame' });
  const failed = session.execute(request);
  await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledTimes(2));
  first.onerror?.(new FakeErrorEvent('error'));
  await expect(failed).resolves.toMatchObject({ code: 'crashed' });
  const pending = session.execute(request);
  await vi.waitFor(() => expect(workerFactory).toHaveBeenCalledTimes(2));
  emitMatchingFrame(replacement, request, new FakeImageBitmap(1280, 720));
  await expect(pending).resolves.toMatchObject({ kind: 'frame' });
});

it.each([1, 600])(
  'refuses a retired GPU plan and closes all %i transferred resources',
  async (count) => {
    const request = createRequest(),
      worker = new FakeWorker();
    const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });
    const bitmaps = Array.from({ length: count }, () => new FakeImageBitmap(1, 1));
    worker.emit({
      type: EFFECT_RUNTIME_WORKER_RESPONSE,
      result: {
        kind: 'gpu-plan',
        requestId: request.requestId,
        sequenceId: request.sequenceId,
        snapshotId: request.snapshotId,
        effectInstanceId: request.effectInstanceId,
        resources: bitmaps.map((bitmap, id) => ({
          id,
          bitmap,
          kind: 'primitive',
          width: 1,
          height: 1,
        })),
      },
    });
    await expect(pending).resolves.toMatchObject({ kind: 'error', code: 'malformed' });
    expect(worker.postMessage).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('rejects a forged acknowledgement and releases its otherwise valid frame', async () => {
  const request = createRequest(),
    worker = new FakeWorker();
  const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });
  const bitmap = new FakeImageBitmap(1280, 720),
    envelope = createFrameEnvelope(request, bitmap);
  envelope.result.acknowledged.documentId = 'a'.repeat(64);
  worker.emit(envelope);
  await expect(pending).resolves.toMatchObject({ kind: 'error', code: 'outputRejected' });
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('serializes supported frames and reuses the retained worker after successful publication', async () => {
  const worker = new FakeWorker(),
    workerFactory = vi.fn(() => worker);
  const firstPost = deferred<EffectRuntimeWorkerMessage>(),
    secondPost = deferred<EffectRuntimeWorkerMessage>();
  worker.postMessage
    .mockImplementationOnce((value) => firstPost.resolve(value))
    .mockImplementationOnce((value) => secondPost.resolve(value));
  const session = createEffectRuntimeWorkerSession({ workerFactory }),
    request = createRequest();
  const first = session.execute(request);
  const secondRequest = { ...request, requestId: 'request-2', sequenceId: 2 };
  const second = session.execute(secondRequest);
  const sent = await firstPost.promise;
  expect(worker.postMessage).toHaveBeenCalledOnce();
  emitMatchingFrame(worker, sent, new FakeImageBitmap(1280, 720));
  await expect(first).resolves.toMatchObject({ kind: 'frame', requestId: request.requestId });
  expect(await secondPost.promise).toEqual(secondRequest);
  emitMatchingFrame(worker, secondRequest, new FakeImageBitmap(1280, 720));
  await expect(second).resolves.toMatchObject({ kind: 'frame', requestId: 'request-2' });
  expect(workerFactory).toHaveBeenCalledOnce();
  expect(worker.terminate).not.toHaveBeenCalled();
});

it('retires a timed-out worker before starting queued work and closes a late response', async () => {
  vi.useFakeTimers();
  const workers = [new FakeWorker(), new FakeWorker()],
    factory = vi.fn().mockReturnValueOnce(workers[0]).mockReturnValueOnce(workers[1]);
  const firstPost = deferred<EffectRuntimeWorkerMessage>(),
    secondPost = deferred<EffectRuntimeWorkerMessage>();
  workers[0]!.postMessage.mockImplementation((value) => firstPost.resolve(value));
  workers[1]!.postMessage.mockImplementation((value) => secondPost.resolve(value));
  const session = createEffectRuntimeWorkerSession({ workerFactory: factory, timeoutMs: 10 });
  const request = createRequest(),
    first = session.execute(request);
  const sent = await firstPost.promise,
    lateHandler = workers[0]!.onmessage;
  const second = session.execute({ ...request, requestId: 'request-2', sequenceId: 2 });
  await vi.advanceTimersByTimeAsync(10);
  await expect(first).resolves.toMatchObject({ code: 'timeout' });
  const next = await secondPost.promise;
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  const late = new FakeImageBitmap(1280, 720);
  lateHandler?.(new MessageEvent('message', { data: createFrameEnvelope(sent, late) }));
  expect(late.close).toHaveBeenCalledOnce();
  emitMatchingFrame(workers[1]!, next, new FakeImageBitmap(1280, 720));
  await expect(second).resolves.toMatchObject({ kind: 'frame', requestId: 'request-2' });
});

it('ignores a forward wall-clock jump within the elapsed deadline', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  const request = createRequest(),
    worker = new FakeWorker();
  const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });
  await vi.advanceTimersByTimeAsync(127);
  vi.setSystemTime(Date.now() + 1796);
  expect(performance.now()).toBe(127);
  const bitmap = new FakeImageBitmap(1280, 720);
  emitMatchingFrame(worker, request, bitmap);
  await expect(pending).resolves.toMatchObject({ kind: 'frame', bitmap });
  expect(bitmap.close).not.toHaveBeenCalled();
});

it('enforces elapsed deadline before an overdue timer despite a backward wall-clock jump', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const monotonic = vi.spyOn(performance, 'now').mockReturnValue(0),
    worker = new FakeWorker(),
    request = createRequest();
  const pending = executeEffectRuntimeWorker(request, { workerFactory: () => worker });
  monotonic.mockReturnValue(1501);
  vi.setSystemTime(Date.now() - 3000);
  const bitmap = new FakeImageBitmap(1280, 720);
  emitMatchingFrame(worker, request, bitmap);
  await expect(pending).resolves.toMatchObject({ kind: 'error', code: 'timeout' });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledOnce();
});
