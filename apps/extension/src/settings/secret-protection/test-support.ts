import { vi } from 'vitest';
import type { SecretProtectionState } from './controller';
export function createMockSecretProtectionState(): SecretProtectionState {
  return {
    status: {
      isEnabled: false,
      isUnlocked: true,
      mode: 'transparent',
      participants: { ai: false, webdav: false },
    },
    error: null,
    isLoading: false,
    isBusy: false,
    dialog: null,
    reloadStatus: vi.fn().mockResolvedValue(undefined),
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
  };
}
