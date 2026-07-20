import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { shouldRestoreCropOverlayAfterNavigation } from '../../../../navigation';
import { restoreRecordingOverlayAfterNavigation } from '../../../../ui/overlay-restore';
import { getVideoRecordingRuntimeState } from '../../../session-state';
import { getVideoRecordingCaptureMode, getVideoRecordingTabId } from '../../../../session-state';
import { OVERLAY_RESTORE_RETRY_DELAYS_MS } from '../../controls.stop';

export function maybeRestoreCropOverlayAfterComplete(tabId: number): void {
  if (getVideoRecordingCaptureMode() !== CaptureMode.TAB_CROP) {
    return;
  }

  const runtimeState = getVideoRecordingRuntimeState();
  const cropRegion = runtimeState.captureSource?.cropRegion;

  if (!cropRegion) {
    return;
  }

  void restoreRecordingOverlayAfterNavigation(
    tabId,
    cropRegion,
    () =>
      shouldRestoreCropOverlayAfterNavigation(
        tabId,
        getVideoRecordingTabId(),
        getVideoRecordingCaptureMode()
      ),
    OVERLAY_RESTORE_RETRY_DELAYS_MS
  );
}
