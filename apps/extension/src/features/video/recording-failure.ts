import { VideoRecordingFailureCode } from '@sniptale/runtime-contracts/video/types/types';
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
  return translate('background.runtime.recordingError');
}
