import { beforeEach, expect, it, vi } from 'vitest';

const { searchMock, warnMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
    search: searchMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: warnMock }),
}));

import { readCurrentTerminalDownloadState } from './service-state';

beforeEach(() => {
  vi.clearAllMocks();
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
