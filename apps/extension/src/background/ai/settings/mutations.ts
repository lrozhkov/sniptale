import type { AiSettingsMutationMessage } from '../../../contracts/messaging/ai-settings-runtime';
import {
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from '../../../composition/persistence/ai-settings';

type AiSettingsWriteMessage = Exclude<
  AiSettingsMutationMessage,
  { operation: 'read-secret-protection-status' }
>;

export function mutateAiSettings(message: AiSettingsWriteMessage): Promise<void> {
  return mutateStoredAISettings(message);
}

export function resetAiSettingsMutationQueueForTests(): void {
  resetAISettingsMutationQueueForTests();
}
