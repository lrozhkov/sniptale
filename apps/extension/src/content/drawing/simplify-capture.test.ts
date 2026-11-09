// @vitest-environment jsdom
import * as trustedEvents from '../platform/trusted-events';
import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingSession, type DrawingSimplifySource } from '../../features/drawing/public';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
import { createContentSimplifyRuntime, createContentSimplifyDependencies } from './simplify';
import { createContentRuntimeServices } from '../application/runtime-services/services';
import { createRuntimeMessagingTransport } from '../../platform/runtime-messaging';
import type { SimplifyComputeRequest } from '../../workflows/simplify/compute-client';

function png(width = 100, height = 100) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
vi.mock('../selection/locker', () => ({
  setUIHidden: (hidden: boolean) =>
    document.body.classList.toggle('sniptale-capture-ui-hidden', hidden),
}));
vi.mock('../platform/dom-host', async (original) => ({
  ...(await original<typeof import('../platform/dom-host')>()),
  queryAllContentUiElements: (selector: string) => [...document.querySelectorAll(selector)],
  resolveContentShadowRoot: () => null,
}));
afterEach(() => {
  document.body.replaceChildren();
  document.body.classList.remove('sniptale-capture-ui-hidden');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function captureHarness(bounds = { x: 0, y: 0, width: 100, height: 100 }) {
  const complete = deferred<unknown>();
  const send = vi.fn(() => complete.promise);
  const services = createContentRuntimeServices({
    messaging: createRuntimeMessagingTransport({
      runtimeSendMessage: send,
      tabSendMessage: async () => undefined,
    }),
  });
  const trusted = vi
    .spyOn(services.contentActionIntent, 'createTrustedContentActionIntentSource')
    .mockReturnValue({ kind: 'trusted-content-event' });
  const attach = vi
    .spyOn(services.contentActionIntent, 'attachContentActionIntent')
    .mockImplementation(async (message) => message);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  });
  const overlay = document.createElement('div');
  overlay.className = 'sniptale-selection-final-overlay';
  overlay.style.visibility = 'visible';
  document.body.append(overlay);
  const runtime = createContentSimplifyDependencies({
    services,
    getBounds: () => bounds,
  });
  return { complete, send, trusted, attach, overlay, runtime, services };
}
it('captures with fresh trusted intent, excludes transient crop chrome, and restores on failure', async () => {
  const h = captureHarness();
  const event = new Event('pointerup');
  const acquisition = h.runtime.acquire(event);
  const failure = expect(acquisition).rejects.toThrow('Capture failed');
  await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
  expect(h.trusted).toHaveBeenCalledWith(event);
  expect(h.attach).toHaveBeenCalledWith(
    { type: 'CAPTURE_VISIBLE_FOR_CROP' },
    { kind: 'trusted-content-event' }
  );
  expect(h.overlay.style.getPropertyValue('visibility')).toBe('hidden');
  expect(document.body.classList.contains('sniptale-capture-ui-hidden')).toBe(true);
  h.complete.reject(new Error('Capture failed'));
  await failure;
  expect(h.overlay.style.visibility).toBe('visible');
  expect(document.body.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
});
it('restores capture chrome promptly after cancellation and preserves owner style changes', async () => {
  const h = captureHarness();
  const abort = new AbortController();
  const acquisition = h.runtime.acquire(new Event('pointerup'), abort.signal);
  const failure = expect(acquisition).rejects.toBeDefined();
  await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
  h.overlay.style.visibility = 'collapse';
  abort.abort();
  await failure;
  expect(h.overlay.style.visibility).toBe('collapse');
  expect(document.body.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
  h.complete.resolve({ success: true, ...png() });
});
it('waits for the underlying native capture after its caller aborts', async () => {
  const h = captureHarness();
  const abort = new AbortController();
  const first = h.runtime.acquire(new Event('pointerdown'), abort.signal);
  const rejected = expect(first).rejects.toBeDefined();
  await vi.waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
  abort.abort();
  await rejected;
  const second = h.runtime.acquire(new Event('pointerdown'));
  await vi.waitFor(() => expect(h.attach).toHaveBeenCalledTimes(2));
  await Promise.resolve();
  await Promise.resolve();
  expect(h.send).toHaveBeenCalledTimes(1);
  h.complete.resolve({ success: true, dataUrl: png().dataUrl });
  await second;
  expect(h.send).toHaveBeenCalledTimes(2);
});
it('reuses a frozen source without requesting capture or changing chrome', async () => {
  const h = captureHarness();
  const source: DrawingSimplifySource = {
    ...png(),
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
  const runtime = createContentSimplifyDependencies({
    services: h.services,
    getBounds: () => source.bounds,
    getRetainedSource: () => source,
  });
  expect(await runtime.acquire(new Event('pointerup'))).toBe(source);
  expect(h.trusted).not.toHaveBeenCalled();
  expect(h.send).not.toHaveBeenCalled();
  expect(h.overlay.style.visibility).toBe('visible');
});

it('refuses an untrusted acquisition without capturing or mutating chrome', async () => {
  const h = captureHarness();
  h.trusted.mockReturnValue(null);
  await expect(h.runtime.acquire(new Event('pointerup'))).rejects.toThrow('trusted gesture');
  expect(h.attach).not.toHaveBeenCalled();
  expect(h.send).not.toHaveBeenCalled();
  expect(h.overlay.style.visibility).toBe('visible');
});

it('reads an injected local viewport raster without native authority or chrome mutation', async () => {
  const h = captureHarness();
  vi.spyOn(trustedEvents, 'isTrustedPointerEvent').mockReturnValue(true);
  const image = png();
  const local = vi.fn(async () => image.dataUrl);
  const bounds = { x: 40, y: 60, width: 100, height: 100 };
  const runtime = createContentSimplifyDependencies({
    services: h.services,
    getBounds: () => bounds,
    captureViewport: local,
  });
  expect(await runtime.acquire(new Event('pointerup'))).toEqual({ ...image, bounds });
  expect(local).toHaveBeenCalledOnce();
  expect(h.trusted).not.toHaveBeenCalled();
  expect(h.attach).not.toHaveBeenCalled();
  expect(h.send).not.toHaveBeenCalled();
  expect(h.overlay.style.visibility).toBe('visible');
});

it.each([1, 1.25, 2])(
  'maps a native raster through browser DPR/zoom=%s independently of its CSS viewport extent',
  async (scale) => {
    const h = captureHarness();
    vi.stubGlobal('devicePixelRatio', scale);
    const acquisition = h.runtime.acquire(new Event('pointerup'));
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
    h.complete.resolve({ success: true, dataUrl: png(1920, 813).dataUrl });
    expect((await acquisition).bounds).toEqual({
      x: 0,
      y: 0,
      width: 1920 / scale,
      height: 813 / scale,
    });
  }
);
it('rejects native source acquisition if browser DPR changes while capture is in flight', async () => {
  const h = captureHarness();
  vi.stubGlobal('devicePixelRatio', 1);
  const acquisition = h.runtime.acquire(new Event('pointerup'));
  const failure = expect(acquisition).rejects.toThrow('Source acquisition failed');
  await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
  vi.stubGlobal('devicePixelRatio', 1.25);
  h.complete.resolve({ success: true, dataUrl: png(200, 100).dataUrl });
  await failure;
});

it('sends the actual CSS region to the Worker when native capture exceeds the emulated viewport', async () => {
  vi.stubGlobal('devicePixelRatio', 1);
  const h = captureHarness({ x: 0, y: 0, width: 1280, height: 560 });
  const send = vi.fn(async (request: SimplifyComputeRequest): Promise<unknown> => {
    if (request.operation === 'prepare')
      return {
        success: true,
        sessionId: 'native-scale',
        width: 1920,
        height: 813,
        version: 'simplify-v1',
      };
    if (request.operation === 'render')
      return {
        success: true,
        sessionId: 'native-scale',
        ...png(request.region.width, request.region.height),
        version: 'simplify-v1',
      };
    return { success: true, result: 'disposed' };
  });
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const runtime = createContentSimplifyRuntime(session, {
    ...h.runtime,
    send,
    decode: async () => undefined,
  });
  const work = runtime.submit(
    {
      id: 'native-region-proof',
      kind: 'simplify',
      bounds: { x: 460, y: 190, width: 320, height: 120 },
      settings: createDefaultSimplifySettings(),
    },
    new Event('pointerup')
  );
  await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
  h.complete.resolve({ success: true, dataUrl: png(1920, 813).dataUrl });
  await work;
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'render',
      region: { x: 460, y: 190, width: 320, height: 120 },
    })
  );
  expect(session.getSnapshot().document.objects[0]).toMatchObject({
    result: { width: 320, height: 120 },
  });
  runtime.dispose();
  session.dispose();
});

