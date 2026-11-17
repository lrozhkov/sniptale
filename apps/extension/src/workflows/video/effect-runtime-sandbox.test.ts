// @vitest-environment jsdom
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import type {
  EffectRuntimeFrameFailure,
  EffectRuntimeRenderCommand,
} from '../../contracts/effect-runtime/types';
import { EffectRuntimeFrameError } from '../../features/video/composition/effect-runtime/runtime/frame-error';
import { createReviewExportDiagnostics } from '../video-review/export-diagnostics';
import { createEffectRuntimeSandboxExecutor } from './effect-runtime-sandbox';
import * as sandboxRender from './effect-runtime-sandbox-render';

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
  installSandboxResponder,
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
    expect.objectContaining({ code: 'circuitOpen', kind: 'error' })
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

it.each([undefined, 'gpu-preview', 'gpu-scene', 'gpu-scene-plan'] as const)(
  'advertises independent preparation only for negotiated gpu-scene (%s)',
  (compositionBackend) => {
    const executor = createEffectRuntimeSandboxExecutor(
      compositionBackend ? { compositionBackend } : {}
    );
    expect(executor.maximumGpuFramesInFlight).toBe(
      compositionBackend === 'gpu-scene' || compositionBackend === 'gpu-scene-plan' ? 2 : undefined
    );
    expect(typeof executor.prepareGpuFrame).toBe(
      compositionBackend === 'gpu-scene' || compositionBackend === 'gpu-scene-plan'
        ? 'function'
        : 'undefined'
    );
    expect(executor.gpuFrameReuseContext !== undefined).toBe(
      compositionBackend === 'gpu-scene' || compositionBackend === 'gpu-scene-plan'
    );
    executor.dispose();
    expect(executor.gpuFrameReuseContext).toBeUndefined();
  }
);

it.each([undefined, 'gpu-preview', 'gpu-scene', 'gpu-scene-plan'] as const)(
  'preloads only the GPU scene transport without a frame request (%s)',
  async (compositionBackend) => {
    const executor = createEffectRuntimeSandboxExecutor(
      compositionBackend ? { compositionBackend } : {}
    );
    expect(document.querySelectorAll('iframe')).toHaveLength(
      compositionBackend === 'gpu-scene' || compositionBackend === 'gpu-scene-plan' ? 1 : 0
    );
    expect(typeof executor.preload).toBe(
      compositionBackend === 'gpu-scene' || compositionBackend === 'gpu-scene-plan'
        ? 'function'
        : 'undefined'
    );
    executor.dispose();
    await Promise.resolve();
    expect(document.querySelector('iframe')).toBeNull();
  }
);

it('retains failed preload for the manager lifetime without recreating after disposal', async () => {
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
  await expect(manager.prepareGpuFrame(createRequest())).resolves.toMatchObject({
    code: 'circuitOpen',
  });
  manager.preload();
  await expect(manager.prepareGpuFrame(createRequest())).resolves.toMatchObject({
    code: 'circuitOpen',
  });
  expect(document.querySelector('iframe')).toBeNull();
  manager.dispose();
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

it('keeps plan-only parent requests on the negotiated path and refuses bitmap requests', async () => {
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-scene-plan',
  });
  const input = createInputBitmap();
  await expect(manager.renderFrame(createRequest(input))).resolves.toMatchObject({
    kind: 'error',
    code: 'inputRejected',
  });
  expect(input.close).toHaveBeenCalledOnce();
  expect(document.querySelector('iframe')).toBeNull();
  const preparation = manager.prepareGpuFrame(createRequest());
  const iframe = document.querySelector('iframe')!;
  expect(new URL(iframe.src).searchParams.get('composition')).toBe('gpu-scene-plan');
  manager.dispose();
  await expect(preparation).resolves.toMatchObject({ kind: 'error', code: 'crashed' });
});

it('rejects a checked bitmap fallback returned to the plan-only parent', async () => {
  const request = createRequest();
  const bitmap = createInputBitmap();
  const rendered = vi
    .spyOn(sandboxRender, 'renderEffectRuntimeSandboxFrame')
    .mockResolvedValueOnce({
      kind: 'frame',
      bitmap,
      width: 1280,
      height: 720,
      effectInstanceId: request.effectInstanceId,
      requestId: request.requestId,
      snapshotId: request.snapshotId,
      sequenceId: request.sequenceId,
      acknowledged: {
        documentId: request.documentRef.id,
        assetSelectionId: request.assetSelectionRef.id,
      },
    });
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-scene-plan',
  });
  try {
    await expect(manager.prepareGpuFrame(request)).resolves.toMatchObject({
      kind: 'error',
      code: 'outputRejected',
    });
    expect(rendered).toHaveBeenCalledWith(expect.any(Object), request, 'prepareGpuFrame');
    expect(bitmap.close).toHaveBeenCalledOnce();
  } finally {
    manager.dispose();
    rendered.mockRestore();
  }
});

