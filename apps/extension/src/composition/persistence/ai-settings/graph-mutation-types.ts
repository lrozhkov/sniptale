import type { AIModel } from '../../../contracts/settings';
import type { AIProviderUpsertInput } from './provider-secret-upsert-plan';

export type AISettingsMutationCommand =
  | {
      operation: 'add-provider' | 'update-provider';
      provider: AIProviderUpsertInput;
    }
  | { operation: 'clear-provider-secret' | 'delete-provider'; providerId: string }
  | { operation: 'add-model' | 'update-model'; model: AIModel }
  | { operation: 'delete-model'; modelId: string }
  | { operation: 'save-default-model'; defaultModelId: string | null }
  | { operation: 'save-global-prompt' | 'save-scenario-editor-prompt'; prompt: string }
  | { operation: 'save-chrome-ai-enabled'; enabled: boolean }
  | { operation: 'enable-secret-passphrase-protection'; passphrase: string }
  | { operation: 'disable-secret-passphrase-protection'; passphrase?: string | undefined }
  | { operation: 'unlock-secret-passphrase-protection'; passphrase: string }
  | {
      operation: 'change-secret-passphrase-protection';
      currentPassphrase: string;
      nextPassphrase: string;
    }
  | { operation: 'lock-secret-passphrase-protection' }
  | { operation: 'reset-secret-passphrase-protection' };
