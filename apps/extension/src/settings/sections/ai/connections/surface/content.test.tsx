// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('./header', () => ({ AIProvidersHeader: () => <div>header</div> }));
vi.mock('./chrome-ai-card', () => ({ AIProvidersChromeAiCard: () => <div>chrome-ai</div> }));
vi.mock('./secret-protection-card', () => ({
  AIProvidersSecretProtectionCard: () => <div>secrets</div>,
}));
vi.mock('./cards', () => ({ AIProvidersProvidersCard: () => <div>providers</div> }));
vi.mock('./models-card', () => ({ AIProvidersModelsCard: () => <div>models</div> }));
vi.mock('./modals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./modals')>()),
  AIProvidersSectionModals: () => null,
}));
vi.mock('./secret-protection-dialog', () => ({ SecretProtectionDialog: () => null }));
import { AIProvidersSectionContent } from './content';
import type { AiProvidersSectionState } from '../controller/types';

function createState(): AiProvidersSectionState {
  const noop = vi.fn();
  const asyncNoop = vi.fn(async () => undefined);
  return {
    chromeAi: {
      availability: 'available',
      enabled: false,
      error: null,
      handleToggle: asyncNoop,
      isChecking: false,
      isSettingUp: false,
      setupProgress: null,
    },
    secretProtection: {
      dialog: null,
      ensureUnlocked: asyncNoop,
      handleChangeSubmit: asyncNoop,
      handleCloseDialog: noop,
      handleDisableSubmit: asyncNoop,
      handleEnableSubmit: asyncNoop,
      handleLockNow: asyncNoop,
      handleOpenChangeDialog: noop,
      handleOpenDisableDialog: noop,
      handleOpenEnableDialog: noop,
      handleOpenResetDialog: noop,
      handleOpenUnlockDialog: noop,
      handleResetConfirm: asyncNoop,
      handleUnlockSubmit: asyncNoop,
      isBusy: false,
      status: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
    },
    providers: [],
    models: [],
    defaultModelId: null,
    isLoading: false,
    modelOptions: [],
    modals: {
      provider: { open: false },
      model: { open: false },
      confirmDelete: null,
      openProviderModal: noop,
      closeProviderModal: noop,
      openModelModal: noop,
      closeModelModal: noop,
      setConfirmDelete: noop,
    },
    handleDefaultModelChange: asyncNoop,
    handleClearProviderSecret: asyncNoop,
    handleDeleteProvider: asyncNoop,
    handleDeleteModel: asyncNoop,
    reloadData: asyncNoop,
    getProviderName: () => '',
  };
}
it('keeps the connection page limited to providers, models, and connection security', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<AIProvidersSectionContent state={createState()} />));
  expect(node.textContent).toContain('providers');
  expect(node.textContent).toContain('models');
  expect(node.querySelector('textarea')).toBeNull();
  act(() => root.unmount());
});
