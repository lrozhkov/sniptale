import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createOffscreenDesktopMediaController } from './controller';
import type { DesktopMediaRequestOptions } from './types';

const { attachDesktopPreviewMock, detachDesktopPreviewMock, normalizeDisplayMediaLabelMock } =
  vi.hoisted(() => ({
    attachDesktopPreviewMock: vi.fn(),
    detachDesktopPreviewMock: vi.fn(),
    normalizeDisplayMediaLabelMock: vi.fn(),
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
  sendRuntimeMessageBestEffort: vi.fn().mockResolvedValue(undefined),
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
    getTracks: () => [{ stop }],
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

function useDesktopMediaControllerMultiSourceScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeDisplayMediaLabelMock.mockReturnValue('Normalized screen');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getDisplayMedia: vi.fn(), getUserMedia: vi.fn() } },
    });
  });
}

function registerMultiSourceAccumulationTest() {
  it('accumulates multi-source desktop streams until batch consumption', async () => {
    const firstPreview = {} as HTMLVideoElement;
    const secondPreview = {} as HTMLVideoElement;
    const firstStream = createDesktopStream('Window 1');
    const secondStream = createDesktopStream('Window 2');
    const controller = createOffscreenDesktopMediaController();

    attachDesktopPreviewMock.mockReturnValueOnce(firstPreview).mockReturnValueOnce(secondPreview);
    vi.mocked(navigator.mediaDevices.getDisplayMedia)
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream);

    await controller.requestDesktopMedia(CaptureMode.SCREEN, {
      ...createDesktopMediaRequestOptions(),
      sourceCount: 2,
      sourceIndex: 0,
    });
    await controller.requestDesktopMedia(CaptureMode.SCREEN, {
      ...createDesktopMediaRequestOptions({
        desktopMediaRequestGeneration: 'desktop-generation-2',
        desktopMediaRequestId: 'desktop-request-2',
      }),
      sourceCount: 2,
      sourceIndex: 1,
    });

    expect(controller.consumeDesktopStreams()).toEqual([
      { stream: firstStream, label: 'Normalized screen' },
      { stream: secondStream, label: 'Normalized screen' },
    ]);
    expect(detachDesktopPreviewMock).toHaveBeenCalledWith(firstPreview);
    expect(detachDesktopPreviewMock).toHaveBeenCalledWith(secondPreview);
  });
}

function registerMultiSourceResetTest() {
  it('clears prepared multi-source streams when a new batch starts or is disposed', async () => {
    const oldPreview = {} as HTMLVideoElement;
    const nextPreview = {} as HTMLVideoElement;
    const oldStream = createDesktopStream('Old');
    const nextStream = createDesktopStream('Next');
    const controller = createOffscreenDesktopMediaController();

    attachDesktopPreviewMock.mockReturnValueOnce(oldPreview).mockReturnValueOnce(nextPreview);
    vi.mocked(navigator.mediaDevices.getDisplayMedia)
      .mockResolvedValueOnce(oldStream)
      .mockResolvedValueOnce(nextStream);

    await controller.requestDesktopMedia(CaptureMode.SCREEN, {
      ...createDesktopMediaRequestOptions(),
      sourceCount: 2,
      sourceIndex: 0,
    });
    await controller.requestDesktopMedia(CaptureMode.SCREEN, {
      ...createDesktopMediaRequestOptions({
        desktopMediaRequestGeneration: 'desktop-generation-2',
        desktopMediaRequestId: 'desktop-request-2',
      }),
      sourceCount: 2,
      sourceIndex: 0,
    });
    controller.disposeMultiSourceDesktopMedia();

    expect(detachDesktopPreviewMock).toHaveBeenCalledWith(oldPreview);
    expect(detachDesktopPreviewMock).toHaveBeenCalledWith(nextPreview);
  });
}

describe('offscreen-desktop-media controller multi-source path', () => {
  useDesktopMediaControllerMultiSourceScope();
  registerMultiSourceAccumulationTest();
  registerMultiSourceResetTest();
});

describe('offscreen-desktop-media controller compatibility path', () => {
  useDesktopMediaControllerMultiSourceScope();

  it('caches and consumes a single desktop stream through the compatibility path', async () => {
    const preview = {} as HTMLVideoElement;
    const stream = createDesktopStream('Window');
    const controller = createOffscreenDesktopMediaController();

    attachDesktopPreviewMock.mockReturnValueOnce(preview);
    Object.assign(navigator.mediaDevices, { getDisplayMedia: vi.fn() });
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValueOnce(stream);

    await controller.requestDesktopMedia(
      CaptureMode.SCREEN,
      createDesktopMediaRequestOptions({ controlledCursorCaptureEnabled: true })
    );

    expect(controller.consumeDesktopStream()).toEqual({ stream, label: 'Normalized screen' });
    expect(detachDesktopPreviewMock).toHaveBeenCalledWith(preview);
    controller.detachCachedPreview();
  });

  it('reports cancellation and clears cached desktop media after picker failures', async () => {
    const controller = createOffscreenDesktopMediaController();
    Object.assign(navigator.mediaDevices, { getDisplayMedia: vi.fn() });
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockRejectedValueOnce(new Error('cancelled'));

    await controller.requestDesktopMedia(CaptureMode.SCREEN, createDesktopMediaRequestOptions());

    expect(controller.consumeDesktopStream()).toEqual({ stream: null, label: null });
  });
});
