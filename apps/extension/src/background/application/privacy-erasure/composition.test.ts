import { beforeEach, expect, it, vi } from 'vitest';

const {
  diagnosticsCleanupMock,
  mediaCleanupMock,
  nativeIngestionCleanupMock,
  runtimeCleanupMock,
  storageCleanupMock,
} = vi.hoisted(() => ({
  diagnosticsCleanupMock: vi.fn(),
  mediaCleanupMock: vi.fn(),
  nativeIngestionCleanupMock: vi.fn(),
  runtimeCleanupMock: vi.fn(),
  storageCleanupMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/privacy-erasure/cleanup', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/privacy-erasure/cleanup')
  >()),
  createPrivacyErasureStorageCleanupAdapter: () => ({ cleanup: storageCleanupMock }),
}));
vi.mock('../../diagnostics/privacy-erasure/cleanup', () => ({
  diagnosticsPrivacyErasureCleanupAdapter: {
    cleanup: diagnosticsCleanupMock,
    reserveErasureExclusion: () => ({
      release: vi.fn(),
      waitForActiveMutations: vi.fn(async () => undefined),
    }),
  },
}));
vi.mock('../../media/privacy-erasure/cleanup', () => ({
  mediaPrivacyErasureCleanupAdapter: {
    cleanup: mediaCleanupMock,
    reserveErasureExclusion: () => ({
      release: vi.fn(),
      waitForActiveMutations: vi.fn(async () => undefined),
    }),
  },
}));
vi.mock('./runtime-cleanup', () => ({
  backgroundRuntimeCleanupAdapter: { cleanup: runtimeCleanupMock },
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../runtime-state';
import {
  configureNativeIngestionPrivacyErasureCleanupPort,
  eraseLocalExtensionDataFromBackground,
} from './composition';

const verifiedParticipant = {
  id: 'verified-owner',
  remainingCount: 0,
  severity: 'required' as const,
  status: 'verified-empty' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  configureNativeIngestionPrivacyErasureCleanupPort({
    cleanup: nativeIngestionCleanupMock,
    reserveErasureExclusion: () => ({
      release: vi.fn(),
      waitForActiveMutations: vi.fn(async () => undefined),
    }),
  });
  diagnosticsCleanupMock.mockResolvedValue([verifiedParticipant]);
  mediaCleanupMock.mockResolvedValue([verifiedParticipant]);
  nativeIngestionCleanupMock.mockResolvedValue([verifiedParticipant]);
  runtimeCleanupMock.mockResolvedValue([verifiedParticipant]);
  storageCleanupMock.mockResolvedValue({
    failedRequiredParticipantIds: [],
    indexedDbStoresCleared: 2,
    localStorageKeysRemoved: [],
    participants: [verifiedParticipant],
    sessionStorageKeysRemoved: [],
    success: true,
    syncStorageKeysRemoved: [],
  });
});

it('maps the authorized message options into the serialized application use case', async () => {
  const state = createBackgroundRuntimeState();
  const result = await eraseLocalExtensionDataFromBackground(
    {
      type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
      includeAiProviderSecrets: true,
      preservePreferences: false,
    },
    state
  );

  expect(runtimeCleanupMock).toHaveBeenCalledWith(state);
  expect(storageCleanupMock).toHaveBeenCalledWith({
    includeAiProviderSecrets: true,
    preservePreferences: false,
  });
  expect(result).toEqual(expect.objectContaining({ indexedDbStoresCleared: 2, success: true }));
});
