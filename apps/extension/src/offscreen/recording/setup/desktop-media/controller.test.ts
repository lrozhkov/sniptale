import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOffscreenDesktopMediaController } from './controller';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { DesktopMediaRequestOptions } from './types';

const {
  attachDesktopPreviewMock,
  detachDesktopPreviewMock,
  loggerDebugMock,
  loggerErrorMock,
  normalizeDisplayMediaLabelMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  attachDesktopPreviewMock: vi.fn(),
  detachDesktopPreviewMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  normalizeDisplayMediaLabelMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
  }),
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
    detachDesktopPreview: detachDesktopPreviewMock,
  }),
}));

function asMediaStreamFixture<T extends object>(stream: T): MediaStream & T {
  return stream as MediaStream & T;
}

function createDesktopStream(label: string) {
  const stop = vi.fn();
  return asMediaStreamFixture({
    getVideoTracks: () => [{ label }],
    getTracks: () => [{ stop }],
    stop,
  });
}

function createDesktopStreamWithoutTracks() {
  return asMediaStreamFixture({
    getVideoTracks: () => [],
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

function useDesktopMediaControllerTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeDisplayMediaLabelMock.mockReturnValue('Normalized screen');
    sendRuntimeMessageMock.mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getDisplayMedia: vi.fn(),
          getUserMedia: vi.fn(),
        },
      },
    });
  });
}

async function verifiesCachedDesktopMediaLifecycle() {
  const previewVideo = {} as HTMLVideoElement;
  const stream = createDesktopStream('Entire Screen');
  const controller = createOffscreenDesktopMediaController();

  attachDesktopPreviewMock.mockReturnValue(previewVideo);
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(stream);

  await controller.requestDesktopMedia(
    CaptureMode.SCREEN,
    createDesktopMediaRequestOptions({ controlledCursorCaptureEnabled: true })
  );

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      logMessage: 'Failed to notify runtime about obtained desktop media',
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
        label: 'Normalized screen',
      },
    })
  );

  expect(controller.consumeDesktopStream()).toEqual({
    stream,
    label: 'Normalized screen',
  });
  expect(detachDesktopPreviewMock).toHaveBeenCalledWith(previewVideo);
  expect(controller.consumeDesktopStream()).toEqual({
    stream: null,
    label: null,
  });
}

async function verifiesObtainedMediaFailureTrace() {
  const previewVideo = {} as HTMLVideoElement;
  const stream = createDesktopStream('Entire Screen');
  const controller = createOffscreenDesktopMediaController();

  attachDesktopPreviewMock.mockReturnValue(previewVideo);
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(stream);

  await controller.requestDesktopMedia(
    CaptureMode.SCREEN,
    createDesktopMediaRequestOptions({ controlledCursorCaptureEnabled: true })
  );
  await Promise.resolve();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      context: expect.objectContaining({
        captureMode: CaptureMode.SCREEN,
        label: 'Normalized screen',
      }),
      logMessage: 'Failed to notify runtime about obtained desktop media',
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
        label: 'Normalized screen',
      },
    })
  );
  expect(controller.consumeDesktopStream()).toEqual({
    stream,
    label: 'Normalized screen',
  });
}

async function verifiesFallbackEmptyTrackLabelNormalization() {
  const previewVideo = {} as HTMLVideoElement;
  const stream = createDesktopStreamWithoutTracks();
  const controller = createOffscreenDesktopMediaController();

  attachDesktopPreviewMock.mockReturnValue(previewVideo);
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(stream);

  await controller.requestDesktopMedia(CaptureMode.SCREEN, createDesktopMediaRequestOptions());

  expect(normalizeDisplayMediaLabelMock).toHaveBeenCalledWith('', CaptureMode.SCREEN);
  expect(controller.consumeDesktopStream()).toEqual({
    stream,
    label: 'Normalized screen',
  });
}

async function verifiesControlledCursorDesktopConstraints() {
  const controller = createOffscreenDesktopMediaController();
  const stream = createDesktopStream('Window');
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(stream);

  await controller.requestDesktopMedia(
    CaptureMode.SCREEN,
    createDesktopMediaRequestOptions({ controlledCursorCaptureEnabled: true })
  );

  expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      cursor: 'never',
      frameRate: { ideal: 30 },
    },
  });
}

describe('offscreen-desktop-media controller success path', () => {
  useDesktopMediaControllerTestScope();

  it('caches desktop media and clears it after consumption', verifiesCachedDesktopMediaLifecycle);
  it(
    'normalizes desktop selections even when the captured stream has no label',
    verifiesFallbackEmptyTrackLabelNormalization
  );
  it(
    'logs obtained-media notification failures without losing the cached selection',
    verifiesObtainedMediaFailureTrace
  );
  it(
    'requests cursor-free desktop constraints when controlled cursor capture is enabled',
    verifiesControlledCursorDesktopConstraints
  );
});
