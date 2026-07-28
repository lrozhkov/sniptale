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
  if (prior.state !== 'normal') throw new Error('window-not-normal');
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
  expected: WindowSnapshot
): Promise<WindowSnapshot> {
  try {
    if (prior.state !== 'normal') throw new Error('window-not-normal');
    await browserWindows.update(windowId, {
      left: expected.left,
      top: expected.top,
      width: expected.width,
      height: expected.height,
    });
    const applied = await getWindowSnapshot(windowId);
    if (!windowSnapshotsEqual(applied, expected)) {
      throw new CaptureSurfaceMutationError('verification-failed', applied);
    }
    return applied;
  } catch (error) {
    if (error instanceof CaptureSurfaceMutationError) throw error;
    const observed = await getWindowSnapshot(windowId).catch(() => null);
    throw new CaptureSurfaceMutationError(
      error instanceof Error ? error.message : String(error),
      observed,
      { cause: error }
    );
  }
}

export async function restoreWindowSnapshot(windowId: number, snapshot: WindowSnapshot) {
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
  const restored = await getWindowSnapshot(windowId);
  if (!windowSnapshotsEqual(restored, snapshot)) {
    throw new Error('restore-impossible');
  }
}
