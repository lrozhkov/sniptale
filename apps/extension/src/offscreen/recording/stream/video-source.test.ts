// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const loggerDebugMock = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: loggerDebugMock }),
}));

import { createSourceVideo, releaseSourceVideo, waitForSourceMetadata } from './video-source';
import { createEmptyStream } from '../multi-source/media-stream.test-support';

beforeEach(() => {
  vi.useRealTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setDimensions(video: HTMLVideoElement, width: number, height: number): void {
  Object.defineProperties(video, {
    videoHeight: { configurable: true, value: height },
    videoWidth: { configurable: true, value: width },
  });
}

it('creates a muted inline source video and accepts positive finite metadata', async () => {
  const stream = createEmptyStream();
  const video = createSourceVideo(stream);
  setDimensions(video, 1280, 720);

  const ready = waitForSourceMetadata(video);
  video.onloadedmetadata?.(new Event('loadedmetadata'));
  await expect(ready).resolves.toBeUndefined();

  expect(video.autoplay).toBe(true);
  expect(video.muted).toBe(true);
  expect(video.playsInline).toBe(true);
  expect(video.srcObject).toBe(stream);
  expect(video.onloadedmetadata).toBeNull();
});

it('rejects media errors, non-finite dimensions, and zero dimensions', async () => {
  const errored = document.createElement('video');
  setDimensions(errored, 1280, 720);
  const failure = waitForSourceMetadata(errored);
  errored.onerror?.(new Event('error'));
  await expect(failure).rejects.toThrow('Failed to load source metadata');

  const nonFinite = document.createElement('video');
  setDimensions(nonFinite, Number.NaN, 720);
  const nonFiniteReady = waitForSourceMetadata(nonFinite);
  nonFinite.onloadeddata?.(new Event('loadeddata'));
  await expect(nonFiniteReady).rejects.toThrow('not finite');

  const empty = document.createElement('video');
  setDimensions(empty, 0, 720);
  const emptyReady = waitForSourceMetadata(empty);
  empty.onloadedmetadata?.(new Event('loadedmetadata'));
  await expect(emptyReady).rejects.toThrow('invalid dimensions');
});

it('times out missing metadata and tolerates a deferred play call', async () => {
  vi.useFakeTimers();
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('autoplay deferred'));
  const video = document.createElement('video');
  const ready = waitForSourceMetadata(video);
  const expectation = expect(ready).rejects.toThrow('Timed out waiting for source metadata');

  await vi.advanceTimersByTimeAsync(10_000);
  await expectation;
  expect(video.onloadedmetadata).toBeNull();
  expect(video.onloadeddata).toBeNull();
  expect(video.onerror).toBeNull();
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Source video play deferred',
    expect.objectContaining({ error: expect.any(Error) })
  );
});

it('pauses and detaches the source stream on release', () => {
  const video = document.createElement('video');
  video.srcObject = createEmptyStream();

  releaseSourceVideo(video);

  expect(video.pause).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
});
