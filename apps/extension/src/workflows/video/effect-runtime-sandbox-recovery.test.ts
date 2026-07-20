// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type {
  EffectRuntimeFrameResult,
  EffectRuntimeRenderCommand,
  EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';
import { EffectRuntimeSandboxSessionManager } from './effect-runtime-sandbox-session';
import {
  createSandboxInputBitmap,
  createSandboxRenderRequest,
  FakeImageBitmap,
  installSandboxResponder,
  installSynchronousMessageChannel,
} from './effect-runtime-sandbox.test-support';

const runtimeInfoGetUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: runtimeInfoGetUrlMock },
}));

function frameResponse(
  request: EffectRuntimeRenderMessage,
  bitmap = new FakeImageBitmap(request.renderWidth, request.renderHeight)
): EffectRuntimeFrameResult {
  return {
    acknowledged: {
      assetSelectionId: request.assetSelectionRef.id,
      documentId: request.documentRef.id,
    },
    bitmap,
    effectInstanceId: request.effectInstanceId,
    height: request.renderHeight,
    kind: 'frame',
    requestId: request.requestId,
    sequenceId: request.sequenceId,
    snapshotId: request.snapshotId,
    width: request.renderWidth,
  };
}

function failureResponse(
  request: EffectRuntimeRenderMessage,
  code: 'cacheMiss' | 'resourceLimit',
  missingRef?: 'assetSelection' | 'document'
): EffectRuntimeFrameResult {
  if (code === 'cacheMiss') {
    if (!missingRef) throw new Error('Expected a missing immutable reference');
    return {
      code,
      effectInstanceId: request.effectInstanceId,
      kind: 'error',
      missingRef,
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
    };
  }
  return {
    code,
    effectInstanceId: request.effectInstanceId,
    kind: 'error',
    requestId: request.requestId,
    sequenceId: request.sequenceId,
    snapshotId: request.snapshotId,
  };
}

function id(index: number): string {
  return index.toString(16).padStart(64, '0');
}

function commandWithRefs(index: number, bitmap?: ImageBitmap): EffectRuntimeRenderCommand {
  return {
    ...createSandboxRenderRequest(bitmap),
    assetSelectionRef: { id: id(index + 32) },
    documentRef: { id: id(index) },
    requestId: `request-${index}`,
  };
}

function installBitmapClone(): void {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn((bitmap: ImageBitmap) =>
      Promise.resolve(new FakeImageBitmap(bitmap.width, bitmap.height))
    )
  );
}

async function materializeImmutablePayloads() {
  return {
    assets: [
      {
        byteLength: 3,
        bytes: new Uint8Array([1, 2, 3]).buffer,
        id: 'asset',
        kind: 'image' as const,
        mimeType: 'image/png',
        sha256: id(48),
      },
    ],
    documentSource: '{}',
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  runtimeInfoGetUrlMock.mockReset().mockReturnValue('chrome-extension://test/sandbox.html');
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
  installSynchronousMessageChannel();
  installBitmapClone();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('replays inputs and fresh immutable bytes when only the document acknowledgement was evicted', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
  });
  const first = manager.renderFrame(commandWithRefs(0));
  const iframe = document.querySelector('iframe');
  if (!iframe?.contentWindow) throw new Error('Expected sandbox iframe');
  const requests: EffectRuntimeRenderMessage[] = [];
  const ports: MessagePort[] = [];
  installSandboxResponder(iframe, requests, ports, (request, index) => {
    if (index <= 9) return frameResponse(request);
    return index === 10
      ? failureResponse(request, 'cacheMiss', 'assetSelection')
      : failureResponse(request, 'resourceLimit');
  });
  iframe.dispatchEvent(new Event('load'));
  await first;
  for (let index = 1; index < 9; index += 1) await manager.renderFrame(commandWithRefs(index));

  const bitmap = createSandboxInputBitmap();
  const command = commandWithRefs(0, bitmap);
  const materialize = vi.fn(materializeImmutablePayloads);
  command.materializeImmutablePayloads = materialize;

  await expect(manager.renderFrame(command)).resolves.toMatchObject({ code: 'resourceLimit' });
  expect(requests[9]).toMatchObject({
    assetSelectionRef: { id: command.assetSelectionRef.id },
    documentRef: { id: command.documentRef.id, source: '{}' },
    inputFrames: { source: expect.any(Object) },
  });
  expect(requests[10]).toMatchObject({
    assetSelectionRef: { assets: [expect.objectContaining({ byteLength: 3 })] },
    documentRef: { source: '{}' },
    inputFrames: { source: expect.any(Object) },
  });
  expect(requests[10]!.inputFrames.source?.bitmap).not.toBe(bitmap);
  expect(materialize).toHaveBeenCalledTimes(2);
  manager.dispose();
  ports.forEach((port) => port.close());
});

it('replays inputs when only the asset acknowledgement remains missing', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
  });
  const first = manager.renderFrame(commandWithRefs(0));
  const iframe = document.querySelector('iframe');
  if (!iframe?.contentWindow) throw new Error('Expected sandbox iframe');
  const requests: EffectRuntimeRenderMessage[] = [];
  const ports: MessagePort[] = [];
  installSandboxResponder(iframe, requests, ports, (request, index) => {
    if (index === 1) return frameResponse(request);
    if (index === 2) return failureResponse(request, 'cacheMiss', 'assetSelection');
    if (index === 4) return failureResponse(request, 'cacheMiss', 'document');
    return failureResponse(request, 'resourceLimit');
  });
  iframe.dispatchEvent(new Event('load'));
  await first;
  await manager.renderFrame({ ...commandWithRefs(0), requestId: 'forget-asset' });

  const command = { ...commandWithRefs(0, createSandboxInputBitmap()), requestId: 'partial' };
  await expect(manager.renderFrame(command)).resolves.toMatchObject({ code: 'resourceLimit' });
  expect(requests[3]).toMatchObject({
    assetSelectionRef: { assets: [] },
    documentRef: { id: command.documentRef.id },
    inputFrames: { source: expect.any(Object) },
  });
  expect(requests[4]).toMatchObject({
    assetSelectionRef: { assets: [] },
    documentRef: { source: '{}' },
    inputFrames: { source: expect.any(Object) },
  });
  manager.dispose();
  ports.forEach((port) => port.close());
});

it('rejects and closes a late frame from a session cleared by another active request', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
  });
  const first = manager.renderFrame(commandWithRefs(0));
  const second = manager.renderFrame({ ...commandWithRefs(0), requestId: 'request-late' });
  const iframe = document.querySelector('iframe');
  if (!iframe?.contentWindow) throw new Error('Expected sandbox iframe');
  const requests: EffectRuntimeRenderMessage[] = [];
  const ports: MessagePort[] = [];
  let latePort: MessagePort | undefined;
  installSandboxResponder(iframe, requests, ports, (_request, index, responsePort) => {
    if (index === 1) return {};
    latePort = responsePort;
    return undefined;
  });
  iframe.dispatchEvent(new Event('load'));

  await expect(first).resolves.toMatchObject({ code: 'malformed' });
  const lateBitmap = new FakeImageBitmap(1280, 720);
  if (!latePort || !requests[1]) throw new Error('Expected a pending late response port');
  latePort.postMessage(frameResponse(requests[1], lateBitmap));
  await expect(second).resolves.toMatchObject({ code: 'stale' });
  expect(lateBitmap.close).toHaveBeenCalledOnce();
  manager.dispose();
  ports.forEach((port) => port.close());
});
