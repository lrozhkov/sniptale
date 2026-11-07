import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { createEffectRuntimeAssetSelectionId } from '../../contracts/effect-runtime/immutable-refs';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeRenderMessage,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { createDocument } from '../worker/interpreter/support.test-support';
import { EffectRuntimePreparationError } from './prepare-frame';
import { createEffectRuntimeBrokerSession } from './session';
import type { EffectRuntimeWorkerLike } from './worker-request';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

class ReplyWorker implements EffectRuntimeWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly terminate = vi.fn();
  postMessage(): void {
    const request = createWorkerRequest();
    this.onmessage?.(
      new MessageEvent('message', {
        data: {
          result: {
            acknowledged: {
              assetSelectionId: request.assetSelectionRef.id,
              documentId: request.documentRef.id,
            },
            bitmap: new FakeBitmap(request.width, request.height),
            effectInstanceId: request.effectInstanceId,
            height: request.height,
            kind: 'frame',
            requestId: request.requestId,
            sequenceId: request.sequenceId,
            snapshotId: request.snapshotId,
            width: request.width,
          },
          type: EFFECT_RUNTIME_WORKER_RESPONSE,
        },
      })
    );
  }
}

class ErrorWorker extends ReplyWorker {
  override postMessage(): void {
    const request = createWorkerRequest();
    this.onmessage?.(
      new MessageEvent('message', {
        data: {
          result: {
            code: 'outputRejected',
            effectInstanceId: request.effectInstanceId,
            kind: 'error',
            requestId: request.requestId,
            sequenceId: request.sequenceId,
            snapshotId: request.snapshotId,
          },
          type: EFFECT_RUNTIME_WORKER_RESPONSE,
        },
      })
    );
  }
}

