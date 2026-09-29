import { VideoRecordingFailureCode } from '@sniptale/runtime-contracts/video/types/types';
import { isVideoRecordingStartFailureCode } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { translate } from '../../platform/i18n';

export function resolveVideoRecordingFailureMessage(
  errorCode: string | null | undefined
): string | null {
  if (errorCode === null || errorCode === undefined) {
    return null;
  }
  if (errorCode === VideoRecordingFailureCode.CAMERA_FRAME_RATE_UNSUPPORTED) {
    return translate('background.runtime.cameraFrameRateUnsupported');
  }
  if (isVideoRecordingStartFailureCode(errorCode)) {
    const messageKeys = {
      'permission-required': 'content.toolbar.videoRecordingStartPermissionRequired',
      'stale-context': 'content.toolbar.videoRecordingStartStaleContext',
      'invalid-source': 'content.toolbar.videoRecordingStartInvalidSource',
      'viewport-too-large': 'content.toolbar.videoRecordingStartViewportTooLarge',
      'viewport-verification-failed':
        'content.toolbar.videoRecordingStartViewportVerificationFailed',
      'already-active': 'content.toolbar.videoRecordingStartAlreadyActive',
      'duplicate-preparing': 'content.toolbar.videoRecordingStartAlreadyActive',
      cancelled: 'content.toolbar.videoRecordingStartCancelled',
      'internal-error': 'content.toolbar.videoRecordingActionFailed',
    } as const;
    return translate(messageKeys[errorCode]);
  }
  return translate('background.runtime.recordingError');
}
