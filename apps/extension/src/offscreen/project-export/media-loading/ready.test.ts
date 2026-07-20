// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { waitForImageReady, waitForMediaElementReady } from './ready';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    'Image',
    class ImageMock {
      complete = false;
      onerror: null | (() => void) = null;
      onload: null | (() => void) = null;
    } as never
  );
});

it('resolves media readiness for already-ready audio and video elements', async () => {
  const audio = document.createElement('audio');
  const video = document.createElement('video');

  Object.defineProperty(audio, 'readyState', {
    configurable: true,
    get: () => HTMLMediaElement.HAVE_METADATA,
  });
  Object.defineProperty(video, 'readyState', {
    configurable: true,
    get: () => HTMLMediaElement.HAVE_CURRENT_DATA,
  });

  await expect(waitForMediaElementReady(audio)).resolves.toBeUndefined();
  await expect(waitForMediaElementReady(video)).resolves.toBeUndefined();
});

it('rejects media readiness when a media element errors and resolves images once complete', async () => {
  const media = document.createElement('video');
  Object.defineProperty(media, 'readyState', {
    configurable: true,
    get: () => 0,
  });

  const readyPromise = waitForMediaElementReady(media);
  media.dispatchEvent(new Event('error'));
  await expect(readyPromise).rejects.toThrow('Failed to load export media resource.');

  const image = new Image();
  Object.defineProperty(image, 'complete', {
    configurable: true,
    value: true,
  });
  await expect(waitForImageReady(image)).resolves.toBeUndefined();
});

it('rejects pending media and image readiness when export aborts', async () => {
  const controller = new AbortController();
  const media = document.createElement('video');
  const image = new Image();

  Object.defineProperty(media, 'readyState', {
    configurable: true,
    get: () => 0,
  });

  const mediaReady = waitForMediaElementReady(media, { signal: controller.signal });
  const imageReady = waitForImageReady(image, { signal: controller.signal });

  controller.abort();

  await expect(mediaReady).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  await expect(imageReady).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
});

it('rejects readiness waits when media preload exceeds the bounded timeout', async () => {
  vi.useFakeTimers();
  const media = document.createElement('video');
  const image = new Image();

  Object.defineProperty(media, 'readyState', {
    configurable: true,
    get: () => 0,
  });

  const mediaReady = waitForMediaElementReady(media, { timeoutMs: 5 });
  const imageReady = waitForImageReady(image, { timeoutMs: 5 });
  const mediaExpectation = expect(mediaReady).rejects.toThrow(
    'Timed out loading export media resource.'
  );
  const imageExpectation = expect(imageReady).rejects.toThrow(
    'Timed out loading image asset for export.'
  );

  await vi.advanceTimersByTimeAsync(5);

  await mediaExpectation;
  await imageExpectation;
});
