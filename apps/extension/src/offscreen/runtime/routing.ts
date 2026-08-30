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
  startRecording,
  stopRecording,
  updateRecordingSettings,
} from '../recording/controller';
import {
  allowRecordingBegin,
  assertRecordingBegin,
  cancelRecordingBegin,
} from '../recording/start/gate';
import type { RecordingStopOutcome } from '../recording/context';
import { buildDesktopMediaRequestOptions } from './desktop-media-options';
import {
  handledOffscreenRuntimeMessageTypes,
  type HandledOffscreenRuntimeMessageType,
} from './message-types';
import { handlePageStoragePrivacyErasure } from './privacy-erasure';
import { handleProjectExportRuntimeMessage } from './routing.project-export';
import {
  completeFrameAnnotationRasterJob,
  cleanupFrameAnnotationRasterJobs,
  acquireFrameAnnotationRasterInput,
  deleteFrameAnnotationRasterJob,
} from '../../composition/persistence/frame-annotation-raster-jobs';
import { FrameAnnotationRasterizer } from '../frame-annotation-rasterizer';
import {
  cancelDesktopFrame,
  captureDesktopFrame,
  reserveDesktopFrame,
  writeDesktopFrameClipboard,
} from '../media/desktop-frame';
import type { DesktopFrameResult } from '../media/desktop-frame';
import {
  answerCameraSourceOffer,
  closeCameraSourcePeer,
  switchCameraSourcePeerInput,
  type CameraSourcePeerAnswer,
} from '../recording/camera-source/peer';
import { listVideoRecordingMediaDevices } from '../recording/camera-source/device-catalog';
import type { VideoRecordingMediaDevice } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { probeOffscreenRuntimeReadiness } from './bootstrap';
import {
  confirmPagePackageDownloadLease,
  createPagePackageDownloadLease,
  releasePagePackageDownloadLease,
} from '../page-package-download/lease';

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
    case MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE:
    case MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD:
    case MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME:
    case MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME:
    case MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME:
    case MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE:
    case MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE:
    case MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE:
    case VideoMessageType.DISPOSE_DESKTOP_MEDIA:
    case VideoMessageType.OFFSCREEN_START_RECORDING:
    case VideoMessageType.OFFSCREEN_READINESS_PROBE:
    case VideoMessageType.OFFSCREEN_BEGIN_RECORDING:
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES:
      return 'runtime';
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER:
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
    case VideoMessageType.OFFSCREEN_START_RECORDING:
      return 'immediate-ack';
    case VideoMessageType.OFFSCREEN_READINESS_PROBE:
      return 'deferred-ack';
    case VideoMessageType.GET_DESKTOP_MEDIA:
    case MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE:
    case MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD:
    case MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME:
    case MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME:
    case MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME:
    case MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE:
    case MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE:
    case MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE:
    case VideoMessageType.DISPOSE_DESKTOP_MEDIA:
    case VideoMessageType.OFFSCREEN_BEGIN_RECORDING:
    case VideoMessageType.OFFSCREEN_STOP_RECORDING:
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES:
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
      return 'deferred-ack';
    case MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE:
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES:
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
    ...(message.sourceContext === undefined ? {} : { sourceContext: message.sourceContext }),
    ...(message.surface === undefined ? {} : { surface: message.surface }),
  };
}

export async function handleOffscreenRuntimeMessage(
  message: HandledMessage,
  sendResponse?: ResponseSender
): Promise<
  | void
  | RecordingStopOutcome
  | DesktopFrameResult
  | CameraSourcePeerAnswer
  | { mediaDevices: VideoRecordingMediaDevice[] }
  | { challenge: string; offscreenStartupId: string; state: 'failed' | 'ready' }
  | { leaseId: string; result: 'leased'; url: string }
  | { result: 'confirmed' | 'released' | 'stale' }
  | 'accepted'
  | 'applied'
  | 'copied'
  | 'stale'
> {
  switch (message.type) {
    case MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE:
      return createPagePackageDownloadLease(message);
    case MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE:
      return confirmPagePackageDownloadLease(message);
    case MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE:
      return releasePagePackageDownloadLease(message);
    case VideoMessageType.OFFSCREEN_READINESS_PROBE:
      return probeOffscreenRuntimeReadiness(message);
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER:
      return answerCameraSourceOffer({
        peerId: message.peerId,
        offer: { type: 'offer', sdp: message.sdp },
        settings: message.settings,
      });
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE:
      closeCameraSourcePeer(message.peerId);
      return;
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH:
      await switchCameraSourcePeerInput(message.peerId, message.deviceId);
      return;
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES:
      return { mediaDevices: await listVideoRecordingMediaDevices(message.deviceKind) };
    case MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE:
      handlePageStoragePrivacyErasure(message, sendResponse);
      return;
    case MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE: {
      try {
        await cleanupFrameAnnotationRasterJobs();
        const input = await acquireFrameAnnotationRasterInput(message.reference);
        const result = await new FrameAnnotationRasterizer().rasterize(input);
        await completeFrameAnnotationRasterJob(message.reference, result.blob, result.metadata);
        return 'applied';
      } catch (error) {
        await deleteFrameAnnotationRasterJob(message.reference.jobId).catch(() => undefined);
        throw error;
      }
    }
    case MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD:
      await writeDesktopFrameClipboard(message.dataUrl);
      return 'copied';
    case MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME:
      return reserveDesktopFrame(message.requestId);
    case MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME:
      return captureDesktopFrame(message);
    case MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME:
      return cancelDesktopFrame(message.requestId);
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
      try {
        allowRecordingBegin(message);
      } catch (error) {
        cancelRecordingBegin(error instanceof Error ? error.message : String(error));
        throw error;
      }
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
      await updateRecordingSettings(resolveRecordingSourceBinding(message), message.settings);
      return;
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES:
      return await handleProjectExportRuntimeMessage(message, sendResponse);
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
