import { vi } from 'vitest';

import type { AiProvidersSectionState } from '../controller/types';

export function createMockChromeAiState(): AiProvidersSectionState['chromeAi'] {
  return {
    availability: 'available',
    enabled: false,
    error: null,
    handleTest: vi.fn().mockResolvedValue(undefined),
    handleToggle: vi.fn().mockResolvedValue(undefined),
    isChecking: false,
    isSettingUp: false,
    setupProgress: null,
    testStatus: 'idle',
  };
}

export function createMockAiProvidersSectionState(): AiProvidersSectionState {
  return {
    catalogActions: {
      clearProviderSecret: vi.fn().mockResolvedValue(undefined),
      deleteModel: vi.fn().mockResolvedValue(undefined),
      deleteProvider: vi.fn().mockResolvedValue(undefined),
      moveModel: vi.fn().mockResolvedValue(undefined),
      setDefaultModel: vi.fn().mockResolvedValue(undefined),
    },
    chromeAi: createMockChromeAiState(),
    secretProtection: createMockSecretProtectionState(),
    providers: [],
    models: [],
    defaultModelId: null,
    isLoading: false,
    modelOptions: [],
    modals: {
      provider: { open: false },
      model: { open: false },
      confirmDelete: null,
      openProviderModal: vi.fn(),
      closeProviderModal: vi.fn(),
      openModelModal: vi.fn(),
      closeModelModal: vi.fn(),
      setConfirmDelete: vi.fn(),
    },
    reloadData: vi.fn().mockResolvedValue(undefined),
    getProviderName: vi.fn(() => ''),
  };
}

export function createMockSecretProtectionState(): AiProvidersSectionState['secretProtection'] {
  return {
    dialog: null,
    ensureUnlocked: vi.fn().mockResolvedValue(undefined),
    handleChangeSubmit: vi.fn().mockResolvedValue(undefined),
    handleCloseDialog: vi.fn(),
    handleDisableSubmit: vi.fn().mockResolvedValue(undefined),
    handleEnableSubmit: vi.fn().mockResolvedValue(undefined),
    handleLockNow: vi.fn().mockResolvedValue(undefined),
    handleOpenChangeDialog: vi.fn(),
    handleOpenDisableDialog: vi.fn(),
    handleOpenEnableDialog: vi.fn(),
    handleOpenResetDialog: vi.fn(),
    handleOpenUnlockDialog: vi.fn(),
    handleResetConfirm: vi.fn().mockResolvedValue(undefined),
    handleUnlockSubmit: vi.fn().mockResolvedValue(undefined),
    isBusy: false,
    status: {
      isEnabled: false,
      isUnlocked: true,
      mode: 'transparent',
    },
  };
}
