import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingMediaDevice } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { HandledOffscreenRuntimeMessageType } from './message-types';
import { buildProjectExportCommandSuccessResponse } from './project-export-response';

type OffscreenCommandSuccessResponse = Record<string, unknown> & { success: true };

function isRecordWithExactKeys(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function invalidCompletion(type: HandledOffscreenRuntimeMessageType): never {
  throw new Error(`Invalid ${type} completion`);
}

function buildAcceptedScalarResponse(
  type: HandledOffscreenRuntimeMessageType,
  result: unknown
): OffscreenCommandSuccessResponse {
  if (result !== 'accepted') invalidCompletion(type);
  return { result, success: true };
}

function buildAcceptedVoidResponse(
  type: HandledOffscreenRuntimeMessageType,
  result: unknown
): OffscreenCommandSuccessResponse {
  if (result !== undefined) invalidCompletion(type);
  return { result: 'accepted', success: true };
}

function buildCreatedLeaseResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE;
  if (
    !isRecordWithExactKeys(result, ['leaseId', 'result', 'url']) ||
    result['result'] !== 'leased' ||
    typeof result['leaseId'] !== 'string' ||
    result['leaseId'].length === 0 ||
    result['leaseId'].length > 128 ||
    typeof result['url'] !== 'string' ||
    !result['url'].startsWith('blob:')
  ) {
    return invalidCompletion(type);
  }
  return {
    leaseId: result['leaseId'],
    result: 'leased',
    success: true,
    url: result['url'],
  };
}

function buildConfirmedLeaseResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE;
  if (
    !isRecordWithExactKeys(result, ['result']) ||
    (result['result'] !== 'confirmed' && result['result'] !== 'stale')
  ) {
    return invalidCompletion(type);
  }
  return { result: result['result'], success: true };
}

function buildReleasedLeaseResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE;
  if (
    !isRecordWithExactKeys(result, ['result']) ||
    (result['result'] !== 'released' && result['result'] !== 'stale')
  ) {
    return invalidCompletion(type);
  }
  return { result: result['result'], success: true };
}

function buildReadinessResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = VideoMessageType.OFFSCREEN_READINESS_PROBE;
  if (
    !isRecordWithExactKeys(result, ['challenge', 'offscreenStartupId', 'state']) ||
    typeof result['challenge'] !== 'string' ||
    typeof result['offscreenStartupId'] !== 'string' ||
    (result['state'] !== 'failed' && result['state'] !== 'ready')
  ) {
    return invalidCompletion(type);
  }
  return {
    challenge: result['challenge'],
    offscreenStartupId: result['offscreenStartupId'],
    state: result['state'],
    success: true,
  };
}

function buildCameraAnswerResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER;
  if (
    !isRecordWithExactKeys(result, ['sdp', 'type']) ||
    result['type'] !== 'answer' ||
    typeof result['sdp'] !== 'string'
  ) {
    return invalidCompletion(type);
  }
  return { sdp: result['sdp'], success: true };
}

function isVideoRecordingMediaDevice(value: unknown): value is VideoRecordingMediaDevice {
  return (
    isRecordWithExactKeys(value, ['deviceId', 'kind', 'label']) &&
    typeof value['deviceId'] === 'string' &&
    (value['kind'] === 'audioinput' || value['kind'] === 'videoinput') &&
    typeof value['label'] === 'string'
  );
}

function buildMediaDevicesResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES;
  if (
    !isRecordWithExactKeys(result, ['mediaDevices']) ||
    !Array.isArray(result['mediaDevices']) ||
    !result['mediaDevices'].every(isVideoRecordingMediaDevice)
  ) {
    return invalidCompletion(type);
  }
  return { mediaDevices: result['mediaDevices'], success: true };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function buildDesktopFrameResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME;
  if (
    !isRecordWithExactKeys(result, ['dataUrl', 'height', 'result', 'width']) ||
    result['result'] !== 'captured' ||
    typeof result['dataUrl'] !== 'string' ||
    !result['dataUrl'].startsWith('data:image/') ||
    !isPositiveSafeInteger(result['height']) ||
    !isPositiveSafeInteger(result['width'])
  ) {
    return invalidCompletion(type);
  }
  return {
    dataUrl: result['dataUrl'],
    height: result['height'],
    result: 'captured',
    success: true,
    width: result['width'],
  };
}

function buildStopRecordingResponse(result: unknown): OffscreenCommandSuccessResponse {
  const type = VideoMessageType.OFFSCREEN_STOP_RECORDING;
  if (isRecordWithExactKeys(result, ['result']) && result['result'] === 'stopped') {
    return { result: 'accepted', success: true };
  }
  if (
    isRecordWithExactKeys(result, ['error', 'result']) &&
    result['result'] === 'terminal-failure' &&
    typeof result['error'] === 'string'
  ) {
    return { error: result['error'], result: 'terminal-failure', success: true };
  }
  return invalidCompletion(type);
}

function buildProjectExportResponse(
  type:
    | typeof VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT
    | typeof VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
  result: unknown
): OffscreenCommandSuccessResponse {
  return buildProjectExportCommandSuccessResponse(type, result) ?? invalidCompletion(type);
}

export function buildOffscreenCommandResponse(
  type: HandledOffscreenRuntimeMessageType,
  result: unknown
): OffscreenCommandSuccessResponse {
  switch (type) {
    case MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE:
      return buildCreatedLeaseResponse(result);
    case MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE:
      return buildConfirmedLeaseResponse(result);
    case MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE:
      return buildReleasedLeaseResponse(result);
    case VideoMessageType.OFFSCREEN_READINESS_PROBE:
      return buildReadinessResponse(result);
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER:
      return buildCameraAnswerResponse(result);
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES:
      return buildMediaDevicesResponse(result);
    case MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME:
      return buildDesktopFrameResponse(result);
    case VideoMessageType.OFFSCREEN_STOP_RECORDING:
      return buildStopRecordingResponse(result);
    case MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME:
    case MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME:
      return buildAcceptedScalarResponse(type, result);
    case MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE:
      if (result !== 'applied') return invalidCompletion(type);
      return { result, success: true };
    case MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD:
      if (result !== 'copied') return invalidCompletion(type);
      return { result, success: true };
    case VideoMessageType.GET_DESKTOP_MEDIA:
    case VideoMessageType.DISPOSE_DESKTOP_MEDIA:
    case VideoMessageType.OFFSCREEN_BEGIN_RECORDING:
    case VideoMessageType.OFFSCREEN_PAUSE_RECORDING:
    case VideoMessageType.OFFSCREEN_RESUME_RECORDING:
    case VideoMessageType.OFFSCREEN_UPDATE_SETTINGS:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE:
    case VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH:
      return buildAcceptedVoidResponse(type, result);
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT:
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
      return buildProjectExportResponse(type, result);
    case MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE:
    case VideoMessageType.OFFSCREEN_START_RECORDING:
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES:
      return invalidCompletion(type);
  }
}
