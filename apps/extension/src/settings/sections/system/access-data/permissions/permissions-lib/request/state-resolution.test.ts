// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { readPermissionsSnapshot } from './state-resolution';
import { initialPermissions } from '../types';

const { containsMock, downloadsAvailableMock } = vi.hoisted(() => ({
  containsMock: vi.fn(),
  downloadsAvailableMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', (_importOriginal) => ({
  browserDownloads: {
    isAvailable: downloadsAvailableMock,
  },
}));

vi.mock('./browser-permissions', (_importOriginal) => ({
  containsChromePermission: containsMock,
  containsOriginPermission: containsMock,
  containsOriginPermissions: containsMock,
}));

beforeEach(() => {
  containsMock.mockReset();
  downloadsAvailableMock.mockReset();
  downloadsAvailableMock.mockReturnValue(true);

  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { write: vi.fn() },
  });

  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: {
      query: vi.fn(async () => ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
        removeEventListener: vi.fn(),
        name: 'microphone',
        state: 'granted',
      })),
    },
  });
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

it('reports permission query failures as explicit error states', async () => {
  containsMock.mockRejectedValueOnce(new Error('origin failed'));

  const snapshot = await readPermissionsSnapshot();

  expect(snapshot.find(({ id }) => id === 'origins')?.state).toBe('error');
});

it('falls back to a single origin pattern when a permission has no origin pattern list', async () => {
  containsMock.mockResolvedValue(false);

  const snapshot = await readPermissionsSnapshot([
    {
      id: 'single-origin',
      icon: initialPermissions[0]!.icon,
      originPattern: 'https://example.test/*',
      state: 'unknown',
      type: 'origin',
    },
  ]);

  expect(containsMock).toHaveBeenCalledWith('https://example.test/*');
  expect(snapshot).toEqual([
    expect.objectContaining({
      id: 'single-origin',
      state: 'prompt',
    }),
  ]);
});

it('grants origin pattern lists and reports origin entries without patterns as unknown', async () => {
  containsMock.mockResolvedValue(true);

  const snapshot = await readPermissionsSnapshot([
    {
      id: 'all-sites',
      icon: initialPermissions[0]!.icon,
      originPatterns: ['<all_urls>'],
      state: 'unknown',
      type: 'origin',
    },
    {
      id: 'missing-origin-pattern',
      icon: initialPermissions[0]!.icon,
      state: 'unknown',
      type: 'origin',
    },
  ]);

  expect(containsMock).toHaveBeenCalledWith(['<all_urls>']);
  expect(snapshot).toEqual([
    expect.objectContaining({
      id: 'all-sites',
      state: 'granted',
    }),
    expect.objectContaining({
      id: 'missing-origin-pattern',
      state: 'unknown',
    }),
  ]);
});
