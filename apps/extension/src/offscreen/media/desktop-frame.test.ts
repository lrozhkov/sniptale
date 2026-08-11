// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { acquireDesktopStreamMock, writeBrowserClipboardItemsMock } = vi.hoisted(() => ({
  acquireDesktopStreamMock: vi.fn(),
  writeBrowserClipboardItemsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/clipboard', () => ({
  writeBrowserClipboardItems: writeBrowserClipboardItemsMock,
}));
vi.mock('./desktop-stream', () => ({ acquireDesktopStream: acquireDesktopStreamMock }));

import {
  cancelDesktopFrame,
  captureDesktopFrame,
  reserveDesktopFrame,
  writeDesktopFrameClipboard,
} from './desktop-frame';
import {
  acquireOffscreenMediaActivityLease,
  inspectOffscreenMediaActivityOwner,
  resetOffscreenMediaActivityLeaseForTests,
} from '../media-activity/lease';

beforeEach(() => {
  vi.clearAllMocks();
  resetOffscreenMediaActivityLeaseForTests();
});

afterEach(() => {
  cancelDesktopFrame('desktop-request');
  vi.useRealTimers();
  resetOffscreenMediaActivityLeaseForTests();
});

function installFrameSurface(args: {
  dataUrl?: string;
  height?: number;
  withContext?: boolean;
  width?: number;
}) {
  const track: MediaStreamVideoTrack = Object.create(null);
  track.stop = vi.fn();
  const stream: MediaStream = Object.create(null);
  stream.getTracks = () => [track];
  stream.getVideoTracks = () => [track];
  acquireDesktopStreamMock.mockResolvedValue(stream);
  const originalCreateElement = document.createElement.bind(document);
  const video = Object.assign(originalCreateElement('video'), {
    autoplay: false,
    muted: false,
    onerror: null as null | (() => void),
    onloadeddata: null as null | (() => void),
    pause: vi.fn(),
    play: vi.fn().mockImplementation(async () => {
      queueMicrotask(() => video.onloadeddata?.());
    }),
    playsInline: false,
    srcObject: null as MediaStream | null,
  });
  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: args.height ?? 720 },
    videoWidth: { configurable: true, value: args.width ?? 1280 },
  });
  const context = args.withContext === false ? null : { drawImage: vi.fn() };
  const canvas = Object.assign(originalCreateElement('canvas'), {
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => args.dataUrl ?? 'data:image/png;base64,AA=='),
  });
  canvas.height = 0;
  canvas.width = 0;
  const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName === 'video') return video;
    if (tagName === 'canvas') return canvas;
    return originalCreateElement(tagName);
  });
  return { canvas, context, createElement, track, video };
}

it('reserves the shared media lease before the picker and releases it on cancellation', () => {
  expect(reserveDesktopFrame('desktop-request')).toBe('accepted');
  expect(inspectOffscreenMediaActivityOwner()).toBe('desktop-screenshot');
  expect(acquireOffscreenMediaActivityLease('video-recording')).toEqual({
    acquired: false,
    busyOwner: 'desktop-screenshot',
  });
  expect(cancelDesktopFrame('desktop-request')).toBe('accepted');
  expect(cancelDesktopFrame('desktop-request')).toBe('accepted');
  expect(inspectOffscreenMediaActivityOwner()).toBeNull();
});

it('expires an abandoned picker reservation', () => {
  vi.useFakeTimers();
  reserveDesktopFrame('desktop-request');
  vi.advanceTimersByTime(30_000);
  expect(inspectOffscreenMediaActivityOwner()).toBeNull();
});

it.each([
  ['png', 'data:image/png;base64,AA=='],
  ['jpeg', 'data:image/jpeg;base64,AA=='],
  ['webp', 'data:image/webp;base64,AA=='],
] as const)('captures and cleans up a reserved %s desktop frame', async (imageFormat, dataUrl) => {
  const surface = installFrameSurface({ dataUrl });
  reserveDesktopFrame('desktop-request');
  await expect(
    captureDesktopFrame({
      requestId: 'desktop-request',
      streamId: 'one-shot-stream',
      imageFormat,
      imageQuality: 81,
    })
  ).resolves.toEqual({ result: 'captured', dataUrl, width: 1280, height: 720 });
  expect(acquireDesktopStreamMock).toHaveBeenCalledWith({
    desktopStreamId: 'one-shot-stream',
    controlledCursorCaptureEnabled: true,
  });
  expect(surface.context?.drawImage).toHaveBeenCalled();
  expect(surface.canvas.toDataURL).toHaveBeenCalledWith(`image/${imageFormat}`, 0.81);
  expect(surface.track.stop).toHaveBeenCalledOnce();
  expect(surface.video.pause).toHaveBeenCalledOnce();
  expect(inspectOffscreenMediaActivityOwner()).toBeNull();
  surface.createElement.mockRestore();
});

