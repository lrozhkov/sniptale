import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createOffscreenDesktopMediaController } from './controller';
import type { DesktopMediaRequestOptions } from './types';

const { attachDesktopPreviewMock, normalizeDisplayMediaLabelMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    attachDesktopPreviewMock: vi.fn(),
    normalizeDisplayMediaLabelMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../../platform/i18n/display-media-label', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/display-media-label')>()),
  normalizeDisplayMediaLabel: normalizeDisplayMediaLabelMock,
}));

vi.mock('../../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageMock,
  stringifyOffscreenError: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock('../../stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stream')>()),
  createDesktopPreviewController: () => ({
    attachDesktopPreview: attachDesktopPreviewMock,
    detachDesktopPreview: vi.fn(),
  }),
}));

function asMediaStreamFixture<T extends object>(stream: T): MediaStream & T {
  return stream as MediaStream & T;
}

function createDesktopStream(label: string): MediaStream {
  return asMediaStreamFixture({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [{ label }],
  });
}

function createDesktopMediaRequestOptions(
  overrides: Partial<DesktopMediaRequestOptions> = {}
): DesktopMediaRequestOptions {
  return {
    desktopMediaRequestGeneration: 'desktop-generation-1',
    desktopMediaRequestId: 'desktop-request-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  normalizeDisplayMediaLabelMock.mockReturnValue('Normalized screen');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getDisplayMedia: vi.fn(), getUserMedia: vi.fn() } },
  });
});

it('acquires background-selected desktop stream ids with getUserMedia', async () => {
  const controller = createOffscreenDesktopMediaController();
  const stream = createDesktopStream('Ignored stream label');
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);

  await controller.requestDesktopMedia(CaptureMode.SCREEN, {
    ...createDesktopMediaRequestOptions(),
    desktopLabel: 'Window 2',
    desktopStreamId: 'desktop-2',
    sourceCount: 2,
    sourceIndex: 1,
  });

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: 'desktop-2',
        maxFrameRate: 30,
      },
    },
  });
  expect(normalizeDisplayMediaLabelMock).toHaveBeenCalledWith('Window 2', CaptureMode.SCREEN);
  expect(attachDesktopPreviewMock).toHaveBeenCalledWith(stream);
});

it('acquires multi-source display media without a desktop stream id', async () => {
  const controller = createOffscreenDesktopMediaController();
  const stream = createDesktopStream('Selected screen');
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(stream);

  await controller.requestDesktopMedia(CaptureMode.SCREEN, {
    ...createDesktopMediaRequestOptions(),
    sourceCount: 2,
    sourceIndex: 0,
  });

  expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
    video: { frameRate: { ideal: 30 } },
    audio: false,
  });
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(attachDesktopPreviewMock).toHaveBeenCalledWith(stream);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
        label: 'Normalized screen',
        sourceCount: 2,
        sourceIndex: 0,
      },
    })
  );
});

it('reports multi-source display-media cancellations as picker cancellation', async () => {
  const controller = createOffscreenDesktopMediaController();
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockRejectedValue(
    new DOMException('Permission denied', 'NotAllowedError')
  );

  await controller.requestDesktopMedia(CaptureMode.SCREEN, {
    ...createDesktopMediaRequestOptions(),
    sourceCount: 2,
    sourceIndex: 0,
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_CANCELLED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
        sourceCount: 2,
        sourceIndex: 0,
      },
    })
  );
});

it('reports multi-source display-media API failures as acquisition failures', async () => {
  const controller = createOffscreenDesktopMediaController();
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockRejectedValue(
    new Error('display media failed')
  );

  await controller.requestDesktopMedia(CaptureMode.SCREEN, {
    ...createDesktopMediaRequestOptions(),
    sourceCount: 2,
    sourceIndex: 0,
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_FAILED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
        error: 'display media failed',
        phase: 'display-media-acquire',
        sourceCount: 2,
        sourceIndex: 0,
      },
    })
  );
});

it('reports getUserMedia failures as desktop acquisition failures', async () => {
  const controller = createOffscreenDesktopMediaController();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
    new Error('getUserMedia failed')
  );

  await controller.requestDesktopMedia(CaptureMode.SCREEN, {
    ...createDesktopMediaRequestOptions(),
    desktopLabel: 'Window 1',
    desktopStreamId: 'desktop-1',
    sourceCount: 2,
    sourceIndex: 0,
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_FAILED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
        error: 'getUserMedia failed',
        phase: 'desktop-stream-acquire',
        sourceCount: 2,
        sourceIndex: 0,
      },
    })
  );
});

it('clears the single cached desktop slot when a stream-id acquisition fails', async () => {
  const controller = createOffscreenDesktopMediaController();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('single failed'));

  await controller.requestDesktopMedia(CaptureMode.SCREEN, {
    ...createDesktopMediaRequestOptions(),
    desktopLabel: 'Window 1',
    desktopStreamId: 'desktop-1',
  });

  expect(controller.consumeDesktopStream()).toEqual({ stream: null, label: null });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_FAILED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
        error: 'single failed',
        phase: 'desktop-stream-acquire',
      },
    })
  );
});
