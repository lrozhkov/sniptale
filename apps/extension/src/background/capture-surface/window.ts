import { browserDisplays } from '@sniptale/platform/browser/displays';
import { browserWindows } from '@sniptale/platform/browser/windows';
import type { CaptureSurfaceSnapshot } from '../storage/capture-surface/contracts';
import { clampWindowPosition, doesSizeFit, selectDisplayForWindow } from './display-geometry';
import { CaptureSurfaceMutationError } from './types';

type WindowSnapshot = Extract<CaptureSurfaceSnapshot, { type: 'window' }>;

function requireWindowSnapshot(window: chrome.windows.Window): WindowSnapshot {
  if (
    window.id === undefined ||
    window.left === undefined ||
    window.top === undefined ||
    window.width === undefined ||
    window.height === undefined ||
    window.state === undefined
  ) {
    throw new Error('Exact browser window bounds are unavailable');
  }
  return {
    type: 'window',
    left: window.left,
    top: window.top,
    width: window.width,
    height: window.height,
    state: window.state,
  };
}

export function windowSnapshotsEqual(left: WindowSnapshot, right: WindowSnapshot): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height &&
    left.state === right.state
  );
}

function windowSizeMatches(left: WindowSnapshot, right: WindowSnapshot): boolean {
  return left.width === right.width && left.height === right.height && left.state === right.state;
}

async function waitForNormalWindow(
  windowId: number,
  lastBoundsChange: () => number,
  onNormalized?: (snapshot: WindowSnapshot) => Promise<void>
): Promise<WindowSnapshot> {
  let deadline = Date.now() + 2000;
  let snapshot = await getWindowSnapshot(windowId);
  let recorded: WindowSnapshot | null = null;
  while (Date.now() < deadline) {
    if (snapshot.state === 'normal' && (!recorded || !windowSnapshotsEqual(snapshot, recorded))) {
      const persistenceStarted = Date.now();
      await onNormalized?.(snapshot);
      // Durable recovery bookkeeping must not consume the browser settling budget.
      deadline += Date.now() - persistenceStarted;
      recorded = snapshot;
    }
    if (snapshot.state === 'normal' && recorded && Date.now() - lastBoundsChange() >= 250) {
      return snapshot;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    snapshot = await getWindowSnapshot(windowId);
  }
  throw new CaptureSurfaceMutationError('verification-failed', snapshot);
}

async function waitForAppliedWindowSize(
  windowId: number,
  expected: WindowSnapshot,
  reported: WindowSnapshot | null,
  lastBoundsChange: () => number,
  retryBaseline: WindowSnapshot | null
): Promise<WindowSnapshot | null> {
  const deadline = Date.now() + 2000;
  let applied = await getWindowSnapshot(windowId);
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    applied = await getWindowSnapshot(windowId);
    const quietFor = Date.now() - lastBoundsChange();
    if (
      quietFor >= 250 &&
      windowSizeMatches(applied, expected) &&
      (windowSnapshotsEqual(applied, expected) ||
        (reported !== null && windowSnapshotsEqual(applied, reported)))
    ) {
      return applied;
    }
    if (retryBaseline && quietFor >= 500 && windowSnapshotsEqual(applied, retryBaseline)) {
      return null;
    }
  }
  throw new CaptureSurfaceMutationError('verification-failed', applied);
}

function windowRestorationMatches(restored: WindowSnapshot, prior: WindowSnapshot): boolean {
  if (prior.state === 'normal') return windowSnapshotsEqual(restored, prior);
  if (restored.state !== prior.state) return false;
  // Maximized/fullscreen bounds belong to Chrome and can include different frame insets.
  // Allow only frame-sized drift. Large shifts, even on overlapping displays, remain conflicts.
  const frameTolerance = 32;
  return (
    Math.abs(restored.left - prior.left) <= frameTolerance &&
    Math.abs(restored.top - prior.top) <= frameTolerance &&
    Math.abs(restored.width - prior.width) <= frameTolerance * 2 &&
    Math.abs(restored.height - prior.height) <= frameTolerance * 2
  );
}

export async function getWindowSnapshot(windowId: number): Promise<WindowSnapshot> {
  return requireWindowSnapshot(await browserWindows.get(windowId));
}

export async function getWindowWorkArea(windowId: number) {
  const snapshot = await getWindowSnapshot(windowId);
  const display = selectDisplayForWindow(snapshot, await browserDisplays.getInfo());
  if (!display) throw new Error('No browser display is available');
  return { snapshot, workArea: display.workArea };
}

export async function prepareWindowSize(
  windowId: number,
  width: number,
  height: number
): Promise<{ prior: WindowSnapshot; expected: WindowSnapshot }> {
  const { snapshot: prior, workArea } = await getWindowWorkArea(windowId);
  if (!doesSizeFit(workArea, width, height)) throw new Error('window-too-large');
  const position = clampWindowPosition(workArea, { ...prior, width, height });
  return {
    prior,
    expected: { type: 'window', ...position, width, height, state: 'normal' },
  };
}

export async function applyPreparedWindowSize(
  windowId: number,
  prior: WindowSnapshot,
  expected: WindowSnapshot,
  onNormalized?: (snapshot: WindowSnapshot) => Promise<void>
): Promise<WindowSnapshot> {
  let lastBoundsChange = Date.now();
  const unsubscribe = browserWindows.subscribeBoundsChanged((window) => {
    if (window.id === windowId) lastBoundsChange = Date.now();
  });
  try {
    let baseline = prior;
    if (prior.state !== 'normal') {
      await browserWindows.update(windowId, { state: 'normal' });
      baseline = await waitForNormalWindow(windowId, () => lastBoundsChange, onNormalized);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const updated = await browserWindows.update(windowId, {
        left: expected.left,
        top: expected.top,
        width: expected.width,
        height: expected.height,
      });
      lastBoundsChange = Date.now();
      const applied = await waitForAppliedWindowSize(
        windowId,
        expected,
        updated ? requireWindowSnapshot(updated) : null,
        () => lastBoundsChange,
        attempt === 0 ? baseline : null
      );
      if (applied) return applied;
    }
    throw new Error('Window bounds retry did not complete');
  } catch (error) {
    if (error instanceof CaptureSurfaceMutationError) throw error;
    const observed = await getWindowSnapshot(windowId).catch(() => null);
    throw new CaptureSurfaceMutationError(
      error instanceof Error ? error.message : String(error),
      observed,
      { cause: error }
    );
  } finally {
    unsubscribe();
  }
}

export async function restoreWindowSnapshot(windowId: number, snapshot: WindowSnapshot) {
  let lastBoundsChange = Date.now();
  const unsubscribe = browserWindows.subscribeBoundsChanged((window) => {
    if (window.id === windowId) lastBoundsChange = Date.now();
  });
  try {
    await browserWindows.update(windowId, { state: 'normal' });
    await browserWindows.update(windowId, {
      left: snapshot.left,
      top: snapshot.top,
      width: snapshot.width,
      height: snapshot.height,
    });
    if (snapshot.state !== 'normal') {
      await browserWindows.update(windowId, { state: snapshot.state });
    }
    // Native window transitions can emit bounds changes after update() resolves.
    lastBoundsChange = Date.now();
    const deadline = lastBoundsChange + 2000;
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      if (Date.now() - lastBoundsChange < 250) continue;
      const restored = await getWindowSnapshot(windowId);
      if (windowRestorationMatches(restored, snapshot)) return;
    }
    throw new Error('restore-impossible');
  } finally {
    unsubscribe();
  }
}
