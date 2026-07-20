import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const {
  consumeDesktopStreamMock,
  consumeDesktopStreamsMock,
  detachCachedPreviewMock,
  disposeMultiSourceDesktopMediaMock,
  requestDesktopMediaMock,
} = vi.hoisted(() => ({
  consumeDesktopStreamMock: vi.fn(),
  consumeDesktopStreamsMock: vi.fn(),
  detachCachedPreviewMock: vi.fn(),
  disposeMultiSourceDesktopMediaMock: vi.fn(),
  requestDesktopMediaMock: vi.fn(),
}));

vi.mock('./controller', () => ({
  createOffscreenDesktopMediaController: () => ({
    consumeDesktopStream: consumeDesktopStreamMock,
    consumeDesktopStreams: consumeDesktopStreamsMock,
    detachCachedPreview: detachCachedPreviewMock,
    disposeMultiSourceDesktopMedia: disposeMultiSourceDesktopMediaMock,
    requestDesktopMedia: requestDesktopMediaMock,
  }),
}));

import {
  consumeDesktopStream,
  consumeDesktopStreams,
  detachCachedPreview,
  disposeMultiSourceDesktopMedia,
  requestDesktopMedia,
} from '.';

describe('offscreen-desktop-media-root-facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeDesktopStreamMock.mockReturnValue({ label: 'Screen', stream: null });
    consumeDesktopStreamsMock.mockReturnValue([{ label: 'Window 1', stream: {} }]);
    requestDesktopMediaMock.mockResolvedValue(undefined);
  });

  it('delegates desktop-media commands through the lazy controller owner', async () => {
    await requestDesktopMedia(CaptureMode.SCREEN, true, {
      desktopMediaRequestGeneration: 'desktop-generation-1',
      desktopMediaRequestId: 'desktop-request-1',
      desktopLabel: 'Window 2',
      desktopStreamId: 'desktop-2',
      sourceCount: 2,
      sourceIndex: 1,
    });

    expect(consumeDesktopStream()).toEqual({ label: 'Screen', stream: null });
    expect(consumeDesktopStreams()).toEqual([{ label: 'Window 1', stream: {} }]);

    detachCachedPreview();
    disposeMultiSourceDesktopMedia();

    expect(requestDesktopMediaMock).toHaveBeenCalledWith(CaptureMode.SCREEN, {
      controlledCursorCaptureEnabled: true,
      desktopMediaRequestGeneration: 'desktop-generation-1',
      desktopMediaRequestId: 'desktop-request-1',
      desktopLabel: 'Window 2',
      desktopStreamId: 'desktop-2',
      sourceCount: 2,
      sourceIndex: 1,
    });
    expect(consumeDesktopStreamMock).toHaveBeenCalledTimes(1);
    expect(consumeDesktopStreamsMock).toHaveBeenCalledTimes(1);
    expect(detachCachedPreviewMock).toHaveBeenCalledTimes(1);
    expect(disposeMultiSourceDesktopMediaMock).toHaveBeenCalledTimes(1);
  });
});
