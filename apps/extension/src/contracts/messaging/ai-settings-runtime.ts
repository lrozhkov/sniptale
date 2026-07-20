import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AIConnectionType, AIModel, AIProvider } from '../settings';

export type AIProviderDestinationKind = 'chrome-built-in' | 'external' | 'local-custom';

export type AIProviderSelectorEntry = Pick<
  AIProvider,
  'connectionType' | 'createdAt' | 'hasStoredApiKey' | 'id' | 'name'
> & {
  destinationKind: AIProviderDestinationKind;
};

export type AIModelSelectionBootstrapPayload = {
  chromeAiEnabled: boolean;
  defaultModelId: string | null;
  globalSystemPrompt: string;
  models: AIModel[];
  providers: AIProviderSelectorEntry[];
};

export type AISettingsPageModelSelectionBootstrapPayload = Omit<
  AIModelSelectionBootstrapPayload,
  'providers'
> & {
  providers: AIProvider[];
};

export type AIProviderMutationInput = {
  apiKey?: string | undefined;
  baseUrl: string;
  connectionType: Extract<AIConnectionType, 'openai-compatible'>;
  createdAt: number;
  id: string;
  name: string;
};

export type AISecretProtectionStatusPayload = {
  isEnabled: boolean;
  isUnlocked: boolean;
  mode: 'transparent' | 'passphrase';
};

export type AISettingsPageRuntimeDataPayload = {
  scenarioEditorSystemPrompt: string;
  secretProtectionStatus: AISecretProtectionStatusPayload;
  selectionBootstrap: AISettingsPageModelSelectionBootstrapPayload;
};

type AISettingsQueryOperation =
  | 'read-model-selection-bootstrap'
  | 'read-settings-page-runtime-data'
  | 'read-scenario-editor-system-prompt'
  | 'read-chrome-ai-content-system-prompt';

type AiSettingsQueryBase<TOperation extends AISettingsQueryOperation> = {
  operation: TOperation;
  type: typeof MessageType.AI_SETTINGS_QUERY;
};

export type AiSettingsQueryMessage =
  | AiSettingsQueryBase<'read-model-selection-bootstrap'>
  | AiSettingsQueryBase<'read-settings-page-runtime-data'>
  | AiSettingsQueryBase<'read-scenario-editor-system-prompt'>
  | (AiSettingsQueryBase<'read-chrome-ai-content-system-prompt'> & { modelId: string });

export type AiSettingsQueryResponse = {
  error?: string | undefined;
  modelSelection?: AIModelSelectionBootstrapPayload | undefined;
  scenarioEditorSystemPrompt?: string | undefined;
  settingsRuntimeData?: AISettingsPageRuntimeDataPayload | undefined;
  success: boolean;
  systemPrompt?: string | undefined;
};

type AiSettingsMutationOperation =
  | 'read-secret-protection-status'
  | 'add-provider'
  | 'update-provider'
  | 'clear-provider-secret'
  | 'delete-provider'
  | 'add-model'
  | 'update-model'
  | 'delete-model'
  | 'save-default-model'
  | 'save-global-prompt'
  | 'save-scenario-editor-prompt'
  | 'save-chrome-ai-enabled'
  | 'enable-secret-passphrase-protection'
  | 'disable-secret-passphrase-protection'
  | 'change-secret-passphrase-protection'
  | 'lock-secret-passphrase-protection'
  | 'unlock-secret-passphrase-protection'
  | 'reset-secret-passphrase-protection';

type AiSettingsMutationBase<TOperation extends AiSettingsMutationOperation> = {
  operation: TOperation;
  type: typeof MessageType.AI_SETTINGS_MUTATION;
};

export type AiSettingsMutationMessage =
  | AiSettingsMutationBase<'read-secret-protection-status'>
  | (AiSettingsMutationBase<'add-provider' | 'update-provider'> & {
      provider: AIProviderMutationInput;
    })
  | (AiSettingsMutationBase<'clear-provider-secret'> & { providerId: string })
  | (AiSettingsMutationBase<'delete-provider'> & { providerId: string })
  | (AiSettingsMutationBase<'add-model' | 'update-model'> & { model: AIModel })
  | (AiSettingsMutationBase<'delete-model'> & { modelId: string })
  | (AiSettingsMutationBase<'save-default-model'> & {
      defaultModelId: string | null;
    })
  | (AiSettingsMutationBase<'save-global-prompt' | 'save-scenario-editor-prompt'> & {
      prompt: string;
    })
  | (AiSettingsMutationBase<'save-chrome-ai-enabled'> & { enabled: boolean })
  | (AiSettingsMutationBase<'enable-secret-passphrase-protection'> & { passphrase: string })
  | (AiSettingsMutationBase<'disable-secret-passphrase-protection'> & {
      passphrase?: string | undefined;
    })
  | (AiSettingsMutationBase<'unlock-secret-passphrase-protection'> & { passphrase: string })
  | (AiSettingsMutationBase<'change-secret-passphrase-protection'> & {
      currentPassphrase: string;
      nextPassphrase: string;
    })
  | AiSettingsMutationBase<'lock-secret-passphrase-protection'>
  | AiSettingsMutationBase<'reset-secret-passphrase-protection'>;

export type AiSettingsMutationResponse = {
  error?: string | undefined;
  reason?: 'ai-secrets-locked' | undefined;
  result?: 'accepted' | undefined;
  secretProtectionStatus?: AISecretProtectionStatusPayload | undefined;
  success: boolean;
};