it('requires a new executor after transport startup refusal and retains recovered readiness', async () => {
  installSynchronousMessageChannel();
  const executor = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
  const first = document.querySelector('iframe')!;
  const ports: MessagePort[] = [];
  try {
    executor.preload!();
    expect(document.querySelector('iframe')).toBe(first);
    first.dispatchEvent(new Event('error'));
    await Promise.resolve();
    expect(document.querySelector('iframe')).toBeNull();
    executor.preload!();
    expect(document.querySelector('iframe')).toBeNull();
    await expect(executor.prepareGpuFrame!(createRequest())).resolves.toMatchObject({
      code: 'circuitOpen',
    });
    executor.dispose();
    const recovered = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-scene' });
    const replacement = document.querySelector('iframe')!;
    expect(replacement).not.toBe(first);
    const requests: EffectRuntimeRenderMessage[] = [];
    installCacheRetryResponder(replacement, requests, ports);
    replacement.dispatchEvent(new Event('load'));
    await Promise.resolve();
    recovered.preload!();
    expect(document.querySelector('iframe')).toBe(replacement);
    expect(requests).toEqual([]);
    const prepared = recovered.renderFrame(createRequest());
    await expect(prepared).resolves.toMatchObject({ kind: 'frame' });
    recovered.dispose();
    executor.preload!();
    expect(document.querySelector('iframe')).toBeNull();
  } finally {
    executor.dispose();
    for (const port of ports) port.close();
  }
});

it('retains a broker startup refusal without replacing its iframe on later frames', async () => {
  installSynchronousMessageChannel();
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-scene',
  });
  manager.preload();
  const iframe = document.querySelector('iframe')!;
  const requests: EffectRuntimeRenderMessage[] = [];
  const ports: MessagePort[] = [];
  let firstReply = true;
  installSandboxResponder(iframe, requests, ports, (request) => {
    const failure = createEffectRuntimeFailure(request, 'circuitOpen');
    if (!firstReply) return failure;
    firstReply = false;
    return { ...failure, startupFailureCode: 'crashed' };
  });
  iframe.dispatchEvent(new Event('load'));
  try {
    const initial = await manager.renderFrame(createRequest());
    expect(initial).toMatchObject({ code: 'circuitOpen', startupFailureCode: 'crashed' });
    if (initial.kind !== 'error') throw new Error('Expected a broker startup refusal');
    const sink = vi.fn();
    const diagnostics = createReviewExportDiagnostics(
      { destination: 'preview', route: 'render' },
      sink
    );
    diagnostics.reportFailure(EffectRuntimeFrameError.fromFailure(initial), 'compose');
    manager.preload();
    const later = await manager.renderFrame(createRequest());
    expect(later).toMatchObject({
      code: 'circuitOpen',
    });
    expect(later).not.toHaveProperty('startupFailureCode');
    if (later.kind !== 'error') throw new Error('Expected the circuit to stay open');
    diagnostics.reportFailure(EffectRuntimeFrameError.fromFailure(later), 'compose');
    expect(sink).toHaveBeenCalledExactlyOnceWith(
      'preview outcome=failed route=render destination=preview stage=compose code=compose-failed effectCode=crashed'
    );
    expect(requests).toHaveLength(2);
    expect(document.querySelector('iframe')).toBe(iframe);
  } finally {
    manager.dispose();
    for (const port of ports) port.close();
  }
});

function controlledSessionAdmission() {
  const started: {
    command: EffectRuntimeRenderCommand;
    response: ReturnType<typeof Promise.withResolvers<EffectRuntimeFrameFailure>>;
    authority: sandboxRender.EffectRuntimeSandboxRenderAuthority;
  }[] = [];
  const render = vi
    .spyOn(sandboxRender, 'renderEffectRuntimeSandboxFrame')
    .mockImplementation(async (authority, command) => {
      const response = Promise.withResolvers<EffectRuntimeFrameFailure>();
      started.push({ command, response, authority });
      return response.promise;
    });
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 1000,
    requestTimeoutMs: 1000,
    compositionBackend: 'gpu-scene',
  });
  const bitmaps = Array.from({ length: 5 }, () => createInputBitmap());
  const commands = bitmaps.map((bitmap, index) => ({
    ...createRequest(bitmap),
    requestId: 'admission-' + index,
  }));
  const complete = (index: number) => {
    const request = started[index];
    if (!request) throw new Error('Expected admitted request');
    closeEffectRuntimeBitmaps(request.command.inputFrames);
    request.response.resolve(createEffectRuntimeFailure(request.command, 'inputRejected'));
  };
  const cleanup = () => {
    manager.dispose();
    for (const request of started)
      request.response.resolve(createEffectRuntimeFailure(request.command, 'crashed'));
    render.mockRestore();
  };
  return { manager, started, commands, bitmaps, complete, cleanup };
}