beforeEach(() => {
  vi.stubGlobal('ImageBitmap', FakeBitmap);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('executes a parsed request and resets the failure circuit after a frame', async () => {
  const message = await createMessage();
  const prepare = vi.fn().mockResolvedValue(createWorkerRequest());
  const session = createEffectRuntimeBrokerSession({
    prepare,
    workerFactory: () => new ReplyWorker(),
  });

  await expect(session.execute(message)).resolves.toMatchObject({ kind: 'frame' });
  expect(prepare).toHaveBeenCalledOnce();
  expect(session.snapshot()).toEqual({
    activeRequests: 0,
    circuitOpen: false,
    consecutiveFailures: 0,
  });
});

it('reuses one isolated worker across sequential playback frames', async () => {
  const message = await createMessage();
  const worker = new ReplyWorker();
  const workerFactory = vi.fn(() => worker);
  const session = createEffectRuntimeBrokerSession({
    prepare: vi.fn().mockResolvedValue(createWorkerRequest()),
    workerFactory,
  });

  await expect(session.execute(message)).resolves.toMatchObject({ kind: 'frame' });
  await expect(session.execute(message)).resolves.toMatchObject({ kind: 'frame' });

  expect(workerFactory).toHaveBeenCalledOnce();
  expect(worker.terminate).not.toHaveBeenCalled();
});

it('maps preparation errors and opens a bounded circuit after repeated malformed input', async () => {
  const message = await createMessage();
  const session = createEffectRuntimeBrokerSession({
    prepare: vi.fn().mockRejectedValue(new EffectRuntimePreparationError('timeout')),
    workerFactory: () => new ReplyWorker(),
  });

  await expect(session.execute(message)).resolves.toMatchObject({ code: 'timeout' });
  await expect(session.execute(null)).resolves.toMatchObject({ code: 'malformed' });
  await expect(session.execute(null)).resolves.toMatchObject({ code: 'malformed' });
  expect(session.snapshot()).toMatchObject({ circuitOpen: true, consecutiveFailures: 3 });
  await expect(session.execute(null)).resolves.toMatchObject({ code: 'circuitOpen' });
});

it('records worker failures and generic preparation rejection', async () => {
  const message = await createMessage();
  const workerFailure = createEffectRuntimeBrokerSession({
    prepare: vi.fn().mockResolvedValue(createWorkerRequest()),
    workerFactory: () => new ErrorWorker(),
  });
  await expect(workerFailure.execute(message)).resolves.toMatchObject({ code: 'outputRejected' });
  expect(workerFailure.snapshot().consecutiveFailures).toBe(1);

  const preparationFailure = createEffectRuntimeBrokerSession({
    prepare: vi.fn().mockRejectedValue(new Error('decode')),
    workerFactory: () => new ReplyWorker(),
  });
  await expect(preparationFailure.execute(message)).resolves.toMatchObject({
    code: 'inputRejected',
  });
});

it('rejects requests beyond the active queue depth without cancelling active work', async () => {
  const message = await createMessage();
  const pending: Array<(request: EffectRuntimeWorkerMessage) => void> = [];
  const session = createEffectRuntimeBrokerSession({
    prepare: () => new Promise((resolve) => pending.push(resolve)),
    workerFactory: () => new ReplyWorker(),
  });
  const first = session.execute(message);
  const second = session.execute(message);
  await vi.waitFor(() => expect(pending).toHaveLength(2));

  await expect(session.execute(message)).resolves.toMatchObject({ code: 'queueDepthExceeded' });
  for (const resolve of pending) resolve(createWorkerRequest());
  await expect(Promise.all([first, second])).resolves.toEqual([
    expect.objectContaining({ kind: 'frame' }),
    expect.objectContaining({ kind: 'frame' }),
  ]);
});

it('rejects SVG clone amplification before constructing or messaging a worker', async () => {
  const message = await createSvgAmplificationMessage();
  const workerFactory = vi.fn(() => new ReplyWorker());
  const session = createEffectRuntimeBrokerSession({ workerFactory });

  await expect(session.execute(message)).resolves.toMatchObject({ code: 'inputRejected' });
  expect(workerFactory).not.toHaveBeenCalled();
});

async function createMessage(): Promise<EffectRuntimeRenderMessage> {
  const documentSource = JSON.stringify(createDocument([{ op: 'clear' }]));
  const documentSha256 = await sha256EffectV1Bytes(new TextEncoder().encode(documentSource));
  const assetSelectionId = await createEffectRuntimeAssetSelectionId([]);
  return {
    assetSelectionRef: { assets: [], id: assetSelectionId },
    controls: {},
    documentRef: { id: documentSha256, source: documentSource },
    duration: 2,
    effectInstanceId: 'instance',
    fps: 30,
    frameIndex: 30,
    height: 10,
    inputFrames: {},
    kind: 'renderFrame',
    progress: 0.5,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 10,
    renderWidth: 10,
    requestId: 'request',
    sequenceId: 1,
    snapshotId: `effect:${documentSha256}`,
    time: 1,
    width: 10,
  };
}

function createWorkerRequest(): EffectRuntimeWorkerMessage {
  const documentId = 'c'.repeat(64);
  return {
    assetSelectionRef: { assets: {}, id: 'd'.repeat(64) },
    controls: {},
    documentRef: { document: createDocument([{ op: 'clear' }]), id: documentId },
    duration: 2,
    effectInstanceId: 'instance',
    fps: 30,
    frameIndex: 30,
    height: 10,
    inputFrames: {},
    progress: 0.5,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 10,
    renderWidth: 10,
    requestId: 'request',
    sequenceId: 1,
    snapshotId: `effect:${documentId}`,
    time: 1,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    width: 10,
  };
}

async function createSvgAmplificationMessage(): Promise<EffectRuntimeRenderMessage> {
  const groupCount = 63;
  const source = `<svg viewBox="0 0 1 1" fill="#fff">${Array.from(
    { length: groupCount },
    (_, index) => `<g id="g${index}-${'x'.repeat(500)}">`
  ).join('')}${'<rect width="1" height="1"/>'.repeat(64)}${'</g>'.repeat(groupCount)}</svg>`;
  const bytes = new TextEncoder().encode(source);
  const document = createDocument([
    { assetId: 'svg', height: 1, op: 'svgParts', width: 1, x: 0, y: 0 },
  ]);
  const assetSha256 = await sha256EffectV1Bytes(bytes);
  document.assets = [
    {
      byteLength: bytes.byteLength,
      height: 1,
      id: 'svg',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      path: 'assets/svg.svg',
      sha256: assetSha256,
      width: 1,
    },
  ];
  const documentSource = JSON.stringify(document);
  const documentSha256 = await sha256EffectV1Bytes(new TextEncoder().encode(documentSource));
  const assetSelectionId = await createEffectRuntimeAssetSelectionId([
    { id: 'svg', sha256: assetSha256 },
  ]);
  return {
    ...(await createMessage()),
    assetSelectionRef: {
      assets: [
        {
          byteLength: bytes.byteLength,
          bytes: bytes.slice().buffer,
          id: 'svg',
          kind: 'svg',
          mimeType: 'image/svg+xml',
          sha256: assetSha256,
        },
      ],
      id: assetSelectionId,
    },
    documentRef: { id: documentSha256, source: documentSource },
    snapshotId: `effect:${documentSha256}`,
  };
}

it('rejects scene preparation before worker or document work on an unnegotiated connection', async () => {
  const workerFactory = vi.fn(() => new ReplyWorker());
  const session = createEffectRuntimeBrokerSession({ workerFactory });
  const result = await session.execute({ ...(await createMessage()), kind: 'prepareGpuFrame' });
  expect(result).toMatchObject({ kind: 'error', code: 'inputRejected' });
  expect(workerFactory).not.toHaveBeenCalled();
});

it.each([undefined, 'gpu-scene', 'gpu-scene-plan'] as const)(
  'preloads a worker only for GPU scene sessions (%s)',
  (compositionBackend) => {
    const worker = new ReplyWorker(),
      post = vi.spyOn(worker, 'postMessage');
    const workerFactory = vi.fn(() => worker);
    const session = createEffectRuntimeBrokerSession({
      workerFactory,
      ...(compositionBackend ? { compositionBackend } : {}),
    });
    expect(workerFactory).toHaveBeenCalledTimes(compositionBackend ? 1 : 0);
    expect(post).not.toHaveBeenCalled();
    expect(session.snapshot()).toEqual({
      activeRequests: 0,
      consecutiveFailures: 0,
      circuitOpen: false,
    });
  }
);

it('does not charge an idle GPU worker failure to request or failure admission', () => {
  const worker = new ReplyWorker();
  const session = createEffectRuntimeBrokerSession({
    compositionBackend: 'gpu-scene',
    workerFactory: () => worker,
  });
  worker.onmessageerror?.(new MessageEvent('messageerror'));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(session.snapshot()).toEqual({
    activeRequests: 0,
    consecutiveFailures: 0,
    circuitOpen: false,
  });
});

it('rejects bitmap commands on a plan-only connection before request admission', async () => {
  const worker = new ReplyWorker();
  const post = vi.spyOn(worker, 'postMessage');
  const prepare = vi.fn().mockResolvedValue(createWorkerRequest());
  const session = createEffectRuntimeBrokerSession({
    compositionBackend: 'gpu-scene-plan',
    prepare,
    workerFactory: () => worker,
  });
  const bitmap = new FakeBitmap(10, 10);
  const message = await createMessage();
  message.inputFrames = { source: { bitmap, width: 10, height: 10 } };
  await expect(session.execute(message)).resolves.toMatchObject({
    kind: 'error',
    code: 'inputRejected',
  });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(prepare).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  expect(session.snapshot()).toEqual({
    activeRequests: 0,
    consecutiveFailures: 0,
    circuitOpen: false,
  });
});

it('routes an oversized plan-only preparation through refusal without materialization', async () => {
  const bitmaps = Array.from({ length: 513 }, () => new FakeBitmap(1, 1));
  class PlanWorker extends ReplyWorker {
    override postMessage(): void {
      const request = createWorkerRequest();
      this.onmessage?.(
        new MessageEvent('message', {
          data: {
            type: EFFECT_RUNTIME_WORKER_RESPONSE,
            result: {
              kind: 'gpu-plan',
              effectInstanceId: request.effectInstanceId,
              requestId: request.requestId,
              sequenceId: request.sequenceId,
              snapshotId: request.snapshotId,
              acknowledged: {
                documentId: request.documentRef.id,
                assetSelectionId: request.assetSelectionRef.id,
              },
              width: 10,
              height: 10,
              logicalWidth: 10,
              logicalHeight: 10,
              rootPass: 0,
              inputResources: {},
              resources: bitmaps.map((bitmap, id) => ({
                id,
                bitmap,
                kind: 'primitive',
                width: 1,
                height: 1,
              })),
              passes: [
                {
                  id: 0,
                  width: 10,
                  height: 10,
                  logicalWidth: 10,
                  logicalHeight: 10,
                  operations: [],
                },
              ],
            },
          },
        })
      );
    }
  }
  const render = vi.fn(async () => new FakeBitmap(10, 10));
  const isAvailable = vi.fn(async () => true);
  const session = createEffectRuntimeBrokerSession({
    compositionBackend: 'gpu-scene-plan',
    workerFactory: () => new PlanWorker(),
    prepare: vi.fn().mockResolvedValue(createWorkerRequest()),
    gpu: { isAvailable, render, dispose: vi.fn() },
  });
  await expect(
    session.execute({ ...(await createMessage()), kind: 'prepareGpuFrame' })
  ).resolves.toMatchObject({ kind: 'error', code: 'resourceLimit' });
  expect(render).not.toHaveBeenCalled();
  expect(isAvailable).not.toHaveBeenCalled();
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
});
