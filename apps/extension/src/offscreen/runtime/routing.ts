import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseOffscreenRuntimeMessage } from '../../contracts/messaging/parsers/boundary';
import {
  disposeMultiSourceDesktopMedia,
  requestDesktopMedia,
} from '../recording/setup/desktop-media';
import {
  pauseRecording,
  resumeRecording,
  setViewportDrawState,
  startRecording,
  stopRecording,
  updateViewportCrop,
} from '../recording/controller';
import { updateRecordingSettings } from '../recording/update-settings';
import { buildDesktopMediaRequestOptions } from './desktop-media-options';
import {
  handledOffscreenRuntimeMessageTypes,
  type HandledOffscreenRuntimeMessageType,
} from './message-types';
import { handlePageStoragePrivacyErasure } from './privacy-erasure';
import { handleProjectExportRuntimeMessage } from './routing.project-export';

type OffscreenRuntimeMessage = ReturnType<typeof parseOffscreenRuntimeMessage>;

export type { HandledOffscreenRuntimeMessageType } from './message-types';
type HandledMessage = Extract<
  OffscreenRuntimeMessage,
  { type: HandledOffscreenRuntimeMessageType }
>;
type ResponseMode = 'deferred-ack' | 'immediate-ack' | 'manual';

const handledOffscreenRuntimeMessageTypeSet = new Set<HandledOffscreenRuntimeMessageType>(
  handledOffscreenRuntimeMessageTypes
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHandledOffscreenRuntimeMessageCandidate(
  message: unknown
): message is Record<string, unknown> {
  return (
    isRecord(message) &&
    handledOffscreenRuntimeMessageTypeSet.has(message['type'] as HandledOffscreenRuntimeMessageType)
  );
}

export function parseOffscreenRuntimeMessageOrNull(args: {
  logInvalidMessage: (error: unknown) => void;
  message: unknown;
}): HandledMessage | null {
  try {
    const parsedMessage = parseOffscreenRuntimeMessage(args.message);
    return handledOffscreenRuntimeMessageTypeSet.has(
      parsedMessage.type as HandledOffscreenRuntimeMessageType
    )
      ? (parsedMessage as HandledMessage)
      : null;
  } catch (error) {
    args.logInvalidMessage(error);
    return null;
  }
}

export function resolveOffscreenErrorPhase(
  type: HandledOffscreenRuntimeMessageType
): 'stop' | 'runtime' | 'export' {
  switch (type) {
    case MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE:
    case VideoMessageType.GET_DESKTOP_MEDIA:
    case VideoMessageType.DISPOSE_DESKTOP_MEDIA:
    case VideoMessageType.OFFSCREEN_START_RECORDING:
    case VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP:
    case VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE:
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
      return 'runtime';
    case VideoMessageType.OFFSCREEN_STOP_RECORDING:
      return 'stop';
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES:
      return 'export';
  }
}

export function resolveOffscreenRuntimeResponseMode(
  type: HandledOffscreenRuntimeMessageType
): ResponseMode {
  switch (type) {
    case MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE:
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES:
      return 'manual';
    case VideoMessageType.OFFSCREEN_START_RECORDING:
      return 'immediate-ack';
    case VideoMessageType.GET_DESKTOP_MEDIA:
    case VideoMessageType.DISPOSE_DESKTOP_MEDIA:
    case VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP:
    case VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE:
    case VideoMessageType.OFFSCREEN_STOP_RECORDING:
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
      return 'deferred-ack';
  }
}

function buildStartRecordingArgs(
  message: Extract<HandledMessage, { type: typeof VideoMessageType.OFFSCREEN_START_RECORDING }>
) {
  return {
    streamId: message.streamId,
    settings: message.settings,
    ...(message.tabId === undefined ? {} : { tabId: message.tabId }),
    ...(message.viewport === undefined ? {} : { viewport: message.viewport }),
    ...(message.recordingId === undefined ? {} : { recordingId: message.recordingId }),
    ...(message.captureMode === undefined ? {} : { captureMode: message.captureMode }),
    ...(message.cropRegion === undefined ? {} : { cropRegion: message.cropRegion }),
    ...(message.targetResolution === undefined
      ? {}
      : { targetResolution: message.targetResolution }),
    ...(message.emulatedViewportCssSize === undefined
      ? {}
      : { emulatedViewportCssSize: message.emulatedViewportCssSize }),
  };
}

function handleViewportCropMessage(
  message: Extract<HandledMessage, { type: typeof VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP }>
) {
  updateViewportCrop({
    ...(message.targetResolution === undefined
      ? {}
      : { targetResolution: message.targetResolution }),
    ...(message.emulatedViewportCssSize === undefined
      ? {}
      : { viewportSizeInPixels: message.emulatedViewportCssSize }),
  });
}

export async function handleOffscreenRuntimeMessage(
  message: HandledMessage,
  sendResponse?: ResponseSender
): Promise<void> {
  switch (message.type) {
    case MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE:
      handlePageStoragePrivacyErasure(message, sendResponse);
      return;
    case VideoMessageType.GET_DESKTOP_MEDIA:
      await requestDesktopMedia(
        message.captureMode,
        message.controlledCursorCaptureEnabled === true,
        buildDesktopMediaRequestOptions(message)
      );
      return;
    case VideoMessageType.DISPOSE_DESKTOP_MEDIA:
      disposeMultiSourceDesktopMedia();
      return;
    case VideoMessageType.OFFSCREEN_START_RECORDING:
      await startRecording(buildStartRecordingArgs(message));
      return;
    case VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP:
      handleViewportCropMessage(message);
      return;
    case VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE:
      setViewportDrawState({
        frozen: message.frozen,
        navigationEpoch: message.navigationEpoch,
      });
      return;
    case VideoMessageType.OFFSCREEN_STOP_RECORDING:
      await stopRecording(message.discard ?? false);
      return;
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
      pauseRecording();
      return;
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
      resumeRecording();
      return;
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
      updateRecordingSettings(message.settings);
      return;
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES:
      await handleProjectExportRuntimeMessage(message, sendResponse);
      return;
  }
}
