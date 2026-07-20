import {
  parseRuntimeRequestMessage,
  parseRuntimeResponseForRequest,
  parseTabRequestMessage,
  parseTabResponseForRequest,
} from '../../contracts/messaging/parsers/boundary';
import type {
  RuntimeMessageType,
  RuntimeRequestByType,
  RuntimeResponseByType,
} from '../../contracts/messaging/contracts/runtime-message';
import type {
  TabMessageType,
  TabRequestByType,
  TabResponseByType,
} from '../../contracts/messaging/tab';
import {
  beginSendTrace,
  recordMessageFailure,
  recordMessageResponse,
  serializeMessagePayload,
} from '@sniptale/platform/observability/message-tracer/messaging';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import type { RuntimeMessagingDeps, RuntimeMessagingTransport } from './transport';

function validateRuntimeRequest<TMessage extends RuntimeRequestByType[RuntimeMessageType]>(
  message: TMessage
): TMessage {
  parseRuntimeRequestMessage(message);
  return message;
}

function validateTabRequest<TMessage extends TabRequestByType[TabMessageType]>(
  message: TMessage
): TMessage {
  parseTabRequestMessage(message);
  return message;
}

const defaultDeps: RuntimeMessagingDeps = {
  runtimeSendMessage: (message) => chrome.runtime.sendMessage(message),
  tabSendMessage: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
};

/**
 * Creates a typed runtime/tab transport seam over the browser messaging API.
 */
export function createRuntimeMessagingTransport(
  deps: Partial<RuntimeMessagingDeps> = {}
): RuntimeMessagingTransport {
  const resolvedDeps = {
    ...defaultDeps,
    ...deps,
  } satisfies RuntimeMessagingDeps;

  return {
    async sendRuntimeMessage<TMessage extends RuntimeRequestByType[RuntimeMessageType]>(
      message: TMessage
    ): Promise<RuntimeResponseByType[TMessage['type']]> {
      const parsedMessage = validateRuntimeRequest(message);
      const tracker = beginSendTrace(parsedMessage, parsedMessage, 'bg');

      try {
        const messageWithFreshness = attachRuntimeMessageFreshness(parsedMessage);
        const rawResponse = await resolvedDeps.runtimeSendMessage(messageWithFreshness);
        recordMessageResponse(rawResponse, tracker);
        return parseRuntimeResponseForRequest(parsedMessage, rawResponse);
      } catch (error) {
        recordMessageFailure(error, tracker);
        throw error;
      }
    },
    async sendTabMessage<TMessage extends TabRequestByType[TabMessageType]>(
      tabId: number,
      message: TMessage
    ): Promise<TabResponseByType[TMessage['type']]> {
      const parsedMessage = validateTabRequest(message);
      const tracker = beginSendTrace(
        parsedMessage,
        serializeMessagePayload(tabId, parsedMessage),
        'cs'
      );

      try {
        const rawResponse = await resolvedDeps.tabSendMessage(tabId, parsedMessage);
        recordMessageResponse(rawResponse, tracker);
        return parseTabResponseForRequest(parsedMessage, rawResponse);
      } catch (error) {
        recordMessageFailure(error, tracker);
        throw error;
      }
    },
  };
}
