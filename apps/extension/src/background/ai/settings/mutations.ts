import { createLogger } from '@sniptale/platform/observability/logger';
import type { AiSettingsMutationMessage } from '../../../contracts/messaging/ai-settings-runtime';
import {
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from '../../../composition/persistence/ai-settings';

import { refreshManagedProviderCatalogs, refreshProviderCatalog } from './catalog-runtime';

const logger = createLogger({ namespace: 'BackgroundAiSettingsMutation' });

type AiSettingsWriteMessage = Exclude<
  AiSettingsMutationMessage,
  { operation: 'read-secret-protection-status' }
>;

export async function mutateAiSettings(message: AiSettingsWriteMessage): Promise<void> {
  if (message.operation === 'refresh-provider-catalog')
    return refreshProviderCatalog(message.providerId);
  if (message.operation === 'refresh-managed-catalogs') return refreshManagedProviderCatalogs();
  await mutateStoredAISettings(message);
  if (message.operation === 'set-provider-enabled' && message.enabled) {
    await refreshProviderCatalog(message.providerId).catch(() => {
      logger.warn('AI catalog maintenance failed after connection activation');
    });
  }
  if (
    (message.operation === 'add-provider' || message.operation === 'update-provider') &&
    message.provider.enabled !== false
  ) {
    await refreshProviderCatalog(message.provider.id).catch(() => {
      // The connection already committed. Its unverified status permits an explicit metadata retry.
      logger.warn('AI catalog maintenance failed after connection configuration was saved');
    });
  }
}

export function resetAiSettingsMutationQueueForTests(): void {
  resetAISettingsMutationQueueForTests();
}
