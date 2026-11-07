// @vitest-environment jsdom
import { createEffectRuntimeSandboxExecutor } from './effect-runtime-sandbox';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';
import { PendingEffectRuntimeRequest } from './effect-runtime-sandbox-request';
import { EffectRuntimeSandboxSessionManager } from './effect-runtime-sandbox-session';
import { readEffectRuntimeSandboxConnectionNonce } from '../../contracts/effect-runtime/sandbox-connection';
import {
  createSandboxInputBitmap as createInputBitmap,
  createSandboxRenderRequest as createRequest,
  createSandboxWireRequest as createWireRequest,
  FakeImageBitmap,
  installCacheRetryResponder,
  installSynchronousMessageChannel,
  respondWithResourceLimit,
} from './effect-runtime-sandbox.test-support';

const runtimeInfoGetUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: runtimeInfoGetUrlMock },
}));

beforeEach(() => {
  document.body.replaceChildren();
  runtimeInfoGetUrlMock.mockReset();
  runtimeInfoGetUrlMock.mockReturnValue('chrome-extension://test/effect-runtime-sandbox.html');
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('selects preview composition without changing sandbox or nonce authority', async () => {
  const input = createInputBitmap();
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-preview',
  });
  const pending = manager.renderFrame(createRequest(input));
  const iframe = document.querySelector('iframe');
  if (!iframe) throw new Error('Expected a sandbox iframe');
  const url = new URL(iframe.src);
  expect(url.searchParams.get('composition')).toBe('gpu-preview');
  expect(readEffectRuntimeSandboxConnectionNonce(url.hash)).not.toBeNull();
  expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
  manager.dispose();
  await expect(pending).resolves.toMatchObject({ kind: 'error', code: 'crashed' });
  expect(input.close).toHaveBeenCalledOnce();
});

it('fails closed and removes a sandbox iframe when its isolated page cannot load', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 1,
    requestTimeoutMs: 1,
  });

  const resultPromise = manager.renderFrame(createRequest());
  const iframe = document.querySelector('iframe');

  expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
  expect(new URL(iframe!.src).search).toBe('');
  await expect(resultPromise).resolves.toEqual(
    expect.objectContaining({ code: 'crashed', kind: 'error' })
  );
  expect(document.querySelector('iframe')).toBeNull();
  manager.dispose();
});

it('closes untransferred input bitmaps when rendering starts after disposal', async () => {
  const bitmap = createInputBitmap();
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
  });
  manager.dispose();

  await expect(manager.renderFrame(createRequest(bitmap))).resolves.toMatchObject({
    code: 'crashed',
    kind: 'error',
  });
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('closes untransferred input bitmaps when disposal cancels sandbox loading', async () => {
  const bitmap = createInputBitmap();
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
  });
  const result = manager.renderFrame(createRequest(bitmap));
  manager.dispose();

  await expect(result).resolves.toMatchObject({ code: 'crashed', kind: 'error' });
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('authenticates readiness and keeps one sandbox after a contained worker timeout', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
  });
  const firstResult = manager.renderFrame(createRequest());
  const iframe = document.querySelector('iframe');
  if (!iframe?.contentWindow) throw new Error('Expected a sandbox iframe window');
  const workerCodes = ['timeout', 'resourceLimit'] as const;
  let responseIndex = 0;
  const sandboxControlPorts: MessagePort[] = [];
  const connect = vi.spyOn(iframe.contentWindow, 'postMessage');
  connect.mockImplementation((message: unknown, options?: WindowPostMessageOptions) => {
    const connection = message as { connectionNonce: string };
    const sandboxControlPort = options?.transfer?.[0] as MessagePort;
    sandboxControlPorts.push(sandboxControlPort);
    sandboxControlPort.onmessage = (event) => {
      const responsePort = event.ports[0];
      const envelope = event.data as { request: EffectRuntimeRenderMessage };
      responsePort?.postMessage({
        code: workerCodes[responseIndex++],
        effectInstanceId: envelope.request.effectInstanceId,
        kind: 'error',
        requestId: envelope.request.requestId,
        sequenceId: envelope.request.sequenceId,
        snapshotId: envelope.request.snapshotId,
      });
    };
    sandboxControlPort.start();
    sandboxControlPort.postMessage({
      connectionNonce: connection.connectionNonce,
      type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
    });
  });
  iframe.dispatchEvent(new Event('load'));

  await expect(firstResult).resolves.toMatchObject({ code: 'timeout', kind: 'error' });
  await expect(
    manager.renderFrame({ ...createRequest(), requestId: 'request-2' })
  ).resolves.toEqual(expect.objectContaining({ code: 'resourceLimit', kind: 'error' }));
  expect(document.querySelector('iframe')).toBe(iframe);
  expect(connect).toHaveBeenCalledOnce();
  manager.dispose();
  for (const port of sandboxControlPorts) port.close();
});

