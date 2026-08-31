import { beforeEach, expect, it, vi } from 'vitest';

const { searchAvailability, searchMock, warnMock } = vi.hoisted(() => ({
  searchAvailability: { value: true },
  searchMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
    get search() {
      return searchAvailability.value ? searchMock : undefined;
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: warnMock }),
}));

import { readCurrentTerminalDownloadState, readDownloadInterruptionReason } from './service-state';

beforeEach(() => {
  vi.clearAllMocks();
  searchAvailability.value = true;
});

it('reads current terminal download state from the downloads adapter', async () => {
  searchMock.mockResolvedValueOnce([{ id: 7, state: 'complete' }]);
  searchMock.mockResolvedValueOnce([{ id: 8, state: 'in_progress' }]);

  await expect(readCurrentTerminalDownloadState(7)).resolves.toBe('complete');
  await expect(readCurrentTerminalDownloadState(8)).resolves.toBeNull();
});

it('treats failed or malformed download searches as non-terminal', async () => {
  searchMock.mockRejectedValueOnce(new Error('search failed'));
  searchMock.mockResolvedValueOnce(undefined);

  await expect(readCurrentTerminalDownloadState(9)).resolves.toBeNull();
  await expect(readCurrentTerminalDownloadState(10)).resolves.toBeNull();
  expect(warnMock).toHaveBeenCalledWith(
    'Failed to reconcile registered download state',
    expect.any(Error)
  );
});

it('retains only a browser-provided interruption reason', async () => {
  searchMock
    .mockResolvedValueOnce([{ error: 'NETWORK_FAILED', id: 11, state: 'interrupted' }])
    .mockResolvedValueOnce([{ id: 12, state: 'interrupted' }])
    .mockResolvedValueOnce([{ error: 'SERVER_FAILED', id: 13, state: 'complete' }]);

  await expect(readDownloadInterruptionReason(11)).resolves.toBe('NETWORK_FAILED');
  await expect(readDownloadInterruptionReason(12)).resolves.toBeNull();
  await expect(readDownloadInterruptionReason(13)).resolves.toBeNull();
});

it('treats an unavailable browser search capability as unknown state', async () => {
  searchAvailability.value = false;

  await expect(readCurrentTerminalDownloadState(14)).resolves.toBeNull();
  await expect(readDownloadInterruptionReason(14)).resolves.toBeNull();
});
