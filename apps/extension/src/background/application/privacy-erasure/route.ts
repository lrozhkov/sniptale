import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  LocalDataErasureMessage,
  LocalDataErasureResponse,
} from '../../../contracts/messaging/privacy-erasure';
import { type ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { BackgroundRuntimeState } from '../runtime-state';
import { eraseLocalExtensionDataFromBackground } from './composition';

const logger = createLogger({ namespace: 'BackgroundPrivacyErasureRoute' });

function isLocalDataErasureMessage(message: unknown): message is LocalDataErasureMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.ERASE_LOCAL_EXTENSION_DATA
  );
}

export function routeLocalDataErasureMessage(
  message: unknown,
  sendResponse: ResponseSender<LocalDataErasureResponse>,
  state: BackgroundRuntimeState
): boolean {
  if (!isLocalDataErasureMessage(message)) {
    return false;
  }

  eraseLocalExtensionDataFromBackground(message, state).then(
    (result) =>
      sendResponse({
        success: result.success,
        ...(result.success
          ? {}
          : {
              error: `Local data erasure failed: ${result.failedRequiredParticipantIds.join(', ')}`,
            }),
        result,
      }),
    () => {
      logger.error('Failed to erase local extension data');
      sendResponse({
        success: false,
        error: 'Local data erasure failed',
      });
    }
  );
  return true;
}
