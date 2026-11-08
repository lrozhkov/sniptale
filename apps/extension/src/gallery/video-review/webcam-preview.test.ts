import * as canonicalProvider from '../../workflows/video/preview-source';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import type { createReviewWebcamPlayback } from './webcam-playback';
import { createReviewWebcamPreviewSource, mountReviewWebcamPreview } from './webcam-preview';

type Playback = Parameters<typeof createReviewWebcamPlayback>[0];
const mocks = vi.hoisted(() => ({
  recover: vi.fn(),
  read: vi.fn<(id: string) => Promise<Blob | null>>(),
  cadence:
    vi.fn<
      (blob: Blob, signal: AbortSignal) => Promise<{ duration: number; frameDuration: number }>
    >(),
  playback: vi.fn<(args: Playback) => () => void>(),
  draw: vi.fn(),
  stop: vi.fn(),
  createUrl: vi.fn(),
  revokeUrl: vi.fn(),
}));
vi.mock('../../composition/persistence/projects/asset-publication', () => ({
  recoverProjectMediaPublications: mocks.recover,
}));
vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: mocks.read,
}));
vi.mock('../../workflows/video-review/render-webcam', () => ({
  drawReviewWebcam: mocks.draw,
  inspectReviewWebcamMetadata: mocks.cadence,
}));
vi.mock('./webcam-playback', () => ({ createReviewWebcamPlayback: mocks.playback }));
let loaded: HTMLMediaElement[];
let cleanups: Set<() => void>;
beforeEach(() => {
  vi.resetAllMocks();
  loaded = [];
  cleanups = new Set();
  mocks.read.mockResolvedValue(new Blob(['camera']));
  mocks.cadence.mockResolvedValue({ duration: 10, frameDuration: 0.1 });
  mocks.playback.mockReturnValue(mocks.stop);
  mocks.createUrl.mockReturnValue('blob:camera');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = mocks.createUrl;
      static revokeObjectURL = mocks.revokeUrl;
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    loaded.push(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const settings = createQuickEditWebcam(
    'project-asset:camera',
    { width: 100, height: 100 },
    { width: 160, height: 90 }
  );
  const canvas = document.createElement('canvas');
  const context = { clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  const view = { canvas, output: { width: 160, height: 90 }, settings, placement: undefined };
  const events = { ready: vi.fn(), loaded: vi.fn(), failed: vi.fn() };
  const cleanup = mountReviewWebcamPreview(
    document.createElement('video'),
    settings.assetId,
    () => view,
    events
  );
  cleanups.add(cleanup);
  return {
    view,
    events,
    context,
    dispose: () => {
      cleanup();
      cleanups.delete(cleanup);
    },
  };
}
async function camera(duration = 10) {
  await vi.waitFor(() => expect(loaded.length).toBeGreaterThan(0));
  const node = loaded[0];
  if (!(node instanceof HTMLVideoElement)) throw new Error('Expected camera decoder');
  Object.defineProperties(node, {
    duration: { value: duration },
    videoWidth: { value: 100 },
    videoHeight: { value: 100 },
  });
  return node;
}

it('uses metadata cadence, invalidates paused paint on settings/geometry and releases the decoder', async () => {
  const { view, events, context, dispose } = setup();
  const node = await camera();
  node.dispatchEvent(new Event('loadedmetadata'));
  expect(events.loaded).toHaveBeenCalledWith(10);
  const playback = mocks.playback.mock.calls[0]![0];
  expect(playback.frameDuration).toBe(0.1);
  const frame = {
    time: 1,
    placement: view.settings.placement,
    representedMediaTime: 1,
    generation: 1,
    tolerance: 0.2,
    acceptedAt: 0,
  };
  playback.paint(frame);
  playback.paint(frame);
  expect(mocks.draw).toHaveBeenCalledTimes(1);
  view.output = { width: 320, height: 180 };
  playback.paint(frame);
  view.settings = { ...view.settings, mirrored: true };
  expect(playback.settings()).toBe(view.settings);
  playback.paint(frame);
  expect(mocks.draw).toHaveBeenCalledTimes(3);
  playback.paint(null);
  expect(events.ready).toHaveBeenLastCalledWith(false);
  expect(context.clearRect).toHaveBeenCalledTimes(4);
  dispose();
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:camera');
  expect(node.hasAttribute('src')).toBe(false);
  playback.paint(frame);
  expect(mocks.draw).toHaveBeenCalledTimes(3);
  node.dispatchEvent(new Event('error'));
  expect(events.failed).not.toHaveBeenCalled();
});

it('ignores late acquisition after disposal without allocating a URL', async () => {
  let release!: (blob: Blob | null) => void;
  mocks.read.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const { dispose, events } = setup();
  dispose();
  release(new Blob(['camera']));
  await Promise.resolve();
  await Promise.resolve();
  expect(mocks.cadence).not.toHaveBeenCalled();
  expect(mocks.createUrl).not.toHaveBeenCalled();
  expect(events.failed).not.toHaveBeenCalled();
});

it.each(['missing', 'metadata'] as const)(
  'reports %s resource failure without starting playback',
  async (failure) => {
    if (failure === 'missing') mocks.read.mockResolvedValue(null);
    else mocks.cadence.mockRejectedValue(new Error('metadata unavailable'));
    const { events } = setup();
    await vi.waitFor(() => expect(events.failed).toHaveBeenCalledOnce());
    expect(mocks.playback).not.toHaveBeenCalled();
    expect(mocks.createUrl).not.toHaveBeenCalled();
  }
);

it('keeps ordinary missing-byte preview loading write-free', async () => {
  mocks.read.mockResolvedValue(null);
  const { events } = setup();
  await vi.waitFor(() => expect(events.failed).toHaveBeenCalledOnce());
  expect(mocks.recover).not.toHaveBeenCalled();
});

function manualSetup() {
  const settings = createQuickEditWebcam(
    'project-asset:camera',
    { width: 100, height: 100 },
    { width: 160, height: 90 }
  );
  const main = document.createElement('video');
  const events = { ready: vi.fn(), loaded: vi.fn(), failed: vi.fn() };
  const source = createReviewWebcamPreviewSource(main, settings.assetId, () => settings, events);
  cleanups.add(source.dispose);
  const reservations: Array<{ role: string; bytes: number; release: ReturnType<typeof vi.fn> }> =
    [];
  const resources = {
    canvas: vi.fn(),
    bytes: vi.fn((role: string, bytes: number) => {
      const lease = { role, bytes, release: vi.fn() };
      reservations.push(lease);
      return lease;
    }),
  };
  return { source, main, settings, events, resources, reservations };
}
function fakeFrames() {
  const instances: FakeFrame[] = [];
  let timestamp = 0;
  class FakeFrame {
    timestamp: number;
    displayWidth = 100;
    displayHeight = 100;
    allocationSize() {
      return 60000;
    }
    close = vi.fn();
    constructor(_source: CanvasImageSource, options?: VideoFrameInit) {
      expect(options).toBeUndefined();
      this.timestamp = timestamp;
      instances.push(this);
    }
    clone() {
      const copy = new FakeFrame(document.createElement('canvas'));
      copy.timestamp = this.timestamp;
      return copy;
    }
  }
  vi.stubGlobal('VideoFrame', FakeFrame);
  return {
    instances,
    timestamp(value: number) {
      timestamp = value;
    },
  };
}
async function admitManual(state: ReturnType<typeof manualSetup>, duration = 10) {
  const node = await camera(duration);
  Object.defineProperty(node, 'readyState', { configurable: true, value: 2 });
  node.dispatchEvent(new Event('loadedmetadata'));
  const playback = mocks.playback.mock.calls[0]![0];
  playback.paint({
    time: 0,
    placement: state.settings.placement,
    representedMediaTime: 0,
    generation: 2,
    tolerance: 0.2,
    acceptedAt: performance.now(),
  });
  return { node, playback };
}

it.each([10, Infinity])(
  'captures admitted timestamps and releases leases with native duration %s',
  async (duration) => {
    const frames = fakeFrames();
    const state = manualSetup();
    const { playback } = await admitManual(state, duration);
    expect(loaded).toHaveLength(1);
    expect(mocks.draw).not.toHaveBeenCalled();
    expect(frames.instances).toHaveLength(0);
    frames.timestamp(10000);
    const capture = state.source.captureAccepted({ generation: 2 }, state.resources);
    expect(capture.status).toBe('ready');
    if (capture.status !== 'ready') throw new Error('Expected admitted frame');
    expect(capture.frame.representedMediaTime).toBe(0.01);
    expect(capture.frame.drawable.videoFrame?.()).toBe(frames.instances[1]);
    expect(frames.instances[1]!.close).not.toHaveBeenCalled();
    const drawImage = vi.fn();
    const context = { drawImage } as unknown as CanvasRenderingContext2D;
    frames.timestamp(900000);
    capture.frame.drawable.draw(context, 0, 0, 100, 100);
    expect(drawImage.mock.calls[0]![0].timestamp).toBe(10000);
    expect(state.reservations.map(({ role, bytes }) => ({ role, bytes }))).toEqual([
      { role: 'webcam.retained', bytes: 60000 },
      { role: 'webcam.active', bytes: 60000 },
    ]);
    capture.frame.release();
    capture.frame.release();
    expect(frames.instances[1]!.close).toHaveBeenCalledOnce();
    playback.paint(null);
    expect(frames.instances[0]!.close).toHaveBeenCalledOnce();
    expect(state.reservations.every((entry) => entry.release.mock.calls.length === 1)).toBe(true);
  }
);

it('retains immutable camera pixels through brief underflow and clears them on seek or expiry', async () => {
  const frames = fakeFrames();
  const state = manualSetup();
  const { node } = await admitManual(state);
  vi.spyOn(performance, 'now').mockReturnValue(0);
  mocks.playback.mock.calls[0]![0].paint({
    time: 0,
    placement: state.settings.placement,
    representedMediaTime: 0,
    generation: 2,
    tolerance: 0.2,
    acceptedAt: 0,
  });
  const first = state.source.captureAccepted({}, state.resources);
  if (first.status !== 'ready') throw new Error('Expected admitted frame');
  first.frame.release();
  Object.defineProperty(state.main, 'paused', { configurable: true, value: false });
  Object.defineProperty(node, 'readyState', { configurable: true, value: 1 });
  state.main.currentTime = 0.1;
  frames.timestamp(100000);
  vi.spyOn(performance, 'now').mockReturnValue(100);
  const bridge = state.source.captureAccepted({}, state.resources);
  if (bridge.status !== 'ready') throw new Error('Expected retained frame');
  expect(bridge.frame.representedMediaTime).toBe(0);
  bridge.frame.release();
  vi.spyOn(performance, 'now').mockReturnValue(251);
  expect(state.source.captureAccepted({}, state.resources).status).toBe('unavailable');
  expect(frames.instances[0]!.close).toHaveBeenCalledOnce();
});

it('rejects mismatched capture timestamps and stale generations without leaking snapshots', async () => {
  const frames = fakeFrames();
  const state = manualSetup();
  await admitManual(state);
  expect(state.source.captureAccepted({ generation: 1 }, state.resources).status).toBe(
    'unavailable'
  );
  expect(frames.instances).toHaveLength(0);
  frames.timestamp(3000000);
  expect(state.source.captureAccepted({}, state.resources).status).toBe('unavailable');
  expect(frames.instances[0]!.close).toHaveBeenCalledOnce();
  expect(state.reservations).toHaveLength(0);
});

it('reports capture failure without reserving storage when the browser constructor fails', async () => {
  const state = manualSetup();
  await admitManual(state);
  vi.stubGlobal(
    'VideoFrame',
    class {
      constructor() {
        throw new Error('capture failed');
      }
    }
  );
  expect(state.source.captureAccepted({}, state.resources).status).toBe('failed');
  expect(state.events.failed).toHaveBeenCalledOnce();
  expect(state.reservations).toHaveLength(0);
});

it('clears retained pixels on admission invalidation and keeps an active caller lease independent', async () => {
  const frames = fakeFrames();
  const state = manualSetup();
  const { playback } = await admitManual(state);
  const listener = vi.fn();
  const unsubscribe = state.source.subscribeAdmission(listener);
  const result = state.source.captureAccepted({}, state.resources);
  if (result.status !== 'ready') throw new Error('Expected admitted frame');
  playback.paint(null);
  expect(listener).toHaveBeenLastCalledWith(null);
  expect(frames.instances[0]!.close).toHaveBeenCalledOnce();
  expect(frames.instances[1]!.close).not.toHaveBeenCalled();
  state.source.dispose();
  state.source.dispose();
  result.frame.release();
  expect(frames.instances[1]!.close).toHaveBeenCalledOnce();
  unsubscribe();
  expect(state.source.captureAccepted({}, state.resources).status).toBe('unavailable');
});

it('releases retained pixels when active-clone reservation fails', async () => {
  const frames = fakeFrames();
  const state = manualSetup();
  await admitManual(state);
  const reserve = state.resources.bytes.getMockImplementation()!;
  state.resources.bytes.mockImplementation((role, bytes) => {
    if (role === 'webcam.active') throw new Error('Allocation plan exceeded');
    return reserve(role, bytes);
  });
  expect(state.source.captureAccepted({}, state.resources).status).toBe('failed');
  expect(state.events.failed).toHaveBeenCalledOnce();
  expect(frames.instances[0]!.close).toHaveBeenCalledOnce();
  expect(state.reservations[0]!.release).toHaveBeenCalledOnce();
});

it('loads a recorded WebM whose native duration is Infinity from inspected track metadata', async () => {
  const { events } = setup();
  const node = await camera(Infinity);
  node.dispatchEvent(new Event('loadedmetadata'));
  expect(events.failed).not.toHaveBeenCalled();
  expect(events.loaded).toHaveBeenCalledWith(10);
  expect(mocks.playback.mock.lastCall?.[0]).toMatchObject({ duration: 10 });
});

function canonicalCamera() {
  vi.stubGlobal('VideoDecoder', class {});
  class Frame {
    format = 'RGBA';
    colorSpace = { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false };
    codedWidth = 100;
    codedHeight = 100;
    displayWidth = 100;
    displayHeight = 100;
    timestamp = 400000;
    duration = 200000;
    allocationSize() {
      return 40000;
    }
    close = vi.fn();
    clone() {
      return new Frame();
    }
  }
  vi.stubGlobal('VideoFrame', Frame);
  const frame = new Frame();
  const release = vi.fn();
  const acquire = vi.fn().mockResolvedValue({
    bindings: new Map([
      [
        'camera',
        {
          source: {
            sourceWidth: 100,
            sourceHeight: 100,
            orientation: { rotation: 90, flip: true },
            toVideoFrame: () => frame,
            draw: vi.fn(),
          },
          timestamp: 0.4,
          nextTimestamp: 0.6,
          target: 0.5,
          url: 'blob:camera',
        },
      ],
    ]),
    release,
  });
  const dispose = vi.fn();
  vi.spyOn(canonicalProvider, 'createPreviewSourceProvider').mockReturnValue({
    acquire,
    retainSources: vi.fn(),
    dispose,
  });
  const f = manualSetup();
  f.main.currentTime = 99;
  return { ...f, frame, release, acquire, dispose };
}

it('selects a canonical camera interval without waiting for HTML metadata or clock', async () => {
  const f = canonicalCamera();
  const { acquire, release, frame } = f;
  const captured = await f.source.captureFrame(
    { sourceTime: 0.5, settings: f.settings },
    f.resources,
    new AbortController().signal
  );
  expect(mocks.playback).not.toHaveBeenCalled();
  expect(f.events.loaded).toHaveBeenCalledWith(10);
  expect(acquire.mock.calls[0]![0]).toEqual([
    { id: 'camera', url: 'blob:camera', time: 0.5, rangeStart: 0, rangeEnd: 10 },
  ]);
  expect(captured.status).toBe('ready');
  if (captured.status !== 'ready') throw new Error('Expected camera frame');
  expect(captured.frame.representedMediaTime).toBe(0.4);
  expect(captured.frame.drawable.orientation).toEqual({ rotation: 90, flip: true });
  expect(release).not.toHaveBeenCalled();
  loaded[0]!.dispatchEvent(new Event('loadedmetadata'));
  loaded[0]!.dispatchEvent(new Event('error'));
  expect(f.events.ready).toHaveBeenLastCalledWith(true);
  expect(f.events.failed).not.toHaveBeenCalled();
  const gpu = captured.frame.drawable.videoFrame!();
  f.source.dispose();
  expect(frame.close).not.toHaveBeenCalled();
  expect(vi.mocked(gpu.close)).not.toHaveBeenCalled();
  captured.frame.release();
  captured.frame.release();
  expect(frame.close).toHaveBeenCalledOnce();
  expect(vi.mocked(gpu.close)).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it.each(['abort', 'dispose'] as const)(
  'releases late canonical camera after %s',
  async (operation) => {
    const f = canonicalCamera();
    const gate = Promise.withResolvers<Awaited<ReturnType<typeof f.acquire>>>();
    const late = { bindings: new Map(), release: vi.fn() };
    f.acquire.mockReturnValueOnce(gate.promise);
    const controller = new AbortController();
    const pending = f.source.captureFrame(
      { sourceTime: 0.5, settings: f.settings },
      f.resources,
      controller.signal
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(f.acquire).toHaveBeenCalledOnce());
    if (operation === 'abort') controller.abort();
    else f.source.dispose();
    gate.resolve(late);
    await rejected;
    expect(late.release).toHaveBeenCalledOnce();
    expect(f.reservations).toHaveLength(0);
    expect(f.events.failed).not.toHaveBeenCalled();
  }
);

it('freezes camera settings and crop while metadata is pending', async () => {
  const read = Promise.withResolvers<Blob | null>();
  mocks.read.mockReturnValueOnce(read.promise);
  const f = canonicalCamera();
  f.settings.offsetSeconds = 0.25;
  const placement = { ...f.settings.placement, x: 0.2 };
  const crop = { zoom: 2, panX: 0.1, panY: 0.2 };
  const pending = f.source.captureFrame(
    { sourceTime: 0.75, settings: f.settings, placement, crop },
    f.resources,
    new AbortController().signal
  );
  f.main.currentTime = 99;
  f.settings.offsetSeconds = 9;
  placement.x = 0.8;
  crop.zoom = 3;
  read.resolve(new Blob(['camera']));
  const result = await pending;
  expect(f.acquire.mock.calls[0]![0][0].time).toBe(0.5);
  if (result.status !== 'ready') throw new Error('Expected camera');
  expect(result.frame.placement.x).toBe(0.2);
  expect(result.frame.crop?.zoom).toBe(2);
  result.frame.release();
});

it.each(['EOF', 'negative', 'hidden', 'disabled'] as const)(
  'hides canonical camera at %s',
  async (kind) => {
    const f = canonicalCamera();
    if (kind === 'hidden') f.settings.hiddenRanges = [{ id: 'hidden', start: 0, end: 1 }];
    if (kind === 'disabled') f.settings.enabled = false;
    const result = await f.source.captureFrame(
      {
        sourceTime: kind === 'EOF' ? 10 : 0.5,
        settings: { ...f.settings, offsetSeconds: kind === 'negative' ? 1 : 0 },
      },
      f.resources,
      new AbortController().signal
    );
    expect(result.status).toBe('hidden');
    expect(f.acquire).not.toHaveBeenCalled();
    expect(f.events.ready).toHaveBeenLastCalledWith(false);
  }
);

it.each(['decode', 'missing-binding', 'invalid-frame'] as const)(
  'rejects canonical camera %s without HTML fallback',
  async (kind) => {
    const f = canonicalCamera();
    if (kind === 'decode') f.acquire.mockRejectedValueOnce(new Error('decode failed'));
    if (kind === 'missing-binding')
      f.acquire.mockResolvedValueOnce({ bindings: new Map(), release: f.release });
    if (kind === 'invalid-frame') vi.spyOn(f.frame, 'allocationSize').mockReturnValue(0);
    await expect(
      f.source.captureFrame(
        { sourceTime: 0.5, settings: f.settings },
        f.resources,
        new AbortController().signal
      )
    ).rejects.toThrow();
    expect(mocks.playback).not.toHaveBeenCalled();
    expect(f.events.failed).toHaveBeenCalledOnce();
    if (kind !== 'decode') expect(f.release).toHaveBeenCalledOnce();
    if (kind === 'invalid-frame') expect(f.frame.close).toHaveBeenCalledOnce();
  }
);

it('starts HTML compatibility only after actual canonical unsupported', async () => {
  const f = canonicalCamera();
  f.acquire.mockResolvedValueOnce(null);
  const result = await f.source.captureFrame(
    { sourceTime: 0.5, settings: f.settings },
    f.resources,
    new AbortController().signal
  );
  expect(result.status).toBe('unavailable');
  const node = await camera();
  node.dispatchEvent(new Event('loadedmetadata'));
  expect(mocks.playback).toHaveBeenCalledOnce();
  Object.defineProperty(node, 'readyState', { configurable: true, value: 2 });
  mocks.playback.mock.lastCall![0].paint({
    time: 0.5,
    placement: f.settings.placement,
    representedMediaTime: 0.4,
    generation: 2,
    tolerance: 0.2,
    acceptedAt: performance.now(),
  });
  const compatible = await f.source.captureFrame(
    { sourceTime: 0.5, settings: f.settings },
    f.resources,
    new AbortController().signal
  );
  expect(compatible.status).toBe('ready');
  if (compatible.status !== 'ready') throw new Error('Expected compatibility camera');
  compatible.frame.release();
  expect(f.acquire).toHaveBeenCalledOnce();
  expect(f.events.failed).not.toHaveBeenCalled();
});

it('retains RGB camera borrowers after source disposal when VideoFrame is absent', async () => {
  vi.stubGlobal('VideoFrame', undefined);
  const rgbContext = document.createElement('canvas').getContext('2d')!;
  vi.spyOn(rgbContext, 'drawImage').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(rgbContext);
  const f = manualSetup();
  await admitManual(f);
  const result = f.source.captureAccepted({}, f.resources);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected RGB camera');
  expect(result.frame.drawable.videoFrame).toBeUndefined();
  expect(result.frame.representedMediaTime).toBe(0);
  const drawImage = vi.fn();
  const context = { drawImage } as unknown as CanvasRenderingContext2D;
  f.source.dispose();
  result.frame.drawable.draw(context, 0, 0, 100, 100);
  const image = drawImage.mock.calls[0]![0] as HTMLCanvasElement;
  expect(image.width).toBe(100);
  expect(f.reservations.some((lease) => lease.release.mock.calls.length === 0)).toBe(true);
  result.frame.release();
  result.frame.release();
  expect(image.width).toBe(0);
  for (const lease of f.reservations) expect(lease.release).toHaveBeenCalledOnce();
});

it.each(['retained', 'active', 'draw'] as const)(
  'rolls back RGB camera %s failure',
  async (failure) => {
    vi.stubGlobal('VideoFrame', undefined);
    const context = document.createElement('canvas').getContext('2d')!;
    const copy = vi.spyOn(context, 'drawImage').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const f = manualSetup();
    await admitManual(f);
    const bytes = f.resources.bytes.getMockImplementation()!;
    if (failure === 'draw')
      copy.mockImplementationOnce(() => {
        throw new Error('copy failed');
      });
    else
      f.resources.bytes.mockImplementation((role, count) => {
        if (role === `webcam.${failure}`) throw new Error('reservation refused');
        return bytes(role, count);
      });
    expect(f.source.captureAccepted({}, f.resources).status).toBe('failed');
    f.source.dispose();
    for (const lease of f.reservations) expect(lease.release).toHaveBeenCalledOnce();
  }
);
