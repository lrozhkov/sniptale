import { beforeEach, expect, it, vi } from 'vitest';

const { sendPrivacyErasureRuntimeMessageMock } = vi.hoisted(() => ({
  sendPrivacyErasureRuntimeMessageMock: vi.fn(),
}));

vi.mock('./transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transport')>()),
  sendPrivacyErasureRuntimeMessage: sendPrivacyErasureRuntimeMessageMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { requestLocalExtensionDataErasure } from '.';

beforeEach(() => {
  vi.clearAllMocks();
});

it('sends a typed local data erasure request through runtime messaging', async () => {
  sendPrivacyErasureRuntimeMessageMock.mockResolvedValue({
    success: true,
    result: {
      failedRequiredParticipantIds: [],
      indexedDbStoresCleared: 19,
      localStorageKeysRemoved: [],
      participants: [],
      success: true,
      sessionStorageKeysRemoved: [],
      syncStorageKeysRemoved: [],
    },
  });

  await expect(
    requestLocalExtensionDataErasure({
      includeAiProviderSecrets: false,
      preservePreferences: true,
    })
  ).resolves.toMatchObject({ indexedDbStoresCleared: 19 });

  expect(sendPrivacyErasureRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
    includeAiProviderSecrets: false,
    preservePreferences: true,
  });
});

it('throws when the background erasure route rejects the request', async () => {
  sendPrivacyErasureRuntimeMessageMock.mockResolvedValue({ success: false, error: 'Denied' });

  await expect(
    requestLocalExtensionDataErasure({
      includeAiProviderSecrets: true,
      preservePreferences: false,
    })
  ).rejects.toThrow('Denied');
});

it('throws when the background route reports a partial erasure failure', async () => {
  sendPrivacyErasureRuntimeMessageMock.mockResolvedValue({
    error: 'Local data erasure failed: indexed-db:editor-bootstrap',
    success: false,
    result: {
      failedRequiredParticipantIds: ['indexed-db:editor-bootstrap'],
      indexedDbStoresCleared: 19,
      localStorageKeysRemoved: [],
      participants: [],
      success: false,
      sessionStorageKeysRemoved: [],
      syncStorageKeysRemoved: [],
    },
  });

  await expect(
    requestLocalExtensionDataErasure({
      includeAiProviderSecrets: true,
      preservePreferences: false,
    })
  ).rejects.toThrow('indexed-db:editor-bootstrap');
});
