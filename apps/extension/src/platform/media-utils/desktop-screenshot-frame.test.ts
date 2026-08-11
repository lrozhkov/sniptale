// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { captureDesktopScreenshotFrame } from './desktop-screenshot-frame';
import { createPopupPreviewStream } from '../../popup/recording/video/setup/options/webcam-preview.test-support';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function installCaptureSurface(args: { cursor?: string; width?: number } = {}) {
  const stop = vi.fn();
  const stream = createPopupPreviewStream({ stop });
  const track = stream.getVideoTracks()[0]!;
  const settings = { cursor: args.cursor ?? 'never', width: 1280 };
  vi.spyOn(track, 'applyConstraints').mockResolvedValue(undefined);
  vi.spyOn(track, 'getSettings').mockReturnValue(settings);
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

  const originalCreateElement = document.createElement.bind(document);
  const video = Object.assign(originalCreateElement('video'), {
    pause: vi.fn(),
    play: vi
      .fn()
      .mockImplementation(async () =>
        queueMicrotask(() => video.onloadeddata?.(new Event('loadeddata')))
      ),
    srcObject: null as MediaStream | null,
  });
  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: 720 },
    videoWidth: { configurable: true, value: args.width ?? 1280 },
  });
  const canvas = Object.assign(originalCreateElement('canvas'), {
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toDataURL: vi.fn(() => 'data:image/webp;base64,AA=='),
  });
  const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName === 'video') return video;
    if (tagName === 'canvas') return canvas;
    return originalCreateElement(tagName);
  });
  return { canvas, createElement, getUserMedia, stop, track, video };
}

it('consumes the picker stream in its calling document and cleans up after the first frame', async () => {
  const surface = installCaptureSurface();
  await expect(
    captureDesktopScreenshotFrame({
      streamId: 'popup-owned-stream',
      imageFormat: 'jpeg',
      imageQuality: 72,
    })
  ).resolves.toEqual({ dataUrl: 'data:image/webp;base64,AA==', width: 1280, height: 720 });
  expect(surface.getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: 'popup-owned-stream',
        maxFrameRate: 60,
      },
    },
  });
  expect(surface.track.applyConstraints).toHaveBeenCalledWith({ cursor: 'never' });
  expect(surface.canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.72);
  expect(surface.stop).toHaveBeenCalledOnce();
  expect(surface.video.pause).toHaveBeenCalledOnce();
  surface.createElement.mockRestore();
});

it('keeps capture available when Chrome omits cursor confirmation and still checks dimensions', async () => {
  const cursorSurface = installCaptureSurface({ cursor: 'always' });
  await expect(
    captureDesktopScreenshotFrame({ streamId: 'stream', imageFormat: 'webp', imageQuality: 90 })
  ).resolves.toEqual({ dataUrl: 'data:image/webp;base64,AA==', width: 1280, height: 720 });
  expect(cursorSurface.stop).toHaveBeenCalledOnce();
  cursorSurface.createElement.mockRestore();

  const unsupportedSurface = installCaptureSurface();
  vi.mocked(unsupportedSurface.track.applyConstraints).mockRejectedValueOnce(
    new DOMException('Unsupported constraint', 'OverconstrainedError')
  );
  await expect(
    captureDesktopScreenshotFrame({ streamId: 'stream', imageFormat: 'webp', imageQuality: 90 })
  ).resolves.toMatchObject({ width: 1280, height: 720 });
  expect(unsupportedSurface.stop).toHaveBeenCalledOnce();
  unsupportedSurface.createElement.mockRestore();

  const sizeSurface = installCaptureSurface({ width: 0 });
  await expect(
    captureDesktopScreenshotFrame({ streamId: 'stream', imageFormat: 'png', imageQuality: 90 })
  ).rejects.toThrow('raster budget');
  expect(sizeSurface.stop).toHaveBeenCalledOnce();
  sizeSurface.createElement.mockRestore();
});
