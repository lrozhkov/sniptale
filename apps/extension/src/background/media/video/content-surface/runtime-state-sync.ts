import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { RECORDING_START_DELIVERY_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import {
  CaptureMode,
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  updateVideoRecordingSurface,
  type VideoRecordingSurfaceLease,
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

/** Prepares only an existing supported drawing surface; other sources have no page drawing UI. */
export async function prepareVideoRecordingSurfaceCapture(
  args: {
    captureMode: CaptureMode | null;
    recordingId: string | null;
    tabId: number | null;
  },
  createSnapshot: (lease: VideoRecordingSurfaceLease) => Promise<VideoRecordingSurfaceSnapshot>
): Promise<() => Promise<void>> {
  const unchanged = async () => undefined;
  if (args.captureMode !== CaptureMode.TAB && args.captureMode !== CaptureMode.TAB_CROP)
    return unchanged;
  const lease = await ensureVideoRecordingSurfaceLeaseHydrated();
  if (!lease || lease.tabId !== args.tabId) return unchanged;
  if (
    lease.expiresAt <= Date.now() ||
    !args.recordingId ||
    lease.recordingId !== args.recordingId
  ) {
    throw new Error('Recording drawing surface identity changed');
  }
  const snapshot = await createSnapshot(lease);
  const requestId = crypto.randomUUID();
  const send = async (suppressed: boolean) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        getBackgroundRuntimeMessaging().sendTabMessage(
          lease.tabId,
          {
            type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
            surfaceToken: lease.surfaceToken,
            snapshot,
            capturePreparation: { requestId, suppressed },
          },
          { frameId: 0 }
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Recording drawing surface preparation timed out')),
            RECORDING_START_DELIVERY_TIMEOUT_MS
          );
        }),
      ]);
      if (!response.success || response.capturePreparationId !== requestId) {
        throw new Error('Recording drawing surface did not confirm readiness');
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const restore = () => send(false);
  try {
    await send(true);
    const current = await ensureVideoRecordingSurfaceLeaseHydrated();
    if (
      !current ||
      current.surfaceSessionId !== lease.surfaceSessionId ||
      current.documentGeneration !== lease.documentGeneration ||
      current.capabilityEpoch !== lease.capabilityEpoch ||
      current.recordingId !== lease.recordingId ||
      current.surfaceToken !== lease.surfaceToken
    ) {
      throw new Error('Recording drawing surface identity changed');
    }
    return restore;
  } catch (error) {
    await restore().catch(() => undefined);
    throw error;
  }
}
