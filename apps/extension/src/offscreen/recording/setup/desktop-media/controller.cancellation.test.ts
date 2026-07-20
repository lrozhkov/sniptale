import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOffscreenDesktopMediaController } from './controller';
import type { DesktopMediaRequestOptions } from './types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const {
  attachDesktopPreviewMock,
  detachDesktopPreviewMock,
  loggerErrorMock,
  normalizeDisplayMediaLabelMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  attachDesktopPreviewMock: vi.fn(),
  detachDesktopPreviewMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  normalizeDisplayMediaLabelMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
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

async function verifiesCancelledDesktopMediaReset() {
  const previewVideo = {} as HTMLVideoElement;
  const stream = createDesktopStream('Entire Screen');
  const controller = createOffscreenDesktopMediaController();
  const requestError = new Error('cancelled');

  attachDesktopPreviewMock.mockReturnValue(previewVideo);
  vi.mocked(navigator.mediaDevices.getDisplayMedia)
    .mockResolvedValueOnce(stream)
    .mockRejectedValueOnce(requestError);

  await controller.requestDesktopMedia(CaptureMode.SCREEN, createDesktopMediaRequestOptions());
  controller.consumeDesktopStream();
  await controller.requestDesktopMedia(
    CaptureMode.SCREEN,
    createDesktopMediaRequestOptions({
      desktopMediaRequestGeneration: 'desktop-generation-2',
      desktopMediaRequestId: 'desktop-request-2',
    })
  );

  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      context: { captureMode: CaptureMode.SCREEN },
      logMessage: 'Failed to notify runtime about cancelled desktop media request',
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_CANCELLED,
        desktopMediaRequestGeneration: 'desktop-generation-2',
        desktopMediaRequestId: 'desktop-request-2',
      },
    })
  );
  expect(controller.consumeDesktopStream()).toEqual({
    stream: null,
    label: null,
  });
}

async function verifiesPreviousDesktopSelectionIsDisposedBeforeReplacement() {
  const firstPreview = {} as HTMLVideoElement;
  const secondPreview = {} as HTMLVideoElement;
  const firstStream = createDesktopStream('Entire Screen');
  const secondStream = createDesktopStream('Window');
  const controller = createOffscreenDesktopMediaController();

  attachDesktopPreviewMock.mockReturnValueOnce(firstPreview).mockReturnValueOnce(secondPreview);
  vi.mocked(navigator.mediaDevices.getDisplayMedia)
    .mockResolvedValueOnce(firstStream)
    .mockResolvedValueOnce(secondStream);

  await controller.requestDesktopMedia(CaptureMode.SCREEN, createDesktopMediaRequestOptions());
  await controller.requestDesktopMedia(
    CaptureMode.SCREEN,
    createDesktopMediaRequestOptions({
      desktopMediaRequestGeneration: 'desktop-generation-2',
      desktopMediaRequestId: 'desktop-request-2',
    })
  );

  expect(firstStream.stop).toHaveBeenCalledOnce();
  expect(detachDesktopPreviewMock).toHaveBeenCalledWith(firstPreview);
  expect(controller.consumeDesktopStream()).toEqual({
    stream: secondStream,
    label: 'Normalized screen',
  });
}

async function verifiesCancelledMediaFailureTrace() {
  const controller = createOffscreenDesktopMediaController();
  const requestError = new Error('cancelled');

  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockRejectedValue(requestError);

  await controller.requestDesktopMedia(CaptureMode.SCREEN, createDesktopMediaRequestOptions());
  await Promise.resolve();

  expect(loggerErrorMock).toHaveBeenCalledWith('Desktop media cancelled or failed', requestError);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      context: { captureMode: CaptureMode.SCREEN },
      logMessage: 'Failed to notify runtime about cancelled desktop media request',
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_CANCELLED,
        desktopMediaRequestGeneration: 'desktop-generation-1',
        desktopMediaRequestId: 'desktop-request-1',
      },
    })
  );
}

function verifiesIdlePreviewDetach() {
  const controller = createOffscreenDesktopMediaController();

  controller.detachCachedPreview();

  expect(detachDesktopPreviewMock).not.toHaveBeenCalled();
  expect(controller.consumeDesktopStream()).toEqual({
    stream: null,
    label: null,
  });
}

describe('offscreen-desktop-media controller cancellation path', () => {
  it('ignores preview detachment when no cached preview exists', verifiesIdlePreviewDetach);
  it(
    'reports cancelled desktop media requests and clears preview state',
    verifiesCancelledDesktopMediaReset
  );
  it(
    'logs cancelled-media notification failures as low-noise debug traces',
    verifiesCancelledMediaFailureTrace
  );
  it(
    'disposes the previous cached desktop stream before replacing it',
    verifiesPreviousDesktopSelectionIsDisposedBeforeReplacement
  );
});
