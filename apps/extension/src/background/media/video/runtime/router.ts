import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  DiagnosticEventFromCS,
  DiagnosticLevel,
} from '@sniptale/platform/observability/diagnostics/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { appendContentDiagnosticEvent } from '../../../diagnostics/public/event-sink';
import {
  createUnhandledRouteResult,
  handleDownloadRecording,
  handleDownloadRecordingSidecar,
  handleOffscreenError,
  handleOffscreenRecordingPaused,
  handleOffscreenRecordingResumed,
  handleOffscreenRecordingStarted,
  handleOffscreenRecordingStopped,
  handleRecordingDurationUpdated,
  handleRegisterCameraRecorderControl,
  handleRecordingState,
  handleRecordingTabId,
  handleVideoSavedToIdb,
  type RouteResult,
} from './handlers';
import { routeExportRuntimeMessage } from './handlers/export/route';
import { routeStateLifecycleRuntimeMessage } from './handlers/state/route';
import type { ProjectExportPreauthorization } from '../../../routing-contracts/project-export-preauthorization';

function mapRuntimeDiagnosticEvent(message: {
  event?: string;
  level?: string;
  payload?: unknown;
}): DiagnosticEventFromCS {
  const [rawKind, ...messageParts] = (message.event ?? 'action:content event').split(':');
  const kind = rawKind === 'error' ? 'error' : 'action';
  const text = messageParts.join(':').trim() || message.event || 'content event';
  return {
    kind,
    ...(message.level === undefined ? {} : { level: message.level as DiagnosticLevel }),
    message: text,
    ...(message.payload === undefined ? {} : { data: message.payload }),
  };
}

function handleDiagnosticRuntimeMessage(
  message: Extract<VideoRuntimeMessage, { type: typeof VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS }>,
  senderTabId?: number
): RouteResult {
  if (typeof senderTabId === 'number') {
    appendContentDiagnosticEvent(mapRuntimeDiagnosticEvent(message), senderTabId);
  }
  return { handled: true, keepChannelOpen: false };
}

function routeRecordingRuntimeMessage(
  message: VideoRuntimeMessage,
  sendResponse: ResponseSender,
  senderTabId?: number,
  sender?: chrome.runtime.MessageSender
): RouteResult | null {
  if (message.type === VideoMessageType.GET_RECORDING_STATE) {
    return handleRecordingState(sendResponse, sender);
  }
  if (message.type === VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL) {
    return handleRegisterCameraRecorderControl(message, sendResponse, sender);
  }
  if (message.type === VideoMessageType.GET_RECORDING_TAB_ID) {
    return handleRecordingTabId(sendResponse, senderTabId);
  }
  if (message.type === VideoMessageType.RECORDING_DURATION_UPDATED) {
    return handleRecordingDurationUpdated(message, sendResponse);
  }
  if (message.type === VideoMessageType.OFFSCREEN_RECORDING_STARTED) {
    return handleOffscreenRecordingStarted(message, sendResponse);
  }
  if (message.type === VideoMessageType.OFFSCREEN_RECORDING_STOPPED) {
    return handleOffscreenRecordingStopped(message, sendResponse);
  }
  if (message.type === VideoMessageType.OFFSCREEN_RECORDING_PAUSED) {
    return handleOffscreenRecordingPaused(message, sendResponse);
  }
  if (message.type === VideoMessageType.OFFSCREEN_RECORDING_RESUMED) {
    return handleOffscreenRecordingResumed(message, sendResponse);
  }
  if (message.type === VideoMessageType.OFFSCREEN_ERROR) {
    return handleOffscreenError(message, sendResponse);
  }
  if (message.type === VideoMessageType.VIDEO_SAVED_TO_IDB) {
    return handleVideoSavedToIdb(message, sendResponse);
  }
  if (message.type === VideoMessageType.DOWNLOAD_RECORDING) {
    return handleDownloadRecording(message, sendResponse);
  }
  if (message.type === VideoMessageType.DOWNLOAD_RECORDING_SIDECAR) {
    return handleDownloadRecordingSidecar(message, sendResponse);
  }
  return null;
}

export function routeVideoRuntimeMessage(
  message: VideoRuntimeMessage,
  sendResponse: ResponseSender,
  senderTabId?: number,
  sender?: chrome.runtime.MessageSender,
  projectExportPreauthorization?: ProjectExportPreauthorization
): RouteResult {
  const recordingRoute = routeRecordingRuntimeMessage(message, sendResponse, senderTabId, sender);
  if (recordingRoute) {
    return recordingRoute;
  }

  const stateLifecycleRoute = routeStateLifecycleRuntimeMessage(message, sendResponse);
  if (stateLifecycleRoute) {
    return stateLifecycleRoute;
  }

  const exportRoute = routeExportRuntimeMessage(
    message,
    sendResponse,
    sender,
    projectExportPreauthorization
  );
  if (exportRoute) {
    return exportRoute;
  }

  if (message.type === VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS) {
    return handleDiagnosticRuntimeMessage(message, senderTabId);
  }
  return createUnhandledRouteResult();
}
