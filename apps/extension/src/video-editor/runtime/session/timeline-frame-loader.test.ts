// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadTimelineVideoPreviewFrames } from './timeline-frame-loader';

function mediaHarness(synchronousSeek = false) {
  const createElement = document.createElement.bind(document);
  const video = createElement('video');
  const canvas = createElement('canvas');
  let time = 0;
  let decoded = false;
  const finishSeek = () => {
    decoded = true;
    video.dispatchEvent(new Event('seeked'));
  };
  const seek = vi.fn((value: number) => {
    time = value;
    decoded = false;
    if (synchronousSeek) finishSeek();
  });
  Object.defineProperty(video, 'currentTime', { get: () => time, set: seek });
  const drawImage = vi.fn(() => {
    if (!decoded) throw new Error('Frame pixels are not available before seek completes');
  });
  Object.defineProperty(canvas, 'getContext', { value: () => ({ drawImage }) });
  Object.defineProperty(canvas, 'toBlob', {
    value: (callback: BlobCallback) =>
      callback(new Blob(['decoded frame'], { type: 'image/webp' })),
  });
  vi.spyOn(document, 'createElement').mockImplementation((name) => {
    if (name === 'video') return video;
    if (name === 'canvas') return canvas;
    return createElement(name);
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:decoded-frame'),
    revokeObjectURL: vi.fn(),
  });
  return { video, drawImage, seek, finishSeek };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('waits for decoded zero-time pixels even when currentTime already equals the sample', async () => {
  const media = mediaHarness();
  const outcome = loadTimelineVideoPreviewFrames({
    assetUrl: 'blob:video',
    samples: [{ cacheKey: 'first', sourceTime: 0 }],
  }).catch((error: unknown) => error);
  media.video.dispatchEvent(new Event('loadeddata'));
  await vi.waitFor(() => expect(media.seek).toHaveBeenCalledTimes(1));
  expect(media.drawImage).not.toHaveBeenCalled();
  expect(media.seek).toHaveBeenCalledExactlyOnceWith(0);
  media.finishSeek();
  expect(await outcome).toEqual([{ cacheKey: 'first', sourceTime: 0, url: 'blob:decoded-frame' }]);
  expect(media.drawImage).toHaveBeenCalledOnce();
  expect(media.video.getAttribute('src')).toBe('');
});

it('subscribes before seeking so an immediately available frame cannot be missed', async () => {
  const media = mediaHarness(true);
  const outcome = loadTimelineVideoPreviewFrames({
    assetUrl: 'blob:video',
    samples: [{ cacheKey: 'later', sourceTime: 2 }],
  });
  media.video.dispatchEvent(new Event('loadeddata'));
  expect(await outcome).toEqual([{ cacheKey: 'later', sourceTime: 2, url: 'blob:decoded-frame' }]);
  expect(media.video.getAttribute('src')).toBe('');
});

it.each(['abort', 'error'] as const)(
  'discards a partial batch on %s while awaiting the next frame',
  async (ending) => {
    const media = mediaHarness();
    const controller = new AbortController();
    const outcome = loadTimelineVideoPreviewFrames({
      assetUrl: 'blob:video',
      signal: controller.signal,
      samples: [
        { cacheKey: 'first', sourceTime: 0 },
        { cacheKey: 'second', sourceTime: 1 },
      ],
    }).catch((error: unknown) => error);
    media.video.dispatchEvent(new Event('loadeddata'));
    await vi.waitFor(() => expect(media.seek).toHaveBeenCalledTimes(1));
    media.finishSeek();
    await vi.waitFor(() => expect(media.seek).toHaveBeenCalledTimes(2));
    if (ending === 'abort') controller.abort();
    else media.video.dispatchEvent(new Event('error'));
    expect(await outcome).toMatchObject({ name: ending === 'abort' ? 'AbortError' : 'Error' });
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:decoded-frame');
    expect(media.video.getAttribute('src')).toBe('');
    media.finishSeek();
    expect(media.drawImage).toHaveBeenCalledTimes(1);
  }
);

it('keeps portrait pixels proportional inside a sufficiently detailed filmstrip cell', async () => {
  const media = mediaHarness(true);
  Object.defineProperty(media.video, 'videoWidth', { value: 720 });
  Object.defineProperty(media.video, 'videoHeight', { value: 1280 });
  const outcome = loadTimelineVideoPreviewFrames({
    assetUrl: 'blob:portrait',
    samples: [{ cacheKey: 'portrait', sourceTime: 0 }],
  });
  media.video.dispatchEvent(new Event('loadeddata'));
  await outcome;
  expect(media.drawImage).toHaveBeenCalledWith(media.video, 109.375, 0, 101.25, 180);
});
