import { beforeEach, expect, it, vi } from 'vitest';

const {
  diagnosticsCleanupMock,
  mediaCleanupMock,
  nativeIngestionCleanupMock,
  runtimeCleanupMock,
  screenshotCleanupPortMock,
  storageCleanupMock,
} = vi.hoisted(() => ({
  diagnosticsCleanupMock: vi.fn(),
  mediaCleanupMock: vi.fn(),
  nativeIngestionCleanupMock: vi.fn(),
  runtimeCleanupMock: vi.fn(),
  screenshotCleanupPortMock: vi.fn(),
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
vi.mock('./runtime-cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-cleanup')>()),
  backgroundRuntimeCleanupAdapter: { cleanup: runtimeCleanupMock },
  configureBackgroundRuntimeScreenshotCleanupPort: screenshotCleanupPortMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../runtime-state';
import {
  configureAudioJobPrivacyErasurePort,
  configureNativeIngestionPrivacyErasureCleanupPort,
  configureScreenshotPrivacyErasureCleanupPort,
  configureSyncPrivacyErasurePort,
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
  configureSyncPrivacyErasurePort({
    reserveErasureExclusion: () => ({ release() {}, async quiesce() {} }),
  });
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

it('configures screenshot cleanup through the application port', () => {
  const port = { disableScreenshotMode: vi.fn() };

  configureScreenshotPrivacyErasureCleanupPort(port);

  expect(screenshotCleanupPortMock).toHaveBeenCalledWith(port);
});

it('cancels audio requests and waits for their staging writes before storage erasure', async () => {
  const events: string[] = [];
  const release = vi.fn(() => events.push('release'));
  configureAudioJobPrivacyErasurePort(
    {
      cancelActiveJob: async () => {
        events.push('cancel');
      },
      reserveErasureExclusion: () => {
        events.push('reserve');
        return {
          release,
          waitForActiveMutations: async () => {
            events.push('settled');
          },
        };
      },
    },
    {
      async cancelActiveJob() {
        events.push('cancel-text');
      },
      reserveErasureExclusion() {
        events.push('reserve-text');
        return {
          release() {
            events.push('release-text');
          },
          async waitForActiveMutations() {
            events.push('settled-text');
          },
        };
      },
    }
  );
  storageCleanupMock.mockImplementationOnce(async () => {
    events.push('storage');
    return {
      failedRequiredParticipantIds: [],
      indexedDbStoresCleared: 0,
      localStorageKeysRemoved: [],
      participants: [verifiedParticipant],
      sessionStorageKeysRemoved: [],
      success: true,
      syncStorageKeysRemoved: [],
    };
  });
  const result = await eraseLocalExtensionDataFromBackground(
    {
      type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
      includeAiProviderSecrets: false,
      preservePreferences: true,
    },
    createBackgroundRuntimeState()
  );
  expect(result.success).toBe(true);
  expect(events).toEqual([
    'reserve',
    'reserve-text',
    'cancel',
    'cancel-text',
    'settled',
    'settled-text',
    'storage',
    'release',
    'release-text',
  ]);
  expect(release).toHaveBeenCalledOnce();
});

it('uses the explicitly configured sync lifecycle port before cleanup', async () => {
  const release = vi.fn();
  const quiesce = vi.fn(async () => undefined);
  const reserveErasureExclusion = vi.fn(() => ({ release, quiesce }));
  configureSyncPrivacyErasurePort({ reserveErasureExclusion });

  const operation = eraseLocalExtensionDataFromBackground(
    {
      type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
      includeAiProviderSecrets: false,
      preservePreferences: true,
    },
    createBackgroundRuntimeState()
  );
  expect(reserveErasureExclusion).toHaveBeenCalledOnce();
  await expect(operation).resolves.toEqual(expect.objectContaining({ success: true }));
  expect(quiesce).toHaveBeenCalledBefore(mediaCleanupMock);
  expect(quiesce).toHaveBeenCalledBefore(storageCleanupMock);
  expect(release).toHaveBeenCalledOnce();
});

it('fails closed before any cleanup when runtime has not configured sync quiescence', async () => {
  vi.resetModules();
  const composition = await import('./composition');

  const result = await composition.eraseLocalExtensionDataFromBackground(
    {
      type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
      includeAiProviderSecrets: true,
      preservePreferences: false,
    },
    createBackgroundRuntimeState()
  );

  expect(result.success).toBe(false);
  expect(result.failedRequiredParticipantIds).toEqual(['sync-runtime-state']);
  expect(mediaCleanupMock).not.toHaveBeenCalled();
  expect(diagnosticsCleanupMock).not.toHaveBeenCalled();
  expect(nativeIngestionCleanupMock).not.toHaveBeenCalled();
  expect(runtimeCleanupMock).not.toHaveBeenCalled();
  expect(storageCleanupMock).not.toHaveBeenCalled();
});
