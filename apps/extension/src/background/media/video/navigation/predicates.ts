import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

export function shouldRefreshViewportRecordingAfterNavigation(
  tabId: number,
  recordingTabId: number | null,
  currentCaptureMode: CaptureMode | null
): boolean {
  return tabId === recordingTabId && currentCaptureMode === CaptureMode.VIEWPORT_EMULATION;
}

export function shouldRestoreCropOverlayAfterNavigation(
  tabId: number,
  recordingTabId: number | null,
  currentCaptureMode: CaptureMode | null
): boolean {
  return tabId === recordingTabId && currentCaptureMode === CaptureMode.TAB_CROP;
}