it('retries one acknowledged-ref cache miss once with both immutable payloads', async () => {
  installSynchronousMessageChannel();
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
  });
  const firstCommand = createRequest();
  const firstResult = manager.renderFrame(firstCommand);
  const iframe = document.querySelector('iframe');
  if (!iframe?.contentWindow) throw new Error('Expected a sandbox iframe window');
  const requests: EffectRuntimeRenderMessage[] = [];
  const ports: MessagePort[] = [];
  installCacheRetryResponder(iframe, requests, ports);
  iframe.dispatchEvent(new Event('load'));
  await expect(firstResult).resolves.toMatchObject({ kind: 'frame' });

  const command = { ...createRequest(), requestId: 'request-2' };
  const materialize = vi.fn(command.materializeImmutablePayloads);
  command.materializeImmutablePayloads = materialize;
  const result = manager.renderFrame(command);
  await expect(result).resolves.toMatchObject({ code: 'resourceLimit' });
  expect(requests).toHaveLength(3);
  expect(requests[1]!.documentRef).toEqual({ id: command.documentRef.id });
  expect(requests[1]!.assetSelectionRef).toEqual({ id: command.assetSelectionRef.id });
  expect(requests[2]!.documentRef).toEqual({ id: command.documentRef.id, source: '{}' });
  expect(requests[2]!.assetSelectionRef).toEqual({
    assets: [],
    id: command.assetSelectionRef.id,
  });
  expect(materialize).toHaveBeenCalledOnce();
  manager.dispose();
  for (const port of ports) port.close();
});

it('accepts only an identity-bound response on the per-request message port', async () => {
  const controlChannel = new MessageChannel();
  const active = new Set<PendingEffectRuntimeRequest>();
  const clearSession = vi.fn();
  controlChannel.port2.onmessage = (event) => respondWithResourceLimit(event);
  controlChannel.port2.start();
  const pending = new PendingEffectRuntimeRequest({
    active,
    clearSession,
    current: { controlPort: controlChannel.port1 },
    request: createWireRequest(),
    timeoutMs: 100,
  });

  await expect(pending.start()).resolves.toEqual({
    code: 'resourceLimit',
    effectInstanceId: 'instance-1',
    kind: 'error',
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: 'effect:snapshot',
  });
  expect(active.size).toBe(0);
  expect(clearSession).not.toHaveBeenCalled();
  controlChannel.port1.close();
  controlChannel.port2.close();
});

