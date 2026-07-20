// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';

const renderPreviewScene = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('../stage/scene/render-preview', () => ({ renderPreviewScene }));

import { createVideoPreviewFrameMaterializer } from './materializer';

beforeEach(() => renderPreviewScene.mockClear());

function createVideoClip(trackId: string): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip 1',
    sourceDuration: 1,
    sourceStart: 0,
    startTime: 0,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

function mockDelayedSeekVideo(): void {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    const element = originalCreateElement(tagName, options);
    if (tagName !== 'video') return element;
    const video = element as HTMLVideoElement;
    let currentTime = 0;
    let seekCount = 0;
    let seeking = false;
    Object.defineProperties(video, {
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
          seeking = true;
          seekCount += 1;
          if (seekCount === 1) {
            window.setTimeout(() => {
              seeking = false;
            }, 20);
            window.setTimeout(() => video.dispatchEvent(new Event('seeked')), 80);
            return;
          }
          window.setTimeout(() => {
            seeking = false;
            video.dispatchEvent(new Event('seeked'));
          }, 100);
        },
      },
      load: { configurable: true, value: vi.fn() },
      pause: { configurable: true, value: vi.fn() },
      readyState: { configurable: true, value: 2 },
      seeking: { configurable: true, get: () => seeking },
    });
    return video;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('materializes a paused video when an intra-frame seek completes without a seeked event', async () => {
  vi.useFakeTimers();
  const project = createEmptyVideoProject('Cache seek');
  project.duration = 1;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    const element = originalCreateElement(tagName, options);
    if (tagName !== 'video') return element;
    const video = element as HTMLVideoElement;
    let currentTime = 0;
    Object.defineProperties(video, {
      cancelVideoFrameCallback: { configurable: true, value: vi.fn() },
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
        },
      },
      load: { configurable: true, value: vi.fn() },
      pause: { configurable: true, value: vi.fn() },
      readyState: { configurable: true, value: 2 },
      seeking: { configurable: true, value: false },
      requestVideoFrameCallback: { configurable: true, value: vi.fn(() => 1) },
    });
    return video;
  });
  const materializer = createVideoPreviewFrameMaterializer({
    assetUrls: { 'asset-1': 'blob:video' },
    ownerDocument: document,
    project,
    rasterSize: { height: 360, width: 640 },
  });
  expect(document.querySelector('video')?.isConnected).toBe(true);

  const pending = materializer.renderFrame(1 / project.fps, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(2_000);

  await expect(pending).resolves.toBe(materializer.canvas);
  expect(renderPreviewScene).toHaveBeenCalledOnce();
  materializer.dispose();
});

it('ignores a delayed seeked event from the previously materialized frame', async () => {
  vi.useFakeTimers();
  const project = createEmptyVideoProject('Delayed cache seek');
  project.duration = 1;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  mockDelayedSeekVideo();
  const materializer = createVideoPreviewFrameMaterializer({
    assetUrls: { 'asset-1': 'blob:video' },
    ownerDocument: document,
    project,
    rasterSize: { height: 360, width: 640 },
  });

  const firstFrame = materializer.renderFrame(1 / project.fps, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(40);
  await expect(firstFrame).resolves.toBe(materializer.canvas);

  const secondFrame = materializer.renderFrame(2 / project.fps, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(50);
  expect(renderPreviewScene).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(60);
  await expect(secondFrame).resolves.toBe(materializer.canvas);
  expect(renderPreviewScene).toHaveBeenCalledTimes(2);
  materializer.dispose();
});

it.each([
  { branch: 'load', readyState: 0 },
  { branch: 'seek', readyState: 2 },
])(
  'stops before $branch when cancellation precedes the media operation',
  async ({ readyState }) => {
    const controller = new AbortController();
    const project = createEmptyVideoProject('Cancelled cache seek');
    project.duration = 1;
    project.clips = [createVideoClip(project.tracks[0]!.id)];
    const load = vi.fn();
    const setCurrentTime = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (tagName !== 'video') return element;
      const video = element as HTMLVideoElement;
      Object.defineProperties(video, {
        currentTime: {
          configurable: true,
          get: () => 0,
          set: setCurrentTime,
        },
        load: { configurable: true, value: load },
        pause: { configurable: true, value: vi.fn(() => controller.abort()) },
        readyState: { configurable: true, value: readyState },
        seeking: { configurable: true, value: false },
      });
      return video;
    });
    const materializer = createVideoPreviewFrameMaterializer({
      assetUrls: { 'asset-1': 'blob:video' },
      ownerDocument: document,
      project,
      rasterSize: { height: 360, width: 640 },
    });

    await expect(
      materializer.renderFrame(1 / project.fps, controller.signal)
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(load).not.toHaveBeenCalled();
    expect(setCurrentTime).not.toHaveBeenCalled();
    expect(renderPreviewScene).not.toHaveBeenCalled();
    materializer.dispose();
  }
);
