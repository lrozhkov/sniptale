import { translate } from '../../../platform/i18n/index';
import { runBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';

const logger = createLogger({ namespace: 'BackgroundQuickActions' });

export function notifyDuplicateCapture(tabId: number): void {
  runBestEffort(
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      type: MessageType.SHOW_TOAST,
      payload: {
        type: 'error',
        title: translate('common.states.error'),
        message: translate('background.runtime.captureAlreadyRunning'),
      },
    }),
    logger,
    'Failed to show duplicate-capture toast',
    { tabId }
  );
}

export function notifyQuickActionError(tabId: number, error: unknown): void {
  runBestEffort(
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      type: MessageType.SHOW_TOAST,
      payload: {
        type: 'error',
        title: translate('background.runtime.captureErrorTitle'),
        message: error instanceof Error ? error.message : translate('content.runtime.unknownError'),
      },
    }),
    logger,
    'Failed to show quick action error toast',
    { tabId }
  );
}
