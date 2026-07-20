import { shouldRefreshViewportRecordingAfterNavigation } from '../../../navigation';
import { getVideoRecordingCaptureMode, getVideoRecordingTabId } from '../../../session-state';

export function isViewportRecordingNavigationTab(tabId: number): boolean {
  return shouldRefreshViewportRecordingAfterNavigation(
    tabId,
    getVideoRecordingTabId(),
    getVideoRecordingCaptureMode()
  );
}
