// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialPermissions, type PermissionInfo } from './types';
import {
  readPermissionsSnapshot,
  requestChromePermission,
  requestMicrophonePermission,
  requestOriginPermission,
} from './request';
import { subscribeToPermissionChanges } from './subscriptions';

const {
  containsMock,
  downloadsAvailableMock,
  requestMock,
  subscribeToAddedMock,
  subscribeToRemovedMock,
} = vi.hoisted(() => ({
  containsMock: vi.fn(),
  downloadsAvailableMock: vi.fn(),
  requestMock: vi.fn(),
  subscribeToAddedMock: vi.fn(),
  subscribeToRemovedMock: vi.fn(),
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
    subscribeToAdded: subscribeToAddedMock,
    subscribeToRemoved: subscribeToRemovedMock,
  },
}));

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

function defineNavigatorValue(key: keyof Navigator, value: unknown) {
  Object.defineProperty(globalThis.navigator, key, {
    configurable: true,
    value,
  });
}

function createPermissionInfo(overrides: Partial<PermissionInfo>): PermissionInfo {
  return {
    id: 'custom',
    icon: initialPermissions[0]!.icon,
    state: 'unknown',
    type: 'chrome',
    ...(overrides.chromePermission === undefined
      ? overrides
      : { ...overrides, chromePermission: overrides.chromePermission }),
  };
}

beforeEach(() => {
  containsMock.mockReset();
  downloadsAvailableMock.mockReset();
  requestMock.mockReset();
  subscribeToAddedMock.mockReset();
  subscribeToRemovedMock.mockReset();

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
  } as Navigator['permissions']);

  downloadsAvailableMock.mockReturnValue(true);
  subscribeToAddedMock.mockImplementation((listener: () => void) => {
    void listener;
    return vi.fn();
  });
  subscribeToRemovedMock.mockImplementation((listener: () => void) => {
    void listener;
    return vi.fn();
  });
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
  containsMock.mockImplementation(async (query: { permissions?: string[]; origins?: string[] }) => {
    if (query.origins?.includes('<all_urls>')) {
      return false;
    }
    return false;
  });

  const snapshot = await readPermissionsSnapshot();

  expect(snapshot.map(({ id, state }) => ({ id, state }))).toEqual([
    { id: 'origins', state: 'prompt' },
    { id: 'microphone', state: 'granted' },
    { id: 'camera', state: 'granted' },
  ]);
});

it('reports explicit permission read errors while keeping capability absences as prompt/unknown', async () => {
  defineNavigatorValue('clipboard', {} as Navigator['clipboard']);
  defineNavigatorValue('permissions', {
    query: vi.fn(async () => {
      throw new Error('no permission api');
    }),
  } as Navigator['permissions']);
  downloadsAvailableMock.mockReturnValue(false);
  containsMock.mockImplementation(async (query: { origins?: string[] }) => {
    if (query.origins?.includes('<all_urls>')) {
      throw new Error('origin lookup failed');
    }
    return false;
  });

  const snapshot = await readPermissionsSnapshot([
    initialPermissions[0]!,
    initialPermissions[1]!,
    initialPermissions[2]!,
    createPermissionInfo({
      id: 'custom-chrome',
      chromePermission: 'activeTab',
    }),
    createPermissionInfo({
      id: 'no-chrome-permission',
      type: 'chrome',
    }),
  ]);

  expect(snapshot.map(({ id, state }) => ({ id, state }))).toEqual([
    { id: 'origins', state: 'error' },
    { id: 'microphone', state: 'error' },
    { id: 'camera', state: 'error' },
    { id: 'custom-chrome', state: 'prompt' },
    { id: 'no-chrome-permission', state: 'unknown' },
  ]);
});

describe('settings microphone permission flows', () => {
  it('requests microphone permission and stops acquired tracks on success', async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }],
    }));
    defineNavigatorValue('mediaDevices', {
      getUserMedia,
    });

    await expect(requestMicrophonePermission()).resolves.toBe('granted');
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it('maps microphone request failures to denied or prompt states', async () => {
    const deniedError = new DOMException('denied', 'NotAllowedError');
    const getUserMedia = vi
      .fn<Navigator['mediaDevices']['getUserMedia']>()
      .mockRejectedValueOnce(deniedError)
      .mockRejectedValueOnce(new DOMException('other', 'AbortError'));
    defineNavigatorValue('mediaDevices', {
      getUserMedia,
    });

    await expect(requestMicrophonePermission()).resolves.toBe('denied');
    await expect(requestMicrophonePermission()).resolves.toBe('prompt');
  });
});

describe('settings permission subscriptions', () => {
  it('subscribes to both permission change channels and cleans them up', () => {
    const listener = vi.fn();
    const unsubscribeAdded = vi.fn();
    const unsubscribeRemoved = vi.fn();
    subscribeToAddedMock.mockReturnValue(unsubscribeAdded);
    subscribeToRemovedMock.mockReturnValue(unsubscribeRemoved);

    const unsubscribe = subscribeToPermissionChanges(listener);

    expect(subscribeToAddedMock).toHaveBeenCalledTimes(1);
    expect(subscribeToRemovedMock).toHaveBeenCalledTimes(1);

    const addedListener = subscribeToAddedMock.mock.calls[0]?.[0] as (() => void) | undefined;
    const removedListener = subscribeToRemovedMock.mock.calls[0]?.[0] as (() => void) | undefined;
    addedListener?.();
    removedListener?.();

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();

    expect(unsubscribeAdded).toHaveBeenCalledTimes(1);
    expect(unsubscribeRemoved).toHaveBeenCalledTimes(1);
  });
});
