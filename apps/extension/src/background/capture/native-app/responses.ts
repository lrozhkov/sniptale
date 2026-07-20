import type {
  AppRecordingStoppedMessage,
  AppScreenshotStartMessage,
  ExtensionRecordingRejectMessage,
  ExtensionScreenshotRejectMessage,
  NativeRejectReason,
} from '../../../contracts/native-app';

export function screenshotReject(
  message: Pick<AppScreenshotStartMessage, 'captureId' | 'controllerLeaseId' | 'protocolVersion'>,
  reason: NativeRejectReason
): ExtensionScreenshotRejectMessage {
  return {
    captureId: message.captureId,
    controllerLeaseId: message.controllerLeaseId,
    protocolVersion: message.protocolVersion,
    reason,
    type: 'extension.screenshot.reject',
  };
}

export function recordingReject(
  message: Pick<
    AppRecordingStoppedMessage,
    'controllerLeaseId' | 'protocolVersion' | 'recordingId'
  >,
  reason: NativeRejectReason
): ExtensionRecordingRejectMessage {
  return {
    controllerLeaseId: message.controllerLeaseId,
    protocolVersion: message.protocolVersion,
    reason,
    recordingId: message.recordingId,
    type: 'extension.recording.reject',
  };
}
