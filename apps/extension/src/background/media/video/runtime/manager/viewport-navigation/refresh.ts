import { getVideoRecordingRuntimeState } from '../../session-state';
import {
  clearViewportNavigationPending,
  getViewportNavigationEpoch,
  isViewportNavigationPending,
} from '../../../session-state';
import { refreshViewportRecordingAfterNavigation } from '../../../navigation';
import { freezeViewportRecordingForNavigation } from './freeze';
import { isViewportRecordingNavigationTab } from './guard';

export function handleViewportRecordingTabUpdate(
  tabId: number,
  status: string | undefined
): boolean {
  if (!isViewportRecordingNavigationTab(tabId)) {
    return false;
  }

  if (status === 'loading') {
    if (!isViewportNavigationPending()) {
      freezeViewportRecordingForNavigation();
    }
    return true;
  }

  if (status !== 'complete') {
    return false;
  }

  clearViewportNavigationPending();

  const runtimeState = getVideoRecordingRuntimeState();
  if (!runtimeState.viewportPreset) {
    return true;
  }

  const navigationEpoch = getViewportNavigationEpoch();
  void refreshViewportRecordingAfterNavigation({
    tabId,
    viewportPreset: runtimeState.viewportPreset,
    navigationEpoch,
    isCurrentNavigationEpoch: () =>
      isViewportRecordingNavigationTab(tabId) && getViewportNavigationEpoch() === navigationEpoch,
  });
  return true;
}
