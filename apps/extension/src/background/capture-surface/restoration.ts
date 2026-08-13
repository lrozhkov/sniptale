import type { CaptureSurfaceSnapshot } from '../storage/capture-surface/contracts';
import type { CaptureSurfaceLeaseState } from './types';
import { CaptureSurfaceError } from './types';
import { getWindowSnapshot, restoreWindowSnapshot, windowSnapshotsEqual } from './window';

export type WindowSnapshot = CaptureSurfaceSnapshot;

type CaptureSurfaceObservation = {
  acquired: false;
  current: CaptureSurfaceSnapshot;
  releaseAcquisition: () => Promise<void>;
};

export async function readCurrentSurfaceSnapshot(
  state: CaptureSurfaceLeaseState
): Promise<CaptureSurfaceObservation> {
  return {
    acquired: false,
    current: await getWindowSnapshot(state.entry.windowId),
    releaseAcquisition: async () => undefined,
  };
}

export function captureSurfaceSnapshotsEqual(
  left: CaptureSurfaceSnapshot,
  right: CaptureSurfaceSnapshot
): boolean {
  return windowSnapshotsEqual(left, right);
}

export async function restoreCaptureSurfaceSnapshot(
  state: CaptureSurfaceLeaseState
): Promise<void> {
  try {
    await restoreWindowSnapshot(state.entry.windowId, state.prior);
  } catch (error) {
    if (error instanceof CaptureSurfaceError) throw error;
    throw new CaptureSurfaceError(
      'restore-impossible',
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function transitionCaptureSurfaceSnapshot(args: {
  expected: readonly CaptureSurfaceSnapshot[];
  next: CaptureSurfaceSnapshot;
  state: CaptureSurfaceLeaseState;
}): Promise<void> {
  const current = await getWindowSnapshot(args.state.entry.windowId);
  if (args.expected.some((expected) => windowSnapshotsEqual(current, expected))) {
    try {
      await restoreWindowSnapshot(args.state.entry.windowId, args.next);
    } catch (error) {
      if (error instanceof CaptureSurfaceError) throw error;
      throw new CaptureSurfaceError(
        'restore-impossible',
        error instanceof Error ? error.message : String(error)
      );
    }
  } else if (!windowSnapshotsEqual(current, args.next)) {
    throw new CaptureSurfaceError('restore-conflict');
  }
}
