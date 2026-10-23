import {
  tryRunWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../../../../composition/persistence/infrastructure/mutation-barrier';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  getVideoRecordingId,
  isVideoRecordingStopInProgress,
  getVideoRecordingTabId,
} from '../session-state';
import {
  canPersistVideoRecordingLease,
  createLeaseSnapshot,
  persistLease,
  readPersistedLease,
  removePersistedLease,
  type VideoRecordingControlLease,
  type RecordingTerminalProgress,
} from '../../../storage/video/recording-control-lease';

let activeLease: VideoRecordingControlLease | null = null;
let hydrationPromise: Promise<VideoRecordingControlLease | null> | null = null;
let leaseHydrated = false;
let mutationQueue: Promise<void> = Promise.resolve();
let leaseRevision = 0;

async function mutateLease<T>(
  operation: (permit: PersistenceMutationPermit) => Promise<T>
): Promise<T> {
  leaseRevision += 1;
  const admitted = await tryRunWithPersistenceMutationPermit(async (permit) => {
    const work = mutationQueue.then(() => operation(permit));
    mutationQueue = work.then(
      () => undefined,
      () => undefined
    );
    return { value: await work };
  });
  if (!admitted) throw new Error('Recording authority is unavailable during local data cleanup.');
  return admitted.value;
}

function getUnexpiredActiveLease(): VideoRecordingControlLease | null {
  if (activeLease && activeLease.phase !== 'terminal' && activeLease.expiresAt <= Date.now()) {
    activeLease = null;
    leaseHydrated = true;
  }
  return activeLease;
}

export async function issuePreparedVideoRecordingLease(args: {
  captureMode: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number } | null;
  ownerSenderUrl: string;
  surfaceBinding?: { generation: number; streamInstanceId: string } | null;
  viewportPresetId?: string | null;
}): Promise<VideoRecordingControlLease | null> {
  return mutateLease(async (permit) => {
    const recordingId = getVideoRecordingId();
    const recordingTabId = getVideoRecordingTabId();
    if (
      !recordingId ||
      (recordingTabId === null && args.captureMode !== CaptureMode.CAMERA) ||
      !canPersistVideoRecordingLease()
    ) {
      return null;
    }

    if (getUnexpiredActiveLease()?.phase === 'terminal') {
      throw new Error('Recording cleanup must complete before a new recording starts.');
    }
    const lease = createLeaseSnapshot({
      captureMode: args.captureMode,
      cropRegion: args.cropRegion ?? null,
      ownerSenderUrl: args.ownerSenderUrl,
      recordingId,
      recordingTabId,
      surfaceBinding: args.surfaceBinding ?? null,
      viewportPresetId: args.viewportPresetId ?? null,
    });
    await persistLease(lease, permit);
    activeLease = lease;
    leaseHydrated = true;
    return lease;
  });
}

export async function activateVideoRecordingLease(args: {
  generation: number;
  recordingId: string;
  streamInstanceId: string | null;
}): Promise<VideoRecordingControlLease> {
  return mutateLease(async (permit) => {
    const lease = getUnexpiredActiveLease() ?? (await readPersistedLease());
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
    await persistLease(activated, permit);
    activeLease = activated;
    leaseHydrated = true;
    return activated;
  });
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
  options: {
    shouldClear?: () => boolean;
    authority?:
      | 'confirmed-completion'
      | 'cancelled-before-dispatch'
      | 'durable-saved-result'
      | 'verified-erasure';
    binding?: { generation: number; streamInstanceId: string };
  } = {}
): Promise<void> {
  return mutateLease(async (permit) => {
    const leaseToClear = await resolveLeaseToClear(recordingId);
    if (recordingId !== undefined && !leaseToClear) {
      return;
    }

    const canRemove = (): boolean => {
      if (options.authority === 'verified-erasure' || options.authority === 'durable-saved-result')
        return true;
      if (options.authority === 'confirmed-completion') {
        return Boolean(
          leaseToClear?.phase === 'terminal' &&
          leaseToClear.terminal.outcome === 'stopped' &&
          leaseToClear.terminal.cleanupStep === 'lease' &&
          options.binding &&
          leaseToClear.surfaceBinding?.generation === options.binding.generation &&
          leaseToClear.surfaceBinding.streamInstanceId === options.binding.streamInstanceId
        );
      }
      if (leaseToClear?.phase === 'terminal') return false;
      return (
        options.authority === 'cancelled-before-dispatch' ||
        !isVideoRecordingStopInProgress() ||
        getVideoRecordingId() !== leaseToClear?.recordingId
      );
    };
    if (!canRemove()) throw new Error('Recording cleanup retains authority for the accepted Stop.');
    if (options.shouldClear && !options.shouldClear()) return;

    await removePersistedLease(permit);

    // Stop can be admitted while the browser storage removal is pending.
    if (!canRemove()) {
      if (leaseToClear) {
        await persistLease(leaseToClear, permit);
        activeLease = leaseToClear;
      }
      throw new Error('Recording cleanup retains authority for the accepted Stop.');
    }

    if (options.shouldClear && !options.shouldClear()) {
      if (activeLease && activeLease.recordingId !== leaseToClear?.recordingId) {
        await persistLease(activeLease, permit);
        return;
      }
      if (leaseToClear) {
        activeLease = leaseToClear;
        await persistLease(leaseToClear, permit);
      }
      return;
    }

    if (!recordingId || !activeLease || activeLease.recordingId === recordingId) {
      activeLease = null;
    }
    leaseHydrated = true;
  });
}

