import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  errorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: mocks.errorMock,
  }),
}));

import { refreshPopupSecondaryState } from './refresh-popup-secondary-state';

beforeEach(() => {
  mocks.errorMock.mockReset();
});

it('returns early when popup bootstrap refresh was cancelled', async () => {
  const refreshActiveTabCapabilities = vi.fn(async () => undefined);
  const refreshGalleryStatus = vi.fn(async () => undefined);

  await refreshPopupSecondaryState({
    cancelledRef: () => true,
    refreshActiveTabCapabilities,
    refreshGalleryStatus,
  });

  expect(refreshActiveTabCapabilities).not.toHaveBeenCalled();
  expect(refreshGalleryStatus).not.toHaveBeenCalled();
});

it('logs secondary refresh failures without rethrowing', async () => {
  const refreshActiveTabCapabilities = vi.fn(async () => undefined);
  const refreshGalleryStatus = vi.fn(async () => {
    throw new Error('boom');
  });

  await refreshPopupSecondaryState({
    cancelledRef: () => false,
    refreshActiveTabCapabilities,
    refreshGalleryStatus,
  });

  expect(refreshActiveTabCapabilities).toHaveBeenCalledTimes(1);
  expect(refreshGalleryStatus).toHaveBeenCalledTimes(1);
  expect(mocks.errorMock).toHaveBeenCalledWith(
    'Failed to refresh popup secondary state',
    expect.any(Error)
  );
});