it('conceals a pending mask for source capture and keeps accepted masks visible', async () => {
  const h = captureHarness();
  const pending = document.createElement('div');
  pending.dataset['ui'] = 'content.drawing.simplify-private';
  pending.dataset['simplifyPending'] = 'true';
  pending.style.visibility = 'visible';
  const accepted = document.createElement('div');
  accepted.dataset['ui'] = 'content.drawing.simplify-private';
  accepted.style.visibility = 'visible';
  document.body.append(pending, accepted);
  const acquisition = h.runtime.acquire(new Event('pointerup'));
  await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
  try {
    expect(pending.style.visibility).toBe('hidden');
    expect(accepted.style.visibility).toBe('visible');
  } finally {
    h.complete.resolve({ success: true, dataUrl: png().dataUrl });
    await acquisition;
  }
  expect(pending.style.visibility).toBe('visible');
  expect(accepted.style.visibility).toBe('visible');
});

it.each(['resolve', 'reject', 'abort'] as const)(
  'conceals late mounted draft chrome and restores it after %s',
  async (exit) => {
    const h = captureHarness(),
      abort = new AbortController();
    const work = h.runtime.acquire(new Event('pointerdown'), abort.signal);
    const completion = work.then(
      () => true,
      () => false
    );
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
    const draft = document.createElement('div');
    draft.dataset['ui'] = 'content.drawing.simplify-private';
    draft.dataset['simplifyPending'] = 'true';
    draft.style.visibility = 'visible';
    const accepted = document.createElement('div');
    accepted.dataset['ui'] = 'content.drawing.simplify-private';
    accepted.style.visibility = 'visible';
    const loader = document.createElement('div');
    loader.dataset['ui'] = 'content.drawing.simplify-pending';
    document.body.append(draft, accepted, loader);
    await vi.waitFor(() => expect(draft.style.visibility).toBe('hidden'));
    expect(loader.style.visibility).toBe('hidden');
    expect(accepted.style.visibility).toBe('visible');
    if (exit === 'resolve') h.complete.resolve({ success: true, ...png() });
    else if (exit === 'reject') h.complete.reject(new Error('Capture failed'));
    else abort.abort();
    await completion;
    expect(draft.style.visibility).toBe('visible');
    expect(loader.style.visibility).toBe('');
    expect(accepted.style.visibility).toBe('visible');
    if (exit === 'abort') h.complete.resolve({ success: true, ...png() });
  }
);
