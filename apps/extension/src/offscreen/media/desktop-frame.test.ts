// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  inspectOffscreenMediaActivityOwner,
  resetOffscreenMediaActivityLeaseForTests,
} from '../media-activity/lease';
import { createConfigurableVideoStream } from '../recording/multi-source/media-stream.test-support';

const { acquireDesktopStreamMock, writeBrowserClipboardItemsMock } = vi.hoisted(() => ({
  acquireDesktopStreamMock: vi.fn(),
  writeBrowserClipboardItemsMock: vi.fn(),
}));

vi.mock('./desktop-stream', () => ({ acquireDesktopStream: acquireDesktopStreamMock }));
vi.mock('@sniptale/platform/browser/clipboard', () => ({
  writeBrowserClipboardItems: writeBrowserClipboardItemsMock,
}));

import { captureDesktopFrame, writeDesktopFrameClipboard } from './desktop-frame';

function installRasterElements(options: { cursor?: string; height?: number; width?: number } = {}) {
  const settings: MediaTrackSettings & { cursor?: string } =
    options.cursor === undefined ? {} : { cursor: options.cursor };
  const stream = createConfigurableVideoStream({ settings });
  const stop = vi.spyOn(stream.getTracks()[0]!, 'stop');
  acquireDesktopStreamMock.mockResolvedValue(stream);

  const video = {
    autoplay: false,
    muted: false,
    onerror: null as null | (() => void),
    onloadeddata: null as null | (() => void),
    pause: vi.fn(),
    play: vi.fn().mockImplementation(() => {
      queueMicrotask(() => video.onloadeddata?.());
      return Promise.resolve();
    }),
    playsInline: false,
    srcObject: null as MediaStream | null,
    videoHeight: options.height ?? 1080,
    videoWidth: options.width ?? 1920,
  };
  const drawImage = vi.fn();
  const canvas = {
    getContext: vi.fn(() => ({ drawImage })),
    height: 0,
    toDataURL: vi.fn(() => 'data:image/webp;base64,AA=='),
    width: 0,
  };
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) =>
    tagName === 'video' ? video : canvas) as typeof document.createElement);
  return { canvas, drawImage, stop, stream, video };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetOffscreenMediaActivityLeaseForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('encodes the first cursor-free frame and cleans every acquired resource', async () => {
  const fixture = installRasterElements({ cursor: 'never' });

  await expect(
    captureDesktopFrame({ streamId: 'stream-1', imageFormat: 'webp', imageQuality: 72 })
  ).resolves.toEqual({
    result: 'captured',
    dataUrl: 'data:image/webp;base64,AA==',
    width: 1920,
    height: 1080,
  });

  expect(acquireDesktopStreamMock).toHaveBeenCalledWith({
    controlledCursorCaptureEnabled: true,
    desktopStreamId: 'stream-1',
  });
  expect(fixture.canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.72);
  expect(fixture.drawImage).toHaveBeenCalled();
  expect(fixture.stop).toHaveBeenCalledOnce();
  expect(fixture.video.pause).toHaveBeenCalledOnce();
  expect(fixture.video.srcObject).toBeNull();
  expect(fixture.canvas.width).toBe(0);
  expect(inspectOffscreenMediaActivityOwner()).toBeNull();
});

it('rejects an explicitly cursor-bearing track and still releases the stream', async () => {
  const fixture = installRasterElements({ cursor: 'always' });

  await expect(
    captureDesktopFrame({ streamId: 'stream-2', imageFormat: 'png', imageQuality: 90 })
  ).rejects.toThrow('cursor-free');

  expect(fixture.stop).toHaveBeenCalledOnce();
  expect(inspectOffscreenMediaActivityOwner()).toBeNull();
});

it('rejects invalid raster dimensions before drawing', async () => {
  const fixture = installRasterElements({ width: 0 });

  await expect(
    captureDesktopFrame({ streamId: 'stream-3', imageFormat: 'jpeg', imageQuality: 90 })
  ).rejects.toThrow('raster budget');

  expect(fixture.drawImage).not.toHaveBeenCalled();
  expect(fixture.stop).toHaveBeenCalledOnce();
});

it('writes only PNG clipboard artifacts through the offscreen clipboard owner', async () => {
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