export async function hydrateVideoRecordingLeaseCache(): Promise<VideoRecordingControlLease | null> {
  const revision = leaseRevision;
  const lease = await readPersistedLease();
  if (revision !== leaseRevision) return getUnexpiredActiveLease();
  const currentId = getVideoRecordingId();
  if (lease && currentId && currentId !== lease.recordingId) return getUnexpiredActiveLease();
  leaseHydrated = true;
  if (!lease) {
    activeLease = null;
    return null;
  }

  activeLease = lease;
  return lease;
}

export async function ensureVideoRecordingLeaseCache(): Promise<VideoRecordingControlLease | null> {
  const lease = getUnexpiredActiveLease();
  if (lease) {
    return lease;
  }
  if (leaseHydrated) return null;

  hydrationPromise ??= hydrateVideoRecordingLeaseCache().finally(() => {
    hydrationPromise = null;
  });
  return hydrationPromise;
}

export function validateRecordingControlCapability(args: {
  controlToken: string;
  ownerSenderUrl: string | null;
  recordingId: string;
}): boolean {
  const lease = getUnexpiredActiveLease();
  if (
    !lease ||
    lease.recordingId !== args.recordingId ||
    lease.phase !== 'active' ||
    lease.controlToken !== args.controlToken ||
    lease.ownerSenderUrl !== args.ownerSenderUrl
  ) {
    return false;
  }

  return true;
}

/** Prepared authority permits start cancellation with the exact owner-bound capability. */
export function validatePreparedRecordingCancellationCapability(args: {
  controlToken: string;
  ownerSenderUrl: string | null;
  recordingId: string;
}): boolean {
  const lease = getUnexpiredActiveLease();
  return (
    lease?.phase === 'prepared' &&
    lease.recordingId === args.recordingId &&
    lease.controlToken === args.controlToken &&
    lease.ownerSenderUrl === args.ownerSenderUrl
  );
}

export function getActiveVideoRecordingLeaseSnapshot(): VideoRecordingControlLease | null {
  return getUnexpiredActiveLease();
}

/** Records exact terminal evidence before cleanup can revoke recording authority. */
export function updateVideoRecordingTerminal(
  binding: { recordingId: string; generation: number; streamInstanceId: string },
  progress: RecordingTerminalProgress | { outcome: 'failed'; cleanupStep: 'surface' }
): Promise<VideoRecordingControlLease> {
  return mutateLease(async (permit) => {
    if (!canPersistVideoRecordingLease())
      throw new Error('Recording recovery storage is unavailable.');
    const lease = await readPersistedLease();
    if (
      !lease ||
      lease.recordingId !== binding.recordingId ||
      lease.surfaceBinding?.generation !== binding.generation ||
      lease.surfaceBinding.streamInstanceId !== binding.streamInstanceId ||
      (getVideoRecordingId() !== null && getVideoRecordingId() !== binding.recordingId)
    )
      throw new Error('Recording terminal identity changed.');
    const nextProgress: RecordingTerminalProgress = {
      ...progress,
      discard:
        'discard' in progress
          ? progress.discard
          : lease.phase === 'terminal' && lease.terminal.discard,
    };
    if (lease.phase === 'terminal') {
      if (progress.outcome === 'unknown' || lease.terminal.outcome === 'failed') return lease;
      if (lease.terminal.outcome === 'stopped' && progress.outcome === 'failed') return lease;
      if (lease.terminal.discard !== nextProgress.discard)
        throw new Error('Recording stop disposition changed.');
      const steps = ['surface', 'camera-grant', 'lease'];
      if (steps.indexOf(progress.cleanupStep) < steps.indexOf(lease.terminal.cleanupStep))
        return lease;
    }
    const next: VideoRecordingControlLease = {
      ...lease,
      phase: 'terminal',
      terminal: nextProgress,
    };
    await persistLease(next, permit);
    activeLease = next;
    leaseHydrated = true;
    return next;
  });
}

/** Terminal authority permits only an explicit Stop from the original trusted popup. */
export function validateTerminalRecordingStopCapability(args: {
  controlToken: string;
  ownerSenderUrl: string | null;
  recordingId: string;
}): boolean {
  const lease = getUnexpiredActiveLease();
  return (
    lease?.phase === 'terminal' &&
    lease.expiresAt > Date.now() &&
    lease.recordingId === args.recordingId &&
    lease.controlToken === args.controlToken &&
    lease.ownerSenderUrl === args.ownerSenderUrl
  );
}

export async function requireActiveVideoRecordingSourceBinding(): Promise<{
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}> {
  const lease = getUnexpiredActiveLease() ?? (await ensureVideoRecordingLeaseCache());
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
  leaseRevision += 1;
  mutationQueue = Promise.resolve();
}
