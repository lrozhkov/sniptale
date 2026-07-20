import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  ensure: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
vi.mock('../../media/video/runtime/offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media/video/runtime/offscreen-manager')>()),
  closeOffscreenDocumentForPrivacyErasure: mocks.close,
  ensurePrivacyErasureOffscreenDocument: mocks.ensure,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { extensionPageLocalStorageErasureAdapter } from './page-local-storage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.close.mockResolvedValue(undefined);
  mocks.ensure.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true, empty: true, removedCount: 3 });
});

it('owns isolated offscreen preparation, typed erase/verify commands, and release', async () => {
  await extensionPageLocalStorageErasureAdapter.prepare();
  await expect(
    extensionPageLocalStorageErasureAdapter.erase({ preservePreferences: true })
  ).resolves.toBe(3);
  await expect(
    extensionPageLocalStorageErasureAdapter.verifyEmpty({ preservePreferences: true })
  ).resolves.toBe(true);
  await extensionPageLocalStorageErasureAdapter.release();

  expect(mocks.ensure).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      operation: 'erase',
      preservePreferences: true,
      capabilityToken: expect.any(String),
    })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'verify' })
  );
});

it('fails closed when offscreen verification is not explicitly empty', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true, empty: false });

  await expect(
    extensionPageLocalStorageErasureAdapter.erase({ preservePreferences: false })
  ).rejects.toThrow('Extension page local storage erasure failed');
});
