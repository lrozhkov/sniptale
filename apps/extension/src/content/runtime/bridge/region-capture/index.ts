import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import { RegionCaptureControlMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  getRegionCaptureSupport,
  startRegionCapture,
  stopRegionCapture,
} from '../../../selection/region-capture';
import {
  createRegionCaptureProgressReporter,
  type RegionCaptureRuntimeTransport,
} from './transport';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import {
  isRegionCaptureMessage,
  type ContentRuntimeHandlerResult,
  type ContentRuntimeMessage,
  type RegionCaptureMessage,
} from '../types';

type StartRegionCaptureBridgeMessage = Extract<
  RegionCaptureMessage,
  { type: typeof RegionCaptureControlMessageType.START }
>;

type RegionCaptureBridgeDeps = {
  transport: RegionCaptureRuntimeTransport;
  startCapture: typeof startRegionCapture;
  stopCapture: typeof stopRegionCapture;
  getSupport: typeof getRegionCaptureSupport;
  logger: Pick<Logger, 'debug'>;
};

function getRegionCaptureErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const defaultRegionCaptureBridgeDeps: RegionCaptureBridgeDeps = {
  getSupport: getRegionCaptureSupport,
  logger: createLogger({ namespace: 'ContentRegionCaptureBridge' }),
  startCapture: startRegionCapture,
  stopCapture: stopRegionCapture,
  transport: {
    sendRuntimeMessage: (message) =>
      getContentRuntimeServices().messaging.sendRuntimeMessage(message),
  },
};

function startRegionCaptureWithResponse(
  message: StartRegionCaptureBridgeMessage,
  sendResponse: ResponseSender,
  deps: RegionCaptureBridgeDeps
): void {
  deps.logger.debug('[ContentRegionCapture] start', {
    microphoneEnabled: message.settings.microphoneEnabled,
    quality: message.settings.quality,
    systemAudioEnabled: message.settings.systemAudioEnabled,
  });

  deps
    .startCapture(message.settings, createRegionCaptureProgressReporter(deps.transport))
    .then(() => {
      sendResponse({ success: true });
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error: getRegionCaptureErrorMessage(error),
      });
    });
}

export function handleRegionCaptureMessage(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender,
  deps: RegionCaptureBridgeDeps = defaultRegionCaptureBridgeDeps
): ContentRuntimeHandlerResult {
  if (!isRegionCaptureMessage(message)) {
    return null;
  }

  return handleKnownRegionCaptureMessage(message, sendResponse, deps);
}

function handleKnownRegionCaptureMessage(
  message: RegionCaptureMessage,
  sendResponse: ResponseSender,
  deps: RegionCaptureBridgeDeps
): ContentRuntimeHandlerResult {
  switch (message.type) {
    case RegionCaptureControlMessageType.START: {
      startRegionCaptureWithResponse(message, sendResponse, deps);
      return true;
    }
    case RegionCaptureControlMessageType.STOP:
      deps.logger.debug('[ContentRegionCapture] stop');
      deps.stopCapture();
      sendResponse({ success: true });
      return true;
    case RegionCaptureControlMessageType.CHECK_SUPPORT:
      sendResponse({ success: true, support: deps.getSupport() });
      return true;
  }
}
