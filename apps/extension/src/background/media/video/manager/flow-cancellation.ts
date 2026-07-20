import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getVideoRecordingCaptureMode, getVideoRecordingTabId } from '../session-state';

const logger = createLogger({ namespace: 'VideoManager' });

export function isVideoRecordingStartCancelled(tabId: number | null, captureMode: CaptureMode) {
  if (getVideoRecordingCaptureMode() !== captureMode) {
    return true;
  }
  if (captureMode === CaptureMode.CAMERA) {
    return false;
  }

  return getVideoRecordingTabId() !== tabId;
}

export function abortVideoRecordingStartIfCancelled(
  tabId: number | null,
  captureMode: CaptureMode,
  stage: string
) {
  if (isVideoRecordingStartCancelled(tabId, captureMode)) {
    logger.log(`Start aborted after ${stage}`);
    return true;
  }
  return false;
}
