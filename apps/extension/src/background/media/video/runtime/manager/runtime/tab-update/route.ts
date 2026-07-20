import { handleControlledCursorTabUpdate } from '../../controlled-cursor/navigation';
import { handleViewportRecordingTabUpdate } from '../../viewport-navigation';
import { maybeRestoreCropOverlayAfterComplete } from './crop-overlay';
import { getVideoRecordingTabId } from '../../../../session-state';

export function handleTabUpdated(tabId: number, changeInfo: { status?: string }): void {
  if (tabId !== getVideoRecordingTabId()) {
    return;
  }

  if (handleViewportRecordingTabUpdate(tabId, changeInfo.status)) {
    return;
  }

  if (handleControlledCursorTabUpdate(tabId, changeInfo.status)) {
    return;
  }

  if (changeInfo.status !== 'complete') {
    return;
  }

  maybeRestoreCropOverlayAfterComplete(tabId);
}
