import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  AiSettingsMutationMessage,
  AiSettingsMutationResponse,
} from '../../../contracts/messaging/ai-settings-runtime';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { respondAsyncSuccess } from '../../routing-contracts/response';
import { mutateAiSettings } from './mutations';
import { isAISecretPassphraseLockedError } from '../../../composition/persistence/ai-settings/secret-protection.store.ts';
import { loadAISecretProtectionStatus } from '../../../composition/persistence/ai-settings';
import * as authorizationPreauthorization from './authorization/preauthorization';

const logger = createLogger({ namespace: 'BackgroundAiSettingsRoute' });

function isAiSettingsMutationMessage(message: unknown): message is AiSettingsMutationMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.AI_SETTINGS_MUTATION
  );
}

export function routeAiSettingsMutationMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender<AiSettingsMutationResponse>
): boolean {
  if (!isAiSettingsMutationMessage(message)) {
    return false;
  }

  if (!authorizationPreauthorization.hasPreauthorizedAiSettingsMutationMessage(message)) {
    logger.warn('Rejected AI settings mutation from unauthorized sender', {
      senderUrl: sender.url,
      tabId: sender.tab?.id,
      type: message.operation,
    });
    sendResponse({ success: false, error: 'Unauthorized AI settings mutation sender' });
    return true;
  }

  if (message.operation === 'read-secret-protection-status') {
    respondAsyncAiSecretProtectionStatus(sendResponse);
    return true;
  }

  respondAsyncAiSettingsMutation(mutateAiSettings(message), sendResponse);
  return true;
}

function respondAsyncAiSecretProtectionStatus(
  sendResponse: ResponseSender<AiSettingsMutationResponse>
): void {
  loadAISecretProtectionStatus().then(
    (secretProtectionStatus) => {
      sendResponse({ success: true, secretProtectionStatus });
    },
    (error) => {
      respondAsyncSuccess(Promise.reject(error), sendResponse);
    }
  );
}

function respondAsyncAiSettingsMutation(
  work: Promise<void>,
  sendResponse: ResponseSender<AiSettingsMutationResponse>
): void {
  work
    .then(() => {
      sendResponse({ success: true, result: 'accepted' });
    })
    .catch((error) => {
      if (isAISecretPassphraseLockedError(error)) {
        sendResponse({
          success: false,
          reason: error.reason,
          error: error.message,
        });
        return;
      }

      respondAsyncSuccess(Promise.reject(error), sendResponse);
    });
}
