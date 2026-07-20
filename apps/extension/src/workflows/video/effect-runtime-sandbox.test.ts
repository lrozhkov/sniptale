// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';
import { PendingEffectRuntimeRequest } from './effect-runtime-sandbox-request';
import { EffectRuntimeSandboxSessionManager } from './effect-runtime-sandbox-session';
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

it('fails closed and removes a sandbox iframe when its isolated page cannot load', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 1,
    requestTimeoutMs: 1,
  });

  const resultPromise = manager.renderFrame(createRequest());
  const iframe = document.querySelector('iframe');

  expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
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
