import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import type {
  CaptureSurfaceLeaseRequest,
  CaptureSurfaceLeaseState,
  VideoCaptureViewport,
} from './types';
import { CaptureSurfaceError } from './types';
import {
  applyPreparedWindowSize,
  getWindowSnapshot,
  getWindowWorkArea,
  windowSnapshotsEqual,
} from './window';

type Size = { width: number; height: number };
type Raster = Size & { scale: number };

function alignedDimension(outer: number, content: number, scale: number, limit: number): number {
  // Chromium's I420 capture requires an even physical content rectangle, not even window bounds.
  for (const delta of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const physical = Math.round((content + delta) * scale);
    if (outer + delta > 0 && outer + delta <= limit && physical > 0 && physical % 2 === 0) {
      return outer + delta;
    }
  }
  throw new CaptureSurfaceError('verification-failed');
}

export function resolveVideoRasterWindowSize(window: Size, viewport: Raster, workArea: Size): Size {
  if (
    ![viewport.width, viewport.height, viewport.scale].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    throw new CaptureSurfaceError('verification-failed');
  }
  return {
    width: alignedDimension(window.width, viewport.width, viewport.scale, workArea.width),
    height: alignedDimension(window.height, viewport.height, viewport.scale, workArea.height),
  };
}

async function readStableViewport(
  state: CaptureSurfaceLeaseState,
  measure: NonNullable<CaptureSurfaceLeaseRequest['measureVideoViewport']>
): Promise<VideoCaptureViewport> {
  let previous: VideoCaptureViewport | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const current = await measure(state.entry.tabId);
    if (
      current.windowId !== state.entry.windowId ||
      !windowSnapshotsEqual(await getWindowSnapshot(state.entry.windowId), state.entry.applied)
    ) {
      throw new CaptureSurfaceError('restore-conflict');
    }
    if (
      previous &&
      current.width === previous.width &&
      current.height === previous.height &&
      current.scale === previous.scale
    ) {
      return current;
    }
    previous = current;
  }
  throw new CaptureSurfaceError('verification-failed');
}

export async function alignVideoCaptureSurface(
  state: CaptureSurfaceLeaseState,
  measure: NonNullable<CaptureSurfaceLeaseRequest['measureVideoViewport']>,
  registry: CaptureSurfaceLeaseRegistry
): Promise<void> {
  const viewport = await readStableViewport(state, measure);
  const { snapshot, workArea } = await getWindowWorkArea(state.entry.windowId);
  if (!windowSnapshotsEqual(snapshot, state.entry.applied))
    throw new CaptureSurfaceError('restore-conflict');
  const size = resolveVideoRasterWindowSize(snapshot, viewport, workArea);
  if (size.width === snapshot.width && size.height === snapshot.height) return;
  const expected = { ...snapshot, ...size };
  // Persist both sides before the second native mutation so worker recovery can restore either.
  state.entry.alignmentFrom = snapshot;
  state.entry.applied = expected;
  await registry.persist();
  await applyPreparedWindowSize(state.entry.windowId, snapshot, expected);
  const verified = await readStableViewport(state, measure);
  const verifiedSize = resolveVideoRasterWindowSize(expected, verified, workArea);
  if (verifiedSize.width !== expected.width || verifiedSize.height !== expected.height) {
    throw new CaptureSurfaceError('verification-failed');
  }
  state.applied.width = expected.width;
  state.applied.height = expected.height;
}
