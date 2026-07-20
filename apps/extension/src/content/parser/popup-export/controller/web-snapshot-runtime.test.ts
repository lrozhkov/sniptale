import { expect, it, vi } from 'vitest';

const saveCurrentPageWebSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock('../../web-snapshot/save', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../web-snapshot/save')>()),
  saveCurrentPageWebSnapshot: saveCurrentPageWebSnapshotMock,
}));

import { handlePopupWebSnapshotRuntime } from './web-snapshot-runtime';

async function flushPopupWebSnapshotRuntime(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

it('normalizes non-error save failures', async () => {
  const sendResponse = vi.fn();
  saveCurrentPageWebSnapshotMock.mockRejectedValueOnce('string failure');

  expect(handlePopupWebSnapshotRuntime(sendResponse, 'req-web', true, false)).toBe(true);
  await flushPopupWebSnapshotRuntime();

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'string failure',
    success: false,
    warnings: [],
  });
});
