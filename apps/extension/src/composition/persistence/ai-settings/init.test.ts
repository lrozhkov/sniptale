import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';

const {
  localGetMock,
  migrateAiProviderStorageToV3Mock,
  recoverStoredAISecretPassphraseProtectionTransitionMock,
} = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  migrateAiProviderStorageToV3Mock: vi.fn(),
  recoverStoredAISecretPassphraseProtectionTransitionMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: localGetMock,
    },
  },
}));

vi.mock('./provider-secrets.migration.ts', () => ({
  migrateAiProviderStorageToV3: migrateAiProviderStorageToV3Mock,
}));

vi.mock('./secret-protection-transition.store.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./secret-protection-transition.store.ts')>()),
  recoverStoredAISecretPassphraseProtectionTransition:
    recoverStoredAISecretPassphraseProtectionTransitionMock,
}));

function resetInitMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  migrateAiProviderStorageToV3Mock.mockResolvedValue(undefined);
  recoverStoredAISecretPassphraseProtectionTransitionMock.mockResolvedValue(undefined);
}

describe('ai/init', () => {
  beforeEach(resetInitMocks);

  it('reads readiness without triggering migration authority', async () => {
    localGetMock.mockResolvedValue({
      [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
      [AI_STORAGE_VERSION_KEY]: null,
    });

    const { readAiStorageReadiness } = await import('./init');

    await expect(readAiStorageReadiness()).resolves.toEqual({
      isReady: false,
      migrationPhase: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
      requiresMigration: true,
      version: null,
    });
    expect(migrateAiProviderStorageToV3Mock).not.toHaveBeenCalled();
  });

  it('runs migration and secret protection recovery once when the seam is not ready', async () => {
    localGetMock.mockResolvedValue({
      [AI_STORAGE_VERSION_KEY]: null,
    });
    migrateAiProviderStorageToV3Mock.mockResolvedValue(undefined);

    const { initializeAiStorageAccess } = await import('./init');

    await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
    await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
    expect(migrateAiProviderStorageToV3Mock).toHaveBeenCalledTimes(1);
    expect(recoverStoredAISecretPassphraseProtectionTransitionMock).toHaveBeenCalledTimes(1);
  });

  it('skips migration but still recovers secret protection transitions when already ready', async () => {
    localGetMock.mockResolvedValue({
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    });

    const { initializeAiStorageAccess } = await import('./init');

    await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
    expect(migrateAiProviderStorageToV3Mock).not.toHaveBeenCalled();
    expect(recoverStoredAISecretPassphraseProtectionTransitionMock).toHaveBeenCalledTimes(1);
  });
});
