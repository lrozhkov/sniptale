// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import type { createReviewWebcamPlayback } from './webcam-playback';
import { mountReviewWebcamPreview } from './webcam-preview';

type Playback = Parameters<typeof createReviewWebcamPlayback>[0];
const mocks = vi.hoisted(() => ({
  recover: vi.fn(),
  read: vi.fn<(id: string) => Promise<Blob | null>>(),
  cadence: vi.fn<(blob: Blob, signal: AbortSignal) => Promise<number>>(),
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
  inspectReviewWebcamFrameDuration: mocks.cadence,
}));
vi.mock('./webcam-playback', () => ({ createReviewWebcamPlayback: mocks.playback }));
let loaded: HTMLMediaElement[];
let cleanups: Set<() => void>;
beforeEach(() => {
  vi.resetAllMocks();
  loaded = [];
  cleanups = new Set();
  mocks.read.mockResolvedValue(new Blob(['camera']));
  mocks.cadence.mockResolvedValue(0.1);
  mocks.playback.mockReturnValue(mocks.stop);
  mocks.createUrl.mockReturnValue('blob:camera');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = mocks.createUrl;
      static revokeObjectURL = mocks.revokeUrl;
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
    function (this: HTMLMediaElement) {
      loaded.push(this);
    }
  );
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
async function camera() {
  await vi.waitFor(() => expect(loaded.length).toBeGreaterThan(0));
  const node = loaded[0];
  if (!(node instanceof HTMLVideoElement)) throw new Error('Expected camera decoder');
  Object.defineProperties(node, {
    duration: { value: 10 },
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
  const frame = { time: 1, placement: view.settings.placement };
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
