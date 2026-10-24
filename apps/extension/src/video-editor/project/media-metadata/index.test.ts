// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { loadAudioMetadata, loadImageMetadata } from './index';

const originalAudioContext = window.AudioContext;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: originalAudioContext,
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectUrl,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectUrl,
  });
});

for (const outcome of ['load', 'error'] as const) {
  it(`retires image metadata callbacks after ${outcome} before source cleanup can emit another error`, async () => {
    const cleanupErrors: Array<() => void> = [];
    class MetadataImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 640;
      naturalHeight = 480;
      set src(value: string) {
        if (value === '') cleanupErrors.push(() => this.onerror?.());
      }
    }
    const image = new MetadataImage();
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          return image;
        }
      }
    );
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:image-metadata'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const blob = new Blob(['image bytes'], { type: 'image/png' });
    const metadata = loadImageMetadata(blob);
    const settled = metadata.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    );
    if (outcome === 'load') image.onload?.();
    else image.onerror?.();
    const result = await settled;
    if (outcome === 'load') {
      expect(result).toEqual({
        value: {
          width: 640,
          height: 480,
          size: blob.size,
          mimeType: 'image/png',
        },
      });
    } else expect(result).toEqual({ error: expect.any(Error) });
    const firstCleanupErrors = cleanupErrors.splice(0);
    firstCleanupErrors.forEach((emit) => emit());
    expect(cleanupErrors).toEqual([]);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:image-metadata');
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
  });
}

it('skips audio peak extraction when duration resolution uses fallback', async () => {
  vi.useFakeTimers();
  const blob = new Blob([], { type: 'audio/mpeg' });
  const readBytes = vi.fn();
  const contextConstructed = vi.fn();
  class AudioContextMock {
    constructor() {
      contextConstructed();
    }
  }

  Object.defineProperty(blob, 'arrayBuffer', {
    configurable: true,
    value: readBytes,
  });
  Object.defineProperty(blob, 'size', {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: AudioContextMock,
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:metadata-test'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });

  const metadataPromise = loadAudioMetadata(blob);

  await vi.advanceTimersByTimeAsync(4_000);

  await expect(metadataPromise).resolves.toEqual({
    audioPeaks: null,
    duration: 1,
    hasAudio: true,
    mimeType: 'audio/mpeg',
    size: 1024,
  });
  expect(readBytes).not.toHaveBeenCalled();
  expect(contextConstructed).not.toHaveBeenCalled();
});
