import { setViewportRecordingDrawState } from '../../../navigation';
import { freezeViewportNavigation, isViewportNavigationPending } from '../../../session-state';
import { isViewportRecordingNavigationTab } from './guard';

export function freezeViewportRecordingForNavigation(): void {
  const navigationEpoch = freezeViewportNavigation();

  void setViewportRecordingDrawState({
    frozen: true,
    navigationEpoch,
  });
}

export function handleViewportRecordingNavigationStart(tabId: number): boolean {
  if (!isViewportRecordingNavigationTab(tabId)) {
    return false;
  }

  freezeViewportRecordingForNavigation();
  return true;
}

export function handleViewportRecordingDebuggerDetach(tabId: number): boolean {
  if (!isViewportRecordingNavigationTab(tabId)) {
    return false;
  }

  if (!isViewportNavigationPending()) {
    freezeViewportRecordingForNavigation();
  }

  return true;
}
