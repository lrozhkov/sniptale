import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RegionSelectorController } from '../../selection/region-selector/types';
import {
  isRegionOverlayMessage,
  type ContentRuntimeHandlerResult,
  type ContentRuntimeMessage,
  type RegionOverlayMessage,
} from './types';

type RegionOverlayBridgeDeps = {
  hideRecordingOverlay: RegionSelectorController['hideRecordingOverlay'];
  hideRegionSelector: RegionSelectorController['hideRegionSelector'];
  logger: Pick<Logger, 'debug'>;
  showRecordingOverlay: RegionSelectorController['showRecordingOverlay'];
  showRegionSelector: RegionSelectorController['showRegionSelector'];
};

function acknowledgeOverlayRequest(sendResponse: ResponseSender): true {
  sendResponse({ success: true });
  return true;
}

export function handleRegionOverlayMessage(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender,
  deps: RegionOverlayBridgeDeps
): ContentRuntimeHandlerResult {
  if (!isRegionOverlayMessage(message)) {
    return null;
  }

  return handleKnownRegionOverlayMessage(message, sendResponse, deps);
}

function handleKnownRegionOverlayMessage(
  message: RegionOverlayMessage,
  sendResponse: ResponseSender,
  deps: RegionOverlayBridgeDeps
): ContentRuntimeHandlerResult {
  switch (message.type) {
    case VideoMessageType.SHOW_REGION_SELECTOR:
      deps.logger.debug('[ContentRegionOverlay] show selector');
      deps.showRegionSelector({
        regionSelectionCapabilityToken: message.regionSelectionCapabilityToken,
        regionSelectionRequestGeneration: message.regionSelectionRequestGeneration,
        regionSelectionRequestId: message.regionSelectionRequestId,
      });
      return acknowledgeOverlayRequest(sendResponse);
    case VideoMessageType.HIDE_REGION_SELECTOR:
      deps.logger.debug('[ContentRegionOverlay] hide selector');
      deps.hideRegionSelector();
      return acknowledgeOverlayRequest(sendResponse);
    case VideoMessageType.REGION_SELECTED:
      deps.logger.debug('[ContentRegionOverlay] region selected');
      if (message.region) {
        deps.showRecordingOverlay(message.region);
      }
      return false;
    case VideoMessageType.SHOW_RECORDING_OVERLAY:
      deps.logger.debug('[ContentRegionOverlay] show recording overlay');
      if (message.region) {
        deps.showRecordingOverlay(message.region);
      }
      return acknowledgeOverlayRequest(sendResponse);
    case VideoMessageType.HIDE_RECORDING_OVERLAY:
      deps.logger.debug('[ContentRegionOverlay] hide recording overlay');
      deps.hideRecordingOverlay();
      return acknowledgeOverlayRequest(sendResponse);
  }
}

export function createRegionOverlayBridgeDeps(
  controller: Pick<
    RegionSelectorController,
    'hideRecordingOverlay' | 'hideRegionSelector' | 'showRecordingOverlay' | 'showRegionSelector'
  >
): RegionOverlayBridgeDeps {
  return {
    ...controller,
    logger: createLogger({ namespace: 'ContentRegionOverlayBridge' }),
  };
}
