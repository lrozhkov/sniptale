// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { loadAudioMetadata } from './index';

const originalAudioContext = window.AudioContext;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
