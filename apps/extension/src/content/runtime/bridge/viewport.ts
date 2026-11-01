import { createRecordingClockSynchronizer } from '../../overlay/video-telemetry/clock-synchronization';
import {
  CONTENT_RUNTIME_PROTOCOL_VERSION,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
  updateVideoTelemetryClock,
  flushVideoTelemetryCursor,
  flushVideoTelemetryEvents,
  waitForVideoEventsCalibration,
  waitForVideoCursorCalibration,
} from '../../overlay/video-telemetry';
import { hideVideoCountdown, showVideoCountdown } from '../../overlay/video-countdown';
import {
  isViewportMessage,
  type ContentRuntimeHandlerResult,
  type ContentRuntimeMessage,
  type ViewportMessage,
} from './types';
import type { RegionSelectorController } from '../../selection/region-selector/types';

const recordingClock = createRecordingClockSynchronizer();

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
): false | true {
  if (message.cursorTrajectoryMode === 'blocks' || message.recordingEventsMode === 'blocks') {
    recordingClock.invalidate();
    enableVideoTelemetry(
      message.recordingId,
      message.offsetSeconds,
      message.frameClock === undefined ? undefined : null,
      message.cursorTrajectoryMode,
      message.recordingEventsMode
    );
    if (message.frameClock) {
      if (message.frameClock.phase === 'paused') pauseVideoTelemetry(null);
      const calibration = recordingClock.localize(message.frameClock, true).then((result) => {
        if (result.status === 'ready')
          updateVideoTelemetryClock(message.recordingId, result.anchor);
      });
      waitForVideoCursorCalibration(calibration);
      waitForVideoEventsCalibration(calibration);
    }
    sendResponse({ success: true, viewport: getViewportInfo() });
    return false;
  }
  if (message.frameClock === undefined) {
    recordingClock.invalidate();
    enableVideoTelemetry(message.recordingId, message.offsetSeconds);
  } else if (message.frameClock === null) {
    recordingClock.invalidate();
    enableVideoTelemetry(message.recordingId, message.offsetSeconds, null);
  } else {
    enableVideoTelemetry(message.recordingId, message.offsetSeconds, null);
    if (message.frameClock.phase === 'paused') pauseVideoTelemetry(null);
    void recordingClock.localize(message.frameClock, true).then((result) => {
      if (result.status === 'ready') updateVideoTelemetryClock(message.recordingId, result.anchor);
    });
    sendResponse({ success: true, viewport: getViewportInfo() });
    return false;
  }
  sendResponse({ success: true, viewport: getViewportInfo() });
  return false;
}

function handleDisableControlledCursorCaptureMessage(
  message: Extract<ViewportMessage, { type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE }>,
  sendResponse: ResponseSender
): false | true {
  recordingClock.invalidate();
  const telemetry = message.boundaryReason
    ? disableVideoTelemetry(message.boundaryReason)
    : disableVideoTelemetry();
  if (message.cursorTrajectoryMode === 'blocks' || message.recordingEventsMode === 'blocks') {
    void Promise.all([flushVideoTelemetryCursor(), flushVideoTelemetryEvents()]).then(
      () => sendResponse({ success: true, ...(telemetry ? { telemetry } : {}) }),
      () => sendResponse({ success: true, ...(telemetry ? { telemetry } : {}) })
    );
    return true;
  }
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
        contentRuntimeProtocolVersion: CONTENT_RUNTIME_PROTOCOL_VERSION,
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
      return handleDisableControlledCursorCaptureMessage(message, sendResponse);
    case VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE:
    case VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE: {
      const pause = message.type === VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE;
      const apply = pause ? pauseVideoTelemetry : resumeVideoTelemetry;
      if (message.frameClock === undefined) {
        recordingClock.invalidate();
        apply();
        return acknowledgeViewportMessage(sendResponse);
      }
      if (message.frameClock === null) {
        recordingClock.invalidate();
        apply(null);
        return acknowledgeViewportMessage(sendResponse);
      }
      const calibration = recordingClock.localize(message.frameClock, !pause).then((result) => {
        if (result.status === 'ready')
          updateVideoTelemetryClock(result.anchor.recordingId, result.anchor);
      });
      waitForVideoCursorCalibration(calibration);
      waitForVideoEventsCalibration(calibration);
      if (pause) pauseVideoTelemetry(null);
      else resumeVideoTelemetry(null, message.frameClock);
      return acknowledgeViewportMessage(sendResponse);
    }
  }

  return true;
}
