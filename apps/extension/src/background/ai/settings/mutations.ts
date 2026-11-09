import type { SecretProtectionService } from '../../../composition/persistence/secret-protection/model';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { AiSettingsMutationMessage } from '../../../contracts/messaging/ai-settings-runtime';
import {
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from '../../../composition/persistence/ai-settings';

import {
  createAICatalogRuntime,
  refreshManagedProviderCatalogs,
  refreshProviderCatalog,
} from './catalog-runtime';

const logger = createLogger({ namespace: 'BackgroundAiSettingsMutation' });

type AiSettingsWriteMessage = Exclude<
  AiSettingsMutationMessage,
  { operation: 'read-secret-protection-status' }
>;

export function createAiSettingsMutator(protection: SecretProtectionService) {
  const catalogs = createAICatalogRuntime(protection);
  return (message: AiSettingsWriteMessage) => mutateAiSettings(message, protection, catalogs);
}

export async function mutateAiSettings(
  message: AiSettingsWriteMessage,
  protection?: SecretProtectionService,
  catalogs = { refreshManagedProviderCatalogs, refreshProviderCatalog }
): Promise<void> {
  switch (message.operation) {
    case 'enable-secret-passphrase-protection':
      if (!protection) throw new Error('Shared secret protection service is required');
      return protection.enable(message.participant ?? 'ai', message.passphrase);
    case 'disable-secret-passphrase-protection':
      if (!protection) throw new Error('Shared secret protection service is required');
      return protection.disable(message.participant ?? 'ai', message.passphrase);
    case 'unlock-secret-passphrase-protection':
      if (!protection) throw new Error('Shared secret protection service is required');
      return protection.unlock(message.passphrase);
    case 'lock-secret-passphrase-protection':
      if (!protection) throw new Error('Shared secret protection service is required');
      return protection.lock();
    case 'change-secret-passphrase-protection':
      if (!protection) throw new Error('Shared secret protection service is required');
      return protection.changePassphrase({
        currentPassphrase: message.currentPassphrase,
        nextPassphrase: message.nextPassphrase,
      });
    case 'reset-secret-passphrase-protection':
      if (!protection) throw new Error('Shared secret protection service is required');
      return protection.reset();
    case 'add-model':
    case 'add-provider':
    case 'clear-provider-secret':
    case 'delete-model':
    case 'delete-provider':
    case 'move-model':
    case 'refresh-managed-catalogs':
    case 'refresh-provider-catalog':
    case 'remember-scenario-selection':
    case 'reset-audio-transcription-prompt':
    case 'reset-global-prompt':
    case 'reset-scenario-editor-prompt':
    case 'reset-voice-input-correction-prompt':
    case 'save-audio-transcription-prompt':
    case 'save-chrome-ai-enabled':
    case 'save-global-prompt':
    case 'save-scenario-editor-prompt':
    case 'save-voice-input-correction-prompt':
    case 'set-provider-enabled':
    case 'update-model':
    case 'update-provider':
      break;
  }
  if (message.operation === 'refresh-provider-catalog')
    return catalogs.refreshProviderCatalog(message.providerId);
  if (message.operation === 'refresh-managed-catalogs')
    return catalogs.refreshManagedProviderCatalogs();
  if (
    protection &&
    (message.operation === 'add-provider' || message.operation === 'update-provider') &&
    typeof message.provider.apiKey === 'string' &&
    message.provider.apiKey.length > 0
  ) {
    await protection.withAdmission('ai', (key, permit) =>
      mutateStoredAISettings(message, key, permit)
    );
  } else await mutateStoredAISettings(message);
  if (message.operation === 'set-provider-enabled' && message.enabled) {
    await catalogs.refreshProviderCatalog(message.providerId).catch(() => {
      logger.warn('AI catalog maintenance failed after connection activation');
    });
  }
  if (
    (message.operation === 'add-provider' || message.operation === 'update-provider') &&
    message.provider.enabled !== false
  ) {
    await catalogs.refreshProviderCatalog(message.provider.id).catch(() => {
      // The connection already committed. Its unverified status permits an explicit metadata retry.
      logger.warn('AI catalog maintenance failed after connection configuration was saved');
    });
  }
}

export function resetAiSettingsMutationQueueForTests(): void {
  resetAISettingsMutationQueueForTests();
}
