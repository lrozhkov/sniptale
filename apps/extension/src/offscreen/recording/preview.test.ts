// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

import { createDesktopPreviewController, getSupportedMimeType } from './preview';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('offscreen desktop preview helpers', () => {
  it('attaches and detaches desktop preview videos through the preview controller', async () => {
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new Error('autoplay blocked'))
      .mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const removeSpy = vi.spyOn(HTMLVideoElement.prototype, 'remove').mockImplementation(() => {});
    const controller = createDesktopPreviewController();
    const stream = {} as MediaStream;

    const firstVideo = controller.attachDesktopPreview(stream);
    await Promise.resolve();

    expect(firstVideo.muted).toBe(true);
    expect(firstVideo.playsInline).toBe(true);
    expect(firstVideo.autoplay).toBe(true);
    expect(firstVideo.srcObject).toBe(stream);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Desktop preview play() rejected',
      expect.any(Error)
    );

    const secondVideo = controller.attachDesktopPreview(stream);
    expect(secondVideo.srcObject).toBe(stream);

    expect(controller.detachDesktopPreview(null)).toBeNull();
    expect(controller.detachDesktopPreview(secondVideo)).toBeNull();
    expect(pauseSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledOnce();

    playSpy.mockRestore();
    pauseSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('selects the first supported preview mime type and falls back to webm', () => {
    const mediaRecorderMock = {
      isTypeSupported: vi
        .fn()
        .mockImplementation((type: string) => type === 'video/webm;codecs=vp8,opus'),
    };

    vi.stubGlobal('MediaRecorder', mediaRecorderMock);
    expect(getSupportedMimeType()).toBe('video/webm;codecs=vp8,opus');

    mediaRecorderMock.isTypeSupported.mockReturnValue(false);
    expect(getSupportedMimeType()).toBe('video/webm');
  });
});
