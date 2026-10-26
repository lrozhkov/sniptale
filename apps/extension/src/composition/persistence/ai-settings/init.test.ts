import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
const AI_RESET_PHASE = 'reset-ai-settings-v4';

const {
  localGetMock,
  resetIncompatibleAISettingsMock,
  recoverStoredAISecretPassphraseProtectionTransitionMock,
} = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  resetIncompatibleAISettingsMock: vi.fn(),
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

vi.mock('./alpha-reset', () => ({
  resetIncompatibleAISettings: resetIncompatibleAISettingsMock,
}));

vi.mock('./secret-protection-transition.store.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./secret-protection-transition.store.ts')>()),
  recoverStoredAISecretPassphraseProtectionTransition:
    recoverStoredAISecretPassphraseProtectionTransitionMock,
}));

function resetInitMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  resetIncompatibleAISettingsMock.mockResolvedValue(undefined);
  recoverStoredAISecretPassphraseProtectionTransitionMock.mockResolvedValue(undefined);
}

describe('ai/init', () => {
  beforeEach(resetInitMocks);

  it('reads readiness without triggering reset authority', async () => {
    localGetMock.mockResolvedValue({
      [AI_STORAGE_RESET_PHASE_KEY]: AI_RESET_PHASE,
      [AI_STORAGE_VERSION_KEY]: null,
    });

    const { readAiStorageReadiness } = await import('./init');

    await expect(readAiStorageReadiness()).resolves.toEqual({
      isReady: false,
      resetPhase: AI_RESET_PHASE,
      requiresReset: true,
      version: null,
    });
    expect(resetIncompatibleAISettingsMock).not.toHaveBeenCalled();
  });

  it('runs reset and secret protection recovery once when the seam is not ready', async () => {
    localGetMock.mockResolvedValue({
      [AI_STORAGE_VERSION_KEY]: null,
    });
    resetIncompatibleAISettingsMock.mockResolvedValue(undefined);

    const { initializeAiStorageAccess } = await import('./init');

    await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
    await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
    expect(resetIncompatibleAISettingsMock).toHaveBeenCalledTimes(1);
    expect(recoverStoredAISecretPassphraseProtectionTransitionMock).toHaveBeenCalledTimes(1);
  });

  it('skips reset but still recovers secret protection transitions when already ready', async () => {
    localGetMock.mockResolvedValue({
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    });

    const { initializeAiStorageAccess } = await import('./init');

    await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
    expect(resetIncompatibleAISettingsMock).not.toHaveBeenCalled();
    expect(recoverStoredAISecretPassphraseProtectionTransitionMock).toHaveBeenCalledTimes(1);
  });
});
