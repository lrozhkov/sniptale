// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  readPermissionsSnapshot,
  requestCameraPermission,
  requestChromePermission,
  requestMicrophonePermission,
  requestOriginPermission,
} from './request';

const { containsMock, downloadsAvailableMock, requestMock } = vi.hoisted(() => ({
  containsMock: vi.fn(),
  downloadsAvailableMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', (_importOriginal) => ({
  browserDownloads: {
    isAvailable: downloadsAvailableMock,
  },
}));

vi.mock('@sniptale/platform/browser/permissions', (_importOriginal) => ({
  browserPermissions: {
    contains: containsMock,
    request: requestMock,
  },
}));

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

function defineNavigatorValue<Key extends keyof Navigator>(key: Key, value: unknown) {
  Object.defineProperty(globalThis.navigator, key, {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  containsMock.mockReset();
  downloadsAvailableMock.mockReset();
  requestMock.mockReset();

  defineNavigatorValue('clipboard', {
    write: vi.fn(),
  });

  defineNavigatorValue('mediaDevices', {
    getUserMedia: vi.fn(),
  });

  defineNavigatorValue('permissions', {
    query: vi.fn(async () => ({
      name: 'microphone',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      state: 'granted',
    })),
  });

  downloadsAvailableMock.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('routes chrome and origin permission requests through browser adapters', async () => {
  requestMock.mockResolvedValue(true);

  await expect(requestChromePermission('downloads')).resolves.toBe(true);
  await expect(requestOriginPermission('<all_urls>')).resolves.toBe(true);

  expect(requestMock).toHaveBeenNthCalledWith(1, { permissions: ['downloads'] });
  expect(requestMock).toHaveBeenNthCalledWith(2, { origins: ['<all_urls>'] });
});

it('reads permission snapshot across microphone, origin, and camera states', async () => {
  containsMock.mockResolvedValue(false);

  const snapshot = await readPermissionsSnapshot();

  expect(snapshot.map(({ id, state }) => ({ id, state }))).toEqual([
    { id: 'origins', state: 'prompt' },
    { id: 'microphone', state: 'granted' },
    { id: 'camera', state: 'granted' },
  ]);
});

it('requests microphone permission and maps failures to denied or prompt states', async () => {
  const deniedError = new DOMException('denied', 'NotAllowedError');
  const getUserMedia = vi
    .fn()
    .mockRejectedValueOnce(deniedError)
    .mockRejectedValueOnce(new DOMException('other', 'AbortError'));
  defineNavigatorValue('mediaDevices', {
    getUserMedia,
  });

  await expect(requestMicrophonePermission()).resolves.toBe('denied');
  await expect(requestMicrophonePermission()).resolves.toBe('prompt');
});

it('requests camera permission as video-only media and stops granted streams', async () => {
  const stop = vi.fn();
  const getUserMedia = vi
    .fn()
    .mockResolvedValueOnce({
      getTracks: () => [{ stop }],
    })
    .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    .mockRejectedValueOnce(new DOMException('other', 'AbortError'));
  defineNavigatorValue('mediaDevices', {
    getUserMedia,
  });

  await expect(requestCameraPermission()).resolves.toBe('granted');
  await expect(requestCameraPermission()).resolves.toBe('denied');
  await expect(requestCameraPermission()).resolves.toBe('prompt');

  expect(getUserMedia).toHaveBeenNthCalledWith(1, { video: true, audio: false });
  expect(stop).toHaveBeenCalledOnce();
});
