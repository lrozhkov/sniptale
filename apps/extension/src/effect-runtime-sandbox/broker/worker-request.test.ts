import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { executeEffectRuntimeWorker, type EffectRuntimeWorkerLike } from './worker-request';
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
