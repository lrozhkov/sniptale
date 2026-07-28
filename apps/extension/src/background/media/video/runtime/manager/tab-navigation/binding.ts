import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoSurfaceSession } from '../../../capture-surface';
import {
  getVideoRecordingCaptureMode,
  getVideoRecordingId,
  getVideoRecordingTabId,
} from '../../../session-state';

export type NavigationBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
  tabId: number;
};

function isTabCaptureMode(mode: CaptureMode | null): boolean {
  return mode === CaptureMode.TAB || mode === CaptureMode.TAB_CROP;
}

export function resolveNavigationBinding(tabId: number): NavigationBinding | null {
  const recordingId = getVideoRecordingId();
  const session = recordingId ? getVideoSurfaceSession(recordingId) : null;
  if (
    !recordingId ||
    getVideoRecordingTabId() !== tabId ||
    !isTabCaptureMode(getVideoRecordingCaptureMode()) ||
    session?.tabId !== tabId ||
    typeof session.streamInstanceId !== 'string'
  ) {
    return null;
  }
  return {
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
    session?.generation === binding.generation &&
    session.streamInstanceId === binding.streamInstanceId &&
    session.tabId === binding.tabId
  );
}
