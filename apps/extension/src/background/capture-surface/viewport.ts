import { browserTabs } from '@sniptale/platform/browser/tabs';
import {
  armDebuggerActivation,
  attachDebugger,
  clearViewport,
  detachDebugger,
  getViewportWorkspace,
  setViewport,
  ViewportMutationError,
} from '../diagnostics/lifecycle';
import type {
  CaptureSurfaceOwner,
  CaptureSurfaceSnapshot,
} from '../storage/capture-surface/contracts';
import { handleForcefulDetach, hasAttachedClient } from '../debugger/session';
import { readViewportCapacity } from './viewport-capacity';
import { CaptureSurfaceMutationError } from './types';

type ViewportSnapshot = Extract<CaptureSurfaceSnapshot, { type: 'native' | 'viewport' }>;

function resolveDebuggerClient(owner: CaptureSurfaceOwner) {
  return owner === 'video'
    ? ('capture-surface-video' as const)
    : ('capture-surface-screenshot' as const);
}

export async function getTabZoom(tabId: number): Promise<number> {
  return browserTabs.getZoom(tabId);
}

export async function prepareViewportSurface(args: {
  owner: CaptureSurfaceOwner;
  tabId: number;
}): Promise<{
  acquired: boolean;
  current: { width: number; height: number };
  releaseAcquisition: () => Promise<void>;
}> {
  const client = resolveDebuggerClient(args.owner);
  const alreadyOwned = hasAttachedClient(args.tabId, client);
  const current = await readViewportCapacity(args.tabId);
  await attachDebugger(
    args.tabId,
    client,
    armDebuggerActivation({ client, reason: 'capture-surface-viewport', tabId: args.tabId })
  );
  try {
    return {
      acquired: !alreadyOwned,
      current,
      releaseAcquisition: alreadyOwned
        ? async () => undefined
        : async () => detachDebugger(args.tabId, client),
    };
  } catch (error) {
    if (!alreadyOwned) {
      await detachDebugger(args.tabId, client);
    }
    throw error;
  }
}

export async function releaseViewportSurfaceAcquisition(args: {
  owner: CaptureSurfaceOwner;
  tabId: number;
}): Promise<void> {
  await detachDebugger(args.tabId, resolveDebuggerClient(args.owner));
}

export async function setViewportSurface(args: {
  tabId: number;
  width: number;
  height: number;
}): Promise<void> {
  try {
    await setViewport(args.tabId, args.width, args.height);
  } catch (error) {
    if (error instanceof ViewportMutationError) {
      throw new CaptureSurfaceMutationError(
        error.message,
        {
          type: 'viewport',
          presetId: 'uncommitted',
          width: error.observed.cssWidth,
          height: error.observed.cssHeight,
        },
        { cause: error }
      );
    }
    throw error;
  }
}

export async function getCurrentViewportSize(tabId: number): Promise<{
  width: number;
  height: number;
}> {
  return getViewportWorkspace(tabId);
}

export function acknowledgeClosedViewportTab(tabId: number): void {
  handleForcefulDetach(tabId);
}

export function viewportSnapshotMatches(
  snapshot: ViewportSnapshot,
  current: { width: number; height: number }
): boolean {
  return snapshot.width === current.width && snapshot.height === current.height;
}

export async function restoreViewportSnapshot(args: {
  owner: CaptureSurfaceOwner;
  snapshot: CaptureSurfaceSnapshot;
  tabId: number;
}) {
  if (args.snapshot.type === 'window') {
    throw new Error('restore-impossible');
  }
  const client = resolveDebuggerClient(args.owner);
  await attachDebugger(
    args.tabId,
    client,
    armDebuggerActivation({ client, reason: 'capture-surface-restore', tabId: args.tabId })
  );
  if (args.snapshot.type === 'viewport') {
    try {
      await setViewport(args.tabId, args.snapshot.width, args.snapshot.height);
      return;
    } catch (restoreError) {
      try {
        await detachDebugger(args.tabId, client);
      } catch (detachError) {
        throw new AggregateError(
          [restoreError, detachError],
          'Viewport restoration and detach failed',
          { cause: detachError }
        );
      }
      throw restoreError;
    }
  }
  let restoreError: unknown = null;
  try {
    await clearViewport(args.tabId);
  } catch (error) {
    restoreError = error;
  }
  try {
    await detachDebugger(args.tabId, client);
  } catch (detachError) {
    throw restoreError
      ? new AggregateError([restoreError, detachError], 'Viewport restoration and detach failed')
      : detachError;
  }
  if (restoreError) throw restoreError;
  await readViewportCapacity(args.tabId);
}
