import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
} from '../../overlay/video-telemetry';
import { hideVideoCountdown, showVideoCountdown } from '../../overlay/video-countdown';
import {
  isViewportMessage,
  type ContentRuntimeHandlerResult,
  type ContentRuntimeMessage,
  type ViewportMessage,
} from './types';
import type { RegionSelectorController } from '../../selection/region-selector/types';

function acknowledgeViewportMessage(sendResponse: ResponseSender): false {
  sendResponse({ success: true });
  return false;
}

export function handleViewportMessage(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender,
  getViewportInfo: () => ViewportInfo,
  regionSelectorController: Pick<RegionSelectorController, 'hideRecordingOverlay'>
): ContentRuntimeHandlerResult {
  if (!isViewportMessage(message)) {
    return null;
  }

  return handleKnownViewportMessage(
    message,
    sendResponse,
    getViewportInfo,
    regionSelectorController
  );
}

function handleEnableControlledCursorCaptureMessage(
  message: Extract<ViewportMessage, { type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE }>,
  sendResponse: ResponseSender,
  getViewportInfo: () => ViewportInfo
): false {
  enableVideoTelemetry(message.recordingId, message.offsetSeconds);
  sendResponse({ success: true, viewport: getViewportInfo() });
  return false;
}

function handleDisableControlledCursorCaptureMessage(sendResponse: ResponseSender): false {
  const telemetry = disableVideoTelemetry();
  sendResponse(telemetry ? { success: true, telemetry } : { success: true });
  return false;
}

function handleKnownViewportMessage(
  message: ViewportMessage,
  sendResponse: ResponseSender,
  getViewportInfo: () => ViewportInfo,
  _regionSelectorController: Pick<RegionSelectorController, 'hideRecordingOverlay'>
): false | true {
  switch (message.type) {
    case VideoMessageType.GET_VIEWPORT_COORDS:
      sendResponse({
        success: true,
        coords: {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
        },
        viewport: getViewportInfo(),
      });
      return true;
    case VideoMessageType.SHOW_COUNTDOWN:
      showVideoCountdown(message.seconds || 3, message.sessionId);
      return acknowledgeViewportMessage(sendResponse);
    case VideoMessageType.HIDE_COUNTDOWN:
      hideVideoCountdown();
      return acknowledgeViewportMessage(sendResponse);
    case VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE:
      return handleEnableControlledCursorCaptureMessage(message, sendResponse, getViewportInfo);
    case VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE:
      return handleDisableControlledCursorCaptureMessage(sendResponse);
    case VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE:
      pauseVideoTelemetry();
      return acknowledgeViewportMessage(sendResponse);
    case VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE:
      resumeVideoTelemetry();
      return acknowledgeViewportMessage(sendResponse);
  }

  return true;
}
