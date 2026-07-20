import type { AIModel, AIProvider } from '../../../../contracts/settings';
import type { ChromeAiAvailability } from '@sniptale/platform/browser/chrome-ai';
import type { AISecretProtectionStatusPayload } from '../../../../contracts/messaging/ai-settings-runtime';

type ProviderModalState = { open: boolean; provider?: AIProvider | null };
type ModelModalState = { open: boolean; model?: AIModel | null };

export type AiProvidersDeleteState =
  | { type: 'provider'; item: AIProvider }
  | { type: 'model'; item: AIModel }
  | null;

interface AiProvidersPromptState {
  isSaving: boolean;
  saveError: string | null;
  value: string;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  setValue: (value: string) => void;
  handleSave: () => Promise<void>;
  handleResizeStart: (event: React.MouseEvent) => void;
}

interface AiProvidersPromptsState {
  global: AiProvidersPromptState;
  scenarioEditor: AiProvidersPromptState;
}

interface AiProvidersChromeAiState {
  availability: ChromeAiAvailability;
  enabled: boolean;
  error: string | null;
  handleToggle: () => Promise<void>;
  isChecking: boolean;
  isSettingUp: boolean;
  setupProgress: number | null;
}

export type AiSecretProtectionDialogMode = 'enable' | 'unlock' | 'disable' | 'change' | 'reset';

interface AiSecretProtectionDialogState {
  mode: AiSecretProtectionDialogMode;
  error: string | null;
  isSubmitting: boolean;
}

interface AiSecretProtectionState {
  dialog: AiSecretProtectionDialogState | null;
  ensureUnlocked: () => Promise<void>;
  handleChangeSubmit: (params: {
    currentPassphrase: string;
    nextPassphrase: string;
    confirmPassphrase: string;
  }) => Promise<void>;
  handleCloseDialog: () => void;
  handleDisableSubmit: (passphrase: string) => Promise<void>;
  handleEnableSubmit: (params: { passphrase: string; confirmPassphrase: string }) => Promise<void>;
  handleLockNow: () => Promise<void>;
  handleOpenChangeDialog: () => void;
  handleOpenDisableDialog: () => void;
  handleOpenEnableDialog: () => void;
  handleOpenResetDialog: () => void;
  handleOpenUnlockDialog: () => void;
  handleResetConfirm: () => Promise<void>;
  handleUnlockSubmit: (passphrase: string) => Promise<void>;
  isBusy: boolean;
  status: AISecretProtectionStatusPayload;
}

interface AiProvidersModalsState {
  provider: ProviderModalState;
  model: ModelModalState;
  confirmDelete: AiProvidersDeleteState;
  openProviderModal: (provider?: AIProvider) => void;
  closeProviderModal: () => void;
  openModelModal: (model?: AIModel) => void;
  closeModelModal: () => void;
  setConfirmDelete: (value: AiProvidersDeleteState) => void;
}

export interface AiProvidersSectionState {
  chromeAi: AiProvidersChromeAiState;
  secretProtection: AiSecretProtectionState;
  providers: AIProvider[];
  models: AIModel[];
  defaultModelId: string | null;
  isLoading: boolean;
  modelOptions: { value: string; label: string }[];
  prompts: AiProvidersPromptsState;
  modals: AiProvidersModalsState;
  handleDefaultModelChange: (value: string) => Promise<void>;
  handleClearProviderSecret: (providerId: string) => Promise<void>;
  handleDeleteProvider: () => Promise<void>;
  handleDeleteModel: () => Promise<void>;
  reloadData: () => Promise<void>;
  getProviderName: (providerId: string) => string;
}
