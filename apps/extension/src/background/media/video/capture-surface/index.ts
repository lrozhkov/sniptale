import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { getCaptureSurfaceService, type AppliedCaptureSurface } from '../../../capture-surface';
import { cancelVideoSourceReadyWait } from './source-handshake';
import {
  clearClosedVideoSurfaceTab,
  clearVideoSurfaceRelease,
  createVideoSurfaceSession,
  deleteVideoSurfaceSession,
  getClosedVideoSurfaceTab,
  getVideoSurfaceRelease,
  getVideoSurfaceSession,
  registerVideoSurfaceRelease,
} from './session-registry';
import { releaseAppliedVideoCaptureSurface } from './release-applied';

function getContext(mode: CaptureMode) {
  return mode === CaptureMode.TAB_CROP ? ('video-tab-crop' as const) : ('video-tab' as const);
}

export async function acquireVideoCaptureSurface(args: {
  captureMode: CaptureMode;
  presetId: string | null;
  recordingId: string;
  tabId: number | null;
}): Promise<AppliedCaptureSurface | null> {
  const generation = 1;
  const session = createVideoSurfaceSession({
    generation,
    recordingId: args.recordingId,
    tabId: args.tabId,
  });

  if (!args.presetId) return null;
  if (args.captureMode === CaptureMode.SCREEN) {
    throw new Error('Viewport presets are unavailable for screen recording');
  }
  if (args.captureMode === CaptureMode.CAMERA || args.tabId === null) {
    throw new Error('Viewport presets are unavailable for camera recording');
  }

  session.applied = await getCaptureSurfaceService().apply({
    sessionId: args.recordingId,
    generation,
    owner: 'video',
    tabId: args.tabId,
    presetId: args.presetId,
    context: getContext(args.captureMode),
  });
  return session.applied;
}

async function releaseVideoCaptureSurfaceInternal(recordingId: string): Promise<void> {
  cancelVideoSourceReadyWait(recordingId, new Error('Recording source validation was cancelled'));
  const session = getVideoSurfaceSession(recordingId);
  const closedTabId = getClosedVideoSurfaceTab(recordingId);
  if (closedTabId !== null) {
    if (session?.applied) {
      await getCaptureSurfaceService().terminateClosedTab(closedTabId, ['video']);
    }
    deleteVideoSurfaceSession(recordingId);
    clearClosedVideoSurfaceTab(recordingId);
    return;
  }
  if (!session?.applied) {
    deleteVideoSurfaceSession(recordingId);
    return;
  }
  await releaseAppliedVideoCaptureSurface(session.applied, session.tabId);
  deleteVideoSurfaceSession(recordingId);
}

export async function releaseVideoCaptureSurface(
  recordingId: string | null | undefined
): Promise<void> {
  if (!recordingId) return;
  const existing = getVideoSurfaceRelease(recordingId);
  if (existing) return existing;
  const release = releaseVideoCaptureSurfaceInternal(recordingId).finally(() => {
    clearVideoSurfaceRelease(recordingId, release);
  });
  registerVideoSurfaceRelease(recordingId, release);
  return release;
}

export { markVideoCaptureSurfaceTabClosed, getVideoSurfaceSession } from './session-registry';
export {
  acceptVideoSourceReady,
  cancelVideoSourceReadyWait,
  waitForVideoSourceReady,
} from './source-handshake';
export {
  deferVideoCaptureSurfaceWorkUntilRecovery,
  recoverVideoCaptureSurfaceOnStartup,
  waitForVideoCaptureSurfaceRecovery,
} from './recovery';
