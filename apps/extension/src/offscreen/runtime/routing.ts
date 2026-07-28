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
  updateRecordingSettings,
} from '../recording/controller';
import {
  allowRecordingBegin,
  assertRecordingBegin,
  cancelRecordingBegin,
} from '../recording/start/gate';
import { recordingContext } from '../recording/context';
import {
  createSourceVideo,
  releaseSourceVideo,
  waitForSourceMetadata,
} from '../recording/stream/video-source';
import { revalidateTabOutputGeometry } from '../recording/stream/tab-output';
import type { RecordingStopOutcome } from '../recording/context';
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
    case VideoMessageType.OFFSCREEN_BEGIN_RECORDING:
    case VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE:
    case VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE:
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
    case VideoMessageType.OFFSCREEN_BEGIN_RECORDING:
    case VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE:
    case VideoMessageType.OFFSCREEN_STOP_RECORDING:
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
      return 'deferred-ack';
    case VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE:
      return 'manual';
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
    recordingId: message.recordingId,
    ...(message.captureMode === undefined ? {} : { captureMode: message.captureMode }),
    ...(message.cropRegion === undefined ? {} : { cropRegion: message.cropRegion }),
    generation: message.generation,
    streamInstanceId: message.streamInstanceId,
    ...(message.surface === undefined ? {} : { surface: message.surface }),
  };
}

export async function handleOffscreenRuntimeMessage(
  message: HandledMessage,
  sendResponse?: ResponseSender
): Promise<void | RecordingStopOutcome> {
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
    case VideoMessageType.OFFSCREEN_BEGIN_RECORDING:
      assertRecordingBegin(message);
      await recordingContext.tabOutputControls?.resume();
      allowRecordingBegin(message);
      return;
    case VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE:
      await setViewportDrawState(resolveRecordingSourceBinding(message), message.frozen);
      if (message.frozen) {
        cancelRecordingBegin('Recording start was cancelled by viewport navigation');
      }
      return;
    case VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE:
      await revalidateSource(message, sendResponse);
      return;
    case VideoMessageType.OFFSCREEN_STOP_RECORDING:
      return await stopRecording(
        {
          recordingId: message.recordingId,
          generation: message.generation,
          streamInstanceId: message.streamInstanceId,
        },
        message.discard ?? false
      );
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
      pauseRecording(resolveRecordingSourceBinding(message));
      return;
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
      resumeRecording(resolveRecordingSourceBinding(message));
      return;
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
      updateRecordingSettings(resolveRecordingSourceBinding(message), message.settings);
      return;
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES:
      await handleProjectExportRuntimeMessage(message, sendResponse);
      return;
  }
}

function resolveRecordingSourceBinding(message: {
  recordingId: string;
  generation: number;
  streamInstanceId: string;
}) {
  return {
    recordingId: message.recordingId,
    generation: message.generation,
    streamInstanceId: message.streamInstanceId,
  };
}

async function revalidateSource(
  message: Extract<HandledMessage, { type: typeof VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE }>,
  sendResponse?: ResponseSender
): Promise<void> {
  const binding = {
    recordingId: message.recordingId,
    generation: message.generation,
    streamInstanceId: message.streamInstanceId,
  };
  const stream = recordingContext.sourceStream;
  if (!stream || !recordingContext.matchesSourceBinding(binding)) {
    sendResponse?.({ success: false, result: 'DENY', error: 'Recording source is unavailable' });
    return;
  }
  const video = createSourceVideo(stream);
  try {
    await waitForSourceMetadata(video);
    if (
      recordingContext.sourceStream !== stream ||
      !recordingContext.matchesSourceBinding(binding) ||
      video.videoWidth !== recordingContext.sourceVideoWidth ||
      video.videoHeight !== recordingContext.sourceVideoHeight
    ) {
      throw new Error('Recording source geometry changed during revalidation');
    }
    const tabOutputGeometry = recordingContext.tabOutputGeometry;
    if (
      tabOutputGeometry &&
      !revalidateTabOutputGeometry(
        tabOutputGeometry,
        {
          width: video.videoWidth,
          height: video.videoHeight,
        },
        message.viewport
          ? {
              width: message.viewport.width,
              height: message.viewport.height,
              devicePixelRatio: message.viewport.devicePixelRatio,
            }
          : tabOutputGeometry.coordinateSpace
      )
    ) {
      throw new Error('Recording tab output mapping changed during revalidation');
    }
    sendResponse?.({
      success: true,
      result: 'ALLOW',
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    });
  } catch (error) {
    sendResponse?.({
      success: false,
      result: 'DENY',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    releaseSourceVideo(video);
  }
}
