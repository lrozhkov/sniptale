import { vi } from 'vitest';

import type { AiProvidersSectionState } from '../controller/types';

export function createMockChromeAiState(): AiProvidersSectionState['chromeAi'] {
  return {
    availability: 'available',
    enabled: false,
    error: null,
    handleToggle: vi.fn().mockResolvedValue(undefined),
    isChecking: false,
    isSettingUp: false,
    setupProgress: null,
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