it.each(['renderFrame', 'prepareGpuFrame'] as const)(
  'admits a parent GPU plan only for %s negotiation',
  async (kind) => {
    installSynchronousMessageChannel();
    const channel = new MessageChannel(),
      request = { ...createWireRequest(), kind };
    const bitmap = new FakeImageBitmap(8, 8);
    channel.port2.onmessage = (event) => {
      event.ports[0]!.postMessage({
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
        resources: [{ id: 0, kind: 'primitive', bitmap, width: 8, height: 8 }],
        inputResources: {},
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
      });
    };
    const pending = new PendingEffectRuntimeRequest({
      active: new Set(),
      clearSession: vi.fn(),
      current: { controlPort: channel.port1 },
      request,
      timeoutMs: 100,
    });
    const result = await pending.start();
    if (kind === 'prepareGpuFrame') {
      expect(result.kind).toBe('gpu-plan');
      expect(bitmap.close).not.toHaveBeenCalled();
      bitmap.close();
    } else {
      expect(result).toMatchObject({ kind: 'error', code: 'malformed' });
      expect(bitmap.close).toHaveBeenCalledOnce();
    }
    channel.port1.close();
    channel.port2.close();
  }
);

it('rejects GPU preparation before creating an unnegotiated parent session', async () => {
  const bitmap = createInputBitmap(),
    manager = new EffectRuntimeSandboxSessionManager(document, {
      loadTimeoutMs: 100,
      requestTimeoutMs: 100,
    });
  await expect(manager.prepareGpuFrame(createRequest(bitmap))).resolves.toMatchObject({
    kind: 'error',
    code: 'inputRejected',
  });
  expect(document.querySelector('iframe')).toBeNull();
  expect(bitmap.close).toHaveBeenCalledOnce();
  manager.dispose();
});

it.each([undefined, 'gpu-preview', 'gpu-scene'] as const)(
  'advertises independent preparation only for negotiated gpu-scene (%s)',
  (compositionBackend) => {
    const executor = createEffectRuntimeSandboxExecutor(
      compositionBackend ? { compositionBackend } : {}
    );
    expect(executor.maximumGpuFramesInFlight).toBe(
      compositionBackend === 'gpu-scene' ? 2 : undefined
    );
    expect(typeof executor.prepareGpuFrame).toBe(
      compositionBackend === 'gpu-scene' ? 'function' : 'undefined'
    );
    executor.dispose();
  }
);

it.each([undefined, 'gpu-preview', 'gpu-scene'] as const)(
  'preloads only the GPU scene transport without a frame request (%s)',
  async (compositionBackend) => {
    const executor = createEffectRuntimeSandboxExecutor(
      compositionBackend ? { compositionBackend } : {}
    );
    expect(document.querySelectorAll('iframe')).toHaveLength(
      compositionBackend === 'gpu-scene' ? 1 : 0
    );
    executor.dispose();
    await Promise.resolve();
    expect(document.querySelector('iframe')).toBeNull();
  }
);

it('reuses preloaded transport and retries failed preload without recreating after disposal', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-scene',
  });
  manager.preload();
  const first = document.querySelector('iframe')!;
  first.dispatchEvent(new Event('error'));
  await Promise.resolve();
  expect(document.querySelector('iframe')).toBeNull();
  const request = manager.prepareGpuFrame(createRequest());
  const replacement = document.querySelector('iframe');
  expect(replacement).not.toBe(first);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(document.querySelector('iframe')).toBe(replacement);
  manager.dispose();
  await expect(request).resolves.toMatchObject({ kind: 'error', code: 'crashed' });
  manager.preload();
  expect(document.querySelector('iframe')).toBeNull();
});

it('authenticates a preloaded transport without posting a frame until requested', async () => {
  installSynchronousMessageChannel();
  const executor = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  const iframe = document.querySelector('iframe')!;
  const requests: EffectRuntimeRenderMessage[] = [],
    ports: MessagePort[] = [];
  installCacheRetryResponder(iframe, requests, ports);
  iframe.dispatchEvent(new Event('load'));
  await Promise.resolve();
  expect(requests).toEqual([]);
  await expect(executor.renderFrame(createRequest())).resolves.toMatchObject({ kind: 'frame' });
  expect(document.querySelector('iframe')).toBe(iframe);
  expect(requests).toHaveLength(1);
  executor.dispose();
  for (const port of ports) port.close();
});
