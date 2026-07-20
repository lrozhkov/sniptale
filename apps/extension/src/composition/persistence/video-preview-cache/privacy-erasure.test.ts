import { beforeEach, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  close: vi.fn(),
  deleteDatabase: vi.fn(),
  verifyAbsent: vi.fn(),
}));

vi.mock('./database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./database')>()),
  defaultVideoPreviewCacheDatabase: database,
}));

import {
  eraseVideoPreviewCacheForPrivacyErasure,
  verifyVideoPreviewCacheEmptyAfterPrivacyErasure,
} from './privacy-erasure';

beforeEach(() => {
  vi.clearAllMocks();
  database.close.mockResolvedValue(undefined);
  database.deleteDatabase.mockResolvedValue(undefined);
  database.verifyAbsent.mockResolvedValue(true);
});

it('closes the connection before deleting the privacy-owned cache database', async () => {
  await eraseVideoPreviewCacheForPrivacyErasure();

  expect(database.close).toHaveBeenCalledOnce();
  expect(database.deleteDatabase).toHaveBeenCalledOnce();
  expect(database.close.mock.invocationCallOrder[0]).toBeLessThan(
    database.deleteDatabase.mock.invocationCallOrder[0] ?? 0
  );
});

it('delegates final absence verification to the database authority', async () => {
  await expect(verifyVideoPreviewCacheEmptyAfterPrivacyErasure()).resolves.toBe(true);
  expect(database.verifyAbsent).toHaveBeenCalledOnce();
});
