import { beforeEach, expect, it, vi } from 'vitest';

const { localGetMock, localSetMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: localGetMock,
      set: localSetMock,
    },
  },
}));

import { loadRecentColors, pushRecentColor } from './index';

beforeEach(() => {
  vi.clearAllMocks();
});

it('normalizes stored recent colors and drops invalid entries', async () => {
  localGetMock.mockResolvedValue({
    sniptale_editor_recent_colors: ['#ABCDEF', '#bad', 'transparent', '#123456', 42],
  });

  await expect(loadRecentColors()).resolves.toEqual(['#abcdef', '#123456']);
});

it('queues committed writes and skips malformed colors', async () => {
  localGetMock
    .mockResolvedValueOnce({ sniptale_editor_recent_colors: ['#abcdef'] })
    .mockResolvedValueOnce({ sniptale_editor_recent_colors: ['#abcdef'] });

  await expect(pushRecentColor('#654321', 2)).resolves.toEqual(['#654321', '#abcdef']);
  await expect(pushRecentColor('oops', 2)).resolves.toEqual(['#abcdef']);

  expect(localSetMock).toHaveBeenCalledOnce();
  expect(localSetMock).toHaveBeenCalledWith({
    sniptale_editor_recent_colors: ['#654321', '#abcdef'],
  });
});
