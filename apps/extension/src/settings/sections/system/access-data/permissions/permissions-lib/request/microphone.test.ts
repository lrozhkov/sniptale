// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { requestMicrophonePermission } from './microphone';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function defineNavigatorValue<Key extends keyof Navigator>(key: Key, value: Navigator[Key]) {
  Object.defineProperty(globalThis.navigator, key, {
    configurable: true,
    value,
  });
}

it('requests microphone permission and maps failures to denied or prompt states', async () => {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
  });
  const deniedError = new DOMException('denied', 'NotAllowedError');
  const getUserMedia = vi
    .fn<Navigator['mediaDevices']['getUserMedia']>()
    .mockRejectedValueOnce(deniedError)
    .mockRejectedValueOnce(new DOMException('other', 'AbortError'));

  defineNavigatorValue('mediaDevices', {
    getUserMedia,
  } as unknown as Navigator['mediaDevices']);

  await expect(requestMicrophonePermission()).resolves.toBe('denied');
  await expect(requestMicrophonePermission()).resolves.toBe('prompt');
});

it('keeps a refused microphone request retryable when browser permission queries are absent', async () => {
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('dismissed', 'NotAllowedError')),
    },
  });
  await expect(requestMicrophonePermission()).resolves.toBe('prompt');
});