it('shares two active and two waiting slots across frame and GPU requests', async () => {
  const f = controlledSessionAdmission();
  const pending = [
    f.manager.renderFrame(f.commands[0]!),
    f.manager.prepareGpuFrame(f.commands[1]!),
    f.manager.renderFrame(f.commands[2]!),
    f.manager.prepareGpuFrame(f.commands[3]!),
  ];
  try {
    expect(f.started).toHaveLength(2);
    expect(await f.manager.prepareGpuFrame(f.commands[4]!)).toMatchObject({
      kind: 'error',
      code: 'queueDepthExceeded',
    });
    expect(f.bitmaps[4]!.close).toHaveBeenCalledOnce();
    f.complete(1);
    await vi.waitFor(() => expect(f.started).toHaveLength(3));
    expect(f.started[2]!.command).toBe(f.commands[2]);
    f.complete(0);
    await vi.waitFor(() => expect(f.started).toHaveLength(4));
    expect(f.started[3]!.command).toBe(f.commands[3]);
    f.complete(3);
    f.complete(2);
    await Promise.all(pending);
    for (const bitmap of f.bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  } finally {
    f.cleanup();
    await Promise.all(pending);
  }
});

it.each(['abort', 'preaborted', 'dispose', 'reset'] as const)(
  'refuses unsent inputs after %s without transferring them',
  async (operation) => {
    const f = controlledSessionAdmission();
    const controller = new AbortController();
    const active = [
      f.manager.prepareGpuFrame(f.commands[0]!),
      f.manager.prepareGpuFrame(f.commands[1]!),
    ];
    if (operation === 'preaborted') controller.abort();
    const waiting = f.manager.prepareGpuFrame(f.commands[2]!, controller.signal);
    try {
      expect(f.started).toHaveLength(2);
      if (operation === 'abort') controller.abort();
      else if (operation === 'dispose') f.manager.dispose();
      else if (operation === 'reset') {
        const authority = f.started[0]!.authority;
        authority.clearSession(authority.ensureSession());
      }
      await expect(waiting).resolves.toMatchObject({ kind: 'error' });
      expect(f.bitmaps[2]!.close).toHaveBeenCalledOnce();
      expect(f.started).toHaveLength(2);
      f.complete(0);
      f.complete(1);
      await Promise.all(active);
      expect(f.started).toHaveLength(2);
    } finally {
      f.cleanup();
      await Promise.all([...active, waiting]);
    }
  }
);

it.each(['timeout', 'malformed'] as const)(
  'settles both retired reply owners while preserving the initiating %s',
  async (failure) => {
    vi.useFakeTimers();
    installSynchronousMessageChannel();
    const Channel = MessageChannel;
    const channels: MessageChannel[] = [];
    vi.stubGlobal(
      'MessageChannel',
      class extends Channel {
        constructor() {
          super();
          channels.push(this);
        }
      }
    );
    const f = controlledSessionAdmission();
    const first = f.manager.prepareGpuFrame(f.commands[0]!);
    const second = f.manager.prepareGpuFrame(f.commands[1]!);
    const waiting = f.manager.prepareGpuFrame(f.commands[2]!);
    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    try {
      const authority = f.started[0]!.authority;
      const session = authority.ensureSession();
      const control = new MessageChannel();
      session.controlPort = control.port1;
      const requests = [0, 1].map(
        (index) =>
          new PendingEffectRuntimeRequest({
            active: authority.active,
            clearSession: () => authority.clearSession(session),
            current: session,
            request: { ...createWireRequest(), requestId: f.commands[index]!.requestId },
            timeoutMs: index === 0 ? 10 : 1000,
          })
      );
      for (const [index, request] of requests.entries())
        void request.start().then((result) => {
          if (result.kind !== 'error' || result.code === 'cacheMiss')
            throw new Error('Expected controlled retirement failure');
          f.started[index]!.response.resolve(result);
        });
      if (failure === 'malformed') {
        const reply = channels[1]!.port1;
        reply.onmessageerror?.call(reply, new MessageEvent('messageerror'));
        await vi.advanceTimersByTimeAsync(0);
      } else await vi.advanceTimersByTimeAsync(10);
      expect(secondSettled).toBe(true);
      await expect(first).resolves.toMatchObject({ kind: 'error', code: failure });
      await expect(second).resolves.toMatchObject({ kind: 'error', code: 'crashed' });
      await expect(waiting).resolves.toMatchObject({ kind: 'error', code: 'crashed' });
      expect(f.started).toHaveLength(2);
      expect(f.bitmaps[2]!.close).toHaveBeenCalledOnce();
      expect(authority.active.size).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(authority.active.size).toBe(0);
    } finally {
      f.complete(0);
      f.complete(1);
      f.cleanup();
      await Promise.all([first, second, waiting]);
      vi.useRealTimers();
    }
  }
);

it('retires reusable contents on runtime failure while client cancellation preserves the generation', async () => {
  const request = createRequest();
  const rendered = vi
    .spyOn(sandboxRender, 'renderEffectRuntimeSandboxFrame')
    .mockResolvedValueOnce(createEffectRuntimeFailure(request, 'resourceLimit'));
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-scene',
  });
  try {
    const initial = manager.gpuFrameReuseContext;
    await expect(manager.prepareGpuFrame(request)).resolves.toMatchObject({
      code: 'resourceLimit',
    });
    const recovered = manager.gpuFrameReuseContext;
    expect(recovered).not.toBe(initial);
    const controller = new AbortController();
    controller.abort();
    await expect(
      manager.prepareGpuFrame(createRequest(), controller.signal)
    ).resolves.toMatchObject({ code: 'stale' });
    expect(manager.gpuFrameReuseContext).toBe(recovered);
    manager.dispose();
    expect(manager.gpuFrameReuseContext).toBeUndefined();
  } finally {
    manager.dispose();
    rendered.mockRestore();
  }
});

