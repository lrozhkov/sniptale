import { beforeEach, expect, it, vi } from 'vitest';

const { localGetMock, localSetMock, observeMock, subscribeMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localSetMock: vi.fn(),
  observeMock: vi.fn(() => true),
  subscribeMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: observeMock,
    subscribeToChanges: subscribeMock,
    local: {
      get: localGetMock,
      set: localSetMock,
    },
  },
}));

import { loadRecentColors, pushRecentColor, subscribeRecentColors } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  observeMock.mockReturnValue(true);
});

it('subscribes to valid recent-color updates and ignores other storage changes', () => {
  const stop = vi.fn();
  subscribeMock.mockReturnValue(stop);
  const listener = vi.fn();
  const unsubscribe = subscribeRecentColors(listener);
  const callback = subscribeMock.mock.calls[0]?.[0];
  expect(callback).toBeTypeOf('function');
  callback({ sniptale_editor_recent_colors: { newValue: ['#ABCDEF80', 'invalid'] } }, 'sync');
  callback({ unrelated: { newValue: [] } }, 'local');
  expect(listener).not.toHaveBeenCalled();
  callback({ sniptale_editor_recent_colors: { newValue: ['#ABCDEF80', 'invalid'] } }, 'local');
  expect(listener).toHaveBeenCalledWith(['#abcdef80']);
  unsubscribe();
  expect(stop).toHaveBeenCalledOnce();
  observeMock.mockReturnValue(false);
  expect(subscribeRecentColors(listener)).toBeTypeOf('function');
  expect(subscribeMock).toHaveBeenCalledOnce();
});

it('normalizes stored recent colors and drops invalid entries', async () => {
  localGetMock.mockResolvedValue({
    sniptale_editor_recent_colors: ['#ABCDEF', '#bad', 'transparent', '#123456', 42],
  });

  await expect(loadRecentColors()).resolves.toEqual(['#abcdef', '#123456']);
});

it('remembers translucent drawing colors for the five quick swatches', async () => {
  localGetMock.mockResolvedValue({ sniptale_editor_recent_colors: ['#ABCDEF80'] });
  await expect(loadRecentColors()).resolves.toEqual(['#abcdef80']);
  await expect(pushRecentColor('#12345680')).resolves.toEqual(['#12345680', '#abcdef80']);
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
