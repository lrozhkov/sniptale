import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoSurfaceSession } from '../../../capture-surface';
import {
  getVideoRecordingCaptureMode,
  getVideoRecordingId,
  getVideoRecordingTabId,
} from '../../../session-state';

export type NavigationBinding = {
  captureMode: CaptureMode.TAB | CaptureMode.TAB_CROP;
  generation: number;
  recordingId: string;
  streamInstanceId: string;
  tabId: number;
};

function isTabCaptureMode(
  mode: CaptureMode | null
): mode is CaptureMode.TAB | CaptureMode.TAB_CROP {
  return mode === CaptureMode.TAB || mode === CaptureMode.TAB_CROP;
}

export function resolveNavigationBinding(tabId: number): NavigationBinding | null {
  const recordingId = getVideoRecordingId();
  const captureMode = getVideoRecordingCaptureMode();
  const session = recordingId ? getVideoSurfaceSession(recordingId) : null;
  if (
    !recordingId ||
    getVideoRecordingTabId() !== tabId ||
    !isTabCaptureMode(captureMode) ||
    session?.tabId !== tabId ||
    !session.sourceReady ||
    typeof session.streamInstanceId !== 'string'
  ) {
    return null;
  }
  return {
    captureMode,
    generation: session.generation,
    recordingId,
    streamInstanceId: session.streamInstanceId,
    tabId,
  };
}

export function isCurrentNavigationBinding(binding: NavigationBinding): boolean {
  const session = getVideoSurfaceSession(binding.recordingId);
  return (
    getVideoRecordingId() === binding.recordingId &&
    getVideoRecordingTabId() === binding.tabId &&
    getVideoRecordingCaptureMode() === binding.captureMode &&
    session?.generation === binding.generation &&
    session.sourceReady &&
    session.streamInstanceId === binding.streamInstanceId &&
    session.tabId === binding.tabId
  );
}
