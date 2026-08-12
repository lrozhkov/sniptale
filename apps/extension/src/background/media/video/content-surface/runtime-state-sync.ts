import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  updateVideoRecordingSurface,
} from './surface-lease';

export async function publishVideoRecordingSurfaceRuntimeState(
  state: VideoRecordingRuntimeState
): Promise<void> {
  let lease = await ensureVideoRecordingSurfaceLeaseHydrated();
  if (!lease || lease.expiresAt <= Date.now()) return;
  if (state.status === VideoRecordingStatus.IDLE && lease.recordingId !== null) {
    lease =
      (await updateVideoRecordingSurface(lease.surfaceSessionId, { recordingId: null })) ?? lease;
  }
  await getBackgroundRuntimeMessaging().sendTabMessage(lease.tabId, {
    type: VideoMessageType.RECORDING_STATE_SYNC,
    state,
  });
}
