import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  AiSettingsMutationMessage,
  AiSettingsMutationResponse,
} from '../../../contracts/messaging/ai-settings-runtime';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { respondAsyncSuccess } from '../../routing-contracts/response';
import { mutateAiSettings } from './mutations';
import { AIModelProviderChangedError } from '../../../composition/persistence/ai-settings/graph-mutation-types';
import {
  SecretProtectionLockedError,
  type SecretProtectionService,
} from '../../../composition/persistence/secret-protection/model';
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
  sendResponse: ResponseSender<AiSettingsMutationResponse>,
  protection?: SecretProtectionService,
  mutate = (message: Parameters<typeof mutateAiSettings>[0]) =>
    protection ? mutateAiSettings(message, protection) : mutateAiSettings(message)
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
    respondAsyncAiSecretProtectionStatus(sendResponse, protection);
    return true;
  }

  respondAsyncAiSettingsMutation(mutate(message), sendResponse);
  return true;
}

function respondAsyncAiSecretProtectionStatus(
  sendResponse: ResponseSender<AiSettingsMutationResponse>,
  protection?: SecretProtectionService
): void {
  (protection ? protection.readStatus() : loadAISecretProtectionStatus()).then(
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
      if (
        error instanceof SecretProtectionLockedError ||
        error instanceof AIModelProviderChangedError
      ) {
        sendResponse({
          success: false,
          reason: error instanceof SecretProtectionLockedError ? 'ai-secrets-locked' : error.reason,
          error:
            error instanceof SecretProtectionLockedError
              ? 'AI provider secrets are locked'
              : error.message,
        });
        return;
      }

      respondAsyncSuccess(Promise.reject(error), sendResponse);
    });
}
