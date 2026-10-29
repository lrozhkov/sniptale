import type { AIRememberScenarioSelectionInput } from '../../../contracts/settings/ai-catalog';
import type { AIModel } from '../../../contracts/settings';
import type { AIProviderUpsertInput } from './provider-secret-upsert-plan';

export type AISettingsMutationCommand =
  | {
      operation: 'set-provider-enabled';
      providerId: string;
      providerIncarnation: string;
      enabled: boolean;
    }
  | { operation: 'remember-scenario-selection'; selection: AIRememberScenarioSelectionInput }
  | {
      operation: 'add-provider' | 'update-provider';
      provider: AIProviderUpsertInput;
    }
  | { operation: 'clear-provider-secret' | 'delete-provider'; providerId: string }
  | {
      operation: 'add-model' | 'update-model';
      model: AIModel;
      providerIncarnation?: string | undefined;
    }
  | { operation: 'delete-model'; modelId: string }
  | { operation: 'move-model'; modelId: string; beforeModelId: string | null }
  | {
      operation:
        | 'save-global-prompt'
        | 'save-scenario-editor-prompt'
        | 'save-audio-transcription-prompt'
        | 'save-voice-input-correction-prompt';
      prompt: string;
    }
  | {
      operation:
        | 'reset-global-prompt'
        | 'reset-scenario-editor-prompt'
        | 'reset-audio-transcription-prompt'
        | 'reset-voice-input-correction-prompt';
    }
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

/** Refuses a model draft prepared for a replaced connection. */
export class AIModelProviderChangedError extends Error {
  readonly reason = 'ai-provider-changed';
  constructor() {
    super('The AI provider changed after this model draft was prepared');
    this.name = 'AIModelProviderChangedError';
  }
}
