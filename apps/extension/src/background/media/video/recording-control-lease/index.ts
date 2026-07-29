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
let leaseHydrated = false;

function hydrateSessionFromLease(lease: VideoRecordingControlLease): void {
  setVideoRecordingId(lease.recordingId);
  setVideoRecordingTabId(lease.recordingTabId);
  setOpenEditorAfterRecording(lease.openEditorAfterRecording);
  setVideoRecordingRuntimeState({
    captureMode: lease.captureMode,
    cropRegion: lease.cropRegion,
    countdownEndsAt: null,
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPresetId: lease.viewportPresetId,
  } satisfies Partial<VideoRecordingRuntimeState>);
}

export async function issuePreparedVideoRecordingLease(args: {
  captureMode: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number } | null;
  ownerSenderUrl: string;
  openEditorAfterRecording: boolean;
  surfaceBinding?: { generation: number; streamInstanceId: string } | null;
  viewportPresetId?: string | null;
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
    cropRegion: args.cropRegion ?? null,
    ownerSenderUrl: args.ownerSenderUrl,
    openEditorAfterRecording: args.openEditorAfterRecording,
    recordingId,
    recordingTabId,
    surfaceBinding: args.surfaceBinding ?? null,
    viewportPresetId: args.viewportPresetId ?? null,
  });
  await persistLease(lease);
  activeLease = lease;
  leaseHydrated = true;
  return lease;
}

export async function activateVideoRecordingLease(args: {
  generation: number;
  recordingId: string;
  streamInstanceId: string | null;
}): Promise<VideoRecordingControlLease> {
  const lease = activeLease ?? (await readPersistedLease());
  if (
    !lease ||
    lease.recordingId !== args.recordingId ||
    lease.phase !== 'prepared' ||
    (lease.surfaceBinding !== null &&
      (lease.surfaceBinding.generation !== args.generation ||
        lease.surfaceBinding.streamInstanceId !== args.streamInstanceId))
  ) {
    throw new Error('Prepared recording control lease does not match the activated source');
  }
  const activated: VideoRecordingControlLease = { ...lease, phase: 'active' };
  await persistLease(activated);
  activeLease = activated;
  leaseHydrated = true;
  return activated;
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
  leaseHydrated = true;
}

export async function hydrateActiveVideoRecordingLease(): Promise<VideoRecordingControlLease | null> {
  const lease = await readPersistedLease();
  leaseHydrated = true;
  if (!lease) {
    activeLease = null;
    await removePersistedLease();
    return null;
  }

  activeLease = lease;
  if (lease.phase === 'active') hydrateSessionFromLease(lease);
  return lease;
}

export async function ensureActiveVideoRecordingLeaseHydrated(): Promise<VideoRecordingControlLease | null> {
  if (activeLease && activeLease.expiresAt > Date.now()) {
    return activeLease;
  }
  if (leaseHydrated) return null;

  hydrationPromise ??= hydrateActiveVideoRecordingLease().finally(() => {
    hydrationPromise = null;
  });
  return hydrationPromise;
}

export async function restoreCurrentRecordingFromLease(recordingId: string): Promise<boolean> {
  const lease = activeLease ?? (await ensureActiveVideoRecordingLeaseHydrated());
  if (!lease || lease.recordingId !== recordingId || lease.phase !== 'active') {
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
    activeLease.phase !== 'active' ||
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

export async function requireActiveVideoRecordingSourceBinding(): Promise<{
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}> {
  const lease = activeLease ?? (await ensureActiveVideoRecordingLeaseHydrated());
  if (!lease || lease.phase !== 'active' || !lease.surfaceBinding) {
    throw new Error('Active recording source binding is unavailable');
  }
  return {
    generation: lease.surfaceBinding.generation,
    recordingId: lease.recordingId,
    streamInstanceId: lease.surfaceBinding.streamInstanceId,
  };
}

export function resetActiveVideoRecordingLeaseForTests(): void {
  activeLease = null;
  hydrationPromise = null;
  leaseHydrated = false;
}

export function reconcileVideoRecordingLeaseOnStartup(): void {
  ensureActiveVideoRecordingLeaseHydrated().catch((error) => {
    logger.warn('Failed to hydrate active recording lease on startup', error);
  });
}
