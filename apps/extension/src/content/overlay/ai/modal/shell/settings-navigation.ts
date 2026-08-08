import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../../../platform/runtime-services/services';
import {
  attachContentActionIntent,
  createTrustedContentActionIntentSource,
} from '../../../../application/privileged-action-intent';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../../platform/i18n';

type AiSettingsRoute = { section: 'ai-connections' | 'ai-prompts' };

/** Delegates extension-page navigation to the background owner of privileged tab APIs. */
export async function openAIModalSettings(route: AiSettingsRoute, event: Event): Promise<void> {
  try {
    const message = await attachContentActionIntent(
      {
        section: route.section,
        type: MessageType.AI_SETTINGS_NAVIGATION,
      },
      createTrustedContentActionIntentSource(event)
    );
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(message);
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to open AI settings');
    }
  } catch {
    showToast(translate('aiModal.openSettingsFailed'), 'error');
  }
}
