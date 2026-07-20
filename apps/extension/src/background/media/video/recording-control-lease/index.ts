import { createLogger } from '@sniptale/platform/observability/logger';
import {
  CaptureMode,
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { setVideoRecordingRuntimeState } from '../runtime/session-state';
import {
  getVideoRecordingId,
  getVideoRecordingTabId,
  setOpenEditorAfterRecording,
  setVideoRecordingId,
  setVideoRecordingTabId,
} from '../session-state';
import {
  canPersistVideoRecordingLease,
  createLeaseSnapshot,
  persistLease,
  readPersistedLease,
  removePersistedLease,
  type VideoRecordingControlLease,
} from '../../../storage/video/recording-control-lease';

const logger = createLogger({ namespace: 'BackgroundVideoRecordingLease' });

let activeLease: VideoRecordingControlLease | null = null;
let hydrationPromise: Promise<VideoRecordingControlLease | null> | null = null;

function hydrateSessionFromLease(lease: VideoRecordingControlLease): void {
  setVideoRecordingId(lease.recordingId);
  setVideoRecordingTabId(lease.recordingTabId);
  setOpenEditorAfterRecording(lease.openEditorAfterRecording);
  setVideoRecordingRuntimeState({
    captureMode: lease.captureMode,
    countdownEndsAt: null,
    error: null,
    status: VideoRecordingStatus.RECORDING,
  } satisfies Partial<VideoRecordingRuntimeState>);
}

export async function issueActiveVideoRecordingLease(args: {
  captureMode: CaptureMode;
  ownerSenderUrl: string;
  openEditorAfterRecording: boolean;
}): Promise<VideoRecordingControlLease | null> {
  const recordingId = getVideoRecordingId();
  const recordingTabId = getVideoRecordingTabId();
  if (
    !recordingId ||
    (recordingTabId === null && args.captureMode !== CaptureMode.CAMERA) ||
    !canPersistVideoRecordingLease()
  ) {
    return null;
  }

  const lease = createLeaseSnapshot({
    captureMode: args.captureMode,
    ownerSenderUrl: args.ownerSenderUrl,
    openEditorAfterRecording: args.openEditorAfterRecording,
    recordingId,
    recordingTabId,
  });
  await persistLease(lease);
  activeLease = lease;
  return lease;
}

async function resolveLeaseToClear(
  recordingId?: string
): Promise<VideoRecordingControlLease | null> {
  if (recordingId !== undefined) {
    if (activeLease) {
      return activeLease.recordingId === recordingId ? activeLease : null;
    }
    const persistedLease = await readPersistedLease();
    return persistedLease?.recordingId === recordingId ? persistedLease : null;
  }

  return activeLease ?? (await readPersistedLease());
}

export async function clearActiveVideoRecordingLease(
  recordingId?: string,
  options: { shouldClear?: () => boolean } = {}
): Promise<void> {
  const leaseToClear = await resolveLeaseToClear(recordingId);
  if (recordingId !== undefined && !leaseToClear) {
    return;
  }

  if (options.shouldClear && !options.shouldClear()) {
    return;
  }

  await removePersistedLease();

  if (options.shouldClear && !options.shouldClear()) {
    if (activeLease && activeLease.recordingId !== leaseToClear?.recordingId) {
      await persistLease(activeLease);
      return;
    }
    if (leaseToClear) {
      activeLease = leaseToClear;
      await persistLease(leaseToClear);
    }
    return;
  }

  if (!recordingId || !activeLease || activeLease.recordingId === recordingId) {
    activeLease = null;
  }
}

export async function hydrateActiveVideoRecordingLease(): Promise<VideoRecordingControlLease | null> {
  const lease = await readPersistedLease();
  if (!lease) {
    activeLease = null;
    await removePersistedLease();
    return null;
  }

  activeLease = lease;
  hydrateSessionFromLease(lease);
  return lease;
}

export async function ensureActiveVideoRecordingLeaseHydrated(): Promise<VideoRecordingControlLease | null> {
  if (activeLease && activeLease.expiresAt > Date.now()) {
    return activeLease;
  }

  hydrationPromise ??= hydrateActiveVideoRecordingLease().finally(() => {
    hydrationPromise = null;
  });
  return hydrationPromise;
}

export async function restoreCurrentRecordingFromLease(recordingId: string): Promise<boolean> {
  const lease = activeLease ?? (await ensureActiveVideoRecordingLeaseHydrated());
  if (!lease || lease.recordingId !== recordingId) {
    return false;
  }

  hydrateSessionFromLease(lease);
  return true;
}

export function validateRecordingControlCapability(args: {
  controlToken: string;
  ownerSenderUrl: string | null;
  recordingId: string;
}): boolean {
  if (
    !activeLease ||
    activeLease.recordingId !== args.recordingId ||
    activeLease.controlToken !== args.controlToken ||
    activeLease.ownerSenderUrl !== args.ownerSenderUrl ||
    activeLease.expiresAt <= Date.now()
  ) {
    return false;
  }

  return true;
}

export function getActiveVideoRecordingLeaseSnapshot(): VideoRecordingControlLease | null {
  return activeLease;
}

export function resetActiveVideoRecordingLeaseForTests(): void {
  activeLease = null;
  hydrationPromise = null;
}

export function reconcileVideoRecordingLeaseOnStartup(): void {
  ensureActiveVideoRecordingLeaseHydrated().catch((error) => {
    logger.warn('Failed to hydrate active recording lease on startup', error);
  });
}
