import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_READY,
  EFFECT_RUNTIME_WORKER_REQUEST,
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { parseRuntimeAnimationDocument } from '../../contracts/effect-runtime/animation';

const initialization = vi.hoisted(() => ({
  preload: vi.fn<() => Promise<void>>(async () => undefined),
}));
vi.mock('./lottie', async (original) => ({
  ...(await original<typeof import('./lottie')>()),
  initializeLottieRuntime: () => initialization.preload(),
  createLottieFrameRenderer: async () => ({
    render: async ({ width, height }: { width: number; height: number }) =>
      new FakeBitmap(width, height),
    dispose: vi.fn(),
  }),
}));
beforeEach(() => initialization.preload.mockReset());

function workerScope(postFrame: (message: unknown, transfer: unknown) => void) {
  return {
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
    postMessage(message: { type: string }, transfer: unknown) {
      if (message.type === EFFECT_RUNTIME_WORKER_RESPONSE) postFrame(message, transfer);
    },
  };
}

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('installs the worker boundary and returns a typed malformed response', async () => {
  vi.resetModules();
  const postMessage = vi.fn();
  const scope = workerScope(postMessage);
  vi.stubGlobal('self', scope);

  await import('./index');
  expect(scope.onmessage).toBeTypeOf('function');
  scope.onmessage?.(new MessageEvent('message', { data: null }));
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ result: expect.objectContaining({ code: 'malformed' }) }),
    { transfer: [] }
  );
});

it('transfers a successful frame from the installed worker boundary', async () => {
  vi.resetModules();
  const postMessage = vi.fn();
  const scope = workerScope(postMessage);
  vi.stubGlobal('self', scope);
  vi.stubGlobal('ImageBitmap', FakeBitmap);
  await import('./index');

  scope.onmessage?.(new MessageEvent('message', { data: createRequest() }));

  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ result: expect.objectContaining({ kind: 'frame' }) }),
    { transfer: [expect.any(FakeBitmap)] }
  );
});

it('disposes a successful frame when the final worker transfer fails', async () => {
  vi.resetModules();
  let transferredBitmap: FakeBitmap | null = null;
  const postMessage = vi.fn((message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'result' in message &&
      typeof message.result === 'object' &&
      message.result !== null &&
      'bitmap' in message.result
    ) {
      if (message.result.bitmap instanceof FakeBitmap) transferredBitmap = message.result.bitmap;
    }
    throw new Error('transfer failed');
  });
  const scope = workerScope(postMessage);
  vi.stubGlobal('self', scope);
  vi.stubGlobal('ImageBitmap', FakeBitmap);
  await import('./index');

  scope.onmessage?.(new MessageEvent('message', { data: createRequest() }));

  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(transferredBitmap?.close).toHaveBeenCalledOnce());
});

it('rejects unexpected message ports and disposes request-owned resources', async () => {
  vi.resetModules();
  const postMessage = vi.fn();
  const scope = workerScope(postMessage);
  const bitmap = new FakeBitmap(10, 10);
  const channel = new MessageChannel();
  const close = vi.spyOn(channel.port2, 'close');
  vi.stubGlobal('self', scope);
  vi.stubGlobal('ImageBitmap', FakeBitmap);
  await import('./index');

  scope.onmessage?.(
    new MessageEvent('message', {
      data: { ...createRequest(), inputFrames: { source: { bitmap, height: 10, width: 10 } } },
      ports: [channel.port2],
    })
  );

  expect(close).toHaveBeenCalledOnce();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ result: expect.objectContaining({ code: 'malformed' }) }),
    { transfer: [] }
  );
  channel.port1.close();
});

it('rejects messages carrying a window origin', async () => {
  vi.resetModules();
  const postMessage = vi.fn();
  const scope = workerScope(postMessage);
  vi.stubGlobal('self', scope);
  vi.stubGlobal('ImageBitmap', FakeBitmap);
  await import('./index');

  scope.onmessage?.(
    new MessageEvent('message', {
      data: createRequest(),
      origin: 'https://attacker.invalid',
    })
  );

  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ result: expect.objectContaining({ code: 'malformed' }) }),
    { transfer: [] }
  );
});

function createRequest(): EffectRuntimeWorkerMessage {
  const documentId = 'c'.repeat(64);
  const document = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'worker-proof',
    label: { en: 'Worker proof' },
    controls: [],
    bindings: [],
    resources: [],
    animation: { v: '5.12.2', w: 10, h: 10, fr: 30, ip: 0, op: 60, layers: [], assets: [] },
  });
  if (!document) throw new Error('Invalid fixture.');
  return {
    assetSelectionRef: { assets: {}, id: 'd'.repeat(64) },
    controls: {},
    documentRef: { document, id: documentId },
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

it('installs guards after failed preload and returns a classified failure without an unhandled rejection', async () => {
  vi.resetModules();
  initialization.preload.mockRejectedValueOnce(new Error('WASM unavailable'));
  const postMessage = vi.fn();
  const scope = workerScope(postMessage);
  vi.stubGlobal('self', scope);
  await import('./index');
  await Promise.resolve();
  await Promise.resolve();
  expect(() => Reflect.get(scope, 'fetch')).toThrow('SNIPTALE_EFFECT_RUNTIME_API_DENIED');
  scope.onmessage?.(new MessageEvent('message', { data: createRequest() }));
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ result: expect.objectContaining({ code: 'crashed' }) }),
    { transfer: [] }
  );
});

it('announces readiness only after Lottie initialization and sandbox guards', async () => {
  vi.resetModules();
  let finish!: () => void;
  initialization.preload.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  const scope = { ...workerScope(vi.fn()), postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  await import('./index');
  expect(scope.postMessage).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() =>
    expect(scope.postMessage).toHaveBeenCalledWith(
      { type: EFFECT_RUNTIME_WORKER_READY, initialized: true },
      { transfer: [] }
    )
  );
  expect(() => Reflect.get(scope, 'fetch')).toThrow('SNIPTALE_EFFECT_RUNTIME_API_DENIED');
});
