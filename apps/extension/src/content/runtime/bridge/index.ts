import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { parseContentTabMessage } from '../../../contracts/messaging/parsers/boundary';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { createContentRuntimeMessageHandlers } from './router';
import type { ContentRuntimeMessage } from './types';
import type { RegionSelectorController } from '../../selection/region-selector/types';
import { isTopLevelContentRuntimeMessage } from '../../application/message-listener/ownership';

const logger = createLogger({ namespace: 'ContentRuntimeBridge' });

type ContentRuntimeListenerDeps = {
  regionSelectorController: Pick<
    RegionSelectorController,
    'hideRecordingOverlay' | 'hideRegionSelector' | 'showRecordingOverlay' | 'showRegionSelector'
  >;
};

/**
 * Creates the top-level runtime message listener for content script orchestration.
 */
export function createContentRuntimeMessageListener(
  getViewportInfo: () => ViewportInfo,
  deps: ContentRuntimeListenerDeps
) {
  return (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: ResponseSender
  ) => {
    if (!isTopLevelContentRuntimeMessage(message)) {
      return false;
    }

    let parsedMessage: ContentRuntimeMessage;
    try {
      parsedMessage = parseContentTabMessage(message);
    } catch (error) {
      logger.warn(`Ignoring invalid ${PRODUCT_BRAND_NAME} runtime message`, error);
      return false;
    }

    logger.debug('Received content runtime message', { type: parsedMessage.type });

    const handlers = createContentRuntimeMessageHandlers(
      parsedMessage,
      sendResponse,
      getViewportInfo,
      deps.regionSelectorController
    );

    for (const handler of handlers) {
      const result = handler();
      if (result != null) {
        return result;
      }
    }

    return false;
  };
}
