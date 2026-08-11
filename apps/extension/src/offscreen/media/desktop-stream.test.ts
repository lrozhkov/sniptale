import { beforeEach, expect, it, vi } from 'vitest';
import { acquireDesktopStream } from './desktop-stream';

beforeEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getDisplayMedia: vi.fn(), getUserMedia: vi.fn() } },
  });
});

it('consumes a Chrome desktop stream id with native cursor exclusion', async () => {
  const stream = {} as MediaStream;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);

  await expect(
    acquireDesktopStream({
      controlledCursorCaptureEnabled: true,
      desktopStreamId: 'one-shot-stream',
    })
  ).resolves.toBe(stream);

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: 'one-shot-stream',
        maxFrameRate: 60,
      },
      cursor: 'never',
    },
  });
});
