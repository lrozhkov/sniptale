import { afterEach, expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { createDocument, createPassContext } from './interpreter/support.test-support';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

class FakeCanvas {
  readonly context = createPassContext();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
  getContext() {
    return this.context;
  }
  transferToImageBitmap(): ImageBitmap {
    return new FakeBitmap(this.width, this.height);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('installs the worker boundary and returns a typed malformed response', async () => {
  vi.resetModules();
  const postMessage = vi.fn();
  const scope: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: typeof postMessage;
  } = { onmessage: null, postMessage };
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
  const scope: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: typeof postMessage;
  } = { onmessage: null, postMessage };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('ImageBitmap', FakeBitmap);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
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
      transferredBitmap = message.result.bitmap as FakeBitmap;
    }
    throw new Error('transfer failed');
  });
  const scope: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: typeof postMessage;
  } = { onmessage: null, postMessage };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('ImageBitmap', FakeBitmap);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  await import('./index');

  scope.onmessage?.(new MessageEvent('message', { data: createRequest() }));

  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(transferredBitmap?.close).toHaveBeenCalledOnce());
});

it('rejects unexpected message ports and disposes request-owned resources', async () => {
  vi.resetModules();
  const postMessage = vi.fn();
  const scope: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: typeof postMessage;
  } = { onmessage: null, postMessage };
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
  const scope: {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: typeof postMessage;
  } = { onmessage: null, postMessage };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('ImageBitmap', FakeBitmap);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
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
