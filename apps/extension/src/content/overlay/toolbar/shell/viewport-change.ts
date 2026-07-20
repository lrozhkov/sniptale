import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const logger = createLogger({ namespace: 'ContentToolbarShell' });

export async function handleToolbarViewportChange(
  viewport: { width: number; height: number } | null,
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void
) {
  try {
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
      type: MessageType.SET_VIEWPORT,
      ...(viewport === null ? {} : { width: viewport.width, height: viewport.height }),
    });

    if (response?.success) {
      setCurrentViewport(viewport);
      return;
    }

    const errorMessage = response?.error || translate('content.toolbar.unknownError');
    logger.error('Failed to set viewport', errorMessage);
    if (
      errorMessage.includes(translate('background.runtime.debuggerConflictKeywordExtension')) ||
      errorMessage.includes(translate('background.runtime.debuggerConflictKeywordConflict'))
    ) {
      showToast(translate('content.toolbar.viewportConflictError'), 'error', 5000);
      return;
    }

    showToast(`${translate('content.toolbar.viewportErrorPrefix')} ${errorMessage}`, 'error');
  } catch (error) {
    logger.error('Failed to set viewport', error);
    showToast(translate('content.toolbar.viewportChangeError'), 'error');
  }
}
