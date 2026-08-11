import { beforeEach, expect, it, vi } from 'vitest';
import { acquireDesktopStream } from './desktop-stream';
import { createConfigurableVideoStream } from '../recording/multi-source/media-stream.test-support';

beforeEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getDisplayMedia: vi.fn(), getUserMedia: vi.fn() } },
  });
});

it('consumes a Chrome desktop stream id with native cursor exclusion', async () => {
  const applyConstraints = vi.fn().mockResolvedValue(undefined);
  const stream = createConfigurableVideoStream({
    applyConstraints,
    settings: { cursor: 'never' } as MediaTrackSettings,
  });
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
    },
  });
  expect(applyConstraints).toHaveBeenCalledWith({ cursor: 'never' });
});

it('fails closed and stops the stream when Chrome cannot apply cursor exclusion', async () => {
  const applyConstraints = vi.fn().mockRejectedValue(new DOMException('unsupported'));
  const stream = createConfigurableVideoStream({ applyConstraints, settings: {} });
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);

  await expect(
    acquireDesktopStream({
      controlledCursorCaptureEnabled: true,
      desktopStreamId: 'one-shot-stream',
    })
  ).rejects.toThrow('unsupported');
  expect(stream.getTracks()[0]?.stop).toHaveBeenCalledOnce();
});

it('omits the cursor constraint when controlled cursor capture is disabled', async () => {
  const stream = createConfigurableVideoStream({ settings: {} });
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);

  await expect(acquireDesktopStream({ desktopStreamId: 'one-shot-stream' })).resolves.toBe(stream);

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: 'one-shot-stream',
        maxFrameRate: 60,
      },
    },
  });
});

it.each([
  [true, { cursor: 'never', frameRate: { ideal: 60 } }],
  [false, { frameRate: { ideal: 60 } }],
] as const)(
  'uses display media when no stream id is supplied (controlled cursor: %s)',
  async (controlledCursorCaptureEnabled, video) => {
    const stream = createConfigurableVideoStream({ settings: {} });
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(stream);

    await expect(acquireDesktopStream({ controlledCursorCaptureEnabled })).resolves.toBe(stream);

    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
      audio: false,
      video,
    });
  }
);
