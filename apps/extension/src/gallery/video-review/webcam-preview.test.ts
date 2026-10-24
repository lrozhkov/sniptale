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