it('keeps a pure foreground reuse token through the actual completed standby handoff', async () => {
  const rendered = vi
    .spyOn(sandboxRender, 'renderEffectRuntimeSandboxFrame')
    .mockImplementation(async (_authority, request) => {
      const bitmap = createInputBitmap();
      return {
        kind: 'frame',
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        effectInstanceId: request.effectInstanceId,
        requestId: request.requestId,
        snapshotId: request.snapshotId,
        sequenceId: request.sequenceId,
        acknowledged: {
          documentId: request.documentRef.id,
          assetSelectionId: request.assetSelectionRef.id,
        },
      };
    });
  const primary = createEffectRuntimeSandboxExecutor({
    compositionBackend: 'gpu-scene',
    timeoutMs: 100,
  });
  try {
    const before = primary.gpuFrameReuseContext;
    const warm = primary.createWarmExecutor!();
    if (!warm) throw new Error('Reading the context must not consume foreground admission.');
    const first = await warm.prepareGpuFrame!(createRequest());
    if (first.kind === 'frame') first.bitmap.close();
    warm.dispose();
    const next = await primary.prepareGpuFrame!(createRequest());
    if (next.kind === 'frame') next.bitmap.close();
    expect(next.kind).toBe('frame');
    expect(primary.gpuFrameReuseContext).toBe(before);
    primary.dispose();
    expect(primary.gpuFrameReuseContext).toBeUndefined();
  } finally {
    primary.dispose();
    rendered.mockRestore();
  }
});

it('retries a speculative preload timeout on first demand without retrying a demanded timeout', async () => {
  vi.useFakeTimers();
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-scene',
  });
  try {
    manager.preload();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector('iframe')).toBeNull();
    manager.preload();
    expect(document.querySelector('iframe')).toBeNull();
    const pending = manager.prepareGpuFrame(createRequest());
    expect(document.querySelector('iframe')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({ kind: 'error', code: 'circuitOpen' });
    await expect(manager.prepareGpuFrame(createRequest())).resolves.toMatchObject({
      kind: 'error',
      code: 'circuitOpen',
    });
    expect(document.querySelector('iframe')).toBeNull();
    manager.dispose();
    manager.preload();
    expect(document.querySelector('iframe')).toBeNull();
  } finally {
    manager.dispose();
    vi.useRealTimers();
  }
});

it('authenticates the replacement after a speculative preload timeout before posting a frame', async () => {
  vi.useFakeTimers();
  installSynchronousMessageChannel();
  const manager = new EffectRuntimeSandboxSessionManager(document, {
    loadTimeoutMs: 100,
    requestTimeoutMs: 100,
    compositionBackend: 'gpu-scene',
  });
  const ports: MessagePort[] = [];
  try {
    manager.preload();
    await vi.advanceTimersByTimeAsync(100);
    const pending = manager.renderFrame(createRequest());
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const requests: EffectRuntimeRenderMessage[] = [];
    installCacheRetryResponder(iframe!, requests, ports);
    expect(requests).toEqual([]);
    iframe!.dispatchEvent(new Event('load'));
    await expect(pending).resolves.toMatchObject({ kind: 'frame' });
    expect(requests).toHaveLength(1);
  } finally {
    manager.dispose();
    for (const port of ports) port.close();
    vi.useRealTimers();
  }
});
