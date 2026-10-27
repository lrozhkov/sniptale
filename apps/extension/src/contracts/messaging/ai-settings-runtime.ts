import type {
  AIScenario,
  AIScenarioSelection,
  AIRememberScenarioSelectionInput,
} from '../settings/ai-catalog';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AIConnectionType, AIModel, AIProvider } from '../settings';

export type AIProviderDestinationKind = 'chrome-built-in' | 'external' | 'local-custom';

export type AIProviderSelectorEntry = Pick<
  AIProvider,
  | 'connectionType'
  | 'createdAt'
  | 'hasStoredApiKey'
  | 'id'
  | 'name'
  | 'incarnation'
  | 'enabled'
  | 'management'
  | 'observation'
> & {
  destinationKind: AIProviderDestinationKind;
  destinationBinding?: string | undefined;
};

export type AIModelCatalogPayload = {
  models: AIModel[];
  providers: AIProviderSelectorEntry[];
};

export type AIModelSelectionBootstrapPayload = AIModelCatalogPayload & {
  chromeAiEnabled: boolean;
  defaultModelId: string | null;
  globalSystemPrompt: string;
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
  connectionType: AIConnectionType;
  management?: import('../settings/ai-provider').AIModelManagement | undefined;
  enabled?: boolean | undefined;
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
  audioTranscriptionSystemPrompt?: string | undefined;
  voiceInputCorrectionSystemPrompt?: string | undefined;
  scenarioEditorSystemPrompt: string;
  secretProtectionStatus: AISecretProtectionStatusPayload;
  selectionBootstrap: AISettingsPageModelSelectionBootstrapPayload;
};

type AISettingsQueryOperation =
  | 'read-scenario-selection'
  | 'read-model-selection-bootstrap'
  | 'read-settings-page-runtime-data'
  | 'read-scenario-editor-system-prompt'
  | 'read-chrome-ai-content-system-prompt';

type AiSettingsQueryBase<TOperation extends AISettingsQueryOperation> = {
  operation: TOperation;
  type: typeof MessageType.AI_SETTINGS_QUERY;
};

export type AiSettingsQueryMessage =
  | (AiSettingsQueryBase<'read-scenario-selection'> & { scenario: AIScenario })
  | AiSettingsQueryBase<'read-model-selection-bootstrap'>
  | AiSettingsQueryBase<'read-settings-page-runtime-data'>
  | AiSettingsQueryBase<'read-scenario-editor-system-prompt'>
  | (AiSettingsQueryBase<'read-chrome-ai-content-system-prompt'> & { modelId: string });

export type AiSettingsQueryResponse = {
  scenarioSelection?: AIScenarioSelection | null | undefined;
  error?: string | undefined;
  modelSelection?: AIModelSelectionBootstrapPayload | undefined;
  scenarioEditorSystemPrompt?: string | undefined;
  settingsRuntimeData?: AISettingsPageRuntimeDataPayload | undefined;
  success: boolean;
  systemPrompt?: string | undefined;
};

type AiSettingsMutationOperation =
  | 'remember-scenario-selection'
  | 'refresh-provider-catalog'
  | 'refresh-managed-catalogs'
  | 'read-secret-protection-status'
  | 'add-provider'
  | 'update-provider'
  | 'set-provider-enabled'
  | 'clear-provider-secret'
  | 'delete-provider'
  | 'add-model'
  | 'update-model'
  | 'delete-model'
  | 'move-model'
  | 'save-default-model'
  | 'save-voice-input-correction-prompt'
  | 'reset-voice-input-correction-prompt'
  | 'save-audio-transcription-prompt'
  | 'reset-audio-transcription-prompt'
  | 'save-global-prompt'
  | 'save-scenario-editor-prompt'
  | 'reset-global-prompt'
  | 'reset-scenario-editor-prompt'
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
  | (AiSettingsMutationBase<'remember-scenario-selection'> & {
      selection: AIRememberScenarioSelectionInput;
    })
  | (AiSettingsMutationBase<'set-provider-enabled'> & {
      providerId: string;
      providerIncarnation: string;
      enabled: boolean;
    })
  | AiSettingsMutationBase<'read-secret-protection-status'>
  | (AiSettingsMutationBase<'refresh-provider-catalog'> & { providerId: string })
  | AiSettingsMutationBase<'refresh-managed-catalogs'>
  | (AiSettingsMutationBase<'add-provider' | 'update-provider'> & {
      provider: AIProviderMutationInput;
    })
  | (AiSettingsMutationBase<'clear-provider-secret'> & { providerId: string })
  | (AiSettingsMutationBase<'delete-provider'> & { providerId: string })
  | (AiSettingsMutationBase<'add-model' | 'update-model'> & {
      model: AIModel;
      providerIncarnation: string;
    })
  | (AiSettingsMutationBase<'delete-model'> & { modelId: string })
  | (AiSettingsMutationBase<'move-model'> & {
      modelId: string;
      beforeModelId: string | null;
    })
  | (AiSettingsMutationBase<'save-default-model'> & {
      defaultModelId: string | null;
    })
  | (AiSettingsMutationBase<
      | 'save-global-prompt'
      | 'save-scenario-editor-prompt'
      | 'save-audio-transcription-prompt'
      | 'save-voice-input-correction-prompt'
    > & {
      prompt: string;
    })
  | AiSettingsMutationBase<
      | 'reset-global-prompt'
      | 'reset-scenario-editor-prompt'
      | 'reset-audio-transcription-prompt'
      | 'reset-voice-input-correction-prompt'
    >
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
  reason?: 'ai-secrets-locked' | 'ai-provider-changed' | undefined;
  result?: 'accepted' | undefined;
  secretProtectionStatus?: AISecretProtectionStatusPayload | undefined;
  success: boolean;
};