it('rejects missing reservations and invalid raster dimensions', async () => {
  await expect(
    captureDesktopFrame({
      requestId: 'missing',
      streamId: 'stream',
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).rejects.toThrow('missing or expired');

  const surface = installFrameSurface({ width: 0 });
  reserveDesktopFrame('desktop-request');
  await expect(
    captureDesktopFrame({
      requestId: 'desktop-request',
      streamId: 'stream',
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).rejects.toThrow('raster budget');
  expect(surface.track.stop).toHaveBeenCalledOnce();
  surface.createElement.mockRestore();
});

it('releases the reservation when canvas encoding cannot produce an image', async () => {
  const surface = installFrameSurface({ dataUrl: 'data:text/plain;base64,AA==' });
  reserveDesktopFrame('desktop-request');
  await expect(
    captureDesktopFrame({
      requestId: 'desktop-request',
      streamId: 'stream',
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).rejects.toThrow('exceeded image limits');
  expect(surface.track.stop).toHaveBeenCalledOnce();
  expect(inspectOffscreenMediaActivityOwner()).toBeNull();
  surface.createElement.mockRestore();
});

it('fails safely when the reserved stream has no video track', async () => {
  const surface = installFrameSurface({});
  const emptyStream: MediaStream = Object.create(null);
  emptyStream.getTracks = () => [];
  emptyStream.getVideoTracks = () => [];
  acquireDesktopStreamMock.mockResolvedValue(emptyStream);
  reserveDesktopFrame('desktop-request');
  await expect(
    captureDesktopFrame({
      requestId: 'desktop-request',
      streamId: 'stream',
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).rejects.toThrow('did not provide a video track');
  expect(inspectOffscreenMediaActivityOwner()).toBeNull();
  surface.createElement.mockRestore();
});

it('cleans up when video playback or the canvas context fails', async () => {
  const playbackSurface = installFrameSurface({});
  playbackSurface.video.play.mockRejectedValueOnce(new Error('track ended'));
  reserveDesktopFrame('desktop-request');
  await expect(
    captureDesktopFrame({
      requestId: 'desktop-request',
      streamId: 'stream',
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).rejects.toThrow('track ended');
  expect(playbackSurface.track.stop).toHaveBeenCalledOnce();
  playbackSurface.createElement.mockRestore();

  const canvasSurface = installFrameSurface({ withContext: false });
  reserveDesktopFrame('desktop-request');
  await expect(
    captureDesktopFrame({
      requestId: 'desktop-request',
      streamId: 'stream',
      imageFormat: 'png',
      imageQuality: 90,
    })
  ).rejects.toThrow('canvas context is unavailable');
  expect(canvasSurface.track.stop).toHaveBeenCalledOnce();
  canvasSurface.createElement.mockRestore();
});

it('writes only PNG artifacts through the offscreen clipboard owner', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(blob) }));
  class ClipboardItemMock {
    constructor(readonly value: Record<string, Blob>) {}
  }
  vi.stubGlobal('ClipboardItem', ClipboardItemMock);

  await expect(writeDesktopFrameClipboard('data:image/png;base64,cG5n')).resolves.toBe('copied');
  expect(writeBrowserClipboardItemsMock).toHaveBeenCalledOnce();
  expect(writeBrowserClipboardItemsMock.mock.calls[0]?.[0]?.[0]).toEqual(
    expect.objectContaining({ value: { 'image/png': blob } })
  );
});

it('rejects non-PNG clipboard artifacts', async () => {
  const blob = new Blob(['webp'], { type: 'image/webp' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(blob) }));
  await expect(writeDesktopFrameClipboard('data:image/webp;base64,d2VicA==')).rejects.toThrow(
    'must be encoded as PNG'
  );
  expect(writeBrowserClipboardItemsMock).not.toHaveBeenCalled();
});
