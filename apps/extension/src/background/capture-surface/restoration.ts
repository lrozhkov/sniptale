import type { CaptureSurfaceSnapshot } from '../storage/capture-surface/contracts';
import {
  getCurrentViewportSize,
  prepareViewportSurface,
  restoreViewportSnapshot,
} from './viewport';
import type { CaptureSurfaceLeaseState } from './types';
import { CaptureSurfaceError } from './types';
import { getWindowSnapshot, restoreWindowSnapshot, windowSnapshotsEqual } from './window';

export type WindowSnapshot = Extract<CaptureSurfaceSnapshot, { type: 'window' }>;
export type ViewportSnapshot = Extract<CaptureSurfaceSnapshot, { type: 'native' | 'viewport' }>;
type CaptureSurfaceObservation = {
  acquired: boolean;
  current: CaptureSurfaceSnapshot;
  releaseAcquisition: () => Promise<void>;
};

function normalizeRestoreError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readCurrentSurfaceSnapshot(
  state: CaptureSurfaceLeaseState
): Promise<CaptureSurfaceObservation> {
  if (state.applied.target === 'window') {
    return {
      acquired: false,
      current: await getWindowSnapshot(state.entry.windowId),
      releaseAcquisition: async () => undefined,
    };
  }
  const prepared = await prepareViewportSurface({
    owner: state.entry.owner,
    tabId: state.entry.tabId,
  });
  try {
    return {
      acquired: prepared.acquired,
      current: { type: 'native', ...(await getCurrentViewportSize(state.entry.tabId)) },
      releaseAcquisition: prepared.releaseAcquisition,
    };
  } catch (error) {
    await prepared.releaseAcquisition();
    throw error;
  }
}

export function captureSurfaceSnapshotsEqual(
  left: CaptureSurfaceSnapshot,
  right: CaptureSurfaceSnapshot
): boolean {
  if (left.type === 'window' && right.type === 'window') {
    return windowSnapshotsEqual(left, right);
  }
  if (left.type !== 'window' && right.type !== 'window') {
    return left.width === right.width && left.height === right.height;
  }
  return false;
}

export async function restoreCaptureSurfaceSnapshot(
  state: CaptureSurfaceLeaseState
): Promise<void> {
  try {
    if (state.applied.target === 'window') {
      await restoreWindowSnapshot(state.entry.windowId, state.prior as WindowSnapshot);
    } else {
      await restoreViewportSnapshot({
        owner: state.entry.owner,
        snapshot: state.prior,
        tabId: state.entry.tabId,
      });
    }
  } catch (error) {
    if (error instanceof CaptureSurfaceError) throw error;
    throw new CaptureSurfaceError('restore-impossible', normalizeRestoreError(error));
  }
}

export async function applyCaptureSurfaceSnapshot(
  state: CaptureSurfaceLeaseState,
  snapshot: CaptureSurfaceSnapshot
): Promise<void> {
  try {
    if (snapshot.type === 'window') {
      await restoreWindowSnapshot(state.entry.windowId, snapshot);
    } else {
      await restoreViewportSnapshot({
        owner: state.entry.owner,
        snapshot,
        tabId: state.entry.tabId,
      });
    }
  } catch (error) {
    if (error instanceof CaptureSurfaceError) throw error;
    throw new CaptureSurfaceError('restore-impossible', normalizeRestoreError(error));
  }
}

export async function transitionCaptureSurfaceSnapshot(args: {
  expected: readonly CaptureSurfaceSnapshot[];
  next: CaptureSurfaceSnapshot;
  state: CaptureSurfaceLeaseState;
}): Promise<void> {
  const observation = await readCurrentSurfaceSnapshot(args.state);
  let retainObservedAcquisition = false;
  try {
    if (
      args.expected.some((expected) => captureSurfaceSnapshotsEqual(observation.current, expected))
    ) {
      await applyCaptureSurfaceSnapshot(args.state, args.next);
    } else if (!captureSurfaceSnapshotsEqual(observation.current, args.next)) {
      throw new CaptureSurfaceError('restore-conflict');
    }

    if (
      observation.acquired &&
      args.state.applied.target === 'viewport' &&
      args.next.type === 'viewport'
    ) {
      args.state.viewportAcquisitionOwned = true;
      retainObservedAcquisition = true;
    }
  } finally {
    if (!retainObservedAcquisition) {
      await observation.releaseAcquisition();
    }
  }
}
