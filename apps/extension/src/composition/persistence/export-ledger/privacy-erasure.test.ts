import { beforeEach, expect, it, vi } from 'vitest';

const { isAvailableMock, removeMock } = vi.hoisted(() => ({
  isAvailableMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    session: {
      isAvailable: isAvailableMock,
      remove: removeMock,
    },
  },
}));

import { clearProjectExportJobLedgerForPrivacyErasure } from './privacy-erasure';

beforeEach(() => {
  vi.clearAllMocks();
  isAvailableMock.mockReturnValue(true);
  removeMock.mockResolvedValue(undefined);
});

it('removes an unreadable ledger through the privacy-erasure owner path', async () => {
  await clearProjectExportJobLedgerForPrivacyErasure();

  expect(removeMock).toHaveBeenCalledWith('sniptale_project_export_active_job');
});

it('fails closed when the ledger storage area is unavailable', async () => {
  isAvailableMock.mockReturnValue(false);

  await expect(clearProjectExportJobLedgerForPrivacyErasure()).rejects.toThrow('unavailable');
  expect(removeMock).not.toHaveBeenCalled();
});
